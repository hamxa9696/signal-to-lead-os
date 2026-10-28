import Link from "next/link";
import { Suspense } from "react";
import { TrendingKeywords } from "./trending";
import { env, has } from "@/lib/env";
import {
  contentEngine, dataEnd, groupPerformance, LEAD_WEIGHT, MIN_PIECES, performancePoints, sessionsSeries,
  spanAvgPosition, spanFunnel, spanLeadsByService, spanPagePerformance, spanTotals, type Point,
} from "@/lib/performance";
import { fmtDay, previousOf, resolveRange, withData } from "@/lib/range";
import { RangeBar } from "./range-bar";
import { SessionsChart } from "./chart";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("en-US");
const compact = (v: number) => (v >= 10_000 ? `${(v / 1000).toFixed(1)}k` : n(v));
const pct = (a: number, b: number) => (b > 0 ? (100 * a) / b : 0);

function Delta({ now, prev, lowerIsBetter, unit }: { now: number | null; prev: number | null; lowerIsBetter?: boolean; unit?: "abs" | "places" }) {
  if (now == null || prev == null || (!now && !prev)) return <p className="text-xs text-faint">no comparison yet</p>;
  if (!prev && unit !== "places") return <p className="text-xs font-semibold text-good">new</p>;
  const diff = now - prev;
  if (Math.abs(diff) < 0.05) return <p className="text-xs text-faint">no change</p>;
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  const label =
    unit === "places" ? `${Math.abs(diff).toFixed(1)} places` : unit === "abs" ? n(Math.abs(diff)) : `${Math.abs(Math.round((100 * diff) / prev))}%`;
  return <p className={`text-xs font-semibold ${better ? "text-good" : "text-bad"}`}>{better ? "▲" : "▼"} {label}</p>;
}

function Kpi({ label, value, children, highlight }: { label: string; value: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`card px-[18px] py-4 ${highlight ? "border-accent shadow-[0_0_0_3px_var(--color-accent-soft)]" : ""}`}>
      <p className={`text-[12.5px] ${highlight ? "font-semibold text-accent" : "text-faint"}`}>{label}</p>
      <p className="mt-2 mb-0.5 font-mono text-[26px] tracking-tight">{value}</p>
      {children}
    </div>
  );
}

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ scope?: string; range?: string; from?: string; to?: string; kw?: string }> }) {
  const q = await searchParams;
  const showAll = q.scope === "all";
  const ends = await dataEnd();
  const range = resolveRange(q, ends.ga);
  // Only days that have GA4 data count, and they are compared with the same number of days before.
  const { cur: span, prev: prevSpan, days } = withData(range, ends.ga);
  const sig = previousOf(range);
  const rangeQs = (extra: Record<string, string> = {}) =>
    `?${new URLSearchParams({ ...(range.key !== "28d" ? { range: range.key } : {}), ...(range.key === "custom" ? { from: range.start, to: range.end } : {}), ...extra })}`;

  const [cur, prev, posNow, posPrev, series, byService, engine, pages, perf, services] = await Promise.all([
    spanTotals(span),
    spanTotals(prevSpan),
    spanAvgPosition(span),
    spanAvgPosition(prevSpan),
    sessionsSeries({ start: range.start, end: span?.end ?? range.end }),
    spanLeadsByService(span),
    contentEngine(),
    spanPagePerformance(span, prevSpan),
    groupPerformance(),
    sql<{ id: string; name_ja: string }[]>`select id, name_ja from services`,
  ]);
  const fun = await spanFunnel(span, cur);
  const latest = ends.ga;

  const gaOn = has(env.googleServiceAccountJson) && has(env.ga4PropertyId);
  const gscOn = has(env.googleServiceAccountJson) && has(env.gscSiteUrl);

  // Best-performing service, for the "scoring learned" line.
  const best = [...perf.byService.values()]
    .filter((g) => g.pieces >= MIN_PIECES)
    .map((g) => ({ g, p: performancePoints(perf, g.key, "article", null) }))
    .sort((a, b) => b.p.points - a.p.points)[0];
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name_ja ?? id;

  const rows = (showAll ? pages : pages.filter((p) => p.ours)).slice(0, showAll ? 50 : 10);
  const topService = byService[0];
  const serviceTotal = byService.reduce((a, s) => a + s.leads, 0);

  return (
    <main className="page">
      {(!gaOn || !gscOn) && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-[#F5DDAE] bg-[#FEF8EC] px-3.5 py-2.5 text-[13px] text-[#7A4A0A]">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16v.5" /></svg>
          <span>
            {!gaOn && !gscOn ? "GA4 and Search Console aren't connected yet" : !gaOn ? "GA4 isn't connected yet" : "Search Console isn't connected yet"}, so traffic numbers stay empty until the first morning run after connecting.
          </span>
          <Link href="/status" className="font-semibold underline">Connections →</Link>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            renesistech.jp · {range.label}
            {span ? <> · {fmtDay(span.start)} – {fmtDay(span.end)} vs {fmtDay(prevSpan!.start)} – {fmtDay(prevSpan!.end)}</> : null}
          </p>
          <h1 className="page-title">Performance</h1>
        </div>
        <RangeBar current={range.key} from={range.start} to={range.end} scope={showAll ? "all" : undefined} />
      </div>

      {(!span || span.end < range.end) && (
        <p className="-mt-2 text-[13px] text-muted">
          {!span
            ? <>Google Analytics for {fmtDay(range.start)}{range.start !== range.end ? <> – {fmtDay(range.end)}</> : null} arrives with the next 06:00 JST run (latest data: {fmtDay(latest)}). Trending keywords below are already live.</>
            : <>Website numbers cover {fmtDay(span.start)} – {fmtDay(span.end)} ({days} days with data so far) and are compared with the {days} days before. The rest arrives with the next 06:00 JST run.</>}
        </p>
      )}

      <section aria-label="Key numbers" className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Kpi label="Website sessions" value={n(cur.sessions)}><Delta now={cur.sessions} prev={prev.sessions} /></Kpi>
        <Kpi label="Search clicks" value={n(cur.clicks)}><Delta now={cur.clicks} prev={prev.clicks} /></Kpi>
        <Kpi label="Search impressions" value={compact(cur.impressions)}><Delta now={cur.impressions} prev={prev.impressions} /></Kpi>
        <Kpi label="Avg Google position" value={posNow != null ? posNow.toFixed(1) : "—"}>
          <Delta now={posNow} prev={posPrev} lowerIsBetter unit="places" />
        </Kpi>
        <Kpi label="Visitors" value={n(cur.users)}><Delta now={cur.users} prev={prev.users} /></Kpi>
        <Kpi label="Website form fills" value={n(cur.leads + cur.downloads)} highlight><Delta now={cur.leads + cur.downloads} prev={prev.leads + prev.downloads} unit="abs" /></Kpi>
      </section>

      <div className="flex flex-wrap items-stretch gap-5">
        <section aria-label="Weekly sessions" className="card min-w-0 flex-[2_1_520px] px-[22px] py-5">
          <SeriesChart points={series.points} bucket={series.bucket} rangeLabel={range.label} total={cur.sessions} prevTotal={prev.sessions} />
        </section>

        <section aria-label="Lead funnel" className="card flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 px-[22px] py-5">
          <div>
            <h2 className="text-base font-semibold">
              {fun.sessions > 0 ? `${pct(fun.leads, fun.sessions).toFixed(1)}% of visits end in a form fill` : "From visit to form fill"}
            </h2>
            <p className="mt-1 text-[12.5px] text-faint">{range.label}{span ? ` · ${days} days with data` : ""}</p>
          </div>
          <div className="flex flex-col gap-3">
            <FunnelRow label="Sessions" value={fun.sessions} share={100} base={fun.sessions} />
            <FunnelRow label="Engaged sessions" value={fun.engaged} share={pct(fun.engaged, fun.sessions)} base={fun.sessions} />
            <FunnelRow label="Reached a form page" value={fun.offerViews} share={pct(fun.offerViews, fun.sessions)} base={fun.sessions} />
            <FunnelRow label="Submitted a form" value={fun.leads} share={pct(fun.leads, fun.sessions)} base={fun.sessions} strong />
          </div>
          <p className="mt-auto border-t border-[#F0F1F4] pt-3 text-[12.5px] text-muted">
            {fun.sessions === 0
              ? "Fills in once GA4 is connected."
              : fun.offerViews < fun.engaged * 0.2
                ? "Most engaged visitors never reach a form: add a clear contact / AI-shindan CTA to the top articles."
                : "Visitors reach the forms; shorten or simplify the forms next."}
          </p>
        </section>
      </div>

      <Suspense fallback={<div className="card h-40 animate-pulse bg-subtle" aria-hidden="true" />}>
        <TrendingKeywords
          span={{ start: range.start, end: range.end, prevStart: sig.start, prevEnd: sig.end }}
          label={range.label}
          cat={q.kw && /^[a-z0-9-]{1,40}$/.test(q.kw) ? q.kw : undefined}
          baseQs={{ ...(range.key !== "28d" ? { range: range.key } : {}), ...(range.key === "custom" ? { from: range.start, to: range.end } : {}), ...(showAll ? { scope: "all" } : {}) }}
        />
      </Suspense>

      <div className="flex flex-wrap items-start gap-5">
        <section aria-label="Top content" className="card min-w-0 flex-[2_1_520px] overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-[22px] pt-[18px] pb-3">
            <h2 className="text-base font-semibold">{showAll ? "All blog pages" : "Content made here"}</h2>
            <div className="flex gap-1.5 text-[13px]">
              <Link prefetch={false} href={`/performance${rangeQs()}`} className={`rounded-md px-2.5 py-1 ${!showAll ? "bg-subtle font-semibold" : "text-muted hover:text-ink"}`}>Made here</Link>
              <Link prefetch={false} href={`/performance${rangeQs({ scope: "all" })}`} className={`rounded-md px-2.5 py-1 ${showAll ? "bg-subtle font-semibold" : "text-muted hover:text-ink"}`}>All blog pages</Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <div className="eyebrow grid grid-cols-[minmax(0,1fr)_96px_80px_72px_64px] gap-3 border-y border-line bg-[#FAFAFB] px-[22px] py-2.5 text-[10.5px]">
                <span>Page</span><span className="text-right">Sessions</span><span className="text-right">Clicks</span><span className="text-right">Pos.</span><span className="text-right">Leads</span>
              </div>
              {rows.map((r) => {
                const refresh = r.position != null && r.position >= 8 && r.position <= 20;
                const up = r.sessions > r.sessions_prev && r.sessions_prev > 0;
                const down = r.sessions < r.sessions_prev;
                return (
                  <div key={r.path} className="grid grid-cols-[minmax(0,1fr)_96px_80px_72px_64px] items-center gap-3 border-b border-[#F0F1F4] px-[22px] py-3 last:border-b-0">
                    <span className="min-w-0 truncate" lang="ja">
                      {r.kind === "lead_magnet" && <span className="mr-1.5 rounded bg-accent-soft px-1.5 py-px font-sans text-[11px] font-semibold text-accent">PDF</span>}
                      {r.topic_id ? (
                        <Link href={`/topics/${r.topic_id}`} className="font-medium hover:text-accent-ink">{r.title ?? r.path}</Link>
                      ) : (
                        <a href={`https://renesistech.jp${r.path}`} target="_blank" rel="noreferrer" className="font-medium hover:text-accent-ink">{r.title ?? r.path}</a>
                      )}
                    </span>
                    <span className="text-right font-mono">
                      {n(r.sessions)} {up && <span className="text-[11px] text-good">▲</span>}
                      {down && <span className="text-[11px] text-bad">▼</span>}
                    </span>
                    <span className="text-right font-mono">{n(r.clicks)}</span>
                    <span className={`text-right font-mono ${refresh ? "text-warn" : ""}`}>{r.position != null ? r.position.toFixed(1) : "—"}</span>
                    <span className="text-right font-mono font-semibold">{n(r.leads + r.downloads)}</span>
                  </div>
                );
              })}
              {!rows.length && (
                <p className="px-[22px] py-6 text-sm text-faint">
                  {showAll ? "No blog pages found yet." : "Nothing published from here yet. Pieces appear once an editor publishes their Payload draft."}
                </p>
              )}
            </div>
          </div>
          <p className="border-t border-[#F0F1F4] px-[22px] py-3 text-xs text-faint">Positions in amber (8–20) are refresh candidates: a rewrite can reach Google's first page.</p>
        </section>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
          <section aria-label="Leads by service" className="card flex flex-col gap-3 px-[22px] py-5">
            <h2 className="text-base font-semibold">
              {topService ? <span lang="ja">{topService.service} brings {Math.round(pct(topService.leads, serviceTotal))}% of leads</span> : "Leads by service"}
            </h2>
            {byService.length ? (
              <div className="grid grid-cols-[132px_minmax(0,1fr)_40px] items-center gap-2.5 text-[13px]">
                {byService.slice(0, 6).map((s, i) => (
                  <ServiceBar key={s.service} name={s.service} share={pct(s.leads, serviceTotal)} rel={pct(s.leads, byService[0].leads)} rank={i} />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-faint">Appears once published pieces start bringing in form fills or downloads.</p>
            )}
          </section>

          <section aria-label="Content engine" className="flex flex-col gap-3.5 rounded-[14px] bg-ink px-[22px] py-5 text-[#E6E8EE]">
            <h2 className="text-base font-semibold text-white">Content engine this month</h2>
            <div className="grid grid-cols-3 gap-2.5">
              <div><p className="font-mono text-[22px] text-white">{engine.publishedThisMonth}</p><p className="mt-0.5 text-xs text-[#98A2B3]">published</p></div>
              <div><p className="font-mono text-[22px] text-white">{engine.avgReview ?? "—"}</p><p className="mt-0.5 text-xs text-[#98A2B3]">avg review score</p></div>
              <div><p className="font-mono text-[22px] text-white">{engine.refreshDue}</p><p className="mt-0.5 text-xs text-[#98A2B3]">refresh due</p></div>
            </div>
            <p className="border-t border-[#1F2937] pt-3 text-[13px] leading-relaxed text-[#C3C8D4]">
              {best && best.p.points !== 5 ? (
                <>Scoring learned: <span lang="ja">{serviceName(best.g.key)}</span> topics earn {(best.p.points / 5).toFixed(2)}× the average piece, so they get {best.p.points} of 10 performance points.</>
              ) : (
                <>Scoring stays neutral until a service has {MIN_PIECES}+ pieces live for a week. One lead counts as {LEAD_WEIGHT} sessions.</>
              )}
            </p>
            <Link href="/review" className="inline-flex min-h-10 items-center self-start rounded-lg bg-white px-3.5 text-[13px] font-semibold text-ink hover:bg-subtle">
              Open monthly review
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}

function FunnelRow({ label, value, share, base, strong }: { label: string; value: number; share: number; base: number; strong?: boolean }) {
  return (
    <div>
      <p className={`mb-1.5 flex justify-between text-[13px] ${strong ? "font-semibold" : ""}`}>
        <span>{label}</span>
        <span className="font-mono">
          {n(value)}
          {base > 0 && share < 100 ? ` · ${share < 10 ? share.toFixed(1) : Math.round(share)}%` : ""}
        </span>
      </p>
      <div className="h-2.5 rounded-full bg-[#EEF0F3]">
        <div
          className={`h-full rounded-full ${strong ? "bg-ink" : "bg-accent"}`}
          style={{ width: `${base > 0 ? Math.max(share, value > 0 ? 2 : 0) : 0}%`, opacity: strong ? 1 : Math.max(0.45, share / 100) }}
        />
      </div>
    </div>
  );
}

function ServiceBar({ name, share, rel, rank }: { name: string; share: number; rel: number; rank: number }) {
  return (
    <>
      <span lang="ja" className="truncate">{name}</span>
      <div className="h-2 rounded bg-[#EEF0F3]">
        <div className={`h-full rounded ${rank < 3 ? "bg-accent" : "bg-[#98A2B3]"}`} style={{ width: `${rel}%`, opacity: rank < 3 ? 1 - rank * 0.25 : 1 }} />
      </div>
      <span className="text-right font-mono">{Math.round(share)}%</span>
    </>
  );
}

/** Sessions per day or week as an area line; a diamond marks a day/week a piece went live. */
function SeriesChart({ points, bucket, rangeLabel, total, prevTotal }: { points: Point[]; bucket: "day" | "week"; rangeLabel: string; total: number; prevTotal: number }) {
  const max = Math.max(...points.map((p) => p.sessions), 0);
  // Whole range vs the same-length period before (single days are too noisy to compare).
  const change = prevTotal > 0 ? Math.round((100 * (total - prevTotal)) / prevTotal) : null;
  const firstSel = points.findIndex((p) => p.inRange);
  const unit = bucket === "week" ? "week" : "day";

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            {max === 0 ? "Website sessions" : change == null ? `${n(total)} sessions · ${rangeLabel}` : `Traffic is ${change >= 0 ? "up" : "down"} ${Math.abs(change)}% vs the previous period`}
          </h2>
          <p className="mt-1 text-[12.5px] text-faint">
            Sessions per {unit} on renesistech.jp · ◆ = a piece went live{firstSel > 0 ? " · shaded = selected range" : ""} · hover for details
          </p>
        </div>
        {max > 0 && <span className="font-mono text-xs text-faint">{n(prevTotal)} → {n(total)} sessions</span>}
      </div>
      {max === 0 ? (
        <div className="mt-3.5 flex h-[220px] items-center justify-center rounded-lg border border-dashed border-line-strong px-4 text-center text-[13px] text-faint">
          No GA4 data for this range yet.
        </div>
      ) : (
        <SessionsChart points={points} unit={unit} label={rangeLabel} />
      )}
    </>
  );
}
