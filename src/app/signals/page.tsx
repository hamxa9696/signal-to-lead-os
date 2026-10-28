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
  source_kind: string | null; source_url: string | null; summary: string | null; body: string | null; status: string;
  why: string | null; sort_why: string | null; sort_by: string | null; subcategory_id: string | null; category_id: string | null;
  analyzed_at: Date | null; persona_from_deep: string | null;
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
             coalesce(nullif(sc.name_ja, ''), sc.name_en) as sub,
             src.category as source_kind, src.url as source_url, s.summary, left(s.body, 6000) as body, s.status,
             s.analysis->>'why' as why, s.analysis->>'sort_why' as sort_why, s.analysis->>'sort_by' as sort_by,
             s.subcategory_id, s.category_id, s.analyzed_at, s.deep->>'persona' as persona_from_deep
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
          <Link prefetch={false} key={t.key} href={`/signals?${new URLSearchParams({ status: t.key, ...(q.cat ? { cat: q.cat } : {}), ...(q.sub ? { sub: q.sub } : {}) })}`} aria-current={t.key === status ? "page" : undefined} className={t.key === status ? "seg-on" : "seg-item"}>
            {t.label} <span className="font-mono text-[12px] text-faint">{n(t.key)}</span>
          </Link>
        ))}
      </nav>

      <div className="grid items-start gap-5 md:grid-cols-[250px_minmax(0,1fr)]">
        <nav aria-label="Categories" className="flex flex-col gap-3 md:sticky md:top-6">
          <Link prefetch={false} href={href({})} className={node(!catId && !subId && !unsorted)}>
            <span>All</span><span className="font-mono text-[12px]">{total}</span>
          </Link>
          {tax.categories.filter((c) => c.active).map((c) => (
            <div key={c.id} className="flex flex-col gap-0.5">
              <Link prefetch={false} href={href({ cat: c.id })} className={node(catId === c.id && !subId)}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                  <span className="truncate">{c.name_en}</span>
                </span>
                <span className="font-mono text-[12px]">{inCat(c.id)}</span>
              </Link>
              {tax.subcategories.filter((x) => x.active && x.category_id === c.id).map((x) => (
                <Link prefetch={false} key={x.id} href={href({ sub: x.id })} className={`${node(subId === x.id)} ml-4`}>
                  <span className="truncate">{x.name_en}</span>
                  <span className="font-mono text-[12px]">{inSub(x.id)}</span>
                </Link>
              ))}
            </div>
          ))}
          <Link prefetch={false} href={href({ cat: "none" })} className={node(unsorted)}>
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
            <WhyPanel r={r} tax={tax} personas={targeting.personas} />
          </li>
        ))}
        {!rows.length && <li className="px-5 py-6 text-sm text-faint">Nothing here yet.</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}

const SOURCE_KIND: Record<string, string> = {
  industry_news: "Japanese news site (RSS)",
  developer_news: "Japanese developer news (RSS)",
  keyword_search: "Google News search",
  custom: "Feed you added",
};

function scoreLabel(r: number): { label: string; cls: string } {
  if (r >= 0.8) return { label: "Strong match", cls: "bg-good-soft text-good" };
  if (r >= 0.6) return { label: "Good match", cls: "bg-accent-soft text-accent-ink" };
  if (r >= 0.35) return { label: "Possible match", cls: "bg-subtle text-muted" };
  return { label: "Not relevant", cls: "bg-subtle text-faint" };
}

/** Everything the signal's place on this page is based on, in plain words. */
function WhyPanel({ r, tax, personas }: {
  r: Row;
  tax: Awaited<ReturnType<typeof loadTaxonomy>>;
  personas: { id: string; name: string }[];
}) {
  const sub = tax.subcategories.find((x) => x.id === r.subcategory_id);
  const cat = tax.categories.find((c) => c.id === (sub?.category_id ?? r.category_id));
  const text = `${r.title}\n${r.summary ?? ""}\n${r.body ?? ""}`.toLowerCase();
  const matched = (sub?.keywords ?? []).filter((k) => k.split(/\s+/).every((w) => text.includes(w.toLowerCase())));
  const readers = [...new Set([r.persona_from_deep, ...(sub?.persona_ids ?? []).map((id) => personas.find((p) => p.id === id)?.name)].filter(Boolean))];
  const query = r.source_kind === "keyword_search" ? r.source.replace(/^Google News:\s*/, "") : null;
  const rel = r.relevance != null ? Number(r.relevance) : null;
  const score = rel != null ? scoreLabel(rel) : null;
  const row = "grid gap-0.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3";
  const key = "text-[11.5px] font-semibold uppercase tracking-wide text-faint sm:pt-0.5";

  return (
    <details className="group mt-2">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline">
        <span className="transition group-open:rotate-90">›</span> Why this signal
      </summary>
      <div className="mt-2 flex flex-col gap-2.5 rounded-lg border border-line bg-subtle/60 px-4 py-3 text-[13px]">
        <div className={row}>
          <span className={key}>Found by</span>
          <span>
            {r.source}
            <span className="text-faint"> · {SOURCE_KIND[r.source_kind ?? ""] ?? "Feed"}</span>
            {query && <> searching for <span lang="ja" className="font-medium">「{query}」</span></>}
            {r.published_at && <span className="text-faint"> · published {fmt(r.published_at)}</span>}
          </span>
        </div>
        <div className={row}>
          <span className={key}>Relevance</span>
          <span>
            {score && rel != null ? (
              <>
                <span className={`mr-2 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${score.cls}`}>{score.label} · {rel.toFixed(2)}</span>
                {r.why || <span className="text-faint">Scored by Gemini against your personas, industries and services (reason recorded from the next run).</span>}
              </>
            ) : (
              <span className="text-faint">Not scored yet: waiting for the next Gemini run.</span>
            )}
          </span>
        </div>
        <div className={row}>
          <span className={key}>Sorted into</span>
          <span>
            {cat ? (
              <>
                <span className="font-medium">{cat.name_en}{sub && <> › {sub.name_en}</>}</span>
                {r.sort_by === "service" && <span className="text-faint"> (from its matching service)</span>}
                {r.sort_why && <span className="text-muted"> — {r.sort_why}</span>}
              </>
            ) : (
              <span className="text-faint">No category fits{r.sort_why ? ` — ${r.sort_why}` : ""}</span>
            )}
          </span>
        </div>
        {sub && (
          <div className={row}>
            <span className={key}>Keywords found</span>
            <span lang="ja">
              {matched.length ? (
                <span className="flex flex-wrap gap-1">{matched.map((k) => <span key={k} className="rounded bg-surface px-1.5 py-0.5 text-[12px] ring-1 ring-line">{k}</span>)}</span>
              ) : (
                <span className="text-faint" lang="en">None of this niche&apos;s keywords appear word-for-word; Gemini placed it by meaning.</span>
              )}
            </span>
          </div>
        )}
        {(r.service || readers.length > 0) && (
          <div className={row}>
            <span className={key}>Matches</span>
            <span lang="ja">
              {r.service && <>Service: {r.service}</>}
              {r.service && readers.length > 0 && " · "}
              {readers.length > 0 && <>Readers: {readers.join("、")}</>}
            </span>
          </div>
        )}
        {r.deep && (
          <div className={row}>
            <span className={key}>Evidence</span>
            <span>{r.deep.full_text ? "Full article read; the facts above are taken from it." : "Article is paywalled or not readable; analysed from its summary."}</span>
          </div>
        )}
      </div>
    </details>
  );
}
