import Link from "next/link";
import { sql } from "@/lib/db";
import { loadTaxonomy } from "@/lib/taxonomy";
import { loadTargeting } from "@/lib/targeting";
import { PageHeader } from "../page-header";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "analyzed", label: "Relevant" },
  { key: "new", label: "Waiting for analysis" },
  { key: "ignored", label: "Ignored" },
] as const;

type Row = {
  title: string; url: string | null; source: string; published_at: Date | null;
  relevance: string | null; service: string | null; buyer_problem: string | null; angle: string | null; sub: string | null;
  deep: { facts?: string[]; implication?: string; persona?: string | null; industries?: string[]; questions?: string[]; full_text?: boolean } | null;
};

const fmt = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", month: "short", day: "numeric" }).format(d) : "—";
const UUID = /^[0-9a-f-]{36}$/;

export default async function SignalsPage({ searchParams }: { searchParams: Promise<{ status?: string; cat?: string; sub?: string }> }) {
  const q = await searchParams;
  const status = TABS.some((t) => t.key === q.status) ? q.status! : "analyzed";
  const unsorted = q.cat === "none";
  const catId = q.cat && UUID.test(q.cat) ? q.cat : null;
  const subId = q.sub && UUID.test(q.sub) ? q.sub : null;

  const filter = subId
    ? sql`and s.subcategory_id = ${subId}`
    : catId
      ? sql`and s.category_id = ${catId}`
      : unsorted
        ? sql`and s.category_id is null`
        : sql``;

  const [rows, counts, tree, tax, targeting] = await Promise.all([
    sql<Row[]>`
      select s.title, s.url, src.name as source, s.published_at, s.relevance::text,
             sv.name_ja as service, s.buyer_problem, s.analysis->>'angle' as angle, s.deep,
             coalesce(nullif(sc.name_ja, ''), sc.name_en) as sub
      from signals s join sources src on src.id = s.source_id
      left join services sv on sv.id = s.service_id
      left join subcategories sc on sc.id = s.subcategory_id
      where s.status = ${status} ${filter}
      order by (s.deep is not null) desc, s.relevance desc nulls last, coalesce(s.published_at, s.fetched_at) desc
      limit 200`,
    sql<{ status: string; n: number }[]>`select status, count(*)::int as n from signals group by status`,
    sql<{ category_id: string | null; subcategory_id: string | null; n: number }[]>`
      select category_id, subcategory_id, count(*)::int as n from signals where status = ${status} group by 1, 2`,
    loadTaxonomy(),
    loadTargeting(),
  ]);
  const n = (k: string) => counts.find((c) => c.status === k)?.n ?? 0;
  const total = tree.reduce((a, t) => a + t.n, 0);
  const inCat = (id: string) => tree.filter((t) => t.category_id === id).reduce((a, t) => a + t.n, 0);
  const inSub = (id: string) => tree.filter((t) => t.subcategory_id === id).reduce((a, t) => a + t.n, 0);
  const none = tree.filter((t) => !t.category_id).reduce((a, t) => a + t.n, 0);
  const href = (p: { cat?: string; sub?: string }) =>
    `/signals?${new URLSearchParams({ ...(status !== "analyzed" ? { status } : {}), ...(p.cat ? { cat: p.cat } : {}), ...(p.sub ? { sub: p.sub } : {}) })}`;

  const selSub = tax.subcategories.find((x) => x.id === subId);
  const selCat = tax.categories.find((c) => c.id === (selSub?.category_id ?? catId));
  const selPersonas = (selSub?.persona_ids ?? []).map((id) => targeting.personas.find((p) => p.id === id)?.name).filter(Boolean);
  const heading = selSub ? selSub.name_en : selCat ? selCat.name_en : unsorted ? "Not in any category" : "All signals";

  const node = (active: boolean) =>
    `flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] ${active ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgba(16,24,40,0.06),0_0_0_1px_var(--color-line)]" : "text-muted hover:bg-subtle hover:text-ink"}`;

  return (
    <main className="page">
      <PageHeader
        eyebrow="Inputs"
        title="Signals"
        description={<>News from Japanese <Link href="/sources" className="font-medium text-accent hover:underline">sources</Link>, scored by Gemini and sorted into your <Link href="/categories" className="font-medium text-accent hover:underline">categories</Link>. The strongest are read in full.</>}
      />

      <nav aria-label="Signal status" className="seg self-start">
        {TABS.map((t) => (
          <Link key={t.key} href={`/signals?${new URLSearchParams({ status: t.key, ...(q.cat ? { cat: q.cat } : {}), ...(q.sub ? { sub: q.sub } : {}) })}`} aria-current={t.key === status ? "page" : undefined} className={t.key === status ? "seg-on" : "seg-item"}>
            {t.label} <span className="font-mono text-[12px] text-faint">{n(t.key)}</span>
          </Link>
        ))}
      </nav>

      <div className="grid items-start gap-5 md:grid-cols-[250px_minmax(0,1fr)]">
        <nav aria-label="Categories" className="flex flex-col gap-3 md:sticky md:top-6">
          <Link href={href({})} className={node(!catId && !subId && !unsorted)}>
            <span>All</span><span className="font-mono text-[12px]">{total}</span>
          </Link>
          {tax.categories.filter((c) => c.active).map((c) => (
            <div key={c.id} className="flex flex-col gap-0.5">
              <Link href={href({ cat: c.id })} className={node(catId === c.id && !subId)}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                  <span className="truncate">{c.name_en}</span>
                </span>
                <span className="font-mono text-[12px]">{inCat(c.id)}</span>
              </Link>
              {tax.subcategories.filter((x) => x.active && x.category_id === c.id).map((x) => (
                <Link key={x.id} href={href({ sub: x.id })} className={`${node(subId === x.id)} ml-4`}>
                  <span className="truncate">{x.name_en}</span>
                  <span className="font-mono text-[12px]">{inSub(x.id)}</span>
                </Link>
              ))}
            </div>
          ))}
          <Link href={href({ cat: "none" })} className={node(unsorted)}>
            <span>Not in any category</span><span className="font-mono text-[12px]">{none}</span>
          </Link>
          <Link href="/categories" className="px-2.5 text-[12.5px] font-medium text-accent hover:underline">Edit categories →</Link>
        </nav>

        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">
              {selCat && selSub && <span className="text-faint">{selCat.name_en} / </span>}
              {heading} <span className="font-mono text-[13px] font-normal text-faint">{rows.length}{rows.length === 200 ? "+" : ""}</span>
            </h2>
            {selPersonas.length > 0 && <p lang="ja" className="text-[12.5px] text-muted">Readers: {selPersonas.join("、")}</p>}
          </div>
          {selSub?.description && <p className="-mt-1 text-[13px] text-faint">{selSub.description}</p>}
          <ul className="card divide-y divide-line">
        {rows.map((r, i) => (
          <li key={i} className="px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-faint">
              <span>{r.source} · {fmt(r.published_at)}{r.sub && !subId && <> · <span className="font-medium text-muted">{r.sub}</span></>}</span>
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
        {!rows.length && <li className="px-5 py-6 text-sm text-faint">Nothing here yet.</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}
