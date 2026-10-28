// Pull GA4 page metrics (per day × page, and per day × page × source/medium) plus
// form-submission events into metrics_daily.
import { sql } from "@/lib/db";
import { env, has } from "@/lib/env";
import { ga4ReportUrl, googleFetch } from "@/lib/google";
import { addDays, tokyoToday } from "@/lib/week";
import type { Job } from "./types";

/** page_path used for site-wide daily totals. */
export const SITE_PATH = "*";
const BACKFILL_DAYS = 90;
const REFRESH_DAYS = 7; // GA4 keeps processing for a couple of days
const PAGE = 100_000;
/**
 * GA4 events that mean "a visitor submitted a form on the website". renesistech.jp's own forms
 * fire rh_submit on success (rh_form_start / rh_validation_error / rh_submit_error are not fills);
 * generate_lead is the GA4 standard name, kept in case the site adopts it.
 */
export const FORM_FILL_EVENTS = ["rh_submit", "generate_lead"];

type Ga4Row = { dimensionValues: { value: string }[]; metricValues: { value: string }[] };

export function normPath(p: string): string {
  let path = p.replace(/^https?:\/\/[^/]+/, "").split("?")[0].split("#")[0] || "/";
  try {
    path = decodeURIComponent(path);
  } catch {
    /* keep raw */
  }
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

const ga4Date = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

async function report(body: Record<string, unknown>): Promise<Ga4Row[]> {
  const rows: Ga4Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const r = await googleFetch<{ rows?: Ga4Row[]; rowCount?: number }>(ga4ReportUrl(env.ga4PropertyId), {
      method: "POST",
      body: JSON.stringify({ ...body, limit: PAGE, offset }),
    });
    rows.push(...(r.rows ?? []));
    if (!r.rows || rows.length >= (r.rowCount ?? 0)) break;
  }
  return rows;
}

const METRICS = ["sessions", "totalUsers", "screenPageViews", "engagedSessions", "userEngagementDuration", "keyEvents"];

type Agg = { date: string; path: string; sm: string; m: number[]; leads: number };

export const collectGa4: Job = {
  name: "collect-ga4",
  description: "Pull GA4 sessions, engagement and website form fills per page into metrics_daily",
  async run() {
    if (!has(env.googleServiceAccountJson) || !has(env.ga4PropertyId)) {
      return { status: "skipped", stats: {}, note: "GOOGLE_SERVICE_ACCOUNT_JSON / GA4_PROPERTY_ID not set (SETUP.md §3–4)" };
    }
    const [{ max }] = await sql<{ max: string | null }[]>`
      select max(date)::text as max from metrics_daily where channel = 'website'`;
    const endDate = addDays(tokyoToday(), -1);
    // Full backfill on first run, and again while no form fill has ever been stored (so a change to
    // FORM_FILL_EVENTS fills in history instead of only the last week).
    const [{ any }] = await sql<{ any: boolean }[]>`
      select exists(select 1 from metrics_daily where channel = 'website' and leads > 0) as any`;
    const startDate = max && any ? addDays(endDate, -REFRESH_DAYS) : addDays(endDate, -BACKFILL_DAYS);
    const dateRanges = [{ startDate, endDate }];

    // Several raw paths can normalise to the same one (trailing slash, encoding), so aggregate.
    const agg = new Map<string, Agg>();
    const add = (date: string, path: string, sm: string, m: number[], leads: number) => {
      const key = `${date}|${path}|${sm}`;
      const cur = agg.get(key) ?? { date, path, sm, m: METRICS.map(() => 0), leads: 0 };
      m.forEach((v, i) => (cur.m[i] += v));
      cur.leads += leads;
      agg.set(key, cur);
    };

    const byPage = await report({
      dateRanges,
      dimensions: [{ name: "date" }, { name: "pagePath" }],
      metrics: METRICS.map((name) => ({ name })),
    });
    for (const r of byPage) add(ga4Date(r.dimensionValues[0].value), normPath(r.dimensionValues[1].value), "", r.metricValues.map((v) => Number(v.value)), 0);

    // Same, split by session source / medium (for "where does traffic to this piece come from").
    const bySource = await report({
      dateRanges,
      dimensions: [{ name: "date" }, { name: "pagePath" }, { name: "sessionSourceMedium" }],
      metrics: METRICS.map((name) => ({ name })),
    });
    for (const r of bySource) add(ga4Date(r.dimensionValues[0].value), normPath(r.dimensionValues[1].value), r.dimensionValues[2].value || "(not set)", r.metricValues.map((v) => Number(v.value)), 0);

    // Site-wide daily totals (summing per-page sessions would double-count multi-page sessions).
    const site = await report({ dateRanges, dimensions: [{ name: "date" }], metrics: METRICS.map((name) => ({ name })) });
    for (const r of site) add(ga4Date(r.dimensionValues[0].value), SITE_PATH, "", r.metricValues.map((v) => Number(v.value)), 0);

    // Form submissions (fired by the website's own forms) per page.
    const leads = await report({
      dateRanges,
      dimensions: [{ name: "date" }, { name: "pagePath" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: FORM_FILL_EVENTS } } },
    });
    for (const r of leads) {
      const date = ga4Date(r.dimensionValues[0].value);
      const n = Number(r.metricValues[0].value);
      add(date, normPath(r.dimensionValues[1].value), "", METRICS.map(() => 0), n);
      add(date, SITE_PATH, "", METRICS.map(() => 0), n);
    }

    const rows = [...agg.values()].map((a) => {
      const [sessions, users, views, engaged, duration, keyEvents] = a.m;
      return {
        date: a.date,
        channel: "website",
        page_path: a.path,
        source_medium: a.sm,
        sessions,
        users,
        pageviews: views,
        engaged_sessions: engaged,
        avg_engagement_sec: users ? Math.round((duration / users) * 100) / 100 : 0,
        key_events: keyEvents,
        leads: a.sm === "" ? a.leads : null,
      };
    });

    await sql.begin(async (tx) => {
      await tx`delete from metrics_daily where channel = 'website' and date between ${startDate} and ${endDate}`;
      for (let i = 0; i < rows.length; i += 1_000) {
        await tx`insert into metrics_daily ${tx(rows.slice(i, i + 1_000))}`;
      }
    });

    return { status: "ok", stats: { startDate, endDate, pageRows: byPage.length, sourceRows: bySource.length, leadRows: leads.length, stored: rows.length } };
  },
};
