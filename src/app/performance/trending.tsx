import Link from "next/link";
import { sql } from "@/lib/db";
import { keywordTrends, TREND_PERIODS, type TrendPeriod } from "@/lib/trends";

/** "3h ago" / "2d ago": how fresh the newest article for a keyword is. */
function ago(d: Date | null): { text: string; fresh: boolean } {
  if (!d) return { text: "—", fresh: false };
  const h = (Date.now() - new Date(d).getTime()) / 3_600_000;
  if (h < 1) return { text: "<1h ago", fresh: true };
  if (h < 48) return { text: `${Math.round(h)}h ago`, fresh: h < 24 };
  return { text: `${Math.round(h / 24)}d ago`, fresh: false };
}

/** Dashboard panel: which tracked keywords are pulling in signals now, and how that is changing. */
export async function TrendingKeywords({ period, cat, baseQs }: { period: TrendPeriod; cat?: string; baseQs: Record<string, string> }) {
  const label = TREND_PERIODS.find((p) => p.key === period)!.label;
  const [rows, cats] = await Promise.all([
    keywordTrends(16, period, cat || undefined),
    sql<{ slug: string; name_en: string; color: string }[]>`select slug, name_en, color from categories where active order by sort, name_en`,
  ]);
  const max = Math.max(1, ...rows.map((r) => r.now));
  const rising = rows.filter((r) => r.now > r.prev).length;
  const tab = (slug?: string, p: TrendPeriod = period) =>
    `/performance?${new URLSearchParams({ ...baseQs, ...(slug ? { kw: slug } : {}), ...(p !== "7d" ? { kwp: p } : {}) })}#kw`;
  const noise = rows.filter((r) => r.now >= 5 && r.relevant / r.now < 0.3);

  return (
    <section aria-labelledby="kw" id="kw" className="card scroll-mt-6">
      <div className="flex flex-col gap-3 px-[22px] pt-5 pb-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Trending keywords in Japan</h2>
            <p className="mt-0.5 text-[12.5px] text-faint">
              Japanese articles each keyword picked up in the last {label} vs the {label} before · {rising} rising. &ldquo;Latest&rdquo; = how long ago its newest article
              appeared. Sources: Google News Japan, Hatena, PR TIMES, FSA and your <Link prefetch={false} href="/categories" className="font-medium text-accent hover:underline">sub-category</Link> keywords.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Trend period" className="seg">
          {TREND_PERIODS.map((p) => (
            <Link key={p.key} prefetch={false} href={tab(cat, p.key)} aria-current={period === p.key ? "page" : undefined} className={period === p.key ? "seg-on" : "seg-item"}>
              {p.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Keyword category" className="seg">
          <Link prefetch={false} href={tab()} className={!cat ? "seg-on" : "seg-item"}>All</Link>
          {cats.map((c) => (
            <Link key={c.slug} prefetch={false} href={tab(c.slug)} className={cat === c.slug ? "seg-on" : "seg-item"}>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: c.color }} />
              {c.name_en}
            </Link>
          ))}
        </nav>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-good-dot" /> <b className="font-semibold text-ink">Relevant</b> — Gemini judged it useful for your personas</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent" /> <b className="font-semibold text-ink">Other</b> — collected, but not relevant or not analysed yet</span>
          <span className="text-faint">Mostly green = the keyword finds useful news · mostly blue = mostly noise</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-line px-[22px] py-5 text-sm text-muted">
          No articles for these keywords in this period yet. New searches fill in after the next morning collection (06:00 JST).
        </p>
      ) : (
        <>
        <div translate="no" className="eyebrow hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_64px_72px_64px] gap-x-4 border-t border-line bg-[#FAFAFB] px-[22px] py-2 text-[10.5px] sm:grid">
          <span>Keyword</span><span>Relevant / other</span><span className="text-right">Articles</span><span className="text-right">Latest</span><span className="text-right">vs before</span>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((r) => {
            const delta = r.now - r.prev;
            const other = r.now - r.relevant;
            const share = r.now ? Math.round((100 * r.relevant) / r.now) : 0;
            const href = r.kind === "search"
              ? `/signals?${new URLSearchParams({ source: `Google News: ${r.keyword}` })}`
              : `/signals?${new URLSearchParams({ q: r.keyword })}`;
            return (
              <li key={`${r.kind}-${r.keyword}`} className="group relative">
                <Link prefetch={false} href={href} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-[22px] py-2.5 hover:bg-subtle sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_64px_72px_64px]">
                  <span className="min-w-0">
                    <span lang="ja" className="block truncate text-sm font-medium">{r.keyword}</span>
                    <span className="flex items-center gap-1.5 truncate text-[11.5px] text-faint">
                      {r.color && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: r.color }} />}
                      {r.kind === "search" ? `Google News search${r.category ? ` · ${r.category}` : ""}` : `${r.niche}`}
                    </span>
                  </span>
                  <span className="order-last col-span-2 flex h-2.5 overflow-hidden rounded-full bg-subtle sm:order-none sm:col-span-1" aria-label={`${r.relevant} relevant, ${other} other`}>
                    <span className="h-full bg-good-dot" style={{ width: `${(r.relevant / max) * 100}%` }} />
                    <span className="h-full bg-accent" style={{ width: `${(other / max) * 100}%` }} />
                  </span>
                  <span translate="no" className="notranslate text-right font-mono text-sm font-semibold tabular-nums">{r.now}</span>
                  <span translate="no" className={`notranslate hidden text-right font-mono text-[12px] tabular-nums sm:block ${ago(r.latest).fresh ? "font-semibold text-good" : "text-faint"}`}>
                    {ago(r.latest).text}
                  </span>
                  <span translate="no" className={`notranslate hidden text-right font-mono text-[12.5px] tabular-nums sm:block ${r.prev === 0 && r.now > 0 ? "text-accent" : delta > 0 ? "text-good" : delta < 0 ? "text-bad" : "text-faint"}`}>
                    {r.prev === 0 && r.now > 0 ? "new" : delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${-delta}` : "–"}
                  </span>
                </Link>
                {/* Hover card: what the bar means for this keyword. */}
                <div role="tooltip" className="pointer-events-none absolute top-full right-[22px] z-20 hidden w-[300px] rounded-lg bg-ink px-3.5 py-3 text-[12.5px] leading-relaxed text-white shadow-lg group-hover:block">
                  <p className="font-semibold" lang="ja">{r.keyword}</p>
                  <p className="mt-1">
                    <b>{r.now}</b> article{r.now === 1 ? "" : "s"} in the last {label} ({r.prev} in the {label} before). Newest: {ago(r.latest).text}.
                  </p>
                  <p className="mt-1 flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-good-dot" /> {r.relevant} relevant ({share}%): useful hooks for your personas</p>
                  <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent" /> {other} other: off-topic for you, or still waiting for Gemini</p>
                  <p className="mt-1.5 text-white/70">
                    {r.now === 0 ? "Quiet this period." : share >= 70 ? "Mostly green: a high-quality keyword, keep it." : share >= 30 ? "Mixed: some useful news, some noise." : "Mostly blue: mostly noise; consider a more specific phrase."}
                    {" "}Click to see the articles.
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        </>
      )}
      {noise.length > 0 && (
        <p className="border-t border-line px-[22px] py-3 text-[12.5px] text-muted">
          Mostly noise: <span lang="ja">{noise.map((r) => r.keyword).join("、")}</span>. A more specific phrase on <Link prefetch={false} href="/sources" className="font-medium text-accent hover:underline">Sources</Link> would find better articles.
        </p>
      )}
    </section>
  );
}
