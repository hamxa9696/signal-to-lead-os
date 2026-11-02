// The Trends overview: one row per tracked theme (a niche keyword or a news search phrase), seen
// through four lenses at once — news, Google search, what buyers ask AI assistants, next week's
// forecast — plus whether we already have a page, scored into one explainable opportunity number.
import { sql } from "./db";
import { keywordTrends, TREND_PERIODS, type TrendPeriod } from "./trends";

export type Lens = { now: number; prev: number };
export type ThemeQuestion = { id: string; question: string; intent: string | null; cited: boolean; checked: boolean; domains: string[]; page: string | null };
export type Recommendation = {
  slot: "fast_take" | "evergreen" | "refresh" | "lead_magnet";
  label: string; why: string; seoKeyword: string; aiQuestion: string | null; targetPath: string | null;
};
export type Theme = {
  keyword: string; kind: "niche" | "search"; niche: string | null; category: string | null; catSlug: string | null; color: string | null;
  news: Lens & { relevant: number };
  google: (Lens & { clicks: number; position: number | null; queries: { query: string; impressions: number }[]; page: string | null }) | null;
  ai: { questions: ThemeQuestion[]; cited: number; checked: number };
  forecast: { direction: string; pRise: number; low: number; high: number } | null;
  coverage: { kind: "none" | "weak" | "good"; label: string; path: string | null };
  planned: { id: string; title: string } | null;
  score: number;
  parts: { news: number; google: number; ai: number; gap: number };
  rec: Recommendation;
};

const tokensOf = (kw: string) => kw.toLowerCase().split(/[\s　]+/).filter(Boolean);
/** Same rule as the keyword trends: every word must appear; Latin words match whole words only. */
function matches(text: string, tokens: string[]): boolean {
  const t = text.toLowerCase();
  return tokens.every((w) => (/^[a-z0-9]+$/.test(w) ? new RegExp(`(^|[^a-z0-9])${w}($|[^a-z0-9])`).test(t) : t.includes(w)));
}
// News-search phrases that only steer the crawler toward a kind of story (press releases, launches,
// funding, surveys…) are not themes in themselves.
const CRAWL_ONLY = /PR TIMES|提供開始|資金調達|業務提携|調査|導入事例|シリーズA|実証実験/i;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const log2 = (v: number) => Math.log2(1 + Math.max(0, v));

export async function trendBoard(period: TrendPeriod = "7d", catSlug?: string): Promise<{ themes: Theme[]; gscOn: boolean; geoWeek: string | null }> {
  const hours = TREND_PERIODS.find((p) => p.key === period)?.hours ?? 168;
  const days = Math.max(1, Math.round(hours / 24));
  const [kws, gscRows, [gscEnd], qs, fc, planned, focus] = await Promise.all([
    keywordTrends(60, period, catSlug),
    // Search Console lags 2–3 days: windows end at the latest day we have.
    sql<{ query: string; page: string; cur: boolean; impressions: number; clicks: number; position: number | null }[]>`
      with e as (select max(date) as d from search_queries_daily)
      select lower(query) as query, page, date > (select d from e) - ${days}::int as cur,
             sum(impressions)::int as impressions, sum(clicks)::int as clicks,
             (sum(position * impressions) / nullif(sum(impressions), 0))::float as position
      from search_queries_daily where date > (select d from e) - ${days * 2}::int
      group by 1, 2, 3`,
    sql<{ d: string | null }[]>`select max(date)::text as d from search_queries_daily`,
    sql<(ThemeQuestion & { keywords: string[]; score: number | null })[]>`
      select q.id, q.question, q.intent, q.keywords, r.page_path as page, r.score,
             coalesce(bool_or(g.we_cited), false) as cited, count(g.id) > 0 as checked,
             coalesce(array_agg(distinct c->>'domain') filter (where c->>'domain' is not null), '{}') as domains
      from geo_questions q
      left join geo_readiness r on r.question_id = q.id
      left join geo_checks g on g.question_id = q.id
      left join lateral jsonb_array_elements(g.citations) c on true
      where q.week_of = (select max(week_of) from geo_questions)
      group by q.id, r.page_path, r.score`,
    sql<{ term: string; direction: string; p_rise: number; low: number; high: number }[]>`
      select lower(term) as term, direction, p_rise::float, low, high from trend_forecasts
      where window_start = (select max(window_start) from trend_forecasts)`,
    sql<{ id: string; title_ja: string; primary_keyword: string | null }[]>`
      select id, title_ja, primary_keyword from topics
      where week_of >= current_date - 14 and status <> 'rejected' order by created_at desc`,
    sql<{ slug: string }[]>`select distinct c.slug from services s join categories c on c.id = s.category_id where s.focus and s.active`,
  ]);
  const [{ week: geoWeek }] = await sql<{ week: string | null }[]>`select max(week_of)::text as week from geo_questions`;
  const gscOn = !!gscEnd?.d;
  const focusCats = new Set(focus.map((f) => f.slug));

  const seenKw = new Set<string>();
  const themeKws = kws
    .filter((k) => !(k.kind === "search" && CRAWL_ONLY.test(k.keyword)))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "niche" ? -1 : 1))
    .filter((k) => { const key = k.keyword.toLowerCase().replace(/\s+/g, " ").trim(); if (seenKw.has(key)) return false; seenKw.add(key); return true; });
  const themes = themeKws.map((k): Theme => {
    const tk = tokensOf(k.keyword);
    // Google: Search Console queries that contain the theme.
    const gq = gscRows.filter((r) => matches(r.query, tk));
    const byQuery = new Map<string, number>();
    let gNow = 0, gPrev = 0, clicks = 0, posW = 0, posImp = 0;
    const byPage = new Map<string, { imp: number; pos: number }>();
    for (const r of gq) {
      if (r.cur) {
        gNow += r.impressions; clicks += r.clicks;
        byQuery.set(r.query, (byQuery.get(r.query) ?? 0) + r.impressions);
        if (r.position != null) { posW += r.position * r.impressions; posImp += r.impressions; }
        const p = byPage.get(r.page) ?? { imp: 0, pos: 0 };
        byPage.set(r.page, { imp: p.imp + r.impressions, pos: p.pos + (r.position ?? 0) * r.impressions });
      } else gPrev += r.impressions;
    }
    const position = posImp ? Math.round((posW / posImp) * 10) / 10 : null;
    const topPage = [...byPage.entries()].sort((a, b) => b[1].imp - a[1].imp)[0];
    const pagePath = topPage ? topPage[0].replace(/^https?:\/\/[^/]+/, "") || "/" : null;
    const pagePos = topPage && topPage[1].imp ? topPage[1].pos / topPage[1].imp : null;
    const google = gscOn
      ? { now: gNow, prev: gPrev, clicks, position, page: pagePath,
          queries: [...byQuery.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([query, impressions]) => ({ query, impressions })) }
      : null;

    // AI: tracked buyer questions about the theme.
    // A question belongs to the theme when it (or one of its match keywords) contains every word of the theme.
    const aq = qs.filter((q) => matches(q.question, tk) || q.keywords.some((x) => matches(x, tk)));
    const ai = { questions: aq.map(({ id, question, intent, cited, checked, domains, page }) => ({ id, question, intent, cited, checked, domains: domains.filter((d) => !d.endsWith("renesistech.jp")).slice(0, 3), page })),
      cited: aq.filter((q) => q.cited).length, checked: aq.filter((q) => q.checked).length };

    const f = fc.find((x) => x.term === k.keyword.toLowerCase());
    const forecast = f ? { direction: f.direction, pRise: f.p_rise, low: f.low, high: f.high } : null;

    // Coverage: our best page for the theme, from Google or from the AI-question readiness check.
    const readyPage = aq.find((q) => q.page && (q.score ?? 0) >= 60)?.page ?? aq.find((q) => q.page)?.page ?? null;
    const coverage: Theme["coverage"] = pagePos != null && pagePos <= 10
      ? { kind: "good", label: `Page 1 (#${Math.round(pagePos)})`, path: pagePath }
      : pagePos != null
        ? { kind: "weak", label: `Google #${Math.round(pagePos)}`, path: pagePath }
        : readyPage ? { kind: "weak", label: "Page, not ranking yet", path: readyPage }
        : { kind: "none", label: "No page", path: null };

    const p = planned.find((t) => matches(`${t.title_ja} ${t.primary_keyword ?? ""}`, tk));

    // Score parts (max 30 / 25 / 25 / 20), each explainable on hover.
    // Growth only counts against a real baseline (≥ 3 articles before); otherwise a small bonus for new activity.
    const growth = k.prev >= 3 ? (k.now - k.prev) / k.prev : 0;
    const newsPts = Math.round(clamp(5 * log2(k.relevant), 0, 20) + (k.prev >= 3 ? clamp(growth * 10, -5, 10) : k.now >= 3 ? 3 : 0));
    const gGrowth = google && google.prev >= 5 ? (google.now - google.prev) / google.prev : 0;
    const googlePts = google ? Math.round(clamp(4 * log2(google.now), 0, 18) + clamp(gGrowth * 7, 0, 7)) : 0;
    const uncited = aq.length - ai.cited;
    const aiPts = aq.length ? Math.round(clamp(4 * aq.length, 0, 12) + 13 * (uncited / aq.length)) : 0;
    const gapPts = (coverage.kind === "none" ? 12 : coverage.kind === "weak" ? 7 : 0)
      + (k.cat_slug && focusCats.has(k.cat_slug) ? 5 : 0)
      + (forecast && (forecast.direction === "rising" || forecast.direction === "emerging") ? 3 : 0);
    const parts = { news: clamp(newsPts, 0, 30), google: clamp(googlePts, 0, 25), ai: clamp(aiPts, 0, 25), gap: clamp(gapPts, 0, 20) };
    const score = parts.news + parts.google + parts.ai + parts.gap;

    // What to make: the simplest format that fits the evidence.
    const uncitedQ = aq.find((q) => !q.cited && q.intent === "comparative") ?? aq.find((q) => !q.cited) ?? aq[0] ?? null;
    const seoKeyword = google?.queries[0]?.query ?? k.keyword;
    const hot = (forecast && (forecast.direction === "rising" || forecast.direction === "emerging")) || (k.prev >= 3 && growth >= 0.5 && k.relevant >= 5);
    const rec: Recommendation = coverage.kind === "weak" && coverage.path && pagePos != null && pagePos <= 20
      ? { slot: "refresh", label: "Rewrite our page", why: `Our page sits at Google #${Math.round(pagePos)}; a rewrite can reach page 1.`, seoKeyword, aiQuestion: uncitedQ?.question ?? null, targetPath: coverage.path }
      : hot && coverage.kind !== "good"
        ? { slot: "fast_take", label: "Fast take (publish within 48h)", why: "News is rising now; a quick take catches the wave.", seoKeyword, aiQuestion: uncitedQ?.question ?? null, targetPath: null }
        : aq.some((q) => !q.cited && q.intent === "comparative")
          ? { slot: "lead_magnet", label: "Lead magnet: comparison guide", why: "Buyers ask AI how to choose, and AI cites others: a comparison guide answers that and collects emails.", seoKeyword, aiQuestion: uncitedQ?.question ?? null, targetPath: null }
          : { slot: "evergreen", label: "Evergreen article", why: coverage.kind === "good" ? "We rank already; a supporting article widens the topic." : "Steady interest and no page of ours yet.", seoKeyword, aiQuestion: uncitedQ?.question ?? null, targetPath: null };

    return {
      keyword: k.keyword, kind: k.kind, niche: k.niche, category: k.category, catSlug: k.cat_slug, color: k.color,
      news: { now: k.now, prev: k.prev, relevant: k.relevant }, google, ai, forecast, coverage,
      planned: p ? { id: p.id, title: p.title_ja } : null, score, parts, rec,
    };
  });
  themes.sort((a, b) => b.score - a.score);
  return { themes, gscOn, geoWeek };
}

/** The strongest stories behind a theme in the period (for the detail panel). */
export async function themeStories(keyword: string, period: TrendPeriod = "7d") {
  const hours = TREND_PERIODS.find((p) => p.key === period)?.hours ?? 168;
  const tk = tokensOf(keyword);
  const rows = await sql<{ id: string; signal_id: string; title: string; url: string | null; strength: number | null; outlets: number | null; type: string | null; text: string }[]>`
    select coalesce(st.id::text, s.id::text) as id, s.id as signal_id, coalesce(st.title, s.title) as title, s.url, st.strength, st.outlets, s.signal_type as type,
           lower(s.title || ' ' || coalesce(s.summary, '')) as text
    from signals s left join stories st on st.id = s.story_id
    where s.status = 'analyzed' and coalesce(s.published_at, s.fetched_at) >= now() - make_interval(hours => ${hours})
    order by st.strength desc nulls last, s.relevance desc nulls last limit 1500`;
  const seen = new Set<string>();
  const out: { title: string; url: string | null; strength: number | null; outlets: number | null; type: string | null; signalId: string }[] = [];
  for (const r of rows) {
    if (!matches(r.text, tk) || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ title: r.title, url: r.url, strength: r.strength, outlets: r.outlets, type: r.type, signalId: r.signal_id });
    if (out.length >= 8) break;
  }
  return out;
}
