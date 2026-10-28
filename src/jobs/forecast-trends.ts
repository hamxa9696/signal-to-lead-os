// Every morning: check finished forecasts against real signals. Once a week (or on demand): make
// a new 7-day forecast so Monday's topic slate can prepare for what is about to trend.
import { sql } from "@/lib/db";
import { env, has } from "@/lib/env";
import { evaluateForecasts, makeForecast, saveForecast } from "@/lib/forecast";
import { addDays, tokyoToday } from "@/lib/week";
import type { Job } from "./types";

export function makeForecastJob(opts: { force?: boolean } = {}): Job {
  return {
    name: "forecast-trends",
    description: "Check last week's trend forecast against real signals and forecast the next 7 days",
    async run() {
      const checked = await evaluateForecasts();
      const [{ latest }] = await sql<{ latest: string | null }[]>`select max(window_start)::text as latest from trend_forecasts`;
      const due = opts.force || !latest || latest <= addDays(tokyoToday(), -7);
      if (!due) return { status: "ok", stats: { evaluated: checked.evaluated }, note: `forecast for ${latest} is current` };
      if (!has(env.geminiApiKey)) return { status: "skipped", stats: { evaluated: checked.evaluated }, note: "GEMINI_API_KEY not set" };
      const { windowStart, forecasts } = await makeForecast();
      const saved = await saveForecast(windowStart, forecasts);
      return {
        status: "ok",
        stats: {
          evaluated: checked.evaluated, windowStart, terms: saved,
          rising: forecasts.filter((f) => f.direction === "rising").length,
          emerging: forecasts.filter((f) => f.direction === "emerging").length,
        },
      };
    },
  };
}
