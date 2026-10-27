// Pull Search Console rows (date × page × query) into search_queries_daily.
import { sql } from "@/lib/db";
import { env, has } from "@/lib/env";
import { googleFetch } from "@/lib/google";
import { addDays, tokyoToday } from "@/lib/week";
import type { Job } from "./types";

const PAGE_SIZE = 25_000; // API maximum per request
const BACKFILL_DAYS = 90; // first run
const REFRESH_DAYS = 10; // later runs: GSC data settles over ~3 days, so re-pull a window
const LAG_DAYS = 2; // most recent complete-ish day

type GscRow = { keys: [string, string, string]; clicks: number; impressions: number; ctr: number; position: number };

export const collectGsc: Job = {
  name: "collect-gsc",
  description: "Pull Search Console clicks/impressions/position per page and query",
  async run() {
    if (!has(env.googleServiceAccountJson) || !has(env.gscSiteUrl)) {
      return { status: "skipped", stats: {}, note: "GOOGLE_SERVICE_ACCOUNT_JSON / GSC_SITE_URL not set (SETUP.md §3, §5)" };
    }

    const [{ max }] = await sql<{ max: string | null }[]>`select max(date)::text as max from search_queries_daily`;
    const endDate = addDays(tokyoToday(), -LAG_DAYS);
    const startDate = max ? addDays(endDate, -REFRESH_DAYS) : addDays(endDate, -BACKFILL_DAYS);

    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env.gscSiteUrl)}/searchAnalytics/query`;
    let startRow = 0;
    let total = 0;

    for (;;) {
      const res = await googleFetch<{ rows?: GscRow[] }>(url, {
        method: "POST",
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ["date", "page", "query"],
          rowLimit: PAGE_SIZE,
          startRow,
          dataState: "all",
        }),
      });
      const rows = res.rows ?? [];
      if (!rows.length) break;

      // Insert in chunks to stay under Postgres' parameter limit.
      for (let i = 0; i < rows.length; i += 2_000) {
        const chunk = rows.slice(i, i + 2_000).map((r) => ({
          date: r.keys[0],
          page: r.keys[1],
          query: r.keys[2],
          country: "all",
          device: "all",
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
        }));
        await sql`
          insert into search_queries_daily ${sql(chunk)}
          on conflict (date, page, query, country, device) do update set
            clicks = excluded.clicks, impressions = excluded.impressions,
            ctr = excluded.ctr, position = excluded.position`;
      }
      total += rows.length;
      if (rows.length < PAGE_SIZE) break;
      startRow += PAGE_SIZE;
    }

    return { status: "ok", stats: { startDate, endDate, rows: total } };
  },
};
