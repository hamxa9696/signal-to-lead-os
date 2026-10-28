import Link from "next/link";
import { keywordTrends } from "@/lib/trends";

/** Dashboard panel: which tracked keywords are pulling in signals now, and how that is changing. */
export async function TrendingKeywords({ span, label }: { span?: { start: string; end: string; prevStart: string; prevEnd: string }; label?: string }) {
  const rows = await keywordTrends(16, span);
  const max = Math.max(1, ...rows.map((r) => r.now));
  const rising = rows.filter((r) => r.now > r.prev).length;
  return (
    <section aria-labelledby="kw" className="card overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 px-[22px] pt-5 pb-3">
        <div>
          <h2 id="kw" className="text-base font-semibold">Trending keywords</h2>
          <p className="mt-0.5 text-[12.5px] text-faint">
            Signals each tracked keyword picked up {label ? <>· {label} vs the same length before</> : "in the last 7 days vs the 7 before"} · {rising} rising. Keywords come from your{" "}
            <Link prefetch={false} href="/categories" className="font-medium text-accent hover:underline">sub-categories</Link> and{" "}
            <Link prefetch={false} href="/sources" className="font-medium text-accent hover:underline">Google News searches</Link>.
          </p>
        </div>
        <span className="flex items-center gap-3 text-[11.5px] text-faint">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-accent" /> Signals</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-good-dot" /> Relevant</span>
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-[22px] pb-5 text-sm text-muted">No keyword matches yet. Add keywords to your sub-categories or a Google News search on Sources.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((r) => {
            const delta = r.now - r.prev;
            const href = r.kind === "search"
              ? `/signals?${new URLSearchParams({ source: `Google News: ${r.keyword}` })}`
              : `/signals?${new URLSearchParams({ q: r.keyword })}`;
            return (
              <li key={`${r.kind}-${r.keyword}`}>
                <Link prefetch={false} href={href} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-[22px] py-2.5 hover:bg-subtle sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_64px_64px]">
                  <span className="min-w-0">
                    <span lang="ja" className="block truncate text-sm font-medium">{r.keyword}</span>
                    <span className="flex items-center gap-1.5 truncate text-[11.5px] text-faint">
                      {r.color && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: r.color }} />}
                      {r.kind === "search" ? "Google News search" : r.niche}
                    </span>
                  </span>
                  <span className="order-last col-span-2 flex h-2 overflow-hidden rounded-full bg-subtle sm:order-none sm:col-span-1" aria-hidden="true">
                    <span className="h-full bg-good-dot" style={{ width: `${(r.relevant / max) * 100}%` }} />
                    <span className="h-full bg-accent" style={{ width: `${((r.now - r.relevant) / max) * 100}%` }} />
                  </span>
                  <span className="text-right font-mono text-sm font-semibold tabular-nums" title={`${r.relevant} relevant`}>{r.now}</span>
                  <span className={`hidden text-right font-mono text-[12.5px] tabular-nums sm:block ${r.prev === 0 && r.now > 0 ? "text-accent" : delta > 0 ? "text-good" : delta < 0 ? "text-bad" : "text-faint"}`}>
                    {r.prev === 0 && r.now > 0 ? "new" : delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${-delta}` : "–"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
