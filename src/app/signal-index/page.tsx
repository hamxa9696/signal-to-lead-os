import Link from "next/link";
import { sql } from "@/lib/db";
import { lastMonth, type SignalIndex } from "@/lib/signal-index";
import { typeInfo } from "@/lib/signal-types";
import { PageHeader } from "../page-header";
import { RunButton } from "../run-button";
import { CopyButton } from "../copy-button";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Report = { month: string; data: SignalIndex; topic_id: string | null; topic_status: string | null };
const n = (v: number) => v.toLocaleString("en-US");

export default async function SignalIndexPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const reports = await sql<Report[]>`
    select r.month::text, r.data, r.topic_id, t.status as topic_status
    from signal_index_reports r left join topics t on t.id = r.topic_id order by r.month desc`;
  const r = reports.find((x) => x.month === m) ?? reports[0];
  const due = lastMonth();
  const built = reports.some((x) => x.month === due);

  return (
    <main className="page">
      <PageHeader
        eyebrow="Original research · monthly"
        title="Signal index"
        description="Kizashi's own monthly count of what moved in Japan's AI, blockchain, cloud, software and QA news: data no other site has. Each edition becomes an article on renesistech.jp, the kind of source AI assistants and journalists cite."
        actions={<RunButton job="signal-index" label={built ? `Rebuild ${due.slice(0, 7)}` : `Build ${due.slice(0, 7)} index`} force={built} />}
      />

      {reports.length > 1 && (
        <nav aria-label="Editions" className="flex flex-wrap gap-1.5">
          {reports.map((x) => (
            <Link key={x.month} href={`/signal-index?m=${x.month}`} prefetch={false}
              className={`rounded-full border px-3 py-1 text-[12.5px] ${x.month === r?.month ? "border-accent bg-accent-soft text-accent-ink" : "border-line-strong text-muted hover:text-ink"}`}>
              {x.data.label_ja}
            </Link>
          ))}
        </nav>
      )}

      {!r ? (
        <div className="card p-6 text-sm text-muted">
          No edition yet. It is built automatically on the 2nd of each month for the month before, or click &ldquo;Build {due.slice(0, 7)} index&rdquo;.
        </div>
      ) : <Edition r={r} />}

      <section className="card p-5 text-[13px] text-muted">
        <h2 className="text-base font-semibold text-ink">How it is calculated</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Every article Kizashi collects from Japanese news feeds, official sites, PR TIMES and Google News searches is screened by Gemini; only articles relevant to B2B technology buyers count.</li>
          <li>Articles are counted by publish date (Japan time) and by field. The same news in several outlets is grouped into one <b>story</b>.</li>
          <li><b>Index</b> = a field&apos;s relevant articles this month ÷ the same in the first edition × 100. Month-on-month change shows only when the previous month had 20+ articles.</li>
          <li>All numbers are counted from the database; no AI-made figures. The article prompt must use them exactly and credit 「Renesis Tech Japan調べ」.</li>
        </ul>
      </section>
    </main>
  );
}

function Edition({ r }: { r: Report }) {
  const x = r.data;
  return (
    <>
      {x.coverage.partial && (
        <div className="rounded-xl border border-sprout/40 bg-sprout-soft px-4 py-3 text-[13px] text-ink">
          <b>Baseline edition.</b> {x.coverage.note}
        </div>
      )}

      <section aria-label="Totals" className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        {[
          { l: "Articles screened", v: n(x.totals.screened), s: `${x.totals.sources} sources tracked` },
          { l: "Relevant articles", v: n(x.totals.articles), s: x.totals.prev ? `${x.totals.prev} the month before` : "first comparable month" },
          { l: "Distinct stories", v: n(x.totals.stories), s: "same news across outlets = 1" },
          { l: "Outlets", v: n(x.totals.outlets), s: "publishers with a relevant article" },
        ].map((k) => (
          <div key={k.l} className="card px-[18px] py-4">
            <p className="text-[12.5px] text-faint">{k.l}</p>
            <p translate="no" className="notranslate mt-2 mb-0.5 font-mono text-[26px] tracking-tight">{k.v}</p>
            <p className="text-xs text-faint">{k.s}</p>
          </div>
        ))}
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Key findings · {x.label_ja} (edition {x.edition})</h2>
            <p className="mt-0.5 text-[12.5px] text-faint">Computed from the counts below; these are the headline facts the article leads with.</p>
          </div>
          {r.topic_id && (
            <div className="flex items-center gap-2">
              <Link href={`/topics/${r.topic_id}`} prefetch={false} className="btn-primary">Open the article topic →</Link>
              <span className="text-[12px] text-faint">{r.topic_status}</span>
            </div>
          )}
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[13.5px]">{x.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
        <TypeBar types={x.types} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {x.categories.map((c) => (
          <article key={c.slug} className="card p-5">
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[12px] text-faint"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color ?? "#A29A88" }} />{c.name_en}</p>
                <h3 lang="ja" className="mt-0.5 text-[15px] font-semibold">{c.name_ja}</h3>
              </div>
              <div className="text-right">
                <p translate="no" className="font-mono text-[26px] leading-none tracking-tight">{c.index}</p>
                <p className="mt-1 text-[11px] text-faint">index{c.change != null ? ` · ${c.change > 0 ? "▲" : c.change < 0 ? "▼" : "="} ${Math.abs(c.change)}% m/m` : ""}</p>
              </div>
            </header>
            <p className="mt-2 text-[12.5px] text-muted">
              <b translate="no" className="font-mono text-ink">{c.articles}</b> relevant articles · {c.stories} stories · {c.outlets} outlets{c.official ? ` · ${c.official} official` : ""}
            </p>
            <TypeBar types={c.types} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <List title="Busiest niches" rows={c.niches.map((v) => ({ k: v.name, v: `${v.n}` }))} />
              <List title="Most-mentioned keywords" rows={c.rising.map((v) => ({ k: v.keyword, v: `${v.n}${v.prev ? ` (prev ${v.prev})` : ""}` }))} />
            </div>
            {c.top.length > 0 && (
              <div className="mt-3">
                <h4 className="text-[12px] font-semibold text-muted">Strongest stories</h4>
                <ol className="mt-1 space-y-1 text-[12.5px]">
                  {c.top.map((t) => (
                    <li key={t.title} className="flex gap-2">
                      <span translate="no" className="w-7 shrink-0 font-mono text-faint">{t.strength}</span>
                      <span className="min-w-0">
                        {t.url ? <a href={t.url} target="_blank" rel="noreferrer" lang="ja" className="text-accent hover:underline">{t.title}</a> : <span lang="ja">{t.title}</span>}
                        <span className="text-faint"> · {t.outlets} outlets{t.type ? ` · ${typeInfo(t.type)?.label ?? t.type}` : ""}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Data brief for the article</h2>
          <CopyButton text={(r.data as unknown as { brief?: string }).brief ?? ""} label="⧉ Copy data brief" className="btn" />
        </div>
        <p className="mt-0.5 text-[12.5px] text-faint">Already inside the article&apos;s prompt pack; copy it if you write elsewhere.</p>
      </section>
    </>
  );
}

function TypeBar({ types }: { types: { key: string; label: string; n: number; share: number }[] }) {
  if (!types.length) return null;
  return (
    <div className="mt-3">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-subtle">
        {types.map((t) => <span key={t.key} title={`${t.label}: ${t.n} (${t.share}%)`} style={{ width: `${t.share}%`, background: typeInfo(t.key)?.color ?? "#A29A88" }} />)}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted">
        {types.map((t) => <li key={t.key} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: typeInfo(t.key)?.color ?? "#A29A88" }} />{t.label} {t.share}%</li>)}
      </ul>
    </div>
  );
}

function List({ title, rows }: { title: string; rows: { k: string; v: string }[] }) {
  return (
    <div className="min-w-0">
      <h4 className="text-[12px] font-semibold text-muted">{title}</h4>
      {rows.length ? (
        <ul className="mt-1 space-y-0.5 text-[12.5px]">
          {rows.map((r) => <li key={r.k} className="flex justify-between gap-2"><span lang="ja" className="truncate">{r.k}</span><span translate="no" className="shrink-0 font-mono text-faint">{r.v}</span></li>)}
        </ul>
      ) : <p className="mt-1 text-[12px] text-faint">Not enough mentions.</p>}
    </div>
  );
}
