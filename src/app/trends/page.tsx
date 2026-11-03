import Link from "next/link";
import { sql } from "@/lib/db";
import { themeStories, trendBoard, type Theme } from "@/lib/trend-board";
import { TREND_PERIODS, type TrendPeriod } from "@/lib/trends";
import { typeInfo } from "@/lib/signal-types";
import { PageHeader } from "../page-header";
import { HoverCard } from "../hover-card";
import { PendingButton } from "../pending-button";
import { addThemeToPlan } from "./actions";
import { topStories } from "@/lib/top-stories";
import { whyFor } from "@/lib/story-why";
import { TopStoriesSection } from "./top-stories";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LENS = { news: "#2F6B55", google: "#4E7A8C", ai: "#8A5A7A", next: "#A65A44" } as const;
const n = (v: number) => v.toLocaleString("en-US");
const arrow = (now: number, prev: number) => (prev === 0 ? (now > 0 ? "new" : "") : now > prev * 1.15 ? "▲" : now < prev * 0.85 ? "▼" : "=");
const DIR: Record<string, string> = { rising: "Rising", emerging: "Emerging", steady: "Steady", falling: "Falling" };
const COVER = { none: "text-bad", weak: "text-warn", good: "text-good" } as const;

export default async function TrendsOverview({ searchParams }: { searchParams: Promise<{ period?: string; cat?: string; sel?: string }> }) {
  const q = await searchParams;
  const period = (TREND_PERIODS.find((p) => p.key === q.period)?.key ?? "7d") as TrendPeriod;
  const cat = q.cat && /^[a-z0-9-]{1,40}$/.test(q.cat) ? q.cat : undefined;
  const topQ = topStories({ hours: 72, limit: 6 });
  const [{ themes, gscOn, geoWeek }, cats, top, whys, [{ n: savedCount }]] = await Promise.all([
    trendBoard(period, cat),
    sql<{ slug: string; name_en: string; color: string }[]>`select slug, name_en, color from categories where active order by sort`,
    topQ,
    topQ.then((t) => whyFor({ stories: t.map((x) => x.id) })),
    sql<{ n: number }[]>`select ((select count(*) from stories where saved_at is not null) + (select count(*) from signals where saved_at is not null and story_id is null))::int as n`,
  ]);
  const sel = themes.find((t) => t.keyword === q.sel) ?? themes[0];
  const stories = sel ? await themeStories(sel.keyword, period) : [];
  const periodLabel = TREND_PERIODS.find((p) => p.key === period)!.label;
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const v = { period: period !== "7d" ? period : undefined, cat, ...extra };
    for (const [k, x] of Object.entries(v)) if (x) p.set(k, x);
    const s = p.toString();
    return s ? `/trends?${s}` : "/trends";
  };

  return (
    <main className="page">
      <PageHeader
        eyebrow={`Trends · Japan · last ${periodLabel} vs the ${periodLabel} before`}
        title="What's trending, through 4 lenses"
        description="Top stories: the strongest news right now, in any field, ready to turn into content. Below, the themes you track, checked in the news, Google searches, what buyers ask AI assistants and next week's forecast, scored for opportunity."
        actions={
          <nav aria-label="Period" className="seg">
            {TREND_PERIODS.map((p) => (
              <Link key={p.key} prefetch={false} href={qs({ period: p.key === "7d" ? undefined : p.key, sel: q.sel })} aria-current={p.key === period ? "page" : undefined} className={p.key === period ? "seg-on" : "seg-item"}>
                {p.label}
              </Link>
            ))}
          </nav>
        }
      />

      <TopStoriesSection stories={top} whys={whys} savedCount={savedCount} />

      <h2 className="-mb-2 text-base font-semibold">Tracked themes</h2>
      <div className="flex flex-wrap items-center gap-1.5">
        <Link prefetch={false} href={qs({ cat: undefined })} className={`rounded-full border px-3 py-1 text-[12.5px] ${!cat ? "border-accent bg-accent-soft font-semibold text-accent-ink" : "border-line-strong text-muted hover:text-ink"}`}>All fields</Link>
        {cats.map((c) => (
          <Link key={c.slug} prefetch={false} href={qs({ cat: c.slug })} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] ${cat === c.slug ? "border-accent bg-accent-soft font-semibold text-accent-ink" : "border-line-strong text-muted hover:text-ink"}`}>
            <span className="h-2 w-2 rounded-sm" style={{ background: c.color }} />{c.name_en}
          </Link>
        ))}
        <span className="ml-auto flex flex-wrap gap-3 text-[11.5px] text-muted">
          {([["News", LENS.news], ["Google search", LENS.google], ["AI assistants", LENS.ai], ["Next week", LENS.next]] as const).map(([l, c]) => (
            <span key={l} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: c }} />{l}</span>
          ))}
        </span>
      </div>

      {!themes.length ? (
        <div className="card p-6 text-sm text-muted">No tracked keywords had news in this period. Try a longer period, or add keywords on <Link href="/categories" className="underline">Categories</Link>.</div>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <section aria-label="Trend board" className="card min-w-0 flex-[999_1_600px] overflow-x-auto">
            <div className="min-w-[780px]">
              <div className="eyebrow grid grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_minmax(0,1.1fr)_56px] gap-3 border-b border-line bg-[#FAF6EE] px-4 py-2.5 text-[10.5px]">
                <span>Theme</span><span>News</span><span>Google</span><span>AI assistants</span><span>Next week</span><span>Our coverage</span><span className="text-right">Score</span>
              </div>
              {themes.map((t) => {
                const on = sel?.keyword === t.keyword;
                return (
                  <Link key={t.keyword} prefetch={false} scroll={false} href={qs({ sel: t.keyword })} aria-current={on ? "true" : undefined}
                    className={`grid grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_minmax(0,1.1fr)_56px] items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 ${on ? "bg-accent-soft/60" : "hover:bg-subtle/60"}`}>
                    <span className="min-w-0">
                      <span lang="ja" className="block truncate text-[13.5px] font-semibold">{t.keyword}</span>
                      <span className="flex items-center gap-1.5 text-[11.5px] text-faint">
                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: t.color ?? "#A29A88" }} />
                        <span className="truncate">{t.niche ?? t.category ?? "News search"}</span>
                        {t.planned && <span className="shrink-0 rounded bg-good-soft px-1 text-good">planned</span>}
                      </span>
                    </span>
                    <Cell color={LENS.news} v={n(t.news.relevant)} sub={`articles ${arrow(t.news.now, t.news.prev)}`} />
                    {t.google
                      ? <Cell color={LENS.google} v={t.google.now ? n(t.google.now) : "0"} sub={t.google.now ? `impressions ${arrow(t.google.now, t.google.prev)}` : "no searches yet"} />
                      : <Cell color={LENS.google} v="—" sub="Search Console off" />}
                    <Cell color={LENS.ai} v={t.ai.questions.length ? `${t.ai.questions.length} Q` : "—"} sub={!t.ai.questions.length ? "none tracked" : !t.ai.checked ? "not checked yet" : t.ai.cited ? `cited in ${t.ai.cited}` : "we're not cited"} />
                    <Cell color={LENS.next} v={t.forecast ? DIR[t.forecast.direction] : "—"} sub={t.forecast ? `${Math.round(t.forecast.pRise * 100)}% chance up` : "no forecast"} plain />
                    <span className={`text-[12px] font-semibold ${COVER[t.coverage.kind]}`}>{t.coverage.label}</span>
                    <span translate="no" className="notranslate text-right font-mono text-[18px] font-semibold">{t.score}</span>
                  </Link>
                );
              })}
            </div>
          </section>

          {sel && <Detail t={sel} stories={stories} period={period} gscOn={gscOn} geoWeek={geoWeek} />}
        </div>
      )}

      <p className="text-[12px] text-faint">
        Score (0–100) = news (up to 30: relevant articles and growth) + Google (up to 25: Search Console impressions and growth) + AI (up to 25: buyer questions, more when AI cites others) + gap &amp; fit (up to 20: no or weak page of ours, a focus service, a rising forecast).
        Details for each lens: <Link href="/trends/signals" className="underline">Signals</Link> · <Link href="/trends/ai-search" className="underline">AI search</Link> · <Link href="/trends/forecast" className="underline">Forecast</Link>.
      </p>
    </main>
  );
}

function Cell({ color, v, sub, plain }: { color: string; v: string; sub: string; plain?: boolean }) {
  return (
    <span className="min-w-0">
      <span translate="no" className={`notranslate block font-semibold ${plain ? "text-[13px]" : "font-mono text-[14px]"}`} style={{ color }}>{v}</span>
      <span className="block truncate text-[11px] text-faint">{sub}</span>
    </span>
  );
}

function Detail({ t, stories, period, gscOn, geoWeek }: {
  t: Theme; stories: Awaited<ReturnType<typeof themeStories>>; period: TrendPeriod; gscOn: boolean; geoWeek: string | null;
}) {
  const parts = [
    { k: "News", v: t.parts.news, max: 30, c: LENS.news, tip: `${t.news.relevant} relevant articles; ${t.news.now} now vs ${t.news.prev} the period before.` },
    { k: "Google", v: t.parts.google, max: 25, c: LENS.google, tip: t.google ? `${t.google.now} impressions now vs ${t.google.prev} before.` : "Search Console not connected." },
    { k: "AI", v: t.parts.ai, max: 25, c: LENS.ai, tip: `${t.ai.questions.length} tracked buyer questions; we are cited in ${t.ai.cited}.` },
    { k: "Gap & fit", v: t.parts.gap, max: 20, c: "#C8735A", tip: `Our coverage: ${t.coverage.label}. Focus services and a rising forecast add points.` },
  ];
  return (
    <aside aria-label="Theme detail" className="card flex min-w-0 flex-[1_1_340px] flex-col gap-4 p-5">
      <div>
        <p className="text-[11.5px] text-faint">{t.category ?? "News search"}{t.niche ? ` · ${t.niche}` : ""}</p>
        <div className="flex items-baseline gap-3">
          <h2 lang="ja" className="font-[family-name:var(--font-mincho)] text-[21px] font-bold leading-snug">{t.keyword}</h2>
          <span translate="no" className="notranslate ml-auto font-mono text-[26px] font-semibold">{t.score}</span>
        </div>
        <div className="mt-2.5 flex h-2 overflow-hidden rounded bg-subtle">
          {parts.map((p) => <span key={p.k} style={{ width: `${p.v}%`, background: p.c }} />)}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted">
          {parts.map((p) => (
            <li key={p.k}>
              <HoverCard label={`${p.k} ${p.v} of ${p.max}`} width={260} card={<p>{p.tip}</p>}>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: p.c }} />{p.k} <b className="font-mono text-ink">{p.v}</b>/{p.max}</span>
              </HoverCard>
            </li>
          ))}
        </ul>
      </div>

      <Block title="In the news" color={LENS.news} more={{ href: `/trends/signals?q=${encodeURIComponent(t.keyword)}`, label: "All signals" }}>
        {stories.length ? stories.slice(0, 4).map((s) => (
          <li key={s.signalId} className="text-[12.5px]">
            {s.url ? <a lang="ja" href={s.url} target="_blank" rel="noreferrer" className="hover:underline">{s.title}</a> : <span lang="ja">{s.title}</span>}
            <span className="text-faint"> · {s.outlets ? `${s.outlets} outlet${s.outlets === 1 ? "" : "s"}` : "1 outlet"}{s.type ? ` · ${typeInfo(s.type)?.label ?? s.type}` : ""}{s.strength != null ? ` · strength ${s.strength}` : ""}</span>
          </li>
        )) : <li className="text-[12.5px] text-faint">No relevant stories in this period.</li>}
      </Block>

      <Block title="What people Google" color={LENS.google}>
        {!gscOn ? <li className="text-[12.5px] text-faint">Search Console isn&apos;t connected yet.</li>
          : t.google?.queries.length ? t.google.queries.map((g) => (
            <li key={g.query} className="flex justify-between gap-3 text-[12.5px]"><span lang="ja">{g.query}</span><span translate="no" className="font-mono text-faint">{n(g.impressions)} imp.</span></li>
          )) : <li className="text-[12.5px] text-faint">No searches that reach our site yet{t.google?.position ? "" : ""}. Google demand shows once we appear for these words.</li>}
        {t.google?.position != null && <li className="text-[12px] text-muted">Our average position: #{t.google.position}</li>}
      </Block>

      <Block title="What buyers ask AI" color={LENS.ai} more={{ href: "/trends/ai-search", label: "All questions" }}>
        {t.ai.questions.length ? t.ai.questions.slice(0, 3).map((a) => (
          <li key={a.id} className="text-[12.5px]">
            <p lang="ja">{a.question}</p>
            <p className="text-[11.5px] text-faint">
              {!a.checked ? "Not checked yet" : a.cited ? "Renesis is cited" : "Renesis not cited"}
              {a.domains.length ? ` · AI cites ${a.domains.join(", ")}` : ""}
            </p>
          </li>
        )) : <li className="text-[12.5px] text-faint">No tracked question mentions this theme{geoWeek ? ` (week of ${geoWeek})` : ""}.</li>}
      </Block>

      <p className="text-[12.5px]">
        <span className="text-[11px] font-bold tracking-wide" style={{ color: LENS.next }}>NEXT WEEK </span>
        {t.forecast ? <>{DIR[t.forecast.direction]} · {Math.round(t.forecast.pRise * 100)}% chance of more coverage ({t.forecast.low}–{t.forecast.high} articles). <Link href="/trends/forecast" className="underline">Forecast</Link></> : "No forecast for this theme."}
      </p>

      <div className="rounded-xl bg-accent-soft/70 p-4">
        <p className="text-[11px] font-bold tracking-[0.1em] text-accent">RECOMMENDED CONTENT</p>
        <p className="mt-1 text-[14px] font-bold">{t.rec.label}</p>
        <p className="mt-1 text-[12.5px] text-muted">{t.rec.why}</p>
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
          <dt className="font-semibold">Rank on Google for</dt><dd lang="ja">{t.rec.seoKeyword}</dd>
          <dt className="font-semibold">Answer for AI</dt><dd lang="ja">{t.rec.aiQuestion ?? "—"}</dd>
          {t.rec.targetPath && <><dt className="font-semibold">Page to rewrite</dt><dd className="truncate"><a href={`https://renesistech.jp${t.rec.targetPath}`} target="_blank" rel="noreferrer" className="underline">{t.rec.targetPath}</a></dd></>}
        </dl>
        <p className="mt-2 text-[11.5px] text-faint">Channels (LinkedIn, X, note, newsletter) are planned when you add it.</p>
        {t.planned ? (
          <Link href={`/topics/${t.planned.id}`} prefetch={false} className="btn-primary mt-3 w-full justify-center">Already planned · open in Plan →</Link>
        ) : (
          <form action={addThemeToPlan} className="mt-3">
            <input type="hidden" name="keyword" value={t.keyword} />
            <input type="hidden" name="period" value={period} />
            <PendingButton className="btn-primary w-full" pendingText="Adding to Plan…">Add to this week&apos;s plan</PendingButton>
          </form>
        )}
      </div>
    </aside>
  );
}

function Block({ title, color, more, children }: { title: string; color: string; more?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11.5px] font-bold tracking-[0.06em]" style={{ color }}>{title.toUpperCase()}</h3>
        {more && <Link href={more.href} prefetch={false} className="text-[11.5px] text-accent hover:underline">{more.label} →</Link>}
      </div>
      <ul className="mt-1.5 flex flex-col gap-1.5">{children}</ul>
    </section>
  );
}
