// Fetch + parse RSS 2.0, RSS 1.0 (RDF), Atom and XML sitemaps into one flat shape.
import { XMLParser } from "fast-xml-parser";

export type FeedItem = {
  externalId: string; // guid / link
  title: string;
  url: string | null;
  summary: string | null;
  publishedAt: Date | null;
};

export type SitemapEntry = { url: string; lastmod: Date | null };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true, // rdf:RDF → RDF, dc:date → date
  textNodeName: "#text",
  // Feeds are trusted-ish public XML, but never expand entities beyond the defaults.
  processEntities: true,
  htmlEntities: true,
});

const USER_AGENT = "RenesisSignalBot/0.1 (+https://renesistech.jp)";

export async function fetchXml(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return parser.parse(await res.text());
}

const arr = <T,>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Plain text from a node that may be a string, a {#text} object, or CDATA-ish HTML. */
function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as object)) return String((v as { "#text": unknown })["#text"]);
  return "";
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function date(v: unknown): Date | null {
  const s = text(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function atomLink(v: unknown): string | null {
  const links = arr(v as Record<string, string> | Record<string, string>[]);
  const alt = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
  return alt?.["@_href"] ?? (typeof v === "string" ? v : null);
}

export function parseFeed(doc: unknown): FeedItem[] {
  const d = doc as Record<string, any>;
  const rawItems: Record<string, unknown>[] = d.rss
    ? arr(d.rss.channel?.item)
    : d.RDF
      ? arr(d.RDF.item)
      : d.feed
        ? arr(d.feed.entry)
        : [];
  const isAtom = Boolean(d.feed);

  return rawItems
    .map((it): FeedItem | null => {
      const title = stripHtml(text(it.title));
      const url = isAtom ? atomLink(it.link) : text(it.link) || (it["@_about"] as string) || null;
      const externalId = text(it.guid) || text(it.id) || url || title;
      if (!title || !externalId) return null;
      const summaryRaw = text(it.description) || text(it.summary) || text(it.content);
      return {
        externalId,
        title,
        url,
        summary: summaryRaw ? stripHtml(summaryRaw).slice(0, 600) : null,
        publishedAt: date(it.pubDate) ?? date(it.date) ?? date(it.published) ?? date(it.updated),
      };
    })
    .filter((x): x is FeedItem => x !== null);
}

export function parseSitemap(doc: unknown): { entries: SitemapEntry[]; childSitemaps: string[] } {
  const d = doc as Record<string, any>;
  return {
    entries: arr(d.urlset?.url).map((u: Record<string, unknown>) => ({ url: text(u.loc), lastmod: date(u.lastmod) })).filter((e) => e.url),
    childSitemaps: arr(d.sitemapindex?.sitemap).map((s: Record<string, unknown>) => text(s.loc)).filter(Boolean),
  };
}
