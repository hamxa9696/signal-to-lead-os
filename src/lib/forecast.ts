// Trend forecast: which terms are likely to get more Japanese coverage in the next 7 days.
// Counting and forecasting are plain statistics (explainable, measurable); Gemini only spots new
// terms and dated upcoming events. Every forecast is stored and later checked against real signals.
import { z } from "zod";
import { sql } from "./db";
import { generateJson } from "./gemini";
import { addDays, tokyoToday } from "./week";

export type TermKind = "search" | "niche_keyword" | "niche" | "type" | "emerging";
export type Term = { term: string; kind: TermKind; category_id: string | null; trackedSince: string; match: (s: Sig) => boolean };
type Sig = { day: string; status: string; source_id: string; category: string | null; tier: string; subcategory_id: string | null; signal_type: string | null; text: string; title: string };

const HISTORY = 28;

/** Relevant signals (+ all keyword-search articles) between two JST days, ready for matching. */
async function loadSignals(start: string, end: string): Promise<Sig[]> {
  return sql<Sig[]>`
    select to_char(coalesce(s.published_at, s.fetched_at) at time zone 'Asia/Tokyo', 'YYYY-MM-DD') as day,
           s.status, s.source_id, src.category, src.tier, s.subcategory_id, s.signal_type, s.title,
           lower(s.title || ' ' || coalesce(s.summary, '') || ' ' || coalesce(left(s.body, 1500), '')) as text
    from signals s join sources src on src.id = s.source_id
    where (coalesce(s.published_at, s.fetched_at) at time zone 'Asia/Tokyo')::date between ${start}::date and ${end}::date
      and s.status = 'analyzed'`;
}

/** Same keyword rule as trending keywords: every word present; Latin words as whole words. */
export function textMatcher(keyword: string): (s: { text: string }) => boolean {
  const words = keyword.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const tests = words.map((w) => (/^[a-z0-9]+$/.test(w) ? new RegExp(`(^|[^a-z0-9])${w}($|[^a-z0-9])`) : null));
  return (s) => words.every((w, i) => (tests[i] ? tests[i]!.test(s.text) : s.text.includes(w)));
}

/** Every term we can forecast: news searches, niche keywords, niches and signal types. */
export async function loadTerms(): Promise<Term[]> {
  const [searches, subs] = await Promise.all([
    sql<{ id: string; name: string; category_id: string | null; created: string }[]>`
      select id, name, category_id, to_char(created_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD') as created
      from sources where active and category = 'keyword_search'`,
    sql<{ id: string; name_en: string; keywords: string[]; category_id: string; created: string }[]>`
      select id, name_en, keywords, category_id, to_char(created_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD') as created
      from subcategories where active`,
  ]);
  const [{ first }] = await sql<{ first: string | null }[]>`
    select to_char(min(coalesce(published_at, fetched_at)) at time zone 'Asia/Tokyo', 'YYYY-MM-DD') as first from signals where status = 'analyzed'`;
  const since = first ?? tokyoToday();
  const terms: Term[] = [];
  for (const s of searches) {
    terms.push({ term: s.name.replace(/^Google News:\s*/, ""), kind: "search", category_id: s.category_id, trackedSince: s.created, match: (x) => x.source_id === s.id });
  }
  const seen = new Set(terms.map((t) => t.term.toLowerCase()));
  for (const sc of subs) {
    terms.push({ term: sc.name_en, kind: "niche", category_id: sc.category_id, trackedSince: sc.created, match: (x) => x.subcategory_id === sc.id });
    for (const k of sc.keywords) {
      if (seen.has(k.toLowerCase())) continue;
      seen.add(k.toLowerCase());
      const m = textMatcher(k);
      terms.push({ term: k, kind: "niche_keyword", category_id: sc.category_id, trackedSince: since, match: m });
    }
  }
  for (const t of ["regulation", "funding", "launch", "case_study", "survey", "partnership", "incident"]) {
    terms.push({ term: t, kind: "type", category_id: null, trackedSince: since, match: (x) => x.signal_type === t });
  }
  return terms;
}

/** Daily counts per term between start and end (inclusive). */
export function seriesFor(terms: Term[], sigs: Sig[], start: string, end: string): Map<string, number[]> {
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const idx = new Map(days.map((d, i) => [d, i]));
  const out = new Map<string, number[]>();
  for (const t of terms) {
    const arr = new Array(days.length).fill(0);
    for (const s of sigs) if (idx.has(s.day) && t.match(s)) arr[idx.get(s.day)!]++;
    out.set(t.term, arr);
  }
  return out;
}

// --- Gemini: new terms and dated events -------------------------------------------------------

const Scan = z.object({
  emerging: z.array(z.object({ term: z.string().min(2), category: z.string().nullable().catch(null), why: z.string().catch("") })).catch([]),
  events: z.array(z.object({ term: z.string().min(2), date: z.string().catch(""), what: z.string().catch("") })).catch([]),
});

async function scanWithGemini(recent: Sig[], older: Sig[], known: string[], windowStart: string, windowEnd: string, cats: { id: string; slug: string }[]) {
  const titles = (rows: Sig[], n: number) => rows.slice(0, n).map((s) => `- ${s.title.replace(/ - [^-]+$/, "")}`);
  try {
    return await generateJson(
      [
        "You analyse Japanese business news for Renesis Tech Japan (AI, blockchain/Web3, software, cloud, QA).",
        "",
        "TASK 1 — emerging: up to 10 specific Japanese terms (2–6 words; product, regulation, technology or business theme)",
        "that appear in several RECENT headlines but are new or much rarer in OLDER headlines, and are NOT already in KNOWN TERMS.",
        "Prefer terms Japanese companies will search for. category = one of: " + cats.map((c) => c.slug).join(", ") + ".",
        "why: ENGLISH ONLY, max 100 characters.",
        `TASK 2 — events: dated things mentioned in the headlines that happen between ${windowStart} and ${windowEnd}`,
        "(rules taking effect / 施行, deadlines, announced launches, conferences, earnings or government announcements).",
        "term = the Japanese term it concerns (prefer a KNOWN TERM if one fits); date = YYYY-MM-DD; what = ENGLISH, max 100 characters.",
        "Only include events with a date stated or clearly implied in the headlines. Do not guess.",
        "",
        "KNOWN TERMS:", known.slice(0, 120).join("、"),
        "",
        "RECENT HEADLINES (last 3 days):", ...titles(recent, 150),
        "",
        "OLDER HEADLINES (4–14 days ago, sample):", ...titles(older, 120),
        "",
        'Return ONLY JSON: {"emerging":[{"term":"","category":null,"why":""}],"events":[{"term":"","date":"","what":""}]}',
      ].join("\n"),
      Scan,
      { temperature: 0.2 },
    );
  } catch {
    return { emerging: [], events: [] };
  }
}

// --- Forecast -----------------------------------------------------------------------------------

const PHI = (z: number) => 1 / (1 + Math.exp(-1.702 * z)); // fast normal CDF approximation
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export type Forecast = {
  term: string; kind: TermKind; category_id: string | null; last_7d: number; prev_7d: number; predicted: number; low: number; high: number;
  p_rise: number; direction: "emerging" | "rising" | "steady" | "falling"; confidence: "low" | "medium" | "high";
  drivers: string[]; series: number[]; action: "fast_take" | "evergreen" | "watch";
};

export async function makeForecast(): Promise<{ windowStart: string; forecasts: Forecast[] }> {
  const today = tokyoToday();
  const yesterday = addDays(today, -1);
  const start = addDays(yesterday, -(HISTORY - 1));
  const windowStart = today;
  const windowEnd = addDays(today, 6);

  const [sigs, terms, cats] = await Promise.all([
    loadSignals(start, yesterday),
    loadTerms(),
    sql<{ id: string; slug: string }[]>`select id, slug from categories where active`,
  ]);

  // Gemini: new terms + dated events next week.
  const recent = sigs.filter((s) => s.day >= addDays(yesterday, -2));
  const older = sigs.filter((s) => s.day < addDays(yesterday, -2) && s.day >= addDays(yesterday, -13));
  const scan = await scanWithGemini(recent, older, terms.map((t) => t.term), windowStart, windowEnd, cats);
  const emergingWhy = new Map<string, string>();
  for (const e of scan.emerging) {
    if (e.why) emergingWhy.set(e.term, e.why);
    if (terms.some((t) => t.term.toLowerCase() === e.term.toLowerCase())) continue;
    terms.push({
      term: e.term, kind: "emerging", category_id: cats.find((c) => c.slug === e.category)?.id ?? null,
      trackedSince: start, match: textMatcher(e.term),
    });
  }
  const events = scan.events.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date >= windowStart && e.date <= windowEnd);

  const series = seriesFor(terms, sigs, start, yesterday);
  // All relevant news per day. Terms are judged by their SHARE of it, so adding sources (more
  // articles overall) is not mistaken for a trend.
  const totals = seriesFor([{ term: "*", kind: "type", category_id: null, trackedSince: start, match: () => true }], sigs, start, yesterday).get("*")!;
  const T7 = sum(totals.slice(-7));
  const Tp7 = sum(totals.slice(-14, -7));
  const T3 = sum(totals.slice(-3));
  const baselineOk = Tp7 >= T7 * 0.5; // collection volume comparable week to week
  // How common each early-warning source is in general (last 3 days), to spot terms with unusually many.
  const last3All = sigs.filter((x) => x.day >= addDays(yesterday, -2));
  const isPress = (x: Sig) => x.tier === "press_release" || /PR TIMES/.test(x.title);
  const pressShareAll = last3All.filter(isPress).length / Math.max(1, last3All.length);
  const hatenaShareAll = last3All.filter((x) => x.tier === "community").length / Math.max(1, last3All.length);
  const out: Forecast[] = [];
  for (const t of terms) {
    const s = series.get(t.term)!;
    const last7 = sum(s.slice(-7));
    const prev7 = sum(s.slice(-14, -7));
    const last3 = sum(s.slice(-3));
    const activeDays = s.filter((x) => x > 0).length;
    const trackedDays = Math.max(0, Math.round((Date.parse(yesterday) - Date.parse(t.trackedSince)) / 86_400_000) + 1);
    const enoughHistory = trackedDays >= 12 && baselineOk;
    const event = events.find((e) => e.term.toLowerCase() === t.term.toLowerCase() || t.term.toLowerCase().includes(e.term.toLowerCase()) || e.term.toLowerCase().includes(t.term.toLowerCase()));
    if (!last7 && !prev7 && !event) continue;

    const drivers: string[] = t.kind === "emerging" ? [`New term spotted in recent headlines${emergingWhy.get(t.term) ? `: ${emergingWhy.get(t.term)}` : ""}`] : [];
    const share7 = (last7 + 0.5) / (T7 + 1);
    const sharePrev = (prev7 + 0.5) / (Tp7 + 1);
    const share3 = (last3 + 0.5) / (T3 + 1);
    const growth = share7 / sharePrev;
    const accel = share3 / share7;
    let mult = enoughHistory ? Math.min(2.5, Math.max(0.4, Math.sqrt(growth) * Math.sqrt(accel))) : Math.min(1.5, Math.max(0.7, Math.sqrt(accel)));
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    if (enoughHistory && prev7 > 0 && Math.abs(growth - 1) >= 0.15) drivers.push(`Share of relevant news ${growth > 1 ? "up" : "down"}: ${pct(prev7 / Math.max(1, Tp7))} → ${pct(last7 / Math.max(1, T7))} week on week`);
    if (accel >= 1.4 && last3 >= 2) drivers.push(`Accelerating: ${pct(last3 / Math.max(1, T3))} of the last 3 days' relevant news vs ${pct(last7 / Math.max(1, T7))} over the week`);
    if (accel <= 0.6 && last7 >= 3) drivers.push(`Slowing: only ${last3} article${last3 === 1 ? "" : "s"} in the last 3 days`);

    // Early-warning sources in the last 3 days: officials, press releases and Hatena shares lead media coverage.
    const lead = sigs.filter((x) => x.day >= addDays(yesterday, -2) && t.match(x));
    const official = lead.filter((x) => x.tier === "official").length;
    const press = lead.filter(isPress).length;
    const hatena = lead.filter((x) => x.tier === "community").length;
    const isPressSearch = /PR TIMES/.test(t.term);
    if (official) { mult *= 1.2; drivers.push(`${official} official notice${official === 1 ? "" : "s"} (government/regulator) in the last 3 days — media usually follows`); }
    if (!isPressSearch && press >= 3 && press / Math.max(1, lead.length) > pressShareAll * 1.5) {
      mult *= 1.1;
      drivers.push(`Unusually many company press releases: ${press} of its ${lead.length} articles in the last 3 days`);
    }
    if (hatena && hatena / Math.max(1, lead.length) > hatenaShareAll * 1.5) { mult *= 1.1; drivers.push(`Shared on Hatena Bookmark (${hatena}) — readers are paying attention`); }
    if (event) { mult *= 1.3; drivers.push(`Upcoming: ${event.what} (${event.date})`); }
    if (!enoughHistory) drivers.push(trackedDays < 12 ? `Tracked for only ${trackedDays} day${trackedDays === 1 ? "" : "s"}: no week-on-week comparison yet` : "Collection grew a lot this week: week-on-week comparison skipped");

    const predicted = Math.max(event && !last7 ? 2 : 0, Math.round(last7 * mult));
    const spread = Math.sqrt(Math.max(predicted, 1)) * (activeDays >= 14 ? 1.2 : 1.6);
    const low = Math.max(0, Math.floor(predicted - 1.64 * spread));
    const high = Math.ceil(predicted + 1.64 * spread);
    const p = PHI((predicted - last7) / Math.sqrt(predicted + last7 + 1));
    const emergingNew = t.kind === "emerging" || (enoughHistory && prev7 === 0 && last7 >= 3);
    const direction: Forecast["direction"] =
      emergingNew && last7 >= 2 ? "emerging" : p >= 0.6 && predicted >= last7 * 1.2 ? "rising" : p <= 0.4 && predicted <= last7 * 0.8 ? "falling" : "steady";
    const confidence: Forecast["confidence"] = enoughHistory && activeDays >= 14 && last7 >= 8 ? "high" : activeDays >= 6 && last7 >= 3 ? "medium" : "low";
    const action: Forecast["action"] = direction === "rising" || direction === "emerging" ? "fast_take" : direction === "steady" && last7 >= 5 ? "evergreen" : "watch";
    out.push({
      term: t.term, kind: t.kind, category_id: t.category_id, last_7d: last7, prev_7d: prev7, predicted, low, high,
      p_rise: Math.round(p * 1000) / 1000, direction, confidence, drivers, series: s, action,
    });
  }
  // Emerging terms Gemini named that no article matched by text: keep out (nothing to measure).
  out.sort((a, b) => b.p_rise * Math.log(2 + b.predicted) - a.p_rise * Math.log(2 + a.predicted));
  return { windowStart, forecasts: out.slice(0, 120) };
}

export async function saveForecast(windowStart: string, rows: Forecast[]): Promise<number> {
  const windowEnd = addDays(windowStart, 6);
  await sql.begin(async (tx) => {
    await tx`delete from trend_forecasts where window_start = ${windowStart} and actual is null`;
    for (const f of rows) {
      await tx`
        insert into trend_forecasts ${tx({
          window_start: windowStart, window_end: windowEnd, term: f.term, term_kind: f.kind, category_id: f.category_id,
          last_7d: f.last_7d, prev_7d: f.prev_7d, predicted: f.predicted, low: f.low, high: f.high, p_rise: f.p_rise,
          direction: f.direction, confidence: f.confidence, drivers: tx.json(f.drivers), series: tx.json(f.series), action: f.action,
        })}
        on conflict (window_start, term) do nothing`;
    }
  });
  return rows.length;
}

// --- Checking forecasts against what actually happened -----------------------------------------

/** For every forecast window that has ended, count the real articles and mark hit / miss. */
export async function evaluateForecasts(): Promise<{ evaluated: number }> {
  const today = tokyoToday();
  const due = await sql<{ id: string; window_start: string; window_end: string; term: string; term_kind: TermKind; direction: string; last_7d: number; low: number; high: number }[]>`
    select id, window_start::text, window_end::text, term, term_kind, direction, last_7d, low, high
    from trend_forecasts where actual is null and window_end < ${today}::date`;
  if (!due.length) return { evaluated: 0 };
  const terms = await loadTerms();
  let n = 0;
  for (const ws of [...new Set(due.map((d) => d.window_start))]) {
    const rows = due.filter((d) => d.window_start === ws);
    const sigs = await loadSignals(ws, rows[0].window_end);
    for (const r of rows) {
      const t = terms.find((x) => x.term === r.term) ?? { term: r.term, kind: r.term_kind, category_id: null, trackedSince: ws, match: textMatcher(r.term) };
      const actual = sigs.filter((s) => t.match(s)).length;
      const base = Math.max(1, r.last_7d);
      const hit =
        r.direction === "rising" ? actual >= r.last_7d * 1.1 && actual > r.last_7d
        : r.direction === "falling" ? actual <= r.last_7d * 0.9
        : r.direction === "emerging" ? actual >= 3
        : Math.abs(actual - r.last_7d) <= Math.max(2, base * 0.25);
      await sql`update trend_forecasts set actual = ${actual}, hit = ${hit}, evaluated_at = now() where id = ${r.id}`;
      n++;
    }
  }
  return { evaluated: n };
}

export type Accuracy = { windows: number; forecasts: number; hitRate: number; risingPrecision: number | null; inRange: number; mae: number };

export async function forecastAccuracy(): Promise<Accuracy | null> {
  const [r] = await sql<{ windows: number; n: number; hits: number; rising: number; rising_hits: number; in_range: number; mae: number | null }[]>`
    select count(distinct window_start)::int as windows, count(*)::int as n, count(*) filter (where hit)::int as hits,
           count(*) filter (where direction in ('rising', 'emerging'))::int as rising,
           count(*) filter (where direction in ('rising', 'emerging') and hit)::int as rising_hits,
           count(*) filter (where actual between low and high)::int as in_range,
           avg(abs(actual - predicted))::float as mae
    from trend_forecasts where actual is not null`;
  if (!r.n) return null;
  return {
    windows: r.windows, forecasts: r.n, hitRate: r.hits / r.n, risingPrecision: r.rising ? r.rising_hits / r.rising : null,
    inRange: r.in_range / r.n, mae: Math.round((r.mae ?? 0) * 10) / 10,
  };
}
