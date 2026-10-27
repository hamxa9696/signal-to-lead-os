import { sql } from "@/lib/db";
import { runHealthChecks } from "@/lib/health";
import { RunButton } from "./run-button";

export const dynamic = "force-dynamic";

type RunRow = { job: string; status: string; started_at: Date; stats: Record<string, unknown> | null; error: string | null };

function fmt(d: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(d);
}

export default async function Home() {
  const [checks, runs, counts] = await Promise.all([
    runHealthChecks(),
    sql<RunRow[]>`select job, status, started_at, stats, error from job_runs order by started_at desc limit 12`.catch(() => []),
    sql<{ status: string; n: number }[]>`select status, count(*)::int as n from signals group by status`.catch(() => []),
  ]);
  const ready = checks.filter((c) => c.ok).length;
  const signalCount = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <section>
        <h1 className="text-xl font-semibold">Connections</h1>
        <p className="mt-1 text-sm text-white/60">
          {ready}/{checks.length} ready. Setup steps are in <code className="text-white/80">docs/SETUP.md</code>.
        </p>
        <ul className="mt-4 divide-y divide-white/10 rounded-lg border border-white/10">
          {checks.map((c) => (
            <li key={c.name} className="flex items-start gap-3 px-4 py-3">
              <span
                aria-label={c.ok ? "ok" : "not ready"}
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${c.ok ? "bg-emerald-400" : "bg-amber-400"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-white/40">{c.setup}</span>
                </div>
                <p className="break-words text-sm text-white/60">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Run jobs</h2>
        <p className="mt-1 text-sm text-white/60">
          These also run on a schedule (GitHub Actions). Signals: {signalCount("new")} waiting for analysis,{" "}
          {signalCount("analyzed")} relevant, {signalCount("ignored")} ignored.
        </p>
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <RunButton job="collect-feeds" label="Collect news + sitemap" />
          <RunButton job="collect-gsc" label="Pull Search Console" />
          <RunButton job="collect-ga4" label="Pull GA4" />
          <RunButton job="analyze" label="Analyze signals (Gemini)" />
          <RunButton job="shortlist" label="Regenerate weekly shortlist" force />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Recent runs</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-white/50">
              <tr>
                <th className="px-3 py-2 font-normal">When (JST)</th>
                <th className="px-3 py-2 font-normal">Job</th>
                <th className="px-3 py-2 font-normal">Status</th>
                <th className="px-3 py-2 font-normal">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {runs.map((r, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap px-3 py-2 text-white/60">{fmt(r.started_at)}</td>
                  <td className="px-3 py-2">{r.job}</td>
                  <td className={`px-3 py-2 ${r.status === "error" ? "text-amber-300" : r.status === "ok" ? "text-emerald-300" : "text-white/50"}`}>
                    {r.status}
                  </td>
                  <td className="max-w-md truncate px-3 py-2 text-white/50" title={r.error ?? JSON.stringify(r.stats)}>
                    {r.error?.split("\n")[0] ?? (r.stats?.note as string) ?? summarize(r.stats)}
                  </td>
                </tr>
              ))}
              {!runs.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-white/40">No runs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function summarize(stats: Record<string, unknown> | null): string {
  if (!stats) return "";
  return Object.entries(stats)
    .filter(([k, v]) => k !== "perSource" && k !== "ms" && typeof v !== "object")
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
}
