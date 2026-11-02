// Monthly: compute last month's Kizashi signal index and create the original-research topic.
import { env, has } from "@/lib/env";
import { buildMonthlyIndex, lastMonth } from "@/lib/signal-index";
import type { Job } from "./types";

export function makeSignalIndexJob(opts: { force?: boolean } = {}): Job {
  return {
    name: "signal-index",
    description: "Compute last month's signal index (original data) and create its report topic",
    async run() {
      if (!has(env.databaseUrl)) return { status: "skipped", stats: {}, note: "no database" };
      const r = await buildMonthlyIndex(lastMonth(), opts.force);
      return { status: "ok", stats: r, ...(r.created ? {} : { note: "already built for this month" }) };
    },
  };
}
