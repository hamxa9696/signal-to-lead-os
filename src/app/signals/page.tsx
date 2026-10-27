import Link from "next/link";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "analyzed", label: "Relevant" },
  { key: "new", label: "Waiting for analysis" },
  { key: "ignored", label: "Ignored" },
] as const;

type Row = {
  title: string; url: string | null; source: string; published_at: Date | null;
  relevance: string | null; service: string | null; buyer_problem: string | null; angle: string | null;
};

const fmt = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", month: "short", day: "numeric" }).format(d) : "—";

export default async function SignalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: raw } = await searchParams;
  const status = TABS.some((t) => t.key === raw) ? raw! : "analyzed";

  const [rows, counts] = await Promise.all([
    sql<Row[]>`
      select s.title, s.url, src.name as source, s.published_at, s.relevance::text,
             sv.name_ja as service, s.buyer_problem, s.analysis->>'angle' as angle
      from signals s join sources src on src.id = s.source_id
      left join services sv on sv.id = s.service_id
      where s.status = ${status}
      order by s.relevance desc nulls last, coalesce(s.published_at, s.fetched_at) desc
      limit 200`,
    sql<{ status: string; n: number }[]>`select status, count(*)::int as n from signals group by status`,
  ]);
  const n = (k: string) => counts.find((c) => c.status === k)?.n ?? 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-xl font-semibold">Signals</h1>
      <p className="mt-1 text-sm text-muted">News items collected from Japanese sources and scored by Gemini. Showing up to 200.</p>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/signals?status=${t.key}`}
            className={`rounded-md border px-3 py-1.5 ${t.key === status ? "border-accent bg-subtle" : "border-line-strong text-muted hover:bg-subtle"}`}
          >
            {t.label} ({n(t.key)})
          </Link>
        ))}
      </div>

      <ul className="mt-4 divide-y divide-white/10 card">
        {rows.map((r, i) => (
          <li key={i} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-faint">
              <span>{r.source} · {fmt(r.published_at)}</span>
              {r.relevance && <span className="tabular-nums">relevance {Number(r.relevance).toFixed(2)}</span>}
            </div>
            <p lang="ja" className="mt-0.5">
              {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">{r.title}</a> : r.title}
            </p>
            {(r.buyer_problem || r.angle || r.service) && (
              <p lang="ja" className="mt-1 text-sm text-muted">
                {r.service && <span className="mr-2 rounded bg-subtle px-1.5 py-0.5 text-xs">{r.service}</span>}
                {r.buyer_problem && <>課題: {r.buyer_problem} </>}
                {r.angle && <span className="text-faint">· 切り口: {r.angle}</span>}
              </p>
            )}
          </li>
        ))}
        {!rows.length && <li className="px-4 py-6 text-sm text-faint">Nothing here yet.</li>}
      </ul>
    </main>
  );
}
