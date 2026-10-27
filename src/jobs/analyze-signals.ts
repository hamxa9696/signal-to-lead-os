// Gemini pass over new news signals: relevance, matching service, buyer problem, content angle.
import { z } from "zod";
import { sql } from "@/lib/db";
import { env, has } from "@/lib/env";
import { generateJson } from "@/lib/gemini";
import type { Job } from "./types";

const BATCH = 40; // items per Gemini call (titles + short summaries)
const MAX_PER_RUN = 240; // keeps a daily run to ~6 calls on the free tier
const IGNORE_BELOW = 0.35;
const STALE_DAYS = 21;

const Result = z.object({
  items: z.array(
    z.object({
      i: z.number().int(),
      relevance: z.number().min(0).max(1),
      service_slug: z.string().nullable().catch(null),
      buyer_problem: z.string().catch(""),
      angle: z.string().catch(""),
    }),
  ),
});

type Row = { id: string; title: string; summary: string | null; source: string };

function prompt(services: { slug: string; name_ja: string }[], rows: Row[]): string {
  return [
    "You are a B2B content strategist for Renesis Tech Japan, an AI-native engineering firm.",
    "Renesis sells: AI agents, generative-AI apps, AI chatbots, AI PoCs, custom software, application",
    "modernization, cloud, QA, and blockchain/Web3 development to Japanese companies.",
    "",
    "For EACH news item below, judge how useful it is as the hook for a Japanese-language article or",
    "lead magnet that would attract Japanese companies who might BUY those services.",
    "- relevance 0..1: high = a business problem Japanese companies face that Renesis can solve",
    "  (DX pressure, AI adoption, legacy systems, labour shortage, regulation, new tech they must evaluate).",
    "  Low = consumer gadgets, earnings, personnel moves, events, pure vendor marketing, unrelated science.",
    "- service_slug: the single best matching slug from SERVICES, or null.",
    "- buyer_problem: in Japanese, max 60 characters — the business problem implied for a Japanese company.",
    "- angle: in Japanese, max 80 characters — the article angle Renesis could write (not a news rewrite).",
    "",
    "SERVICES:",
    ...services.map((s) => `- ${s.slug}: ${s.name_ja}`),
    "",
    "ITEMS:",
    ...rows.map((r, i) => `[${i}] (${r.source}) ${r.title}${r.summary ? ` — ${r.summary.slice(0, 200)}` : ""}`),
    "",
    'Return ONLY JSON: {"items":[{"i":0,"relevance":0.0,"service_slug":null,"buyer_problem":"","angle":""}, ...]} with one entry per item.',
  ].join("\n");
}

export const analyzeSignals: Job = {
  name: "analyze-signals",
  description: "Score new news signals with Gemini (relevance, service, buyer problem, angle)",
  async run() {
    if (!has(env.geminiApiKey)) {
      return { status: "skipped", stats: {}, note: "GEMINI_API_KEY not set (SETUP.md §2)" };
    }

    // Old unanalysed items are no longer worth the quota.
    const stale = await sql`
      update signals set status = 'ignored', analysis = '{"reason":"stale"}'
      where status = 'new' and coalesce(published_at, fetched_at) < now() - make_interval(days => ${STALE_DAYS})
      returning id`;

    const services = await sql<{ id: string; slug: string; name_ja: string }[]>`
      select id, slug, name_ja from services where active order by slug`;
    const serviceId = new Map(services.map((s) => [s.slug, s.id]));

    const pending = await sql<Row[]>`
      select s.id, s.title, s.summary, src.name as source
      from signals s join sources src on src.id = s.source_id
      where s.status = 'new'
      order by coalesce(s.published_at, s.fetched_at) desc
      limit ${MAX_PER_RUN}`;

    let analyzed = 0;
    let ignored = 0;
    let missing = 0;

    for (let start = 0; start < pending.length; start += BATCH) {
      const batch = pending.slice(start, start + BATCH);
      const { items } = await generateJson(prompt(services, batch), Result, { temperature: 0.1 });
      const byIndex = new Map(items.map((it) => [it.i, it]));

      for (const [i, row] of batch.entries()) {
        const it = byIndex.get(i);
        if (!it) {
          missing++; // left as 'new', retried next run
          continue;
        }
        const keep = it.relevance >= IGNORE_BELOW;
        keep ? analyzed++ : ignored++;
        await sql`
          update signals set
            status = ${keep ? "analyzed" : "ignored"},
            relevance = ${it.relevance},
            service_id = ${(it.service_slug && serviceId.get(it.service_slug)) || null},
            buyer_problem = ${it.buyer_problem || null},
            analysis = ${sql.json({ angle: it.angle, service_slug: it.service_slug })},
            analyzed_at = now()
          where id = ${row.id}`;
      }
      // Stay well under the free tier's requests-per-minute limit.
      if (start + BATCH < pending.length) await new Promise((r) => setTimeout(r, 6_000));
    }

    return {
      status: "ok",
      stats: { pending: pending.length, analyzed, ignored, missing, markedStale: stale.length },
    };
  },
};
