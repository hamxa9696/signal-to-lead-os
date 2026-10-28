import { sql } from "@/lib/db";
import { runHealthChecks } from "@/lib/health";
import { RunButton } from "../run-button";
import { PageHeader } from "../page-header";

// Connections the traffic goal does not need: shown as optional, not as warnings.
const OPTIONAL = new Set(["Brevo", "Make.com webhook", "PDF storage (Supabase)"]);

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Gemini and PDF actions can take minutes

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
  const required = checks.filter((c) => !OPTIONAL.has(c.name));
  const ready = required.filter((c) => c.ok).length;
  const signalCount = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;

  return (
    <main className="page">
      <PageHeader
        eyebrow="System"
        title="Status"
        description={<>{ready} of {required.length} required connections ready. Setup steps are in <code className="text-ink">docs/SETUP.md</code>.</>}
      />
      <section aria-labelledby="conn" className="flex flex-col gap-3">
        <h2 id="conn" className="text-base font-semibold">Connections</h2>
        <ul className="card divide-y divide-line">
          {checks.map((c) => {
            const optional = OPTIONAL.has(c.name);
            return (
              <li key={c.name} className="flex items-start gap-3 px-4 py-3">
                <span
                  aria-label={c.ok ? "ok" : optional ? "optional, off" : "not ready"}
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${c.ok ? "bg-good-dot" : optional ? "bg-line-strong" : "bg-warn-dot"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {c.name}
                      {optional && <span className="ml-2 rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-faint">Optional</span>}
                    </span>
                    <span className="text-xs text-faint">{c.setup}</span>
                  </div>
                  <p className="break-words text-sm text-muted">{c.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-[13px] text-faint">
          Optional items are only needed for emailed lead-magnet downloads; the website&apos;s own forms already collect emails. Settings:{" "}
          <a href="/delivery" className="font-medium text-accent hover:underline">Delivery</a>.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">Run jobs</h2>
        <p className="mt-1 text-sm text-muted">
          These also run on a schedule (GitHub Actions). Signals: {signalCount("new")} waiting for analysis,{" "}
          {signalCount("analyzed")} relevant, {signalCount("ignored")} ignored.
        </p>
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <RunButton job="collect-feeds" label="Collect news + sitemap" />
          <RunButton job="collect-gsc" label="Pull Search Console" />
          <RunButton job="collect-ga4" label="Pull GA4" />
          <RunButton job="analyze" label="Analyze signals (Gemini)" />
          <RunButton job="deepen" label="Deep-read strong signals" />
          <RunButton job="research" label="Research this week's topics" />
          <RunButton job="shortlist" label="Regenerate weekly shortlist" force />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold">Recent runs</h2>
        <div className="mt-3 overflow-x-auto card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-faint">
              <tr>
                <th className="px-3 py-2 font-normal">When (JST)</th>
                <th className="px-3 py-2 font-normal">Job</th>
                <th className="px-3 py-2 font-normal">Status</th>
                <th className="px-3 py-2 font-normal">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((r, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{fmt(r.started_at)}</td>
                  <td className="px-3 py-2">{r.job}</td>
                  <td className={`px-3 py-2 ${r.status === "error" ? "text-warn" : r.status === "ok" ? "text-good" : "text-faint"}`}>
                    {r.status}
                  </td>
                  <td className="max-w-md truncate px-3 py-2 text-faint" title={r.error ?? JSON.stringify(r.stats)}>
                    {r.error?.split("\n")[0] ?? (r.stats?.note as string) ?? summarize(r.stats)}
                  </td>
                </tr>
              ))}
              {!runs.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-faint">No runs yet.</td>
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
