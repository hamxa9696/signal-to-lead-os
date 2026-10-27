// Collect RSS/Atom news items into `signals`, and our own sitemap into `site_pages`.
import { sql } from "@/lib/db";
import { fetchXml, parseFeed, parseSitemap } from "@/lib/feeds";
import type { Job } from "./types";

// Skip items older than this: stale news is not worth a Gemini call.
const MAX_AGE_DAYS = 21;

type Source = { id: string; kind: string; name: string; url: string; category: string | null };

async function collectRss(src: Source): Promise<number> {
  const items = parseFeed(await fetchXml(src.url));
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const fresh = items.filter((i) => !i.publishedAt || i.publishedAt.getTime() >= cutoff);
  if (!fresh.length) return 0;

  const rows = fresh.map((i) => ({
    source_id: src.id,
    external_id: i.externalId.slice(0, 1000),
    kind: "news",
    title: i.title.slice(0, 500),
    url: i.url,
    summary: i.summary,
    published_at: i.publishedAt,
  }));
  const inserted = await sql`
    insert into signals ${sql(rows, "source_id", "external_id", "kind", "title", "url", "summary", "published_at")}
    on conflict (source_id, external_id) do nothing
    returning id`;
  return inserted.length;
}

/** Walk a sitemap (and one level of sitemap index) into site_pages. */
async function collectOwnSitemap(src: Source): Promise<number> {
  const root = parseSitemap(await fetchXml(src.url));
  const entries = [...root.entries];
  for (const child of root.childSitemaps.slice(0, 20)) {
    entries.push(...parseSitemap(await fetchXml(child)).entries);
  }
  if (!entries.length) return 0;

  const rows = entries.map((e) => {
    const u = new URL(e.url);
    const path = decodeURIComponent(u.pathname);
    const section = path.split("/")[1] || "home";
    // Titles come later from the CMS; the slug is a good enough hint for de-duplication.
    const slug = path.split("/").filter(Boolean).pop() ?? "";
    return { url: e.url, path, section, title: slug.replace(/[-_]/g, " "), lastmod: e.lastmod };
  });
  await sql`
    insert into site_pages ${sql(rows, "url", "path", "section", "title", "lastmod")}
    on conflict (url) do update set lastmod = excluded.lastmod, last_seen = now()`;
  return rows.length;
}

export const collectFeeds: Job = {
  name: "collect-feeds",
  description: "Fetch news RSS feeds into signals and our own sitemap into site_pages",
  async run() {
    const sources = await sql<Source[]>`
      select id, kind, name, url, category from sources
      where active and kind in ('rss', 'sitemap') and url is not null
      order by name`;

    const perSource: Record<string, number | string> = {};
    let newSignals = 0;
    let errors = 0;

    for (const src of sources) {
      try {
        const n =
          src.kind === "sitemap" && src.category === "own_site"
            ? await collectOwnSitemap(src)
            : src.kind === "rss"
              ? await collectRss(src)
              : 0;
        if (src.kind === "rss") newSignals += n;
        perSource[src.name] = n;
        await sql`update sources set last_fetched_at = now(), last_error = null where id = ${src.id}`;
      } catch (err) {
        errors++;
        const msg = (err as Error).message.slice(0, 500);
        perSource[src.name] = `error: ${msg}`;
        await sql`update sources set last_error = ${msg} where id = ${src.id}`;
      }
    }

    // One broken feed should not fail the whole job; all of them failing should.
    if (sources.length && errors === sources.length) throw new Error("every source failed");
    return { status: "ok", stats: { sources: sources.length, newSignals, errors, perSource } };
  },
};
