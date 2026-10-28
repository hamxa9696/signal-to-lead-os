// Give every current topic without one a content package (hub + spokes + scores).
import { sql } from "@/lib/db";
import { env, has } from "@/lib/env";
import { planFormats } from "@/lib/format-plan";
import type { Job } from "./types";

export const planFormatsJob: Job = {
  name: "plan-formats",
  description: "Decide each topic's hub and channels (X, note, LinkedIn, newsletter, YouTube) and score it",
  async run() {
    if (!has(env.geminiApiKey)) return { status: "skipped", stats: {}, note: "GEMINI_API_KEY not set" };
    const rows = await sql<{ id: string }[]>`
      select id from topics where format_plan is null and status <> 'rejected' and week_of >= current_date - 14`;
    if (!rows.length) return { status: "ok", stats: { topics: 0 }, note: "every topic already has a plan" };
    const r = await planFormats(rows.map((x) => x.id));
    return { status: "ok", stats: { topics: rows.length, planned: r.planned } };
  },
};
