import Link from "next/link";
import { sql } from "@/lib/db";
import { addDays, weekOf } from "@/lib/week";
import { SCORE_MAX } from "@/jobs/weekly-shortlist";
import type { KeywordPlan } from "@/lib/keywords";
import { KeywordButton } from "./keyword-button";
import { TopicTabs } from "./tabs";
import { TopicDecision } from "./decision";
import { CopyButton } from "../copy-button";
import { topicPackage } from "@/lib/content/package";
import { HoverCard } from "../hover-card";

export const dynamic = "force-dynamic";

type Breakdown = {
  demand: number; demand_source: string; gsc_impressions_28d: number;
  fit: number; freshness: number; performance: number; performance_note?: string;
};

type Topic = {
  id: string;
  kind: "article" | "lead_magnet";
  magnet_format: string | null;
  title_ja: string;
  title_en: string | null;
  primary_keyword: string | null;
  secondary_keywords: string[];
  search_intent: string | null;
  origin: string;
  service: string | null;
  score: string | null;
  score_breakdown: Breakdown | null;
  rationale: string | null;
  outline: string[] | null;
  cta: string | null;
  status: string;
  item_status: string | null;
  keyword_plan: KeywordPlan | null;
  research: import("@/lib/research").Research | null;
  persona: string | null;
  service_url: string | null;
  week_of: string;
  signals: { title: string; url: string | null; source: string; published: string | null; relevance: number | null; why: string | null; niche: string | null }[];
};

/** Where a topic is in the pipeline, from its own status and its draft's. */
function stage(t: Topic): "proposed" | "writing" | "revision" | "ready" | "live" | "rejected" {
  if (t.status === "rejected") return "rejected";
  if (t.status === "proposed") return "proposed";
  if (t.item_status === "published" || t.status === "done") return "live";
  if (t.item_status === "ready") return "ready";
  if (t.item_status === "needs_revision") return "revision";
  return "writing";
}

const PILL: Record<string, { label: string; cls: string }> = {
  writing: { label: "Writing", cls: "text-accent-ink bg-accent-soft border-accent/30" },
  revision: { label: "Needs revision", cls: "text-warn bg-warn-soft border-warn/30" },
  ready: { label: "Ready to publish", cls: "text-good bg-good-soft border-good/30" },
  live: { label: "Live", cls: "text-white bg-ink border-ink" },
  rejected: { label: "Rejected", cls: "text-faint bg-subtle border-line line-through" },
};

/** The four parts of a topic's 0–100 score. Colours are used for the bars, legend and labels. */
const PARTS = [
  {
    key: "demand", short: "Demand", max: SCORE_MAX.demand, color: "#2E6BE6",
    what: "How many people search for this topic on Google.",
    how: "Search Console impressions for the keyword over the last 28 days: 1,000+ = full 40, scaled down logarithmically. Until Search Console is connected, Gemini estimates demand and the score is capped at 20.",
  },
  {
    key: "fit", short: "Service fit", max: SCORE_MAX.fit, color: "#7C4DDB",
    what: "How directly the topic leads a reader to a Renesis service.",
    how: "Gemini rates the fit 0–10 against your services list, × 3.",
  },
  {
    key: "freshness", short: "Freshness", max: SCORE_MAX.freshness, color: "#0E9F6E",
    what: "How recent the news behind the topic is.",
    how: "Newest linked news item: ≤ 3 days = 20, ≤ 7 days = 15, ≤ 14 days = 10, older = 5. Evergreen topics with no news get 10.",
  },
  {
    key: "performance", short: "Past results", max: SCORE_MAX.performance, color: "#D97706",
    what: "How similar pieces you already published performed.",
    how: "Past pieces for the same service (and lead-magnet format) vs your average piece, first 90 days; one lead counts as 30 visits. 5 = average or not enough history yet.",
  },
] as const;

const KIND = (t: Topic) =>
  t.origin === "refresh" ? "Rewrite" : t.kind === "lead_magnet" ? `Lead magnet · ${t.magnet_format ?? ""}` : "Article";

const fmtWeek = (d: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export default async function TopicsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week: weekParam } = await searchParams;
  const [{ latest }] = await sql<{ latest: string | null }[]>`select max(week_of)::text as latest from topics`;
  const week = /^\d{4}-\d{2}-\d{2}$/.test(weekParam ?? "") ? weekParam! : (latest ?? weekOf());

  const [topics, [{ signals }]] = await Promise.all([
    sql<Topic[]>`
      select t.id, t.kind, t.magnet_format, t.title_ja, t.title_en, t.primary_keyword, t.secondary_keywords,
             t.search_intent, t.origin, sv.name_ja as service, t.score::text,
             t.score_breakdown, t.rationale, t.outline, t.cta, t.status, ci.status as item_status, t.keyword_plan, t.research,
             i.name as persona, sv.landing_url as service_url, t.week_of::text,
             coalesce((select json_agg(json_build_object(
                         'title', s.title, 'url', s.url, 'source', src.name,
                         'published', to_char(coalesce(s.published_at, s.fetched_at) at time zone 'Asia/Tokyo', 'DD Mon'),
                         'relevance', s.relevance, 'why', s.analysis->>'why', 'niche', coalesce(sc.name_en, c.name_en))
                         order by s.relevance desc nulls last)
                       from topic_signals ts join signals s on s.id = ts.signal_id join sources src on src.id = s.source_id
                       left join subcategories sc on sc.id = s.subcategory_id left join categories c on c.id = s.category_id
                       where ts.topic_id = t.id), '[]') as signals
      from topics t
      left join services sv on sv.id = t.service_id
      left join icps i on i.id = t.icp_id
      left join content_items ci on ci.topic_id = t.id and ci.parent_id is null
      where t.week_of = ${week}
      order by (t.status = 'rejected'), t.score desc nulls last`,
    sql<{ signals: number }[]>`
      select count(*)::int as signals from signals
      where status = 'analyzed' and analyzed_at >= ${week}::date - 7 and analyzed_at < ${week}::date + 7`,
  ]);

  const count = (s: string) => topics.filter((t) => stage(t) === s).length;
  const counters = [
    { key: "proposed", label: "Proposed", dot: "" },
    { key: "writing", label: "Writing", dot: "" },
    { key: "revision", label: "Needs revision", dot: "bg-warn-dot", tone: "text-warn" },
    { key: "ready", label: "Ready", dot: "bg-good-dot", tone: "text-good" },
    { key: "live", label: "Live", dot: "" },
  ];

  return (
    <main className="page">
      <TopicTabs current="topics" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            Week of {fmtWeek(week)} – {fmtWeek(addDays(week, 6))} · JST · {signals} relevant signals
          </p>
          <h1 className="page-title">Weekly topics</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">Each topic is built by Gemini from the week&apos;s signals and search demand. Open a topic to see the signals behind it, its keywords and the keywords to rank for.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/topics?week=${addDays(week, -7)}`} className="btn">
            ← Previous
          </Link>
          <Link href={`/topics?week=${addDays(week, 7)}`} className="btn">
            Next →
          </Link>
        </div>
      </div>

      <section aria-label="Pipeline" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {counters.map((c) => (
          <div key={c.key} className="card px-[18px] py-4">
            <p className={`flex items-center gap-1.5 text-[12.5px] ${c.tone ?? "text-faint"}`}>
              {c.dot && <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />}
              {c.label}
            </p>
            <p className="mt-2 font-mono text-[26px] tracking-tight">{count(c.key)}</p>
          </div>
        ))}
      </section>

      <section aria-label="How topics are scored" className="card px-[22px] py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">How the score (0–100) is built</h2>
          <p className="text-xs text-faint">Hover a bar to see its points</p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PARTS.map((p) => (
            <div key={p.key} className="flex gap-2.5">
              <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
              <div>
                <p className="text-[13px] font-semibold">
                  {p.short} <span className="font-mono font-normal text-faint">/ {p.max}</span>
                </p>
                <p className="text-[12.5px] leading-snug text-muted">{p.what}</p>
              </div>
            </div>
          ))}
        </div>
        <details className="mt-3 text-[12.5px]">
          <summary className="cursor-pointer font-medium text-accent-ink">Exactly how each part is calculated</summary>
          <dl className="mt-2 space-y-1.5 text-muted">
            {PARTS.map((p) => (
              <div key={p.key}>
                <dt className="inline font-semibold" style={{ color: p.color }}>{p.short} ({p.max}): </dt>
                <dd className="inline">{p.how}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>

      {!topics.length ? (
        <p className="card px-6 py-8 text-sm text-muted">
          No topics for this week yet. The shortlist is generated every Monday at 06:30 JST, or use “Regenerate weekly shortlist” on the Status page.
        </p>
      ) : (
        <section aria-label="Topics" className="card overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="eyebrow grid grid-cols-[64px_minmax(0,1fr)_184px_150px_170px] gap-4 rounded-t-[14px] border-b border-line bg-[#FAFAFB] px-[22px] py-3 text-[10.5px]">
              <span>Score</span>
              <span>Topic</span>
              <span>Score split</span>
              <span>Service</span>
              <span>State</span>
            </div>
            {topics.map((t) => {
              const s = stage(t);
              const score = Math.round(Number(t.score ?? 0));
              const lead = s !== "proposed" && s !== "rejected";
              return (
                <div key={t.id} className="border-b border-[#F0F1F4] last:border-b-0">
                <div className="grid grid-cols-[64px_minmax(0,1fr)_184px_150px_170px] items-center gap-4 px-[22px] pt-4 pb-2">
                  <ScoreRing value={score} strong={lead} />
                  <div className="min-w-0">
                    <Link href={`/topics/${t.id}`} lang="ja" className="block font-jp text-[15px] font-medium leading-normal hover:text-accent-ink">
                      {t.title_ja}
                    </Link>
                    <p className="mt-1 text-[12.5px] text-faint">
                      {KIND(t)} · <span lang="ja">{t.primary_keyword}</span>
                    </p>
                  </div>
                  <Split b={t.score_breakdown} strong={lead} signals={t.signals.length} total={score} />
                  <span lang="ja" className="text-body">{t.service?.replace(/サービス$/, "") ?? "—"}</span>
                  <div className="flex flex-col items-start gap-2">
                    {s === "proposed" ? (
                      <TopicDecision id={t.id} />
                    ) : s === "rejected" ? (
                      <TopicDecision id={t.id} initial="rejected" />
                    ) : s === "writing" ? (
                      <Link href={`/topics/${t.id}`} className="inline-flex min-h-8 items-center rounded-[7px] bg-ink px-3 text-[12.5px] font-semibold text-white hover:bg-body">
                        Start writing →
                      </Link>
                    ) : (
                      <Link href={`/topics/${t.id}`} className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PILL[s].cls}`}>
                        {PILL[s].label}
                      </Link>
                    )}
                    <CopyButton
                      text={topicPackage({ ...t, score: Number(t.score ?? 0), signals: t.signals })}
                      label="⧉ Copy package"
                      title="Copies the topic, keywords, suggested keywords, signals and research with URLs, outline and links"
                      className="inline-flex min-h-7 items-center rounded-[7px] border border-line-strong bg-surface px-2.5 text-[12px] font-medium text-muted hover:bg-subtle hover:text-ink"
                    />
                  </div>
                </div>
                <TopicDetails t={t} />
                </div>
              );
            })}
          </div>
        </section>
      )}
      <p className="mt-3.5 font-mono text-[11px] text-faint">
        * Demand is Gemini's estimate (capped at 20) until Search Console is connected.
      </p>
    </main>
  );
}

function ScoreRing({ value, strong }: { value: number; strong: boolean }) {
  const c = 2 * Math.PI * 20;
  return (
    <div className="relative h-12 w-12">
      <svg width="48" height="48" viewBox="0 0 48 48" role="img" aria-label={`Score ${value} of 100`} fill="none" strokeWidth="4">
        <circle cx="24" cy="24" r="20" stroke="#EEF0F3" />
        <circle cx="24" cy="24" r="20" stroke={strong ? "var(--color-accent)" : "#98A2B3"} strokeDasharray={`${(value / 100) * c} ${c}`} strokeLinecap="round" transform="rotate(-90 24 24)" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-medium">{value}</span>
    </div>
  );
}

/** Topic-specific reading of each score part, for the hover card. */
function partNote(key: string, b: Breakdown, signals: number): string {
  switch (key) {
    case "demand":
      return b.demand_source === "search_console"
        ? `${b.gsc_impressions_28d.toLocaleString("en-US")} Google impressions for the keyword in 28 days (Search Console).`
        : `Gemini's estimate of search demand (no Search Console data yet), so capped at 20.`;
    case "fit":
      return `Gemini rated the link to a Renesis service ${Math.round(b.fit / 3)}/10.`;
    case "freshness":
      return signals === 0
        ? "Evergreen topic with no news behind it: fixed 10."
        : b.freshness >= 20 ? "Newest news behind it is 3 days old or less." : b.freshness >= 15 ? "Newest news behind it is up to a week old." : b.freshness >= 10 ? "Newest news behind it is up to two weeks old." : "The news behind it is older than two weeks.";
    case "performance":
      return b.performance_note || (b.performance === 5 ? "Average, or not enough past pieces yet to compare." : "Based on how similar past pieces performed.");
    default:
      return "";
  }
}

function Split({ b, signals = 0, total }: { b: Breakdown | null; strong?: boolean; signals?: number; total?: number }) {
  if (!b) return <span className="text-xs text-faint">—</span>;
  const values: Record<string, number> = { demand: b.demand, fit: b.fit, freshness: b.freshness, performance: b.performance };
  const sum = total ?? PARTS.reduce((a, p) => a + values[p.key], 0);
  const weakest = [...PARTS].sort((x, y) => values[x.key] / x.max - values[y.key] / y.max)[0];
  const card = (
    <>
      <p className="font-semibold">Score {sum} / 100, built from four parts</p>
      <ul className="mt-2 flex flex-col gap-2">
        {PARTS.map((p) => (
          <li key={p.key}>
            <p className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-semibold"><span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />{p.short}</span>
              <span className="font-mono">{values[p.key]} / {p.max}</span>
            </p>
            <p className="text-white/75">{p.what} {partNote(p.key, b, signals)}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-white/15 pt-2 text-white/75">Weakest part: <b className="text-white">{weakest.short}</b>. Full rules are under &ldquo;How the score is built&rdquo; above.</p>
    </>
  );
  return (
    <HoverCard label={PARTS.map((p) => `${p.short} ${values[p.key]} of ${p.max}`).join(", ")} card={card} width={340}>
      <div className="flex h-2 gap-[3px]">
        {PARTS.map((p) => (
          <span key={p.key} className="w-10 overflow-hidden rounded-sm" style={{ background: `${p.color}26` }}>
            <span className="block h-full" style={{ width: `${(100 * values[p.key]) / p.max}%`, background: p.color }} />
          </span>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px] font-mono text-[10.5px]">
        {PARTS.map((p) => (
          <span key={p.key} className="w-10" style={{ color: p.color }}>
            {values[p.key]}
            {p.key === "demand" && b.demand_source !== "search_console" ? "*" : ""}
          </span>
        ))}
      </div>
    </HoverCard>
  );
}


const ROLE: Record<string, string> = { primary: "Main keyword", heading: "Use as headings (H2)", long_tail: "Work into the text", faq: "Answer as FAQ" };
const COMP: Record<string, { dot: string; label: string }> = {
  low: { dot: "bg-good-dot", label: "easier to rank" },
  medium: { dot: "bg-warn-dot", label: "medium competition" },
  high: { dot: "bg-bad", label: "hard to rank" },
};
const SRC: Record<string, string> = { google_suggest: "Google suggestion", search_console: "Your Search Console", topic: "Topic keyword" };

/** Expandable: the signals behind a topic, its keywords, and keywords suggested to rank for. */
function TopicDetails({ t }: { t: Topic }) {
  const plan = t.keyword_plan;
  const groups = plan ? (["primary", "heading", "long_tail", "faq"] as const).map((r) => ({ r, items: plan.keywords.filter((k) => k.role === r) })).filter((g) => g.items.length) : [];
  const betterPrimary = plan && t.primary_keyword && plan.primary !== t.primary_keyword ? plan.primary : null;
  return (
    <details className="group px-[22px] pb-3">
      <summary className="ml-[80px] inline-flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline">
        <span className="transition group-open:rotate-90">›</span>
        {t.signals.length ? `${t.signals.length} signal${t.signals.length === 1 ? "" : "s"} behind it` : "Evergreen (no news signal)"} · {1 + t.secondary_keywords.length} keywords
        {plan ? ` · ${plan.keywords.length} suggested to rank for` : " · keyword suggestions not run yet"}
      </summary>
      <div className="mt-3 ml-[80px] grid gap-5 rounded-xl border border-line bg-subtle/50 p-4 lg:grid-cols-[1.2fr_0.8fr_1.2fr]">
        <section className="min-w-0">
          <h3 className="eyebrow">Why this topic</h3>
          {t.rationale && <p className="mt-1.5 text-[13px] text-body">{t.rationale}</p>}
          <h3 className="eyebrow mt-4">Signals behind it</h3>
          {t.signals.length ? (
            <ul className="mt-1.5 flex flex-col gap-2.5">
              {t.signals.map((sig, i) => (
                <li key={i} className="text-[13px]">
                  <p lang="ja" className="font-medium leading-snug">
                    {sig.url ? <a href={sig.url} target="_blank" rel="noreferrer" className="hover:underline">{sig.title}</a> : sig.title}
                  </p>
                  <p className="text-[12px] text-faint">
                    {sig.source}{sig.published ? ` · ${sig.published}` : ""}{sig.niche ? ` · ${sig.niche}` : ""}
                    {sig.relevance != null && ` · relevance ${Number(sig.relevance).toFixed(2)}`}
                  </p>
                  {sig.why && <p className="text-[12px] text-muted">{sig.why}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[13px] text-muted">An evergreen search topic: chosen for steady Google demand, not a news item.</p>
          )}
        </section>

        <section className="min-w-0">
          <h3 className="eyebrow">Keywords</h3>
          <p className="mt-1.5 text-[12px] text-faint">Main keyword</p>
          <p lang="ja" className="text-[14px] font-semibold">{t.primary_keyword ?? "—"}</p>
          {betterPrimary && (
            <p className="mt-1 rounded-md bg-accent-soft px-2 py-1 text-[12px] text-accent-ink">
              Gemini suggests <span lang="ja" className="font-semibold">「{betterPrimary}」</span> as a stronger main keyword.
            </p>
          )}
          {t.secondary_keywords.length > 0 && (
            <>
              <p className="mt-3 text-[12px] text-faint">Secondary keywords</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {t.secondary_keywords.map((k) => <span key={k} lang="ja" className="rounded-full bg-surface px-2.5 py-0.5 text-[12.5px] ring-1 ring-line">{k}</span>)}
              </div>
            </>
          )}
          {t.search_intent && <p className="mt-3 text-[12px] text-faint">Search intent: <span className="text-body">{t.search_intent}</span></p>}
        </section>

        <section className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="eyebrow">Suggested keywords to rank for</h3>
            <KeywordButton topicId={t.id} again={!!plan} />
          </div>
          {plan ? (
            <>
              <p className="mt-1 text-[12px] text-faint">Picked by Gemini from {plan.candidates} real Japanese searches (Google suggestions{"\u00a0"}+ Search Console). Hover a keyword for why.</p>
              <div className="mt-2 flex flex-col gap-2.5">
                {groups.map((g) => (
                  <div key={g.r}>
                    <p className="text-[12px] font-semibold text-muted">{ROLE[g.r]}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {g.items.map((k) => (
                        <span key={k.kw} title={`${k.why} · ${COMP[k.competition].label} · ${k.intent} · ${SRC[k.source]}`} className="inline-flex cursor-help items-center gap-1.5 rounded-full bg-surface px-2.5 py-0.5 text-[12.5px] ring-1 ring-line">
                          <span className={`h-1.5 w-1.5 rounded-full ${COMP[k.competition].dot}`} />
                          <span lang="ja">{k.kw}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2.5 flex flex-wrap gap-3 text-[11.5px] text-faint">
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-good-dot" /> easier to rank</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-warn-dot" /> medium</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-bad" /> hard</span>
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-[13px] text-muted">Not run yet for this topic. It runs automatically after the Monday shortlist, or click the button.</p>
          )}
        </section>
      </div>
    </details>
  );
}
