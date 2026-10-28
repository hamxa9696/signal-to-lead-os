import Link from "next/link";
import { sql } from "@/lib/db";
import { PageHeader } from "../page-header";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "analyzed", label: "Relevant" },
  { key: "new", label: "Waiting for analysis" },
  { key: "ignored", label: "Ignored" },
] as const;

type Row = {
  title: string; url: string | null; source: string; published_at: Date | null;
  relevance: string | null; service: string | null; buyer_problem: string | null; angle: string | null;
  deep: { facts?: string[]; implication?: string; persona?: string | null; industries?: string[]; questions?: string[]; full_text?: boolean } | null;
};

const fmt = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", month: "short", day: "numeric" }).format(d) : "—";

export default async function SignalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: raw } = await searchParams;
  const status = TABS.some((t) => t.key === raw) ? raw! : "analyzed";

  const [rows, counts] = await Promise.all([
    sql<Row[]>`
      select s.title, s.url, src.name as source, s.published_at, s.relevance::text,
             sv.name_ja as service, s.buyer_problem, s.analysis->>'angle' as angle, s.deep
      from signals s join sources src on src.id = s.source_id
      left join services sv on sv.id = s.service_id
      where s.status = ${status}
      order by (s.deep is not null) desc, s.relevance desc nulls last, coalesce(s.published_at, s.fetched_at) desc
      limit 200`,
    sql<{ status: string; n: number }[]>`select status, count(*)::int as n from signals group by status`,
  ]);
  const n = (k: string) => counts.find((c) => c.status === k)?.n ?? 0;

  return (
    <main className="page">
      <PageHeader
        eyebrow="Inputs"
        title="Signals"
        description={<>News from Japanese <Link href="/sources" className="font-medium text-accent hover:underline">sources</Link>, scored by Gemini for your personas. The strongest are read in full; their facts and reader questions are shown first.</>}
      />

      <nav aria-label="Signal status" className="seg self-start">
        {TABS.map((t) => (
          <Link key={t.key} href={`/signals?status=${t.key}`} aria-current={t.key === status ? "page" : undefined} className={t.key === status ? "seg-on" : "seg-item"}>
            {t.label} <span className="font-mono text-[12px] text-faint">{n(t.key)}</span>
          </Link>
        ))}
      </nav>

      <ul className="card divide-y divide-line">
        {rows.map((r, i) => (
          <li key={i} className="px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-faint">
              <span>{r.source} · {fmt(r.published_at)}</span>
              {r.relevance && <span className="tabular-nums">relevance {Number(r.relevance).toFixed(2)}</span>}
            </div>
            <p lang="ja" className="mt-1 font-medium leading-snug">
              {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">{r.title}</a> : r.title}
            </p>
            {(r.buyer_problem || r.angle || r.service) && (
              <p lang="ja" className="mt-1 text-sm text-muted">
                {r.service && <span className="mr-2 rounded bg-subtle px-1.5 py-0.5 text-xs">{r.service}</span>}
                {r.buyer_problem && <>課題: {r.buyer_problem} </>}
                {r.angle && <span className="text-faint">· 切り口: {r.angle}</span>}
              </p>
            )}
            {r.deep && (
              <div lang="ja" className="mt-2 rounded-lg border-l-2 border-accent bg-accent-soft/50 px-3 py-2 text-[13px]">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-accent-ink" lang="en">
                  {r.deep.full_text ? "Read in full" : "Summary only (paywall)"}{r.deep.persona && <> · for {r.deep.persona}</>}
                  {r.deep.industries?.length ? <> · {r.deep.industries.join("、")}</> : null}
                </p>
                <ul className="list-disc space-y-0.5 pl-4 text-body">{r.deep.facts?.map((f) => <li key={f}>{f}</li>)}</ul>
                {r.deep.implication && <p className="mt-1 text-muted">→ {r.deep.implication}</p>}
                {r.deep.questions?.length ? <p className="mt-1 text-faint">検索されそうな質問: {r.deep.questions.join(" / ")}</p> : null}
              </div>
            )}
          </li>
        ))}
        {!rows.length && <li className="px-4 py-6 text-sm text-faint">Nothing here yet.</li>}
      </ul>
    </main>
  );
}
