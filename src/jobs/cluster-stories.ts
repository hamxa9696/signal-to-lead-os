// Group relevant articles about the same news (any outlet) into stories, then score each story.
// Gemini decides "same story" (same event/announcement, not merely the same topic).
import { z } from "zod";
import { sql } from "@/lib/db";
import { env, has } from "@/lib/env";
import { generateJson } from "@/lib/gemini";
import { storyStrength, type StorySignal } from "@/lib/strength";
import type { Job } from "./types";

const WINDOW_DAYS = 14;
const BATCH = 50;
const MAX_NEW = 600;

/** Google News titles end in " - Publisher": split it off as the outlet. */
export function splitOutlet(title: string, sourceName: string, isSearch: boolean): { title: string; outlet: string } {
  const cut = title.lastIndexOf(" - ");
  if (isSearch && cut > 0) return { title: title.slice(0, cut).trim(), outlet: title.slice(cut + 3).trim() };
  return { title, outlet: sourceName };
}

const Out = z.preprocess((v) => (Array.isArray(v) ? { items: v } : v), z.object({
  items: z.array(z.object({ i: z.number().int(), story: z.string() })),
}));

type NewRow = { id: string; title: string; source: string; category: string | null; category_id: string | null; at: Date };
type StoryRow = { id: string; title: string };

export const clusterStories: Job = {
  name: "cluster-stories",
  description: "Group articles about the same news into stories and score each story's strength",
  async run() {
    if (!has(env.geminiApiKey)) return { status: "skipped", stats: {}, note: "GEMINI_API_KEY not set" };

    const fresh = await sql<NewRow[]>`
      select s.id, s.title, src.name as source, src.category, s.category_id, coalesce(s.published_at, s.fetched_at) as at
      from signals s join sources src on src.id = s.source_id
      where s.status = 'analyzed' and s.story_id is null
        and coalesce(s.published_at, s.fetched_at) >= now() - make_interval(days => ${WINDOW_DAYS})
      order by at
      limit ${MAX_NEW}`;

    // Outlet + clean title for every new article.
    const clean = new Map<string, string>();
    for (const r of fresh) {
      const { title, outlet } = splitOutlet(r.title, r.source, r.category === "keyword_search");
      clean.set(r.id, title);
      await sql`update signals set outlet = ${outlet} where id = ${r.id}`;
    }

    const byCat = new Map<string, NewRow[]>();
    for (const r of fresh) byCat.set(r.category_id ?? "none", [...(byCat.get(r.category_id ?? "none") ?? []), r]);

    let assigned = 0;
    let created = 0;
    const failed: string[] = [];
    const touched = new Set<string>();

    for (const [cat, rows] of byCat) {
      for (let start = 0; start < rows.length; start += BATCH) {
        const batch = rows.slice(start, start + BATCH);
        const existing = await sql<StoryRow[]>`
          select id, title from stories
          where last_seen >= now() - interval '7 days'
            and ${cat === "none" ? sql`category_id is null` : sql`category_id = ${cat}`}
          order by last_seen desc limit 80`;
        let items: z.infer<typeof Out>["items"];
        try {
          ({ items } = await generateJson(
            [
              "Group Japanese news headlines into STORIES. A story = one specific event or announcement",
              "(same company + same action, same regulation, same report), reported by any outlet. Articles that",
              "only share a topic (e.g. two different companies adopting AI) are DIFFERENT stories.",
              "For each NEW item return story = an EXISTING story id like \"S3\" if it reports that same event,",
              "or a new group label like \"N1\" (reuse the same N label for new items about the same event).",
              "",
              "EXISTING STORIES:",
              ...(existing.length ? existing.map((s, i) => `S${i} ${s.title}`) : ["(none)"]),
              "",
              "NEW ITEMS:",
              ...batch.map((r, i) => `[${i}] ${clean.get(r.id)}`),
              "",
              'Return ONLY JSON: {"items":[{"i":0,"story":"N1"}]} with one entry per new item.',
            ].join("\n"),
            Out,
            { temperature: 0, prefer: "gemini-3.5-flash-lite" },
          ));
        } catch (err) {
          failed.push((err as Error).message.slice(0, 160));
          continue;
        }
        const newGroups = new Map<string, string>(); // N label -> story id
        for (const [i, r] of batch.entries()) {
          const label = items.find((x) => x.i === i)?.story?.trim() ?? `N-solo-${i}`;
          let storyId: string | undefined;
          const s = /^S(\d+)$/.exec(label);
          if (s && existing[Number(s[1])]) storyId = existing[Number(s[1])].id;
          else {
            storyId = newGroups.get(label);
            if (!storyId) {
              const [row] = await sql<{ id: string }[]>`
                insert into stories (title, category_id, first_seen, last_seen)
                values (${clean.get(r.id)!}, ${r.category_id}, ${r.at}, ${r.at}) returning id`;
              storyId = row.id;
              newGroups.set(label, storyId);
              created++;
            }
          }
          await sql`update signals set story_id = ${storyId}, clustered_at = now() where id = ${r.id}`;
          touched.add(storyId);
          assigned++;
        }
        await new Promise((res) => setTimeout(res, 4_000));
      }
    }

    // Re-score every recent story (momentum changes with time even without new articles).
    const recent = await sql<{ id: string }[]>`select id from stories where last_seen >= now() - interval '14 days'`;
    for (const { id } of recent) await rescoreStory(id);

    if (failed.length && !assigned) throw new Error(`every batch failed: ${failed[0]}`);
    return { status: "ok", stats: { newArticles: fresh.length, assigned, storiesCreated: created, rescored: recent.length, failedBatches: failed.length } };
  },
};

type Member = StorySignal & { id: string; title: string; source_tier: string; category_id: string | null; subcategory_id: string | null; signal_type: string | null; is_search: boolean };

/** Recompute a story's counts, representative article, type and strength from its articles. */
export async function rescoreStory(id: string): Promise<void> {
  const rows = await sql<Member[]>`
    select s.id, s.title, s.relevance::float as relevance, coalesce(s.outlet, src.name) as outlet, src.tier,
           src.tier as source_tier, coalesce(s.published_at, s.fetched_at) as at, s.deep,
           s.category_id, s.subcategory_id, s.signal_type, src.category = 'keyword_search' as is_search
    from signals s join sources src on src.id = s.source_id
    where s.story_id = ${id}`;
  if (!rows.length) {
    await sql`delete from stories where id = ${id}`;
    return;
  }
  const { total, parts } = storyStrength(rows);
  const rep = [...rows].sort((a, b) => Number(b.relevance ?? 0) - Number(a.relevance ?? 0) || +b.at - +a.at)[0];
  const types = rows.map((r) => r.signal_type).filter(Boolean) as string[];
  const type = types.sort((a, b) => types.filter((x) => x === b).length - types.filter((x) => x === a).length)[0] ?? null;
  const times = rows.map((r) => +r.at);
  await sql`
    update stories set
      title = ${splitOutlet(rep.title, rep.outlet, rep.is_search).title},
      category_id = ${rep.category_id}, subcategory_id = ${rep.subcategory_id}, signal_type = ${type},
      first_seen = ${new Date(Math.min(...times))}, last_seen = ${new Date(Math.max(...times))},
      articles = ${rows.length}, outlets = ${new Set(rows.map((r) => r.outlet)).size},
      strength = ${total}, strength_parts = ${sql.json(parts as never)}, updated_at = now()
    where id = ${id}`;
}
