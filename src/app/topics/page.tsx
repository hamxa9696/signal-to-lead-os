import Link from "next/link";
import { sql } from "@/lib/db";
import { addDays, weekOf } from "@/lib/week";
import { SCORE_MAX } from "@/jobs/weekly-shortlist";
import { setTopicStatus } from "../actions";

export const dynamic = "force-dynamic";

type Topic = {
  id: string;
  kind: "article" | "lead_magnet";
  magnet_format: string | null;
  title_ja: string;
  title_en: string | null;
  primary_keyword: string | null;
  secondary_keywords: string[];
  search_intent: string | null;
  service: string | null;
  service_url: string | null;
  score: string | null;
  score_breakdown: {
    demand: number; demand_source: string; gsc_impressions_28d: number;
    fit: number; freshness: number; performance: number; performance_note?: string;
  } | null;
  rationale: string | null;
  outline: string[] | null;
  cta: string | null;
  status: string;
  signals: { title: string; url: string | null }[];
};

const STATUS_STYLE: Record<string, string> = {
  proposed: "text-white/60 border-white/20",
  approved: "text-emerald-300 border-emerald-400/40",
  rejected: "text-white/40 border-white/10 line-through",
  in_progress: "text-sky-300 border-sky-400/40",
  done: "text-sky-300 border-sky-400/40",
};

export default async function TopicsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week: weekParam } = await searchParams;
  const [{ latest }] = await sql<{ latest: string | null }[]>`select max(week_of)::text as latest from topics`;
  const week = /^\d{4}-\d{2}-\d{2}$/.test(weekParam ?? "") ? weekParam! : (latest ?? weekOf());

  const topics = await sql<Topic[]>`
    select t.id, t.kind, t.magnet_format, t.title_ja, t.title_en, t.primary_keyword, t.secondary_keywords,
           t.search_intent, sv.name_ja as service, sv.landing_url as service_url, t.score::text,
           t.score_breakdown, t.rationale, t.outline, t.cta, t.status,
           coalesce((select json_agg(json_build_object('title', s.title, 'url', s.url))
                     from topic_signals ts join signals s on s.id = ts.signal_id
                     where ts.topic_id = t.id), '[]') as signals
    from topics t left join services sv on sv.id = t.service_id
    where t.week_of = ${week}
    order by (t.kind = 'lead_magnet') desc, t.score desc nulls last`;

  const approved = topics.filter((t) => t.status === "approved").length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Weekly shortlist</h1>
          <p className="mt-1 text-sm text-white/60">
            Week of {week} · {topics.length} topics · {approved} approved
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href={`/topics?week=${addDays(week, -7)}`} className="rounded-md border border-white/15 px-3 py-1.5 hover:bg-white/10">← Previous</Link>
          <Link href={`/topics?week=${addDays(week, 7)}`} className="rounded-md border border-white/15 px-3 py-1.5 hover:bg-white/10">Next →</Link>
        </div>
      </div>

      {!topics.length && (
        <p className="mt-8 rounded-lg border border-white/10 px-4 py-6 text-sm text-white/60">
          No topics for this week yet. The shortlist is generated every Monday morning, or use
          “Regenerate weekly shortlist” on the Status page (needs a Gemini key).
        </p>
      )}

      <ol className="mt-6 space-y-4">
        {topics.map((t) => (
          <li key={t.id} className="rounded-lg border border-white/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded border px-1.5 py-0.5 ${t.kind === "lead_magnet" ? "border-fuchsia-400/40 text-fuchsia-300" : "border-white/20 text-white/60"}`}>
                    {t.kind === "lead_magnet" ? `Lead magnet · ${t.magnet_format}` : "Article"}
                  </span>
                  <span className={`rounded border px-1.5 py-0.5 ${STATUS_STYLE[t.status] ?? ""}`}>{t.status}</span>
                  {t.search_intent && <span className="text-white/40">{t.search_intent}</span>}
                </div>
                <h2 lang="ja" className="mt-2 text-lg font-medium">
                  <Link href={`/topics/${t.id}`} className="hover:underline">{t.title_ja}</Link>
                </h2>
                {t.title_en && <p className="text-sm text-white/50">{t.title_en}</p>}
              </div>
              <Score total={t.score} b={t.score_breakdown} />
            </div>

            <div lang="ja" className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {t.primary_keyword && <span className="rounded bg-white/10 px-2 py-0.5 font-medium">{t.primary_keyword}</span>}
              {t.secondary_keywords.map((k) => (
                <span key={k} className="rounded bg-white/5 px-2 py-0.5 text-white/60">{k}</span>
              ))}
            </div>

            {t.rationale && <p className="mt-3 text-sm text-white/70">{t.rationale}</p>}
            {t.service && (
              <p lang="ja" className="mt-1 text-sm text-white/50">
                Service: {t.service_url ? <a href={t.service_url} target="_blank" rel="noreferrer" className="underline decoration-white/30 hover:text-white">{t.service}</a> : t.service}
              </p>
            )}

            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-white/60 hover:text-white">Outline, CTA and sources</summary>
              <ol lang="ja" className="mt-2 list-decimal space-y-0.5 pl-5 text-white/80">
                {(t.outline ?? []).map((h, i) => <li key={i}>{h}</li>)}
              </ol>
              {t.cta && <p lang="ja" className="mt-2 text-white/70">CTA: {t.cta}</p>}
              {t.signals.length > 0 && (
                <ul lang="ja" className="mt-2 space-y-0.5 text-white/50">
                  {t.signals.map((s, i) => (
                    <li key={i}>↳ {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-white/20 hover:text-white">{s.title}</a> : s.title}</li>
                  ))}
                </ul>
              )}
            </details>

            <div className="mt-4 flex flex-wrap gap-2">
              {t.status !== "approved" && <StatusButton id={t.id} status="approved" label="Approve" primary />}
              {t.status !== "rejected" && <StatusButton id={t.id} status="rejected" label="Reject" />}
              {t.status !== "proposed" && t.status !== "in_progress" && t.status !== "done" && <StatusButton id={t.id} status="proposed" label="Undo" />}
              {["approved", "in_progress", "done"].includes(t.status) && (
                <Link href={`/topics/${t.id}`} className="rounded-md bg-sky-400/90 px-3 py-1.5 text-sm text-black hover:bg-sky-300">
                  {t.status === "approved" ? "Start writing →" : "Open workspace →"}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}

function StatusButton({ id, status, label, primary }: { id: string; status: string; label: string; primary?: boolean }) {
  return (
    <form action={setTopicStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        className={`rounded-md px-3 py-1.5 text-sm ${primary ? "bg-emerald-500/90 text-black hover:bg-emerald-400" : "border border-white/15 hover:bg-white/10"}`}
      >
        {label}
      </button>
    </form>
  );
}

function Score({ total, b }: { total: string | null; b: Topic["score_breakdown"] }) {
  if (!b) return null;
  const parts = [
    { k: "Demand", v: b.demand, max: SCORE_MAX.demand, note: b.demand_source === "search_console" ? `${b.gsc_impressions_28d} imp/28d` : "estimate" },
    { k: "Fit", v: b.fit, max: SCORE_MAX.fit },
    { k: "Fresh", v: b.freshness, max: SCORE_MAX.freshness },
    { k: "Perf.", v: b.performance, max: SCORE_MAX.performance, note: b.performance_note ? (b.performance_note.startsWith("no history") ? "no history" : "past pieces") : "not scored", title: b.performance_note },
  ];
  return (
    <div className="w-44 shrink-0 text-xs">
      <div className="text-right text-2xl font-semibold tabular-nums">{Math.round(Number(total))}<span className="text-sm text-white/40">/100</span></div>
      <dl className="mt-1 space-y-1">
        {parts.map((p) => (
          <div key={p.k} title={("title" in p && p.title) || p.note}>
            <div className="flex justify-between text-white/50"><dt>{p.k}{p.note ? ` (${p.note})` : ""}</dt><dd className="tabular-nums">{p.v}/{p.max}</dd></div>
            <div className="h-1 rounded bg-white/10"><div className="h-1 rounded bg-emerald-400/70" style={{ width: `${(100 * p.v) / p.max}%` }} /></div>
          </div>
        ))}
      </dl>
    </div>
  );
}
