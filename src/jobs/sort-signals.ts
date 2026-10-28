// Put relevant signals into a category / sub-category: everything analysed before the taxonomy
// existed, and everything again after the owner changes the categories ("Re-sort" resets sorted_at).
import { z } from "zod";
import { sql } from "@/lib/db";
import { env, has } from "@/lib/env";
import { generateJson } from "@/lib/gemini";
import { loadTargeting } from "@/lib/targeting";
import { loadTaxonomy, resolveSlug, taxonomyBrief } from "@/lib/taxonomy";
import { TYPE_KEYS, TYPE_PROMPT } from "@/lib/signal-types";
import type { Job } from "./types";

const BATCH = 60;
const MAX_PER_RUN = 600;
const WINDOW_DAYS = 45;

const Out = z.preprocess((v) => (Array.isArray(v) ? { items: v } : v), z.object({
  items: z.array(z.object({ i: z.number().int(), slug: z.string().nullable().catch(null), why: z.string().catch(""), signal_type: z.enum(TYPE_KEYS).nullable().catch(null) })),
}));

type Row = { id: string; title: string; buyer_problem: string | null; angle: string | null; service_category: string | null };

export const sortSignals: Job = {
  name: "sort-signals",
  description: "Assign relevant signals to a service category and sub-category (Gemini)",
  async run() {
    if (!has(env.geminiApiKey)) return { status: "skipped", stats: {}, note: "GEMINI_API_KEY not set" };
    const rows = await sql<Row[]>`
      select s.id, s.title, s.buyer_problem, s.analysis->>'angle' as angle, sv.category_id as service_category
      from signals s left join services sv on sv.id = s.service_id
      where s.status = 'analyzed' and s.sorted_at is null
        and coalesce(s.published_at, s.fetched_at) >= now() - make_interval(days => ${WINDOW_DAYS})
      order by s.relevance desc nulls last
      limit ${MAX_PER_RUN}`;
    if (!rows.length) return { status: "ok", stats: { pending: 0 }, note: "nothing to sort" };

    const [taxonomy, targeting] = await Promise.all([loadTaxonomy(), loadTargeting()]);
    const brief = taxonomyBrief(taxonomy, (id) => targeting.personas.find((p) => p.id === id)?.name);
    let sorted = 0;
    let unsorted = 0;
    const failed: string[] = [];

    for (let start = 0; start < rows.length; start += BATCH) {
      const batch = rows.slice(start, start + BATCH);
      try {
        const { items } = await generateJson(
          [
            "Sort Japanese business news into Renesis Tech Japan's market sub-categories.",
            "For EACH item pick the single best sub-category slug; use a category slug if only the category fits;",
            "null if it fits nothing. Judge by the business use-case and industry, not by passing mentions.",
            "why: ENGLISH ONLY (never Japanese), max 140 characters — what in the item puts it in that sub-category (use case, industry,",
            "company type or keyword), or why nothing fits.",
            TYPE_PROMPT,
            "",
            brief,
            "",
            "ITEMS:",
            ...batch.map((r, i) => `[${i}] ${r.title}${r.buyer_problem ? ` | 課題: ${r.buyer_problem}` : ""}${r.angle ? ` | 切り口: ${r.angle}` : ""}`),
            "",
            'Return ONLY JSON: {"items":[{"i":0,"slug":null,"why":"","signal_type":null}]} with one entry per item.',
          ].join("\n"),
          Out,
          { temperature: 0.1, prefer: "gemini-3.5-flash-lite" },
        );
        const bySlug = new Map(items.map((x) => [x.i, x.slug]));
        const byWhy = new Map(items.map((x) => [x.i, x.why]));
        const byType = new Map(items.map((x) => [x.i, x.signal_type]));
        for (const [i, r] of batch.entries()) {
          if (!bySlug.has(i)) continue; // retried next run
          const hit = resolveSlug(taxonomy, bySlug.get(i));
          const category = hit.category_id ?? r.service_category; // fall back to the service's category
          hit.subcategory_id || category ? sorted++ : unsorted++;
          await sql`
            update signals set category_id = ${category}, subcategory_id = ${hit.subcategory_id}, sorted_at = now(),
              signal_type = coalesce(${byType.get(i) ?? null}, signal_type),
              analysis = coalesce(analysis, '{}'::jsonb) || ${sql.json({ sort_why: byWhy.get(i) ?? "", sort_by: hit.subcategory_id ? "subcategory" : category ? (hit.category_id ? "category" : "service") : "none" })}
            where id = ${r.id}`;
        }
      } catch (err) {
        failed.push((err as Error).message.slice(0, 200));
      }
      if (start + BATCH < rows.length) await new Promise((r) => setTimeout(r, 5_000));
    }
    if (failed.length && !sorted && !unsorted) throw new Error(`every batch failed: ${failed[0]}`);
    return { status: "ok", stats: { pending: rows.length, sorted, unsorted, failedBatches: failed.length } };
  },
};
