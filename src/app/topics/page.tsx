import Link from "next/link";
import { sql } from "@/lib/db";
import { addDays, weekOf } from "@/lib/week";
import { SCORE_MAX } from "@/jobs/weekly-shortlist";
import { setTopicStatus } from "../actions";

export const dynamic = "force-dynamic";

type Breakdown = {
  demand: number; demand_source: string; gsc_impressions_28d: number;
  fit: number; freshness: number; performance: number; performance_note?: string;
};

type Topic = {
  id: string;
  kind: "article" | "lead_magnet";
  magnet_format: string | null;
  title_ja: string;
  title_en: string | null;
  primary_keyword: string | null;
  secondary_keywords: string[];
  search_intent: string | null;
  origin: string;
  service: string | null;
  score: string | null;
  score_breakdown: Breakdown | null;
  rationale: string | null;
  outline: string[] | null;
  cta: string | null;
  status: string;
  item_status: string | null;
  signals: { title: string; url: string | null }[];
};

/** Where a topic is in the pipeline, from its own status and its draft's. */
function stage(t: Topic): "proposed" | "writing" | "revision" | "ready" | "live" | "rejected" {
  if (t.status === "rejected") return "rejected";
  if (t.status === "proposed") return "proposed";
  if (t.item_status === "published" || t.status === "done") return "live";
  if (t.item_status === "ready") return "ready";
  if (t.item_status === "needs_revision") return "revision";
  return "writing";
}

const PILL: Record<string, { label: string; cls: string }> = {
  writing: { label: "Writing", cls: "text-accent-ink bg-accent-soft border-accent/30" },
  revision: { label: "Needs revision", cls: "text-warn bg-warn-soft border-warn/30" },
  ready: { label: "Ready to publish", cls: "text-good bg-good-soft border-good/30" },
  live: { label: "Live", cls: "text-white bg-ink border-ink" },
  rejected: { label: "Rejected", cls: "text-faint bg-subtle border-line line-through" },
};

const KIND = (t: Topic) =>
  t.origin === "refresh" ? "Rewrite" : t.kind === "lead_magnet" ? `Lead magnet · ${t.magnet_format ?? ""}` : "Article";

const fmtWeek = (d: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export default async function TopicsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week: weekParam } = await searchParams;
  const [{ latest }] = await sql<{ latest: string | null }[]>`select max(week_of)::text as latest from topics`;
  const week = /^\d{4}-\d{2}-\d{2}$/.test(weekParam ?? "") ? weekParam! : (latest ?? weekOf());

  const [topics, [{ signals }]] = await Promise.all([
    sql<Topic[]>`
      select t.id, t.kind, t.magnet_format, t.title_ja, t.title_en, t.primary_keyword, t.secondary_keywords,
             t.search_intent, t.origin, sv.name_ja as service, t.score::text,
             t.score_breakdown, t.rationale, t.outline, t.cta, t.status, ci.status as item_status,
             coalesce((select json_agg(json_build_object('title', s.title, 'url', s.url))
                       from topic_signals ts join signals s on s.id = ts.signal_id
                       where ts.topic_id = t.id), '[]') as signals
      from topics t
      left join services sv on sv.id = t.service_id
      left join content_items ci on ci.topic_id = t.id and ci.parent_id is null
      where t.week_of = ${week}
      order by (t.status = 'rejected'), t.score desc nulls last`,
    sql<{ signals: number }[]>`
      select count(*)::int as signals from signals
      where status = 'analyzed' and analyzed_at >= ${week}::date - 7 and analyzed_at < ${week}::date + 7`,
  ]);

  const count = (s: string) => topics.filter((t) => stage(t) === s).length;
  const counters = [
    { key: "proposed", label: "Proposed", dot: "" },
    { key: "writing", label: "Writing", dot: "" },
    { key: "revision", label: "Needs revision", dot: "bg-warn-dot", tone: "text-warn" },
    { key: "ready", label: "Ready", dot: "bg-good-dot", tone: "text-good" },
    { key: "live", label: "Live", dot: "" },
  ];

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 md:px-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            Week of {fmtWeek(week)} – {fmtWeek(addDays(week, 6))} · JST · {signals} relevant signals
          </p>
          <h1 className="mt-1.5 text-[28px] font-bold tracking-tight">Weekly shortlist</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/topics?week=${addDays(week, -7)}`} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-medium shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:bg-subtle">
            ← Previous
          </Link>
          <Link href={`/topics?week=${addDays(week, 7)}`} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-medium shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:bg-subtle">
            Next →
          </Link>
        </div>
      </div>

      <section aria-label="Pipeline" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {counters.map((c) => (
          <div key={c.key} className="card px-[18px] py-4">
            <p className={`flex items-center gap-1.5 text-[12.5px] ${c.tone ?? "text-faint"}`}>
              {c.dot && <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />}
              {c.label}
            </p>
            <p className="mt-2 font-mono text-[26px] tracking-tight">{count(c.key)}</p>
          </div>
        ))}
      </section>

      {!topics.length ? (
        <p className="card mt-5 px-6 py-8 text-sm text-muted">
          No topics for this week yet. The shortlist is generated every Monday at 06:30 JST, or use “Regenerate weekly shortlist” on the Status page.
        </p>
      ) : (
        <section aria-label="Topics" className="card mt-5 overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="eyebrow grid grid-cols-[64px_minmax(0,1fr)_184px_150px_170px] gap-4 rounded-t-[14px] border-b border-line bg-[#FAFAFB] px-[22px] py-3 text-[10.5px]">
              <span>Score</span>
              <span>Topic</span>
              <span>Split D·F·N·P</span>
              <span>Service</span>
              <span>State</span>
            </div>
            {topics.map((t) => {
              const s = stage(t);
              const score = Math.round(Number(t.score ?? 0));
              const lead = s !== "proposed" && s !== "rejected";
              return (
                <div key={t.id} className="grid grid-cols-[64px_minmax(0,1fr)_184px_150px_170px] items-center gap-4 border-b border-[#F0F1F4] px-[22px] py-4 last:border-b-0">
                  <ScoreRing value={score} strong={lead} />
                  <div className="min-w-0">
                    <Link href={`/topics/${t.id}`} lang="ja" className="block font-jp text-[15px] font-medium leading-normal hover:text-accent-ink">
                      {t.title_ja}
                    </Link>
                    <p className="mt-1 text-[12.5px] text-faint">
                      {KIND(t)} · <span lang="ja">{t.primary_keyword}</span>
                    </p>
                    {t.rationale && (
                      <details className="mt-1 text-[12.5px]">
                        <summary className="cursor-pointer text-faint hover:text-ink">Why this topic</summary>
                        <p className="mt-1 text-muted">{t.rationale}</p>
                        {t.signals.length > 0 && (
                          <ul lang="ja" className="mt-1 space-y-0.5 text-faint">
                            {t.signals.map((sig, i) => (
                              <li key={i}>↳ {sig.url ? <a href={sig.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong hover:text-ink">{sig.title}</a> : sig.title}</li>
                            ))}
                          </ul>
                        )}
                      </details>
                    )}
                  </div>
                  <Split b={t.score_breakdown} strong={lead} />
                  <span lang="ja" className="text-body">{t.service?.replace(/サービス$/, "") ?? "—"}</span>
                  <div>
                    {s === "proposed" ? (
                      <span className="flex gap-1.5">
                        <StatusButton id={t.id} status="approved" label="Approve" primary />
                        <StatusButton id={t.id} status="rejected" label="Reject" />
                      </span>
                    ) : s === "writing" ? (
                      <Link href={`/topics/${t.id}`} className="inline-flex min-h-8 items-center rounded-[7px] bg-ink px-3 text-[12.5px] font-semibold text-white hover:bg-body">
                        Start writing →
                      </Link>
                    ) : (
                      <Link href={`/topics/${t.id}`} className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PILL[s].cls}`}>
                        {PILL[s].label}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <p className="mt-3.5 font-mono text-[11px] text-faint">
        D demand /{SCORE_MAX.demand} · F fit /{SCORE_MAX.fit} · N freshness /{SCORE_MAX.freshness} · P past performance /{SCORE_MAX.performance}
      </p>
    </main>
  );
}

function ScoreRing({ value, strong }: { value: number; strong: boolean }) {
  const c = 2 * Math.PI * 20;
  return (
    <div className="relative h-12 w-12">
      <svg width="48" height="48" viewBox="0 0 48 48" role="img" aria-label={`Score ${value} of 100`} fill="none" strokeWidth="4">
        <circle cx="24" cy="24" r="20" stroke="#EEF0F3" />
        <circle cx="24" cy="24" r="20" stroke={strong ? "var(--color-accent)" : "#98A2B3"} strokeDasharray={`${(value / 100) * c} ${c}`} strokeLinecap="round" transform="rotate(-90 24 24)" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-medium">{value}</span>
    </div>
  );
}

function Split({ b, strong }: { b: Breakdown | null; strong: boolean }) {
  if (!b) return <span className="text-xs text-faint">—</span>;
  const parts = [
    { v: b.demand, max: SCORE_MAX.demand, name: "Demand" },
    { v: b.fit, max: SCORE_MAX.fit, name: "Fit" },
    { v: b.freshness, max: SCORE_MAX.freshness, name: "Freshness" },
    { v: b.performance, max: SCORE_MAX.performance, name: "Past performance" },
  ];
  return (
    <div className="flex h-2 gap-[3px]" role="img" aria-label={parts.map((p) => `${p.name} ${p.v} of ${p.max}`).join(", ")}>
      {parts.map((p) => (
        <span key={p.name} title={`${p.name} ${p.v}/${p.max}`} className="w-10 overflow-hidden rounded-sm bg-[#EEF0F3]">
          <span className={`block h-full ${strong ? "bg-accent" : "bg-[#98A2B3]"}`} style={{ width: `${(100 * p.v) / p.max}%` }} />
        </span>
      ))}
    </div>
  );
}

function StatusButton({ id, status, label, primary }: { id: string; status: string; label: string; primary?: boolean }) {
  return (
    <form action={setTopicStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        className={`min-h-8 rounded-[7px] px-3 text-[12.5px] ${primary ? "bg-accent font-semibold text-white hover:bg-accent-ink" : "border border-line-strong bg-surface text-muted hover:bg-subtle"}`}
      >
        {label}
      </button>
    </form>
  );
}
