// Weekly GEO run: build the question set, ask every enabled AI engine, score our readiness.
import { env, has } from "@/lib/env";
import { buildQuestionSet } from "@/lib/geo/questions";
import { runEngineChecks } from "@/lib/geo/check";
import { updateReadiness } from "@/lib/geo/readiness";
import type { Job } from "./types";

export function makeGeoJob(opts: { force?: boolean } = {}): Job {
  return {
    name: "geo-weekly",
    description: "Build this week's AI-search question set, check AI engines' citations, score our pages' readiness",
    async run() {
      if (!has(env.geminiApiKey)) return { status: "skipped", stats: {}, note: "GEMINI_API_KEY not set" };
      const set = await buildQuestionSet(opts.force);
      const checks = await runEngineChecks(set.week);
      const ready = await updateReadiness(set.week);
      return {
        status: "ok",
        stats: { week: set.week, questions: set.questions, engines: checks.engines.join(", ") || "none (manual check only)", checked: checks.checked, cited: checks.cited, failed: checks.failed, pagesMatched: ready.withPage },
      };
    },
  };
}
