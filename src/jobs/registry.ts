// Job groups + a runner that records each run in job_runs. Shared by the CLI and the UI.
import { sql } from "@/lib/db";
import { collectFeeds } from "./collect-feeds";
import { collectGsc } from "./collect-gsc";
import { analyzeSignals } from "./analyze-signals";
import { deepenSignals } from "./deepen-signals";
import { researchTopics } from "./research-topics";
import { sortSignals } from "./sort-signals";
import { clusterStories } from "./cluster-stories";
import { planFormatsJob } from "./plan-formats";
import { makeWeeklyShortlist } from "./weekly-shortlist";
import { syncPayloadPublications } from "@/lib/content/publish";
import { syncBrevo } from "./sync-brevo";
import { collectGa4 } from "./collect-ga4";
import { monthlyReview } from "./monthly-review";
import type { Job, JobResult } from "./types";

const syncPublications: Job = {
  name: "sync-publications",
  description: "Mark Payload drafts as live once an editor publishes them",
  async run() {
    const r = await syncPayloadPublications();
    return r.checked === 0 && r.nowLive === 0
      ? { status: "ok", stats: r, note: "nothing waiting" }
      : { status: "ok", stats: r };
  },
};

export function jobGroups(opts: { force?: boolean } = {}): Record<string, Job[]> {
  const shortlist = makeWeeklyShortlist(opts);
  return {
    "collect-feeds": [collectFeeds],
    "collect-gsc": [collectGsc],
    analyze: [analyzeSignals],
    deepen: [deepenSignals],
    research: [researchTopics],
    sort: [sortSignals],
    cluster: [clusterStories],
    formats: [planFormatsJob],
    shortlist: [shortlist],
    "sync-publications": [syncPublications],
    "sync-brevo": [syncBrevo],
    "collect-ga4": [collectGa4],
    daily: [collectFeeds, collectGsc, collectGa4, analyzeSignals, sortSignals, deepenSignals, clusterStories, syncPublications, syncBrevo], // every morning
    weekly: [shortlist, planFormatsJob, researchTopics], // Monday, after daily
    "monthly-review": [monthlyReview],
    monthly: [monthlyReview], // 1st of the month
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
