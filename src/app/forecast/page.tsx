import Link from "next/link";
import { sql } from "@/lib/db";
import { forecastAccuracy } from "@/lib/forecast";
import { PageHeader } from "../page-header";
import { RunButton } from "../run-button";
import { HoverCard } from "../hover-card";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type F = {
  term: string; term_kind: string; cat: string | null; color: string | null; last_7d: number; prev_7d: number; predicted: number; low: number; high: number;
  p_rise: string; direction: "emerging" | "rising" | "steady" | "falling"; confidence: "low" | "medium" | "high"; drivers: string[]; series: number[] | null;
  action: string | null; actual: number | null; hit: boolean | null; window_start: string; window_end: string; made_at: Date;
};

const DIR = {
  emerging: { label: "Emerging", color: "#8A5A7A", icon: "✦" },
  rising: { label: "Rising", color: "#2F7D5B", icon: "▲" },
  steady: { label: "Steady", color: "#7A847E", icon: "■" },
  falling: { label: "Falling", color: "#B4432F", icon: "▼" },
} as const;
const KIND: Record<string, string> = { search: "News search", niche_keyword: "Niche keyword", niche: "Niche", type: "Story type", emerging: "New term" };
const ACTION: Record<string, string> = { fast_take: "Fast take now", evergreen: "Evergreen article", watch: "Watch" };
const day = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

function Spark({ s, predicted }: { s: number[]; predicted: number }) {
  const last14 = s.slice(-14);
  const perDay = predicted / 7;
  const max = Math.max(1, ...last14, perDay);
  const w = 6, gap = 2, h = 26;
  return (
    <svg width={(w + gap) * 21} height={h} aria-hidden="true" className="block">
      {last14.map((v, i) => <rect key={i} x={i * (w + gap)} y={h - (v / max) * h} width={w} height={Math.max(1, (v / max) * h)} rx="1" fill="#A29A88" />)}
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={`f${i}`} x={(14 + i) * (w + gap)} y={h - (perDay / max) * h} width={w} height={Math.max(1, (perDay / max) * h)} rx="1" fill="#2F6B55" fillOpacity="0.35" stroke="#2F6B55" strokeDasharray="2 1" strokeWidth="0.6" />
      ))}
    </svg>
  );
}

export default async function ForecastPage({ searchParams }: { searchParams: Promise<{ dir?: string; cat?: string }> }) {
  const q = await searchParams;
  const [{ latest }] = await sql<{ latest: string | null }[]>`select max(window_start)::text as latest from trend_forecasts`;
  const [rows, past, accuracy, cats] = await Promise.all([
    latest
      ? sql<F[]>`
          select f.term, f.term_kind, c.name_en as cat, c.color, f.last_7d, f.prev_7d, f.predicted, f.low, f.high, f.p_rise::text, f.direction,
                 f.confidence, f.drivers, f.series, f.action, f.actual, f.hit, f.window_start::text, f.window_end::text, f.made_at
          from trend_forecasts f left join categories c on c.id = f.category_id
          where f.window_start = ${latest}
          order by case f.direction when 'emerging' then 0 when 'rising' then 1 when 'steady' then 2 else 3 end, f.p_rise desc, f.predicted desc`
      : Promise.resolve([] as F[]),
    sql<F[]>`
      select f.term, f.term_kind, null as cat, null as color, f.last_7d, f.prev_7d, f.predicted, f.low, f.high, f.p_rise::text, f.direction,
             f.confidence, f.drivers, null as series, f.action, f.actual, f.hit, f.window_start::text, f.window_end::text, f.made_at
      from trend_forecasts f
      where f.actual is not null and f.window_start = (select max(window_start) from trend_forecasts where actual is not null)
      order by f.direction in ('rising', 'emerging') desc, f.p_rise desc limit 20`,
    forecastAccuracy(),
    sql<{ name_en: string; color: string }[]>`select name_en, color from categories where active order by sort`,
  ]);
  const dir = ["rising", "steady", "falling", "all"].includes(q.dir ?? "") ? q.dir! : "rising";
  const shown = rows.filter((r) => (dir === "all" ? true : dir === "rising" ? r.direction === "rising" || r.direction === "emerging" : r.direction === dir))
    .filter((r) => !q.cat || r.cat === q.cat);
  const href = (p: { dir?: string; cat?: string | null }) =>
    `/forecast?${new URLSearchParams({ ...((p.dir ?? dir) !== "rising" ? { dir: p.dir ?? dir } : {}), ...((p.cat === undefined ? q.cat : p.cat) ? { cat: (p.cat === undefined ? q.cat : p.cat)! } : {}) })}`;
  const count = (d: string) => rows.filter((r) => (d === "rising" ? r.direction === "rising" || r.direction === "emerging" : d === "all" || r.direction === d)).length;
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <main className="page">
      <PageHeader
        eyebrow={latest ? `Next 7 days · ${day(latest)} – ${day(rows[0]?.window_end ?? latest)} · made ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }).format(rows[0]?.made_at ?? new Date())} JST` : "No forecast yet"}
        title="Trend forecast"
        description="What is likely to get more Japanese coverage in the next 7 days, from your signals: each term's share of relevant news, its speed, early-warning sources (officials, press releases, Hatena) and dated events. Every forecast is checked against real signals when the week ends."
        actions={<RunButton job="forecast" label="Refresh forecast" force />}
      />

      <section className="card grid gap-4 p-5 md:grid-cols-[1.1fr_2fr]">
        <div>
          <h2 className="text-base font-semibold">How accurate is it?</h2>
          {accuracy ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[
                { l: "Right direction", v: pct(accuracy.hitRate), n: "rising / steady / falling called correctly" },
                { l: "Rising calls right", v: accuracy.risingPrecision == null ? "—" : pct(accuracy.risingPrecision), n: "of terms we said would rise" },
                { l: "Inside the range", v: pct(accuracy.inRange), n: "actual count within low–high" },
                { l: "Average miss", v: `±${accuracy.mae}`, n: "articles per term" },
              ].map((x) => (
                <div key={x.l} className="rounded-lg bg-subtle p-3">
                  <p className="text-[11.5px] text-faint">{x.l}</p>
                  <p translate="no" className="notranslate font-mono text-[22px] text-ink">{x.v}</p>
                  <p className="text-[11px] text-faint">{x.n}</p>
                </div>
              ))}
              <p className="col-span-2 text-[11.5px] text-faint">{accuracy.forecasts} forecasts over {accuracy.windows} week{accuracy.windows === 1 ? "" : "s"}, checked against your signals.</p>
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-muted">
              Not measured yet. The first check runs automatically after {latest ? day(rows[0]?.window_end ?? latest) : "the first forecast week"}: Kizashi counts the real articles for every term and compares them with this forecast.
            </p>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Last checked week: forecast vs actual</h2>
          {past.length ? (
            <table className="mt-2 w-full text-[12.5px]">
              <thead className="text-left text-[11px] text-faint"><tr><th className="py-1 font-medium">Term</th><th className="font-medium">Called</th><th className="text-right font-medium">Before</th><th className="text-right font-medium">Forecast</th><th className="text-right font-medium">Actual</th><th className="text-right font-medium">Result</th></tr></thead>
              <tbody className="divide-y divide-line">
                {past.map((r) => (
                  <tr key={r.term}>
                    <td lang="ja" className="py-1.5">{r.term}</td>
                    <td style={{ color: DIR[r.direction].color }}>{DIR[r.direction].icon} {DIR[r.direction].label}</td>
                    <td translate="no" className="text-right font-mono">{r.last_7d}</td>
                    <td translate="no" className="text-right font-mono">{r.predicted} <span className="text-faint">({r.low}–{r.high})</span></td>
                    <td translate="no" className="text-right font-mono font-semibold">{r.actual}</td>
                    <td className={`text-right font-semibold ${r.hit ? "text-good" : "text-bad"}`}>{r.hit ? "✓ right" : "✗ wrong"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="mt-2 text-[13px] text-muted">The comparison table appears here after the first forecast week ends.</p>}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Direction" className="seg">
          {[{ k: "rising", l: "Rising & emerging" }, { k: "steady", l: "Steady" }, { k: "falling", l: "Falling" }, { k: "all", l: "All" }].map((d) => (
            <Link key={d.k} prefetch={false} href={href({ dir: d.k })} className={dir === d.k ? "seg-on" : "seg-item"}>{d.l} <span className="font-mono text-[12px] text-faint">{count(d.k)}</span></Link>
          ))}
        </nav>
        <nav aria-label="Category" className="seg">
          <Link prefetch={false} href={href({ cat: null })} className={!q.cat ? "seg-on" : "seg-item"}>All</Link>
          {cats.map((c) => (
            <Link key={c.name_en} prefetch={false} href={href({ cat: c.name_en })} className={q.cat === c.name_en ? "seg-on" : "seg-item"}>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: c.color }} />{c.name_en}
            </Link>
          ))}
        </nav>
      </div>

      <section className="card overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="eyebrow grid grid-cols-[minmax(0,1.4fr)_180px_150px_96px_minmax(0,1.6fr)_120px] gap-4 border-b border-line bg-[#FAF6EE] px-5 py-2.5 text-[10.5px]">
            <span>Term</span><span>Last 14 days → next 7</span><span className="text-right">Articles: last 7 → next 7</span><span className="text-right">Chance up</span><span>Why</span><span>Suggested</span>
          </div>
          {shown.map((r) => {
            const p = Number(r.p_rise);
            return (
              <div key={r.term} className="grid grid-cols-[minmax(0,1.4fr)_180px_150px_96px_minmax(0,1.6fr)_120px] items-center gap-4 border-b border-line px-5 py-3 last:border-b-0">
                <div className="min-w-0">
                  <Link prefetch={false} href={`/signals?${new URLSearchParams(r.term_kind === "search" ? { source: `Google News: ${r.term}` } : { q: r.term })}`} lang="ja" className="block truncate text-[14px] font-semibold hover:underline">{r.term}</Link>
                  <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-faint">
                    <span className="font-semibold" style={{ color: DIR[r.direction].color }}>{DIR[r.direction].icon} {DIR[r.direction].label}</span>
                    <span>{KIND[r.term_kind]}</span>
                    {r.cat && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: r.color ?? "#A29A88" }} />{r.cat}</span>}
                    <span title="How much history and volume the forecast rests on">· {r.confidence} confidence</span>
                  </p>
                </div>
                <div>{r.series && <Spark s={r.series} predicted={r.predicted} />}</div>
                <p translate="no" className="notranslate text-right font-mono text-[13px]">
                  {r.last_7d} → <b className="text-ink">{r.predicted}</b>
                  <span className="block text-[11px] text-faint">range {r.low}–{r.high}</span>
                </p>
                <div className="text-right">
                  <span translate="no" className="notranslate font-mono text-[14px] font-semibold" style={{ color: p >= 0.6 ? "#2F7D5B" : p <= 0.4 ? "#B4432F" : "#56625C" }}>{Math.round(p * 100)}%</span>
                </div>
                <HoverCard label={`Why ${r.term}`} width={340} card={<><p className="font-semibold" lang="ja">{r.term}</p><ul className="mt-1 list-disc space-y-1 pl-4 text-white/85">{r.drivers.map((d) => <li key={d}>{d}</li>)}</ul></>}>
                  <p className="line-clamp-2 text-[12.5px] text-body">{r.drivers[0] ?? "Stable coverage."}{r.drivers.length > 1 && <span className="text-faint"> +{r.drivers.length - 1} more</span>}</p>
                </HoverCard>
                <span className={`justify-self-start rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${r.action === "fast_take" ? "bg-sprout-soft text-sprout" : r.action === "evergreen" ? "bg-accent-soft text-accent-ink" : "bg-subtle text-muted"}`}>
                  {ACTION[r.action ?? "watch"]}
                </span>
              </div>
            );
          })}
          {!shown.length && <p className="px-5 py-6 text-sm text-muted">{latest ? "Nothing in this view. Try “All”." : "No forecast yet. Click “Refresh forecast” or wait for Monday's run."}</p>}
        </div>
      </section>
      <p className="text-[11.5px] text-faint">
        Grey bars: real daily articles. Dashed green: forecast per day. &ldquo;Chance up&rdquo; = probability the next 7 days beat the last 7. Counts are relevant signals only. Confidence is low while there is little history.
      </p>
    </main>
  );
}
