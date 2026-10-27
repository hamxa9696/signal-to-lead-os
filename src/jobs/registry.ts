// Job groups + a runner that records each run in job_runs. Shared by the CLI and the UI.
import { sql } from "@/lib/db";
import { collectFeeds } from "./collect-feeds";
import { collectGsc } from "./collect-gsc";
import { analyzeSignals } from "./analyze-signals";
import { makeWeeklyShortlist } from "./weekly-shortlist";
import type { Job, JobResult } from "./types";

export function jobGroups(opts: { force?: boolean } = {}): Record<string, Job[]> {
  const shortlist = makeWeeklyShortlist(opts);
  return {
    "collect-feeds": [collectFeeds],
    "collect-gsc": [collectGsc],
    analyze: [analyzeSignals],
    shortlist: [shortlist],
    daily: [collectFeeds, collectGsc, analyzeSignals], // every morning
    weekly: [shortlist], // Monday, after daily
  };
}

export type RunOutcome = { job: string; ok: boolean; result?: JobResult; error?: string };

export async function runJob(job: Job): Promise<RunOutcome> {
  const [{ id }] = await sql<{ id: string }[]>`insert into job_runs (job) values (${job.name}) returning id`;
  const t0 = Date.now();
  try {
    const r = await job.run();
    const stats = { ...r.stats, ...(r.note ? { note: r.note } : {}), ms: Date.now() - t0 };
    await sql`update job_runs set status = ${r.status}, finished_at = now(), stats = ${sql.json(stats)} where id = ${id}`;
    return { job: job.name, ok: true, result: r };
  } catch (err) {
    const msg = (err as Error).stack ?? String(err);
    await sql`update job_runs set status = 'error', finished_at = now(), error = ${msg.slice(0, 4000)} where id = ${id}`;
    return { job: job.name, ok: false, error: (err as Error).message };
  }
}
