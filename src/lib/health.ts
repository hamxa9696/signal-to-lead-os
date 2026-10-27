// Connection checks for every external service. Each check is cheap and spends no AI quota.
import "server-only";
import { env, has } from "./env";
import { sql } from "./db";
import { googleFetch, ga4ReportUrl, gscSiteUrl } from "./google";
import { payloadFetch } from "./payload";

export type Check = { name: string; ok: boolean; detail: string; setup: string };

async function run(name: string, setup: string, missing: string | null, fn: () => Promise<string>): Promise<Check> {
  if (missing) return { name, ok: false, detail: `${missing} not set`, setup };
  try {
    return { name, ok: true, detail: await fn(), setup };
  } catch (err) {
    return { name, ok: false, detail: (err as Error).message, setup };
  }
}

export async function runHealthChecks(): Promise<Check[]> {
  return Promise.all([
    run("Database", "SETUP.md §1", has(env.databaseUrl) ? null : "DATABASE_URL", async () => {
      const [{ n }] = await sql<{ n: number }[]>`
        select count(*)::int as n from information_schema.tables where table_name = 'topics'`;
      return n ? "connected, schema applied" : "connected — run pnpm db:migrate";
    }),

    run("Gemini", "SETUP.md §2", has(env.geminiApiKey) ? null : "GEMINI_API_KEY", async () =>
      `key present, model ${env.geminiModel} (not test-called, saves quota)`),

    run(
      "Google Analytics 4",
      "SETUP.md §3–4",
      !has(env.googleServiceAccountJson) ? "GOOGLE_SERVICE_ACCOUNT_JSON" : !has(env.ga4PropertyId) ? "GA4_PROPERTY_ID" : null,
      async () => {
        const r = await googleFetch<{ rows?: { metricValues: { value: string }[] }[] }>(ga4ReportUrl(env.ga4PropertyId), {
          method: "POST",
          body: JSON.stringify({
            dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
            metrics: [{ name: "sessions" }],
          }),
        });
        return `connected — ${r.rows?.[0]?.metricValues[0]?.value ?? 0} sessions in last 7 days`;
      },
    ),

    run(
      "Search Console",
      "SETUP.md §3, §5",
      !has(env.googleServiceAccountJson) ? "GOOGLE_SERVICE_ACCOUNT_JSON" : !has(env.gscSiteUrl) ? "GSC_SITE_URL" : null,
      async () => {
        const r = await googleFetch<{ permissionLevel?: string }>(gscSiteUrl(env.gscSiteUrl));
        return `connected — permission ${r.permissionLevel ?? "unknown"}`;
      },
    ),

    run(
      "Payload CMS",
      "SETUP.md §6",
      !has(env.payloadUrl) ? "PAYLOAD_URL" : !has(env.payloadApiKey) ? "PAYLOAD_API_KEY" : null,
      async () => {
        const r = await payloadFetch<{ totalDocs?: number }>(`/${env.payloadPostsCollection}?limit=1&depth=0&draft=true`);
        return `connected — ${r.totalDocs ?? 0} docs in "${env.payloadPostsCollection}"`;
      },
    ),

    run("Brevo", "SETUP.md §7", has(env.brevoApiKey) ? null : "BREVO_API_KEY", async () => {
      const res = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": env.brevoApiKey, accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      const a = (await res.json()) as { companyName?: string };
      return `connected — ${a.companyName ?? "account ok"}`;
    }),

    run("Make.com webhook", "SETUP.md §8", has(env.makeWebhookUrl) ? null : "MAKE_WEBHOOK_URL", async () =>
      "URL present (not test-called, saves operations)"),
  ]);
}
