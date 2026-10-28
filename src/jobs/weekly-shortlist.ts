// Monday job: the weekly content slate. 3 evergreen SEO articles + 1 fast take on the strongest
// current story + 1 lead magnet (type chosen by the reader's need), scored so the ranking is
// explainable; then each topic gets its content package (hub + spokes) from planFormats().
import { z } from "zod";
import { sql } from "@/lib/db";
import { env, has } from "@/lib/env";
import { generateJson } from "@/lib/gemini";
import { weekOf } from "@/lib/week";
import { activePersonas, loadTargeting, targetingBrief } from "@/lib/targeting";
import { groupPerformance, performancePoints, whatWorked } from "@/lib/performance";
import { planFormats } from "@/lib/format-plan";
import { MAGNET_TYPES } from "@/lib/formats";
import { resultsSummary } from "@/lib/format-results";
import type { Job } from "./types";

export const MAGNET_FORMATS = ["checklist", "calculator", "comparison", "template", "mini_report", "self_assessment", "case_collection"] as const;

// Scoring weights (max points). Performance = how similar past pieces did (5 = average / no history).
export const SCORE_MAX = { demand: 40, fit: 30, freshness: 20, performance: 10 } as const;

const TopicOut = z.object({
  kind: z.enum(["article", "lead_magnet"]),
  slot: z.enum(["evergreen", "fast_take", "lead_magnet"]).catch("evergreen"),
  magnet_format: z.enum(MAGNET_FORMATS).nullable().catch(null),
  title_ja: z.string().min(4),
  title_en: z.string().catch(""),
  primary_keyword: z.string().min(1),
  secondary_keywords: z.array(z.string()).catch([]),
  search_intent: z.enum(["informational", "commercial", "transactional", "navigational"]).catch("informational"),
  service_slug: z.string().nullable().catch(null),
  persona_ref: z.number().int().nullable().catch(null),
  fit: z.number().min(0).max(10).catch(5),
  demand_estimate: z.number().min(0).max(10).catch(3),
  evergreen: z.boolean().catch(true),
  signal_refs: z.array(z.number().int()).catch([]),
  rationale: z.string().catch(""),
  outline: z.array(z.string()).catch([]),
  cta: z.string().catch(""),
});
const Result = z.preprocess(
  (v) => (Array.isArray(v) ? { topics: v } : v), // bare array from lighter models
  z.object({ topics: z.array(TopicOut).min(1) }),
);

type SignalRow = {
  id: string; title: string; buyer_problem: string | null; angle: string | null; service: string | null; niche: string | null;
  published_at: Date | null; strength: number | null; outlets: number | null; signal_type: string | null;
};
type QueryRow = { query: string; impressions: number; clicks: number; position: number };

function nextMagnetFormat(recent: string[]): (typeof MAGNET_FORMATS)[number] {
  return MAGNET_FORMATS.find((f) => !recent.includes(f)) ?? MAGNET_FORMATS[0];
}

function buildPrompt(p: {
  brief: string;
  signals: SignalRow[];
  queries: QueryRow[];
  existing: string[];
  magnetFormat: string;
  factSheet: string;
  worked: string[];
  results?: string;
  trending?: string[];
}): string {
  return [
    "You are the content strategist for Renesis Tech Japan (renesistech.jp), an AI-native engineering firm",
    "selling to Japanese companies. Goal: maximum ORGANIC SEARCH TRAFFIC to renesistech.jp from Japanese",
    "business readers, plus email sign-ups and inquiries. Plan this week's content.",
    "",
    "Produce exactly 5 topics, this SLATE:",
    "- 3 × slot \"evergreen\" (kind article): long-tail, buyer-intent Japanese queries people actually type",
    "  (patterns like 〜とは / 費用 / 相場 / 比較 / 進め方 / 事例 / 失敗 / 選び方 / 外注). Built for Google search.",
    "- 1 × slot \"fast_take\" (kind article): a practical take on the STRONGEST, most current story in NEWS SIGNALS",
    "  (highest strength, most outlets, last few days) — what it means for the reader and what to do. It will be",
    "  published within 48 hours and pushed on social media, so pick news that is hot NOW. Must cite that signal.",
    "- 1 × slot \"lead_magnet\" (kind lead_magnet).",
    "- Prioritise AI and software services. At most 1 of the 5 topics may be blockchain/Web3 — the blog",
    "  already covers that heavily.",
    "- Do NOT duplicate EXISTING CONTENT.",
    "- NEWS SIGNALS show their market niche in {braces}; spread topics across niches rather than piling into one.",
    "- The lead magnet's magnet_format is chosen by what the reader needs: " +
      Object.entries(MAGNET_TYPES).map(([k, v]) => `${k} = ${v.when}`).join("; ") + ".",
    `  Prefer a format not used recently (recent: ${p.magnetFormat || "none"}). It must be something a Japanese manager`,
    "  would trade an email address for (practical, specific, reusable). Its outline lists the sections/items it contains.",
    "  Do not put an item count in a lead-magnet title (checklists have 25–40 items, decided when written).",
    "- primary_keyword: one Japanese search query (2–5 words). secondary_keywords: 3–6 related queries.",
    "- When SEARCH CONSOLE QUERIES are given, prefer topics that can win those queries.",
    "- persona_ref: the [index] of the ONE persona this topic is written for. Spread the 5 topics across",
    "  personas, weighted toward Primary ones; use their 課題 and 業界 to choose angles and examples.",
    "- Favour services marked ★ and high-priority industries; skip industries not listed unless the topic",
    "  is industry-neutral.",
    "- fit 0–10: how directly the topic serves the chosen persona's problem AND leads toward a Renesis service.",
    "- demand_estimate 0–10: your estimate of Japanese search demand for primary_keyword.",
    "- signal_refs: indexes of NEWS SIGNALS this topic draws on ([] if none).",
    "- title_ja: natural Japanese title, ≤ 40 characters, no clickbait. title_en: English gloss.",
    "- outline: 5–8 Japanese H2 headings. cta: one Japanese call to action pointing at the matching service",
    "  or the free AI診断 (renesistech.jp/ai-shindan).",
    "- rationale: 1–2 English sentences on why this topic, this week.",
    "",
    "AUDIENCE (service_slug must be a slug from SERVICES):",
    p.brief,
    "",
    p.factSheet ? `RENESIS FACT SHEET:\n${p.factSheet.slice(0, 3000)}\n` : "",
    "SEARCH CONSOLE QUERIES (last 28 days; impressions, clicks, avg position):",
    ...(p.queries.length
      ? p.queries.map((q) => `- ${q.query} — ${q.impressions} imp, ${q.clicks} clicks, pos ${q.position.toFixed(1)}`)
      : ["- (none yet — Search Console not connected or no data)"]),
    "",
    p.results ? `${p.results}\n` : "",
    p.trending?.length ? `LIKELY TO TREND IN THE NEXT 7 DAYS (forecast from signals; the fast take and at least one evergreen topic should use these):\n${p.trending.join("\n")}\n` : "",
    "WHAT WORKED ON renesistech.jp (last 28 days; do more of this, without duplicating it):",
    ...(p.worked.length ? p.worked.map((w) => `- ${w}`) : ["- (no performance data yet)"]),
    "",
    "NEWS SIGNALS (already filtered for relevance):",
    ...(p.signals.length
      ? p.signals.map((s, i) => `[${i}]${s.strength != null ? ` (strength ${s.strength}, ${s.outlets} outlet${s.outlets === 1 ? "" : "s"}${s.signal_type ? `, ${s.signal_type}` : ""})` : ""}${s.niche ? ` {${s.niche}}` : ""} ${s.title}${s.buyer_problem ? ` | 課題: ${s.buyer_problem}` : ""}${s.angle ? ` | 切り口: ${s.angle}` : ""}`)
      : ["- (none)"]),
    "",
    "EXISTING CONTENT (do not duplicate):",
    ...(p.existing.length ? p.existing.map((e) => `- ${e}`) : ["- (none)"]),
    "",
    'Return ONLY JSON: {"topics":[{"kind","magnet_format","title_ja","title_en","primary_keyword","secondary_keywords",',
    '"search_intent","slot","service_slug","persona_ref","fit","demand_estimate","evergreen","signal_refs","rationale","outline","cta"}]}',
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** Search Console impressions (28d) for queries overlapping the keyword. */
async function gscImpressions(keyword: string): Promise<number> {
  const kw = keyword.trim();
  if (kw.length < 2) return 0;
  const [{ imp }] = await sql<{ imp: number }[]>`
    select coalesce(sum(impressions), 0)::int as imp from search_queries_daily
    where date >= current_date - 28
      and (query ilike ${"%" + kw + "%"} or (length(query) >= 3 and ${kw} ilike '%' || query || '%'))`;
  return imp;
}

function freshnessPoints(dates: (Date | null)[], evergreen: boolean): number {
  const ages = dates.filter((d): d is Date => d !== null).map((d) => (Date.now() - d.getTime()) / 86_400_000);
  if (!ages.length) return evergreen ? 10 : 5;
  const newest = Math.min(...ages);
  return newest <= 3 ? 20 : newest <= 7 ? 15 : newest <= 14 ? 10 : 5;
}

export function makeWeeklyShortlist(opts: { force?: boolean } = {}): Job {
  return {
    name: "weekly-shortlist",
    description: "Generate this week's topic shortlist (5 articles + 1 lead magnet) with Gemini",
    async run() {
      if (!has(env.geminiApiKey)) {
        return { status: "skipped", stats: {}, note: "GEMINI_API_KEY not set (SETUP.md §2)" };
      }
      const week = weekOf();
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from topics where week_of = ${week}`;
      if (n > 0 && !opts.force) {
        return { status: "skipped", stats: { week, existing: n }, note: "shortlist already generated for this week (use --force)" };
      }
      if (opts.force) await sql`delete from topics where week_of = ${week} and status = 'proposed'`;

      const targeting = await loadTargeting();
      const personas = activePersonas(targeting);
      const serviceId = new Map(targeting.services.filter((s) => s.active).map((s) => [s.slug, s.id]));
      const serviceId_ = (slug: string) => serviceId.get(slug) ?? null;

      const signals = await sql<SignalRow[]>`
        select s.id, s.title, s.buyer_problem, s.analysis->>'angle' as angle,
               sv.slug as service, s.published_at, coalesce(sc.name_en, c.name_en) as niche,
               st.strength, st.outlets, s.signal_type
        from signals s left join services sv on sv.id = s.service_id
        left join subcategories sc on sc.id = s.subcategory_id left join categories c on c.id = s.category_id
        left join stories st on st.id = s.story_id
        where s.status = 'analyzed' and s.relevance >= 0.5
          and coalesce(s.published_at, s.fetched_at) >= now() - interval '14 days'
          and not exists (select 1 from topic_signals ts where ts.signal_id = s.id)
        order by coalesce(st.strength, round(s.relevance * 50)) desc, s.published_at desc nulls last
        limit 40`;

      const queries = await sql<QueryRow[]>`
        select query, sum(impressions)::int as impressions, sum(clicks)::int as clicks,
               (sum(position * impressions) / nullif(sum(impressions), 0))::float as position
        from search_queries_daily
        where date >= current_date - 28
        group by query
        having sum(impressions) > 0
           and sum(position * impressions) / nullif(sum(impressions), 0) between 3 and 40
        order by impressions desc
        limit 40`;

      const existingRows = await sql<{ t: string }[]>`
        select title as t from site_pages where section = 'blog' and title <> 'blog'
        union all
        select title_ja as t from topics where week_of >= ${week}::date - 84 and status <> 'rejected'`;

      const recentFormats = (
        await sql<{ f: string }[]>`
          select magnet_format as f from topics
          where kind = 'lead_magnet' and status <> 'rejected' and week_of >= ${week}::date - 28`
      ).map((r) => r.f);
      const magnetFormat = [...new Set(recentFormats)].join(", ");

      const [fact] = await sql<{ content: string }[]>`select content from knowledge_docs where kind = 'fact_sheet'`;
      const [perf, worked, results, trendRows] = await Promise.all([
        groupPerformance(), whatWorked(), resultsSummary().catch(() => ""),
        sql<{ term: string; direction: string; predicted: number; last_7d: number; drivers: string[] }[]>`
          select term, direction, predicted, last_7d, drivers from trend_forecasts
          where window_start = (select max(window_start) from trend_forecasts) and direction in ('rising', 'emerging')
          order by p_rise desc limit 12`.catch(() => []),
      ]);
      const trending = trendRows.map((r) => `- ${r.term} (${r.direction}: ${r.last_7d} → ~${r.predicted} articles; ${(r.drivers ?? [])[0] ?? ""})`);

      const { topics } = await generateJson(
        buildPrompt({
          brief: targetingBrief(targeting),
          signals,
          queries,
          existing: existingRows.map((r) => r.t),
          magnetFormat,
          factSheet: fact?.content ?? "",
          worked,
          results,
          trending,
        }),
        Result,
        { temperature: 0.5 },
      );

      let inserted = 0;
      const ids: string[] = [];
      for (const t of topics) {
        const refs = t.signal_refs.filter((i) => i >= 0 && i < signals.length);
        const imp = await gscImpressions(t.primary_keyword);
        const demand = imp > 0
          ? Math.round(SCORE_MAX.demand * Math.min(1, Math.log10(1 + imp) / 3)) // 1,000 imp = full marks
          : Math.round(t.demand_estimate * 2); // estimate only: capped at 20
        const fit = Math.round(t.fit * 3);
        const freshness = freshnessPoints(refs.map((i) => signals[i].published_at), t.evergreen);
        const topicServiceId = (t.service_slug && serviceId_(t.service_slug)) || null;
        const mf = t.kind === "lead_magnet" ? (t.magnet_format ?? nextMagnetFormat(recentFormats)) : null;
        const perfScore = performancePoints(perf, topicServiceId, t.kind, mf);
        const performance = perfScore.points;
        const score = demand + fit + freshness + performance;

        const [row] = await sql<{ id: string }[]>`
          insert into topics (
            kind, magnet_format, title_ja, title_en, primary_keyword, secondary_keywords, search_intent,
            service_id, icp_id, score, score_breakdown, rationale, outline, cta, week_of, slot
          ) values (
            ${t.kind}, ${mf},
            ${t.title_ja}, ${t.title_en || null}, ${t.primary_keyword}, ${t.secondary_keywords},
            ${t.search_intent}, ${topicServiceId},
            ${t.persona_ref != null ? (personas[t.persona_ref]?.id ?? null) : null},
            ${score},
            ${sql.json({
              demand, demand_source: imp > 0 ? "search_console" : "estimate", gsc_impressions_28d: imp,
              fit, freshness, performance, performance_note: perfScore.note, evergreen: t.evergreen,
            })},
            ${t.rationale || null}, ${sql.json(t.outline)}, ${t.cta || null}, ${week},
            ${t.kind === "lead_magnet" ? "lead_magnet" : t.slot === "lead_magnet" ? "evergreen" : t.slot}
          ) returning id`;
        ids.push(row.id);
        for (const i of refs) {
          await sql`insert into topic_signals (topic_id, signal_id) values (${row.id}, ${signals[i].id}) on conflict do nothing`;
        }
        inserted++;
      }

      // Content package for each topic: hub + spokes + scores (one Gemini call; skipped if it fails).
      const planned = await planFormats(ids).catch(() => ({ planned: 0 }));

      return {
        status: "ok",
        stats: { week, topics: inserted, formatsPlanned: planned.planned, signalsUsed: signals.length, gscQueries: queries.length, magnetFormat, livePieces: perf.overall.pieces },
      };
    },
  };
}
