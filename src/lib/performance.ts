// Performance per piece and per service: GA4 (metrics_daily), Search Console
// (search_queries_daily) and downloads (form_submissions). Feeds the Performance page,
// the topic workspace and the "performance" part of topic scoring.
import "server-only";
import { sql } from "./db";

export const SITE_PATH = "*";

// Strip origin + trailing slash so GSC URLs match GA4 paths.
const GSC_PATH = sql`regexp_replace(regexp_replace(page, '^https?://[^/]+', ''), '(.)/+$', '\\1')`;

/**
 * Last day with data for each source. Periods end there (not today), because GA4 and
 * Search Console lag 1–3 days; ending at today would make every period look like a drop.
 */
export async function dataEnd(): Promise<{ ga: string; sc: string }> {
  const [r] = await sql<{ ga: string | null; sc: string | null }[]>`
    select (select max(date) from metrics_daily where channel = 'website')::text as ga,
           (select max(date) from search_queries_daily)::text as sc`;
  const today = new Date().toISOString().slice(0, 10);
  return { ga: r.ga ?? today, sc: r.sc ?? today };
}

export type Totals = { sessions: number; users: number; leads: number; downloads: number; clicks: number; impressions: number };

export async function siteTotals(days: number, offsetDays = 0): Promise<Totals> {
  const end = await dataEnd();
  const [ga] = await sql<{ sessions: number; users: number; leads: number }[]>`
    select coalesce(sum(sessions), 0)::int as sessions, coalesce(sum(users), 0)::int as users, coalesce(sum(leads), 0)::int as leads
    from metrics_daily
    where channel = 'website' and page_path = ${SITE_PATH} and source_medium = ''
      and date > ${end.ga}::date - ${days + offsetDays}::int and date <= ${end.ga}::date - ${offsetDays}::int`;
  const [sc] = await sql<{ clicks: number; impressions: number }[]>`
    select coalesce(sum(clicks), 0)::int as clicks, coalesce(sum(impressions), 0)::int as impressions
    from search_queries_daily
    where date > ${end.sc}::date - ${days + offsetDays}::int and date <= ${end.sc}::date - ${offsetDays}::int`;
  const [dl] = await sql<{ downloads: number }[]>`
    select count(*)::int as downloads from form_submissions
    where form_kind = 'lead_magnet'
      and received_at > now() - make_interval(days => ${days + offsetDays}) and received_at <= now() - make_interval(days => ${offsetDays})`;
  return { ...ga, ...sc, ...dl };
}

export type PageRow = {
  path: string;
  title: string | null;
  ours: boolean; // produced by this system
  kind: string | null;
  service: string | null;
  topic_id: string | null;
  published_at: Date | null;
  sessions: number;
  sessions_prev: number;
  engaged_rate: number | null;
  avg_engagement_sec: number | null;
  leads: number;
  downloads: number;
  clicks: number;
  impressions: number;
  position: number | null;
};

/** Every blog page (ours + existing posts) with the last `days` days of performance. */
export async function pagePerformance(days = 28): Promise<PageRow[]> {
  const end = await dataEnd();
  return sql<PageRow[]>`
    with pages as (
      select p.page_path as path, ci.title, true as ours, ci.type as kind, sv.name_ja as service,
             ci.topic_id, p.published_at, ci.id as item_id
      from publications p
      join content_items ci on ci.id = p.content_item_id
      left join topics t on t.id = ci.topic_id
      left join services sv on sv.id = t.service_id
      where p.channel = 'website' and p.page_path is not null
      union all
      select sp.path, sp.title, false, null, null, null, sp.lastmod, null
      from site_pages sp
      where sp.section = 'blog' and sp.path <> '/blog'
        and not exists (select 1 from publications p where p.page_path = sp.path)
    ),
    ga as (
      select page_path,
             sum(sessions) filter (where date > ${end.ga}::date - ${days}::int)::int as sessions,
             sum(sessions) filter (where date <= ${end.ga}::date - ${days}::int)::int as sessions_prev,
             sum(engaged_sessions) filter (where date > ${end.ga}::date - ${days}::int)::float as engaged,
             avg(avg_engagement_sec) filter (where date > ${end.ga}::date - ${days}::int and sessions > 0)::float as eng_sec,
             sum(leads) filter (where date > ${end.ga}::date - ${days}::int)::int as leads
      from metrics_daily
      where channel = 'website' and source_medium = '' and date > ${end.ga}::date - ${days * 2}::int and date <= ${end.ga}::date
      group by page_path
    ),
    sc as (
      select ${GSC_PATH} as path, sum(clicks)::int as clicks, sum(impressions)::int as impressions,
             (sum(position * impressions) / nullif(sum(impressions), 0))::float as position
      from search_queries_daily
      where date > ${end.sc}::date - ${days}::int and date <= ${end.sc}::date
      group by 1
    ),
    dl as (
      select content_item_id, count(*)::int as downloads from form_submissions
      where form_kind = 'lead_magnet' and received_at > now() - make_interval(days => ${days})
      group by 1
    )
    select pg.path, pg.title, pg.ours, pg.kind, pg.service, pg.topic_id, pg.published_at,
           coalesce(ga.sessions, 0) as sessions, coalesce(ga.sessions_prev, 0) as sessions_prev,
           case when ga.sessions > 0 then ga.engaged / ga.sessions end as engaged_rate,
           ga.eng_sec as avg_engagement_sec,
           coalesce(ga.leads, 0) as leads, coalesce(dl.downloads, 0) as downloads,
           coalesce(sc.clicks, 0) as clicks, coalesce(sc.impressions, 0) as impressions, sc.position
    from pages pg
    left join ga on ga.page_path = pg.path
    left join sc on sc.path = pg.path
    left join dl on dl.content_item_id = pg.item_id
    order by pg.ours desc, coalesce(ga.sessions, 0) desc, coalesce(sc.impressions, 0) desc`;
}

export type QueryRow = { query: string; clicks: number; impressions: number; position: number };

export async function topQueriesForPath(path: string, days = 28, limit = 10): Promise<QueryRow[]> {
  const end = await dataEnd();
  return sql<QueryRow[]>`
    select query, sum(clicks)::int as clicks, sum(impressions)::int as impressions,
           (sum(position * impressions) / nullif(sum(impressions), 0))::float as position
    from search_queries_daily
    where date > ${end.sc}::date - ${days}::int and ${GSC_PATH} = ${path}
    group by query order by impressions desc limit ${limit}`;
}

export type SourceRow = { source_medium: string; sessions: number };

export async function sourcesForPath(path: string, days = 28): Promise<SourceRow[]> {
  const end = await dataEnd();
  return sql<SourceRow[]>`
    select source_medium, sum(sessions)::int as sessions from metrics_daily
    where channel = 'website' and page_path = ${path} and source_medium <> '' and date > ${end.ga}::date - ${days}::int
    group by 1 order by 2 desc limit 8`;
}

// ---------------------------------------------------------------------------
// Scoring feedback
// ---------------------------------------------------------------------------

export const MIN_PIECES = 2; // fewer published pieces than this = not enough history
const WINDOW_DAYS = 90;

export type GroupPerf = { key: string; pieces: number; perDay: number; leadsPerDay: number };

/**
 * Average daily sessions (and leads/downloads) per published piece, grouped by service and by
 * lead-magnet format, over each piece's first 90 days. Normalising per day keeps old and new
 * pieces comparable.
 */
type PieceRow = { service_id: string | null; format: string | null; kind: string; days: number; sessions: number; leads: number };

export async function groupPerformance(): Promise<{ overall: GroupPerf; byService: Map<string, GroupPerf>; byFormat: Map<string, GroupPerf> }> {
  const rows: PieceRow[] = [...(await sql<PieceRow[]>`
    with pieces as (
      select p.page_path, p.published_at, ci.id as item_id, ci.type as kind, t.service_id, t.magnet_format as format,
             greatest(1, least(${WINDOW_DAYS}, current_date - p.published_at::date))::int as days
      from publications p
      join content_items ci on ci.id = p.content_item_id
      join topics t on t.id = ci.topic_id
      where p.channel = 'website' and p.status = 'live' and p.published_at is not null
        and p.published_at < now() - interval '7 days' -- too new to judge
    )
    select pc.service_id, pc.format, pc.kind, pc.days,
           coalesce((select sum(m.sessions) from metrics_daily m
                     where m.channel = 'website' and m.source_medium = '' and m.page_path = pc.page_path
                       and m.date >= pc.published_at::date and m.date < pc.published_at::date + ${WINDOW_DAYS}::int), 0)::int as sessions,
           (coalesce((select sum(m.leads) from metrics_daily m
                      where m.channel = 'website' and m.source_medium = '' and m.page_path = pc.page_path
                        and m.date >= pc.published_at::date and m.date < pc.published_at::date + ${WINDOW_DAYS}::int), 0)
            + (select count(*) from form_submissions fs where fs.content_item_id = pc.item_id))::int as leads
    from pieces pc`)];

  const group = (key: string, rs: PieceRow[]): GroupPerf => ({
    key,
    pieces: rs.length,
    perDay: rs.length ? rs.reduce((a, r) => a + r.sessions / r.days, 0) / rs.length : 0,
    leadsPerDay: rs.length ? rs.reduce((a, r) => a + r.leads / r.days, 0) / rs.length : 0,
  });
  const byKey = (pick: (r: PieceRow) => string | null) => {
    const m = new Map<string, PieceRow[]>();
    for (const r of rows) {
      const k = pick(r);
      if (k) m.set(k, [...(m.get(k) ?? []), r]);
    }
    return new Map([...m].map(([k, rs]) => [k, group(k, rs)]));
  };
  return {
    overall: group("all", rows),
    byService: byKey((r) => r.service_id),
    byFormat: byKey((r) => (r.kind === "lead_magnet" ? r.format : null)),
  };
}

/**
 * 0–10 points: how similar past pieces (same service; for lead magnets also the same format)
 * performed versus the average piece. 5 = average or no history; 10 = at least twice the average.
 * One lead (form fill or download) is worth LEAD_WEIGHT sessions.
 */
export const LEAD_WEIGHT = 30;

export function performancePoints(
  perf: Awaited<ReturnType<typeof groupPerformance>>,
  serviceId: string | null,
  kind: string,
  format: string | null,
): { points: number; note: string } {
  const value = (g: GroupPerf) => g.perDay + LEAD_WEIGHT * g.leadsPerDay;
  const base = value(perf.overall);
  const groups = [serviceId ? perf.byService.get(serviceId) : undefined, kind === "lead_magnet" && format ? perf.byFormat.get(format) : undefined]
    .filter((g): g is GroupPerf => Boolean(g && g.pieces >= MIN_PIECES));
  if (perf.overall.pieces < MIN_PIECES || base <= 0) {
    return { points: 5, note: `no history yet (${perf.overall.pieces} live pieces older than 7 days)` };
  }
  if (!groups.length) {
    const have = serviceId ? (perf.byService.get(serviceId)?.pieces ?? 0) : 0;
    return { points: 5, note: `no history for this service yet (${have} of ${MIN_PIECES} live pieces needed)` };
  }
  const ratio = groups.reduce((a, g) => a + value(g) / base, 0) / groups.length;
  const points = Math.round(Math.max(0, Math.min(10, ratio * 5)));
  return { points, note: `similar pieces ${ratio.toFixed(2)}× average (${groups.map((g) => `${g.key.slice(0, 8)}: ${g.pieces}`).join(", ")})` };
}

/** Short summary of what has worked, for the Gemini shortlist prompt. */
export async function whatWorked(limit = 8): Promise<string[]> {
  const rows = await pagePerformance(28);
  const scored = rows.filter((r) => r.sessions > 0 || r.clicks > 0);
  return scored
    .sort((a, b) => b.leads * 20 + b.downloads * 20 + b.sessions - (a.leads * 20 + a.downloads * 20 + a.sessions))
    .slice(0, limit)
    .map((r) => `${r.title ?? r.path} — ${r.sessions} sessions, ${r.clicks} search clicks, ${r.leads + r.downloads} leads (28d)`);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type Week = { week: string; sessions: number; published: number };

/**
 * Site sessions per week (Monday start) for the last `weeks` COMPLETE weeks of data, plus how many
 * pieces went live each week. The current, unfinished week is left out: a partial week reads as a drop.
 */
export async function weeklySessions(weeks = 12): Promise<Week[]> {
  const end = await dataEnd();
  const d = new Date(`${end.ga}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  // Monday of the last week whose Sunday has data.
  d.setUTCDate(d.getUTCDate() - dow - (dow === 6 ? 0 : 7));
  const lastMonday = d.toISOString().slice(0, 10);
  return sql<Week[]>`
    with w as (
      select (${lastMonday}::date - 7 * g)::date as week from generate_series(0, ${weeks - 1}) g
    )
    select w.week::text as week,
           coalesce((select sum(sessions) from metrics_daily m
                     where m.channel = 'website' and m.page_path = ${SITE_PATH} and m.source_medium = ''
                       and m.date >= w.week and m.date < w.week + 7), 0)::int as sessions,
           (select count(*) from publications p
             where p.channel = 'website' and p.status = 'live'
               and p.published_at >= w.week and p.published_at < w.week + 7)::int as published
    from w order by w.week`;
}

/** Impression-weighted average Google position over a period (lower is better). */
export async function avgPosition(days: number, offsetDays = 0): Promise<number | null> {
  const end = await dataEnd();
  const [r] = await sql<{ pos: number | null }[]>`
    select (sum(position * impressions) / nullif(sum(impressions), 0))::float as pos
    from search_queries_daily
    where date > ${end.sc}::date - ${days + offsetDays}::int and date <= ${end.sc}::date - ${offsetDays}::int`;
  return r.pos;
}

export type Funnel = { sessions: number; engaged: number; offerViews: number; leads: number };

/** Website pages whose main job is a form (the contact form also sits on a few other pages). */
export const FORM_PAGES = ["/contact", "/ai-shindan", "/discovery"];

export async function funnel(days: number): Promise<Funnel> {
  const end = await dataEnd();
  const [r] = await sql<{ sessions: number; engaged: number; offer: number }[]>`
    select coalesce(sum(sessions) filter (where page_path = ${SITE_PATH}), 0)::int as sessions,
           coalesce(sum(engaged_sessions) filter (where page_path = ${SITE_PATH}), 0)::int as engaged,
           coalesce(sum(sessions) filter (where page_path = any(${FORM_PAGES}) or page_path in (
             select p.page_path from publications p join content_items ci on ci.id = p.content_item_id
             where ci.type = 'lead_magnet' and p.page_path is not null)), 0)::int as offer
    from metrics_daily
    where channel = 'website' and source_medium = '' and date > ${end.ga}::date - ${days}::int and date <= ${end.ga}::date`;
  const t = await siteTotals(days);
  return { sessions: r.sessions, engaged: r.engaged, offerViews: r.offer, leads: t.leads + t.downloads };
}

export type ServiceLeads = { service: string; leads: number };

/** Leads (GA4 form fills on our pages + downloads) per Renesis service, last `days` days. */
export async function leadsByService(days: number): Promise<ServiceLeads[]> {
  const end = await dataEnd();
  return sql<ServiceLeads[]>`
    with piece as (
      select p.page_path, ci.id as item_id, coalesce(sv.name_ja, 'その他') as service
      from publications p
      join content_items ci on ci.id = p.content_item_id
      left join topics t on t.id = ci.topic_id
      left join services sv on sv.id = t.service_id
      where p.channel = 'website'
    )
    select service, sum(leads)::int as leads from (
      select pc.service,
             coalesce((select sum(m.leads) from metrics_daily m
                       where m.channel = 'website' and m.source_medium = '' and m.page_path = pc.page_path
                         and m.date > ${end.ga}::date - ${days}::int), 0)
             + (select count(*) from form_submissions fs
                where fs.content_item_id = pc.item_id and fs.received_at > now() - make_interval(days => ${days})) as leads
      from piece pc
    ) x
    group by service having sum(leads) > 0 order by 2 desc`;
}

export type Engine = { publishedThisMonth: number; avgReview: number | null; refreshDue: number; inReview: number };

export async function contentEngine(): Promise<Engine> {
  const [r] = await sql<Engine[]>`
    select
      (select count(*) from publications where status = 'live' and published_at >= date_trunc('month', now()))::int as "publishedThisMonth",
      (select round(avg((v.review->'ai'->>'overall')::numeric))::int from content_items ci
         join content_versions v on v.id = ci.current_version_id
         where v.review->'ai'->>'overall' is not null and v.created_at >= date_trunc('month', now())) as "avgReview",
      (select count(*) from review_actions where kind = 'refresh' and status = 'open')::int as "refreshDue",
      (select count(*) from content_items where status in ('in_review', 'needs_revision'))::int as "inReview"`;
  return r;
}

// ---------------------------------------------------------------------------
// Date-range versions for the dashboard (inclusive JST dates).
// ---------------------------------------------------------------------------

export type Span = { start: string; end: string };
const EMPTY: Totals = { sessions: 0, users: 0, leads: 0, downloads: 0, clicks: 0, impressions: 0 };

export async function spanTotals(s: Span | null): Promise<Totals> {
  if (!s) return EMPTY;
  const [[ga], [sc], [dl]] = await Promise.all([
    sql<{ sessions: number; users: number; leads: number }[]>`
      select coalesce(sum(sessions), 0)::int as sessions, coalesce(sum(users), 0)::int as users, coalesce(sum(leads), 0)::int as leads
      from metrics_daily
      where channel = 'website' and page_path = ${SITE_PATH} and source_medium = '' and date between ${s.start} and ${s.end}`,
    sql<{ clicks: number; impressions: number }[]>`
      select coalesce(sum(clicks), 0)::int as clicks, coalesce(sum(impressions), 0)::int as impressions
      from search_queries_daily where date between ${s.start} and ${s.end}`,
    sql<{ downloads: number }[]>`
      select count(*)::int as downloads from form_submissions
      where form_kind = 'lead_magnet' and (received_at at time zone 'Asia/Tokyo')::date between ${s.start} and ${s.end}`,
  ]);
  return { ...ga, ...sc, ...dl };
}

export async function spanAvgPosition(s: Span | null): Promise<number | null> {
  if (!s) return null;
  const [r] = await sql<{ pos: number | null }[]>`
    select (sum(position * impressions) / nullif(sum(impressions), 0))::float as pos
    from search_queries_daily where date between ${s.start} and ${s.end}`;
  return r.pos;
}

export async function spanFunnel(s: Span | null, totals: Totals): Promise<Funnel> {
  if (!s) return { sessions: 0, engaged: 0, offerViews: 0, leads: 0 };
  const [r] = await sql<{ sessions: number; engaged: number; offer: number }[]>`
    select coalesce(sum(sessions) filter (where page_path = ${SITE_PATH}), 0)::int as sessions,
           coalesce(sum(engaged_sessions) filter (where page_path = ${SITE_PATH}), 0)::int as engaged,
           coalesce(sum(sessions) filter (where page_path = any(${FORM_PAGES}) or page_path in (
             select p.page_path from publications p join content_items ci on ci.id = p.content_item_id
             where ci.type = 'lead_magnet' and p.page_path is not null)), 0)::int as offer
    from metrics_daily
    where channel = 'website' and source_medium = '' and date between ${s.start} and ${s.end}`;
  return { sessions: r.sessions, engaged: r.engaged, offerViews: r.offer, leads: totals.leads + totals.downloads };
}

export async function spanLeadsByService(s: Span | null): Promise<ServiceLeads[]> {
  if (!s) return [];
  return sql<ServiceLeads[]>`
    with piece as (
      select p.page_path, ci.id as item_id, coalesce(sv.name_ja, 'その他') as service
      from publications p
      join content_items ci on ci.id = p.content_item_id
      left join topics t on t.id = ci.topic_id
      left join services sv on sv.id = t.service_id
      where p.channel = 'website'
    )
    select service, sum(leads)::int as leads from (
      select pc.service,
             coalesce((select sum(m.leads) from metrics_daily m
                       where m.channel = 'website' and m.source_medium = '' and m.page_path = pc.page_path
                         and m.date between ${s.start} and ${s.end}), 0)
             + (select count(*) from form_submissions fs
                where fs.content_item_id = pc.item_id
                  and (fs.received_at at time zone 'Asia/Tokyo')::date between ${s.start} and ${s.end}) as leads
      from piece pc
    ) x
    group by service having sum(leads) > 0 order by 2 desc`;
}

/** Every blog page with performance for `cur`, plus sessions in `prev` for the change column. */
export async function spanPagePerformance(cur: Span | null, prev: Span | null): Promise<PageRow[]> {
  const c = cur ?? { start: "1900-01-01", end: "1900-01-01" };
  const p = prev ?? c;
  return sql<PageRow[]>`
    with pages as (
      select p.page_path as path, ci.title, true as ours, ci.type as kind, sv.name_ja as service,
             ci.topic_id, p.published_at, ci.id as item_id
      from publications p
      join content_items ci on ci.id = p.content_item_id
      left join topics t on t.id = ci.topic_id
      left join services sv on sv.id = t.service_id
      where p.channel = 'website' and p.page_path is not null
      union all
      select sp.path, sp.title, false, null, null, null, sp.lastmod, null
      from site_pages sp
      where sp.section = 'blog' and sp.path <> '/blog'
        and not exists (select 1 from publications p where p.page_path = sp.path)
    ),
    ga as (
      select page_path,
             sum(sessions) filter (where date between ${c.start} and ${c.end})::int as sessions,
             sum(sessions) filter (where date between ${p.start} and ${p.end})::int as sessions_prev,
             sum(engaged_sessions) filter (where date between ${c.start} and ${c.end})::float as engaged,
             avg(avg_engagement_sec) filter (where date between ${c.start} and ${c.end} and sessions > 0)::float as eng_sec,
             sum(leads) filter (where date between ${c.start} and ${c.end})::int as leads
      from metrics_daily
      where channel = 'website' and source_medium = '' and date between least(${c.start}::date, ${p.start}::date) and ${c.end}
      group by page_path
    ),
    sc as (
      select ${GSC_PATH} as path, sum(clicks)::int as clicks, sum(impressions)::int as impressions,
             (sum(position * impressions) / nullif(sum(impressions), 0))::float as position
      from search_queries_daily where date between ${c.start} and ${c.end}
      group by 1
    ),
    dl as (
      select content_item_id, count(*)::int as downloads from form_submissions
      where form_kind = 'lead_magnet' and (received_at at time zone 'Asia/Tokyo')::date between ${c.start} and ${c.end}
      group by 1
    )
    select pg.path, pg.title, pg.ours, pg.kind, pg.service, pg.topic_id, pg.published_at,
           coalesce(ga.sessions, 0) as sessions, coalesce(ga.sessions_prev, 0) as sessions_prev,
           case when ga.sessions > 0 then ga.engaged / ga.sessions end as engaged_rate,
           ga.eng_sec as avg_engagement_sec,
           coalesce(ga.leads, 0) as leads, coalesce(dl.downloads, 0) as downloads,
           coalesce(sc.clicks, 0) as clicks, coalesce(sc.impressions, 0) as impressions, sc.position
    from pages pg
    left join ga on ga.page_path = pg.path
    left join sc on sc.path = pg.path
    left join dl on dl.content_item_id = pg.item_id
    order by pg.ours desc, coalesce(ga.sessions, 0) desc, coalesce(sc.impressions, 0) desc`;
}

export type Point = { key: string; sessions: number; published: number; inRange: boolean };

/**
 * Sessions per day (ranges up to ~9 weeks) or per week (longer), over `s`. Short ranges (under a
 * week) are widened to the 14 days ending at the range so the chart still shows a trend; the
 * selected days are flagged with inRange.
 */
export async function sessionsSeries(s: Span): Promise<{ bucket: "day" | "week"; points: Point[] }> {
  const len = Math.round((Date.parse(s.end) - Date.parse(s.start)) / 86_400_000) + 1;
  const bucket = len > 63 ? "week" : "day";
  const from = len < 7 ? new Date(Date.parse(s.end) - 13 * 86_400_000).toISOString().slice(0, 10) : s.start;
  const step = bucket === "week" ? 7 : 1;
  const points = await sql<Point[]>`
    with b as (
      select g::date as key from generate_series(
        ${bucket === "week" ? sql`date_trunc('week', ${from}::date)` : sql`${from}::date`}, ${s.end}::date, make_interval(days => ${step})) g
    )
    select b.key::text as key,
           coalesce((select sum(sessions) from metrics_daily m
                     where m.channel = 'website' and m.page_path = ${SITE_PATH} and m.source_medium = ''
                       and m.date >= b.key and m.date < b.key + ${step}::int and m.date between ${from} and ${s.end}), 0)::int as sessions,
           (select count(*) from publications p
             where p.channel = 'website' and p.status = 'live'
               and (p.published_at at time zone 'Asia/Tokyo')::date >= b.key
               and (p.published_at at time zone 'Asia/Tokyo')::date < b.key + ${step}::int)::int as published,
           (b.key + ${step - 1}::int >= ${s.start}::date) as "inRange"
    from b order by b.key`;
  return { bucket, points };
}
