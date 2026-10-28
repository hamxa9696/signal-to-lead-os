import Link from "next/link";
import { sql } from "@/lib/db";

/** Dashboard teaser: the top terms likely to trend in the next 7 days. */
export async function ForecastCard() {
  const rows = await sql<{ term: string; direction: string; last_7d: number; predicted: number; p_rise: string; driver: string | null }[]>`
    select term, direction, last_7d, predicted, p_rise::text, drivers->>0 as driver from trend_forecasts
    where window_start = (select max(window_start) from trend_forecasts) and direction in ('rising', 'emerging')
    order by p_rise desc limit 5`;
  return (
    <section aria-labelledby="fc" className="card px-[22px] py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="fc" className="text-base font-semibold">Likely to trend in the next 7 days</h2>
        <Link prefetch={false} href="/forecast" className="text-[12.5px] font-medium text-accent hover:underline">Full forecast & accuracy →</Link>
      </div>
      {rows.length ? (
        <ul className="mt-3 grid gap-2 md:grid-cols-5">
          {rows.map((r) => (
            <li key={r.term} className="rounded-lg border border-line bg-subtle/50 p-3">
              <p lang="ja" className="truncate text-[13.5px] font-semibold">{r.term}</p>
              <p translate="no" className="notranslate mt-0.5 font-mono text-[12px] text-muted">{r.last_7d} → <b className="text-ink">{r.predicted}</b> · {Math.round(Number(r.p_rise) * 100)}% up</p>
              <p className="mt-1 line-clamp-2 text-[11.5px] text-faint">{r.direction === "emerging" ? "✦ New · " : "▲ "}{r.driver}</p>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-[13px] text-muted">No rising terms in the current forecast. See the full forecast for steady and falling terms.</p>}
    </section>
  );
}
