// Second, deeper pass over the strongest signals: read the full article, then have Gemini pull
// out the facts, numbers and who it matters to. Feeds the shortlist and the Signals page.
import { z } from "zod";
import { sql } from "@/lib/db";
import { env, has } from "@/lib/env";
import { generateJson } from "@/lib/gemini";
import { fetchArticle, isFetchable } from "@/lib/article";
import { activePersonas, loadTargeting, targetingBrief } from "@/lib/targeting";
import type { Job } from "./types";

const MIN_RELEVANCE = 0.6;
const MAX_PER_RUN = 20; // articles fetched per run
const BATCH = 5; // articles per Gemini call (each up to ~8k chars)
const MIN_BODY = 200; // shorter = paywall / teaser; analyse with title + summary only

const Deep = z.preprocess((v) => (Array.isArray(v) ? { items: v } : v), z.object({
  items: z.array(z.object({
    i: z.number().int(),
    facts: z.array(z.string()).catch([]),
    implication: z.string().catch(""),
    persona_ref: z.number().int().nullable().catch(null),
    industries: z.array(z.string()).catch([]),
    questions: z.array(z.string()).catch([]),
    relevance: z.number().min(0).max(1).nullable().catch(null),
  })),
}));

type Row = { id: string; title: string; url: string | null; summary: string | null; source: string; body: string | null };

function prompt(brief: string, rows: (Row & { text: string })[]): string {
  return [
    "You analyse Japanese business news for Renesis Tech Japan's content team. For EACH article:",
    "- facts: 2–5 concrete facts in Japanese, each one sentence, keeping every number, company and date",
    "  exactly as written. Only facts stated in the ARTICLE text. No opinions.",
    "- implication: in Japanese, ≤ 100 characters — what this means for the persona's company.",
    "- persona_ref: [index] of the PERSONA most affected, or null.",
    "- industries: TARGET INDUSTRIES (Japanese names as listed) this concerns; [] if none.",
    "- questions: 2–3 questions (Japanese) that persona would type into Google after reading this.",
    "- relevance 0..1: re-judge usefulness as a content hook now that you have the full text.",
    "",
    brief,
    "",
    "ARTICLES:",
    ...rows.map((r, i) => `=== [${i}] ${r.title} (${r.source})\n${r.text}`),
    "",
    'Return ONLY JSON: {"items":[{"i":0,"facts":[],"implication":"","persona_ref":null,"industries":[],"questions":[],"relevance":0.0}]}',
  ].join("\n");
}

export const deepenSignals: Job = {
  name: "deepen-signals",
  description: "Read the full text of strong signals and extract facts, implications and reader questions",
  async run() {
    if (!has(env.geminiApiKey)) return { status: "skipped", stats: {}, note: "GEMINI_API_KEY not set" };

    const rows = await sql<Row[]>`
      select s.id, s.title, s.url, s.summary, src.name as source, s.body
      from signals s join sources src on src.id = s.source_id
      where s.status = 'analyzed' and s.relevance >= ${MIN_RELEVANCE} and s.deep_at is null
        and coalesce(s.published_at, s.fetched_at) >= now() - interval '14 days'
      order by s.relevance desc, s.published_at desc nulls last
      limit ${MAX_PER_RUN}`;
    if (!rows.length) return { status: "ok", stats: { candidates: 0 }, note: "nothing new to deepen" };

    let fetched = 0;
    let fetchErrors = 0;
    const ready: (Row & { text: string })[] = [];
    for (const r of rows) {
      let body = r.body;
      if (body == null && isFetchable(r.url)) {
        try {
          body = await fetchArticle(r.url);
          fetched++;
        } catch {
          fetchErrors++;
          body = "";
        }
        await sql`update signals set body = ${body}, body_fetched_at = now() where id = ${r.id}`;
      }
      const text = body && body.length >= MIN_BODY ? body : [r.summary, body].filter(Boolean).join("\n") || "(本文なし)";
      ready.push({ ...r, text });
    }

    const targeting = await loadTargeting();
    const brief = targetingBrief(targeting);
    const personas = activePersonas(targeting);
    let deepened = 0;
    const failed: string[] = [];
    for (let start = 0; start < ready.length; start += BATCH) {
      const batch = ready.slice(start, start + BATCH);
      try {
        const { items } = await generateJson(prompt(brief, batch), Deep, { temperature: 0.1 });
        for (const it of items) {
          const row = batch[it.i];
          if (!row) continue;
          const persona = it.persona_ref != null ? personas[it.persona_ref] : undefined;
          await sql`
            update signals set
              deep = ${sql.json({ facts: it.facts, implication: it.implication, persona: persona?.name ?? null, industries: it.industries, questions: it.questions, full_text: row.text.length >= MIN_BODY && row.text !== row.summary })},
              icp_id = ${persona?.id ?? null},
              relevance = coalesce(${it.relevance}, relevance),
              deep_at = now()
            where id = ${row.id}`;
          deepened++;
        }
      } catch (err) {
        failed.push((err as Error).message.slice(0, 200));
      }
      if (start + BATCH < ready.length) await new Promise((r) => setTimeout(r, 6_000));
    }
    if (failed.length && !deepened) throw new Error(`every batch failed: ${failed[0]}`);
    return { status: "ok", stats: { candidates: rows.length, fetched, fetchErrors, deepened, failedBatches: failed.length } };
  },
};
