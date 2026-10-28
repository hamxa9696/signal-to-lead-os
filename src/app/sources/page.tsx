import { sql } from "@/lib/db";
import { PendingButton } from "../pending-button";
import { loadTargeting } from "@/lib/targeting";
import { deleteSource, toggleSource } from "./actions";
import { AddKeyword, AddRss } from "./forms";

export const dynamic = "force-dynamic";

type Row = {
  id: string; kind: string; name: string; url: string | null; category: string | null; active: boolean;
  last_fetched_at: Date | null; last_error: string | null;
  collected: number; relevant: number; deep: number; used: number;
};

const CATEGORY: Record<string, string> = {
  industry_news: "News site",
  developer_news: "News site",
  keyword_search: "Google News search",
  custom: "Added feed",
  own_site: "Own website",
  search_demand: "Search demand",
};

const ago = (d: Date | null) => {
  if (!d) return "never";
  const h = Math.round((Date.now() - d.getTime()) / 3_600_000);
  return h < 1 ? "just now" : h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

export default async function SourcesPage() {
  const [rows, targeting] = await Promise.all([
    sql<Row[]>`
      select src.id, src.kind, src.name, src.url, src.category, src.active, src.last_fetched_at, src.last_error,
             count(s.id) filter (where s.fetched_at > now() - interval '30 days')::int as collected,
             count(s.id) filter (where s.fetched_at > now() - interval '30 days' and s.status = 'analyzed')::int as relevant,
             count(s.id) filter (where s.deep_at is not null)::int as deep,
             count(distinct ts.topic_id)::int as used
      from sources src
      left join signals s on s.source_id = src.id
      left join topic_signals ts on ts.signal_id = s.id
      group by src.id
      order by src.active desc, (src.category = 'keyword_search'), relevant desc, src.name`,
    loadTargeting(),
  ]);
  const feeds = rows.filter((r) => r.kind === "rss");
  const other = rows.filter((r) => r.kind !== "rss");
  const total = feeds.reduce((a, r) => a + r.collected, 0);
  const relevant = feeds.reduce((a, r) => a + r.relevant, 0);
  // Phrases from persona problems and target industries, offered as search ideas.
  const suggestions = [
    ...targeting.personas.flatMap((p) => (p.pains ?? "").split(/[、,]/).map((x) => x.trim()).filter((x) => x.length >= 3 && x.length <= 20)),
    ...targeting.industries.filter((i) => i.active && i.priority === "high").map((i) => `${i.name_ja} 生成AI`),
  ];

  return (
    <main className="page">
      <div>
        <p className="eyebrow">Where signals come from</p>
        <h1 className="mt-1.5 text-[28px] font-bold tracking-tight">Sources</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Collected every morning. Gemini scores each item for your personas, reads the full article of the strongest ones, and pulls out
          facts and reader questions. Last 30 days: {total.toLocaleString()} items collected, {relevant.toLocaleString()} relevant.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-semibold">Add a Google News search</h2>
          <p className="text-[13px] text-faint">Tracks new Japanese coverage of a phrase (last 14 days). Use your personas&apos; problems or industries.</p>
          <AddKeyword suggestions={[...new Set(suggestions)]} />
        </section>
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-semibold">Add an RSS feed</h2>
          <p className="text-[13px] text-faint">Any Japanese news site or blog with an RSS/Atom feed. Checked before it is saved.</p>
          <AddRss />
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2.4fr)_repeat(4,72px)_96px_110px] gap-3 border-b border-line bg-subtle px-4 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-faint md:grid">
          <span>Source</span><span className="text-right">30d items</span><span className="text-right">Relevant</span><span className="text-right">Deep-read</span><span className="text-right">In topics</span><span>Fetched</span><span />
        </div>
        <ul className="divide-y divide-line">
          {feeds.map((r) => (
            <li key={r.id} className={`grid grid-cols-2 items-center gap-x-3 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,2.4fr)_repeat(4,72px)_96px_110px] ${r.active ? "" : "opacity-55"}`}>
              <div className="col-span-2 min-w-0 md:col-span-1">
                <p lang="ja" className="truncate text-sm font-medium">
                  {r.url ? <a href={r.url.includes("news.google.com") ? r.url.replace("/rss/search", "/search") : r.url} target="_blank" rel="noreferrer" className="hover:underline">{r.name}</a> : r.name}
                </p>
                <p className="text-[12px] text-faint">
                  {CATEGORY[r.category ?? ""] ?? r.category}
                  {r.last_error && <span className="ml-2 text-bad">· error: {r.last_error.slice(0, 60)}</span>}
                </p>
              </div>
              <Num label="30d items" v={r.collected} />
              <Num label="Relevant" v={r.relevant} strong />
              <Num label="Deep-read" v={r.deep} />
              <Num label="In topics" v={r.used} />
              <span className="text-[12px] text-faint">{r.active ? ago(r.last_fetched_at) : "paused"}</span>
              <div className="flex justify-end gap-1">
                <form action={toggleSource}>
                  <input type="hidden" name="id" value={r.id} />
                  <PendingButton className="rounded-lg border border-line-strong px-2.5 py-1 text-[12px] hover:bg-subtle">{r.active ? "Pause" : "Resume"}</PendingButton>
                </form>
                {(r.category === "keyword_search" || r.category === "custom") && (
                  <form action={deleteSource}>
                    <input type="hidden" name="id" value={r.id} />
                    <PendingButton ariaLabel={`Remove ${r.name}`} className="rounded-lg px-2 py-1 text-[12px] text-bad hover:bg-bad-soft">✕</PendingButton>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="text-[13px] text-muted">
        <h2 className="text-sm font-semibold text-ink">Also used</h2>
        <ul className="mt-1 list-disc pl-5">
          {other.map((r) => <li key={r.id}>{r.name}: {r.category === "own_site" ? "existing posts, so topics never duplicate them" : "search demand for scoring"} ({ago(r.last_fetched_at)})</li>)}
          <li>Google Analytics 4: what already works on renesistech.jp (feeds the &ldquo;past results&rdquo; score)</li>
          <li>Topic research: a fresh Google News search per topic, shown with numbered sources on each topic page</li>
        </ul>
      </section>
    </main>
  );
}

function Num({ label, v, strong }: { label: string; v: number; strong?: boolean }) {
  return (
    <span className="flex items-baseline justify-between gap-2 md:block md:text-right">
      <span className="text-[11.5px] text-faint md:hidden">{label}</span>
      <span className={`font-mono text-[13px] tabular-nums ${strong ? "font-semibold text-ink" : "text-muted"}`}>{v.toLocaleString()}</span>
    </span>
  );
}
