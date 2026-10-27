// Monthly review: which pages to refresh, which wins to expand, which dead pages to prune.
import "server-only";
import { sql } from "./db";
import { dataEnd, pagePerformance } from "./performance";

export const RULES = {
  refresh: { minPosition: 8, maxPosition: 20, minImpressions: 50 },
  expand: { topShare: 0.2, minSessions: 30, queryMinImpressions: 20, queryMinPosition: 10 },
  prune: { minAgeDays: 90, maxSessions: 10, maxImpressions: 50 },
} as const;

export const monthStart = (d = new Date()) => {
  const tokyo = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(d);
  return `${tokyo}-01`;
};

const GSC_PATH = sql`regexp_replace(regexp_replace(page, '^https?://[^/]+', ''), '(.)/+$', '\\1')`;

type Q = { query: string; clicks: number; impressions: number; position: number };

async function queriesByPath(days: number): Promise<Map<string, Q[]>> {
  const end = await dataEnd();
  const rows = await sql<(Q & { path: string })[]>`
    select ${GSC_PATH} as path, query, sum(clicks)::int as clicks, sum(impressions)::int as impressions,
           (sum(position * impressions) / nullif(sum(impressions), 0))::float as position
    from search_queries_daily
    where date > ${end.sc}::date - ${days}::int and date <= ${end.sc}::date
    group by 1, 2`;
  const m = new Map<string, Q[]>();
  for (const r of rows) m.set(r.path, [...(m.get(r.path) ?? []), r]);
  for (const qs of m.values()) qs.sort((a, b) => b.impressions - a.impressions);
  return m;
}

export type Action = { kind: "refresh" | "expand" | "prune"; path: string; title: string | null; reason: string; data: Record<string, unknown>; priority: number };

export async function computeMonthlyActions(): Promise<Action[]> {
  const [pages, queries] = await Promise.all([pagePerformance(28), queriesByPath(28)]);
  const actions: Action[] = [];
  const existingTitles = pages.map((p) => (p.title ?? "").toLowerCase());

  // Refresh: page 2 of Google with real impressions. Biggest upside first.
  for (const p of pages) {
    const r = RULES.refresh;
    if (p.position == null || p.position < r.minPosition || p.position > r.maxPosition || p.impressions < r.minImpressions) continue;
    const top = (queries.get(p.path) ?? []).slice(0, 5);
    actions.push({
      kind: "refresh",
      path: p.path,
      title: p.title,
      reason: `Avg position ${p.position.toFixed(1)} with ${p.impressions} impressions (28d). Reaching page 1 typically multiplies clicks several times.`,
      data: { position: p.position, impressions: p.impressions, clicks: p.clicks, sessions: p.sessions, queries: top, query: "" },
      priority: p.impressions / p.position,
    });
  }

  // Expand: the top pages by value; queries they appear for but don't rank well on.
  // Pages already flagged for refresh are fixed first (a new article would compete with them).
  const refreshing = new Set(actions.filter((a) => a.kind === "refresh").map((a) => a.path));
  const valued = pages
    .filter((p) => !refreshing.has(p.path))
    .map((p) => ({ p, v: p.sessions + 30 * (p.leads + p.downloads) }))
    .filter((x) => x.p.sessions >= RULES.expand.minSessions)
    .sort((a, b) => b.v - a.v);
  for (const { p, v } of valued.slice(0, Math.max(1, Math.ceil(valued.length * RULES.expand.topShare)))) {
    const gaps = (queries.get(p.path) ?? []).filter(
      (q) =>
        q.impressions >= RULES.expand.queryMinImpressions &&
        q.position > RULES.expand.queryMinPosition &&
        !existingTitles.some((t) => q.query.split(/\s+/).every((w) => t.includes(w.toLowerCase()))),
    );
    for (const q of gaps.slice(0, 3)) {
      actions.push({
        kind: "expand",
        path: p.path,
        title: p.title,
        reason: `This page performs well (${p.sessions} sessions, ${p.leads + p.downloads} leads in 28d) and shows up for 「${q.query}」 at position ${q.position.toFixed(1)}. A dedicated article could win that query.`,
        data: { query: q.query, query_impressions: q.impressions, query_position: q.position, page_value: v },
        priority: q.impressions,
      });
    }
  }

  // Prune: old pages nobody visits or finds.
  const pr = RULES.prune;
  for (const p of pages) {
    const age = p.published_at ? (Date.now() - new Date(p.published_at).getTime()) / 86_400_000 : null;
    if (age == null || age < pr.minAgeDays) continue;
    if (p.sessions > pr.maxSessions || p.impressions > pr.maxImpressions) continue;
    actions.push({
      kind: "prune",
      path: p.path,
      title: p.title,
      reason: `${Math.round(age)} days old, ${p.sessions} sessions and ${p.impressions} impressions in 28 days. Merge it into a stronger page, rewrite it for a real query, or remove it (set noindex or a redirect).`,
      data: { sessions: p.sessions, impressions: p.impressions, age_days: Math.round(age), query: "" },
      priority: age,
    });
  }
  return actions;
}

/** Store this month's actions (keeps status of ones already decided). */
export async function generateMonthlyReview(month = monthStart()): Promise<{ month: string; counts: Record<string, number> }> {
  const actions = await computeMonthlyActions();
  for (const a of actions) {
    await sql`
      insert into review_actions (month, kind, path, title, reason, data, priority, query_key)
      values (${month}, ${a.kind}, ${a.path}, ${a.title}, ${a.reason}, ${sql.json(a.data as never)}, ${a.priority}, ${String(a.data.query ?? "")})
      on conflict (month, kind, path, query_key) do update set
        reason = excluded.reason, data = excluded.data, priority = excluded.priority, title = excluded.title`;
  }
  const counts = { refresh: 0, expand: 0, prune: 0 } as Record<string, number>;
  for (const a of actions) counts[a.kind]++;
  return { month, counts };
}

/** Turn a recommendation into work: refresh → approved rewrite task, expand → topic for next week. */
export async function actOnReview(actionId: string): Promise<string> {
  const { weekOf, addDays } = await import("./week");
  const [a] = await sql<{ id: string; kind: string; path: string; title: string | null; reason: string; data: Record<string, any>; topic_id: string | null }[]>`
    select id, kind, path, title, reason, data, topic_id from review_actions where id = ${actionId}`;
  if (!a) throw new Error("recommendation not found");
  if (a.topic_id) return a.topic_id;
  if (a.kind === "prune") throw new Error("prune recommendations are handled in Payload; mark them done");

  const queries: Q[] = a.data.queries ?? [];
  const isRefresh = a.kind === "refresh";
  const [t] = await sql<{ id: string }[]>`
    insert into topics (kind, title_ja, primary_keyword, secondary_keywords, search_intent, rationale, week_of, status, decided_at, origin, target_path, score)
    values (
      'article',
      ${isRefresh ? `【リライト】${a.title ?? a.path}` : `「${a.data.query}」をテーマにした記事`},
      ${isRefresh ? (queries[0]?.query ?? null) : a.data.query},
      ${isRefresh ? queries.slice(1, 5).map((q) => q.query) : []},
      'informational',
      ${a.reason},
      ${isRefresh ? weekOf() : addDays(weekOf(), 7)},
      ${isRefresh ? "approved" : "proposed"},
      ${isRefresh ? sql`now()` : null},
      ${a.kind},
      ${isRefresh ? a.path : null},
      null
    ) returning id`;
  await sql`update review_actions set topic_id = ${t.id}, status = 'done' where id = ${a.id}`;
  return t.id;
}

export async function setReviewStatus(actionId: string, status: "open" | "done" | "dismissed"): Promise<void> {
  await sql`update review_actions set status = ${status} where id = ${actionId}`;
}
