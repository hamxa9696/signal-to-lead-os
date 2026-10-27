import Link from "next/link";
import { sql } from "@/lib/db";
import { groupPerformance, LEAD_WEIGHT, MIN_PIECES, pagePerformance, performancePoints, siteTotals, type Totals } from "@/lib/performance";

export const dynamic = "force-dynamic";

const DAYS = 28;
const n = (v: number) => v.toLocaleString("en-US");

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev && !now) return null;
  if (!prev) return <span className="text-xs text-emerald-300">new</span>;
  const pct = Math.round(((now - prev) / prev) * 100);
  return <span className={`text-xs ${pct >= 0 ? "text-emerald-300" : "text-amber-300"}`}>{pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}%</span>;
}

function Tile({ label, k, cur, prev, hint }: { label: string; k: keyof Totals; cur: Totals; prev: Totals; hint: string }) {
  return (
    <div className="rounded-lg border border-white/10 p-3" title={hint}>
      <p className="text-xs text-white/50">{label}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{n(cur[k])}</span>
        <Delta now={cur[k]} prev={prev[k]} />
      </p>
    </div>
  );
}

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope } = await searchParams;
  const showAll = scope === "all";
  const [cur, prev, pages, perf, services, [{ latest }]] = await Promise.all([
    siteTotals(DAYS),
    siteTotals(DAYS, DAYS),
    pagePerformance(DAYS),
    groupPerformance(),
    sql<{ id: string; name_ja: string }[]>`select id, name_ja from services where active`,
    sql<{ latest: string | null }[]>`
      select greatest((select max(date) from metrics_daily), (select max(date) from search_queries_daily))::text as latest`,
  ]);
  const rows = showAll ? pages : pages.filter((p) => p.ours);
  const serviceRows = [...perf.byService.values()].sort((a, b) => b.perDay - a.perDay);
  const name = (id: string) => services.find((s) => s.id === id)?.name_ja ?? id;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-xl font-semibold">Performance</h1>
      <p className="mt-1 text-sm text-white/60">
        Last {DAYS} days vs the {DAYS} before. Data up to {latest ?? "-"} (GA4 and Search Console lag 1–3 days).
      </p>

      <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Website sessions" k="sessions" cur={cur} prev={prev} hint="GA4, whole site" />
        <Tile label="Search clicks" k="clicks" cur={cur} prev={prev} hint="Google Search Console" />
        <Tile label="Search impressions" k="impressions" cur={cur} prev={prev} hint="Google Search Console" />
        <Tile label="Form fills (GA4)" k="leads" cur={cur} prev={prev} hint="generate_lead events from the website forms" />
        <Tile label="Downloads (Brevo)" k="downloads" cur={cur} prev={prev} hint="Lead-magnet delivery emails sent" />
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-semibold">Pages</h2>
          <div className="flex gap-2 text-sm">
            <Link href="/performance" className={`rounded-md border px-3 py-1.5 ${!showAll ? "border-white/40 bg-white/10" : "border-white/15 text-white/60"}`}>
              Made here ({pages.filter((p) => p.ours).length})
            </Link>
            <Link href="/performance?scope=all" className={`rounded-md border px-3 py-1.5 ${showAll ? "border-white/40 bg-white/10" : "border-white/15 text-white/60"}`}>
              All blog pages ({pages.length})
            </Link>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-white/50">
              <tr>
                <th className="px-3 py-2 font-normal">Page</th>
                <th className="px-3 py-2 text-right font-normal">Sessions</th>
                <th className="px-3 py-2 text-right font-normal">Engaged</th>
                <th className="px-3 py-2 text-right font-normal">Leads</th>
                <th className="px-3 py-2 text-right font-normal">Search clicks</th>
                <th className="px-3 py-2 text-right font-normal">Impressions</th>
                <th className="px-3 py-2 text-right font-normal">Avg position</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((r) => (
                <tr key={r.path}>
                  <td className="max-w-[340px] px-3 py-2">
                    <div lang="ja" className="truncate">
                      {r.topic_id ? <Link href={`/topics/${r.topic_id}`} className="hover:underline">{r.title ?? r.path}</Link> : (r.title ?? r.path)}
                    </div>
                    <div className="truncate text-xs text-white/40">
                      {r.ours && <span className="mr-1 rounded bg-sky-400/20 px-1 text-sky-200">{r.kind === "lead_magnet" ? "magnet" : "ours"}</span>}
                      {r.path}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {n(r.sessions)} <Delta now={r.sessions} prev={r.sessions_prev} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-white/70">{r.engaged_rate != null ? `${Math.round(r.engaged_rate * 100)}%` : "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n(r.leads + r.downloads)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n(r.clicks)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-white/70">{n(r.impressions)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.position != null && r.position >= 8 && r.position <= 20 ? "text-amber-200" : "text-white/70"}`} title={r.position != null && r.position >= 8 && r.position <= 20 ? "Positions 8–20: a refresh could reach page 1" : ""}>
                    {r.position != null ? r.position.toFixed(1) : "-"}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-5 text-white/40">
                    {showAll ? "No blog pages yet." : "Nothing published from here yet. Pieces appear once an editor publishes their Payload draft."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">What the weekly scoring learns</h2>
        <p className="mt-1 text-sm text-white/60">
          Each new topic gets 0–10 performance points from how past pieces for the same service (and, for lead magnets, the same format) did in their first 90 days,
          compared with the average piece. One lead counts as {LEAD_WEIGHT} sessions. 5 points means average, or fewer than {MIN_PIECES} live pieces to compare.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-white/50">
              <tr>
                <th className="px-3 py-2 font-normal">Service</th>
                <th className="px-3 py-2 text-right font-normal">Live pieces</th>
                <th className="px-3 py-2 text-right font-normal">Sessions / day</th>
                <th className="px-3 py-2 text-right font-normal">Leads / day</th>
                <th className="px-3 py-2 text-right font-normal">Points now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              <tr className="text-white/60">
                <td className="px-3 py-2">All pieces (baseline)</td>
                <td className="px-3 py-2 text-right tabular-nums">{perf.overall.pieces}</td>
                <td className="px-3 py-2 text-right tabular-nums">{perf.overall.perDay.toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{perf.overall.leadsPerDay.toFixed(2)}</td>
                <td className="px-3 py-2 text-right tabular-nums">5</td>
              </tr>
              {serviceRows.map((g) => (
                <tr key={g.key}>
                  <td lang="ja" className="px-3 py-2">{name(g.key)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.pieces}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.perDay.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.leadsPerDay.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{performancePoints(perf, g.key, "article", null).points}</td>
                </tr>
              ))}
              {!serviceRows.length && <tr><td colSpan={5} className="px-3 py-4 text-white/40">No live pieces older than 7 days yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
