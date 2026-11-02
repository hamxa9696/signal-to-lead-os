// GEO measurement in three layers (LinkedIn "AI search visibility" guide, ch. 4):
//   leading indicators  – move first (AI visits, LinkedIn posting and engagement, new pages)
//   outcomes            – citations, share of voice, rank, sentiment, LinkedIn inclusion; judged on
//                         4-week windows, never week to week (AI takes ~7 days median, ~37 days P90 to cite)
//   diagnostics         – the same outcomes split by cluster, intent, engine, format and author
import { sql } from "../db";
import { OUR_DOMAIN } from "./check";

export const WINDOW_DAYS = 28;
export const MATURE_DAYS = 30;

export type Outcome = {
  answers: number; cited: number; mentioned: number; citeRate: number; mentionRate: number;
  sov: number; ourCitations: number; allCitations: number; avgRank: number | null;
  quality: { primary: number; supporting: number; reference: number };
  sentiment: { positive: number; neutral: number; negative: number };
  linkedinRate: number; linkedinOurs: number; weeks: number;
};

type Row = {
  answers: number; cited: number; mentioned: number; all_citations: number; our_citations: number; avg_rank: number | null;
  q_primary: number; q_supporting: number; q_reference: number; s_pos: number; s_neu: number; s_neg: number;
  li: number; li_ours: number; weeks: number;
};

const agg = () => sql`
  count(*)::int as answers,
  count(*) filter (where g.we_cited)::int as cited,
  count(*) filter (where g.we_mentioned)::int as mentioned,
  (coalesce(sum(jsonb_array_length(g.citations)), 0)
    + count(*) filter (where g.we_cited and g.engine like '%_manual'))::int as all_citations,
  count(*) filter (where g.we_cited)::int as our_citations,
  round(avg(g.our_position) filter (where g.our_position is not null), 1)::float as avg_rank,
  count(*) filter (where g.citation_quality = 'primary')::int as q_primary,
  count(*) filter (where g.citation_quality = 'supporting')::int as q_supporting,
  count(*) filter (where g.citation_quality = 'reference')::int as q_reference,
  count(*) filter (where g.sentiment = 'positive')::int as s_pos,
  count(*) filter (where g.sentiment = 'neutral')::int as s_neu,
  count(*) filter (where g.sentiment = 'negative')::int as s_neg,
  count(*) filter (where g.linkedin_cited)::int as li,
  count(*) filter (where g.linkedin_ours)::int as li_ours,
  count(distinct q.week_of)::int as weeks`;

function toOutcome(r: Row | undefined): Outcome {
  const x = r ?? ({ answers: 0, cited: 0, mentioned: 0, all_citations: 0, our_citations: 0, avg_rank: null, q_primary: 0, q_supporting: 0, q_reference: 0, s_pos: 0, s_neu: 0, s_neg: 0, li: 0, li_ours: 0, weeks: 0 } as Row);
  const d = Math.max(1, x.answers);
  return {
    answers: x.answers, cited: x.cited, mentioned: x.mentioned, citeRate: x.cited / d, mentionRate: x.mentioned / d,
    sov: x.all_citations ? x.our_citations / x.all_citations : 0, ourCitations: x.our_citations, allCitations: x.all_citations, avgRank: x.avg_rank,
    quality: { primary: x.q_primary, supporting: x.q_supporting, reference: x.q_reference },
    sentiment: { positive: x.s_pos, neutral: x.s_neu, negative: x.s_neg },
    linkedinRate: x.li / d, linkedinOurs: x.li_ours, weeks: x.weeks,
  };
}

/** This 4-week window vs the 4 weeks before, plus how long we have been measuring. */
export async function outcomes(): Promise<{ now: Outcome; prev: Outcome; firstCheck: string | null; matureFrom: string | null }> {
  const [[a], [b], [f]] = await Promise.all([
    sql<Row[]>`select ${agg()} from geo_checks g join geo_questions q on q.id = g.question_id where q.week_of > current_date - ${WINDOW_DAYS}::int`,
    sql<Row[]>`select ${agg()} from geo_checks g join geo_questions q on q.id = g.question_id
               where q.week_of > current_date - ${WINDOW_DAYS * 2}::int and q.week_of <= current_date - ${WINDOW_DAYS}::int`,
    sql<{ first: string | null; mature: string | null }[]>`
      select min(checked_at)::date::text as first, (min(checked_at)::date + ${MATURE_DAYS}::int)::text as mature from geo_checks`,
  ]);
  return { now: toOutcome(a), prev: toOutcome(b), firstCheck: f?.first ?? null, matureFrom: f?.mature ?? null };
}

export type Slice = { key: string; label: string; questions: number } & Outcome;

/** Outcomes split one way, over the current 4-week window. */
export async function diagnostics(): Promise<Record<"cluster" | "intent" | "engine" | "format" | "author", Slice[]>> {
  const base = (dim: ReturnType<typeof sql>) => sql<(Row & { key: string | null; questions: number })[]>`
    select ${dim} as key, count(distinct q.question)::int as questions, ${agg()}
    from geo_checks g
    join geo_questions q on q.id = g.question_id
    left join geo_readiness r on r.question_id = q.id
    left join lateral (
      select t.slot, e.name as author
      from publications p join content_items ci on ci.id = p.content_item_id join topics t on t.id = ci.topic_id
      left join experts e on e.id = t.author_id
      where p.channel = 'website' and r.page_path is not null and p.page_path = r.page_path limit 1
    ) k on true
    where q.week_of > current_date - ${WINDOW_DAYS}::int
    group by 1 order by count(*) desc`;
  const [cluster, intent, engine, format, author] = await Promise.all([
    base(sql`coalesce(q.cluster, 'Unclustered')`),
    base(sql`coalesce(q.intent, 'unknown')`),
    base(sql`g.engine`),
    base(sql`case when r.page_path is null then 'No page yet' else coalesce(k.slot, 'Page not made in Kizashi') end`),
    base(sql`case when r.page_path is null then 'No page yet' else coalesce(k.author, case when k.slot is null then 'Page not made in Kizashi' else 'No author set' end) end`),
  ]);
  const map = (rows: (Row & { key: string | null; questions: number })[]) => rows.map((r) => ({ key: r.key ?? "-", label: r.key ?? "-", questions: r.questions, ...toOutcome(r) }));
  return { cluster: map(cluster), intent: map(intent), engine: map(engine), format: map(format), author: map(author) };
}

/** Domains and vendor names that win the citations instead of us (current window). */
export async function competitors(): Promise<{ domains: { domain: string; n: number; share: number; ours: boolean }[]; vendors: { name: string; n: number }[] }> {
  const [domains, vendors] = await Promise.all([
    sql<{ domain: string; n: number }[]>`
      select c->>'domain' as domain, count(*)::int as n
      from geo_checks g join geo_questions q on q.id = g.question_id, jsonb_array_elements(g.citations) c
      where q.week_of > current_date - ${WINDOW_DAYS}::int and coalesce(c->>'domain', '') <> ''
      group by 1 order by 2 desc limit 15`,
    sql<{ name: string; n: number }[]>`
      select v as name, count(*)::int as n
      from geo_checks g join geo_questions q on q.id = g.question_id, unnest(g.competitors) v
      where q.week_of > current_date - ${WINDOW_DAYS}::int and v !~* 'renesis|レネシス'
      group by 1 order by 2 desc limit 12`,
  ]);
  const total = domains.reduce((a, d) => a + d.n, 0) || 1;
  return { domains: domains.map((d) => ({ ...d, share: d.n / total, ours: d.domain.endsWith(OUR_DOMAIN) })), vendors };
}

export type LinkedinPost = {
  topic_id: string; channel: string; title: string; posted_at: string; post_url: string | null; author: string | null;
  impressions: number | null; reactions: number | null; comments: number | null; shares: number | null;
};

/** Leading indicators: LinkedIn activity and engagement, LinkedIn visits, pages still too new to judge. */
export async function leading(): Promise<{
  posts: LinkedinPost[]; now: { posts: number; impressions: number; reactions: number; comments: number; shares: number; visits: number };
  prev: { posts: number; visits: number }; newPages: number;
}> {
  const [posts, [v], [np]] = await Promise.all([
    sql<LinkedinPost[]>`
      select s.topic_id, s.channel, t.title_ja as title, s.posted_at::date::text as posted_at, s.post_url, e.name as author,
             s.impressions, s.reactions, s.comments, s.shares
      from topic_spokes s join topics t on t.id = s.topic_id left join experts e on e.id = t.author_id
      where s.channel like 'linkedin%' and s.posted_at >= now() - interval '60 days'
      order by s.posted_at desc`,
    sql<{ now: number; prev: number }[]>`
      select coalesce(sum(sessions) filter (where date > current_date - ${WINDOW_DAYS}::int), 0)::int as now,
             coalesce(sum(sessions) filter (where date <= current_date - ${WINDOW_DAYS}::int), 0)::int as prev
      from channel_metrics_daily where source = 'linkedin' and date > current_date - ${WINDOW_DAYS * 2}::int`,
    sql<{ n: number }[]>`
      select count(*)::int as n from publications where channel = 'website' and status = 'live' and published_at > now() - make_interval(days => ${MATURE_DAYS})`,
  ]);
  const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;
  const recent = posts.filter((p) => new Date(p.posted_at).getTime() > cutoff);
  const sum = (k: "impressions" | "reactions" | "comments" | "shares") => recent.reduce((a, p) => a + (p[k] ?? 0), 0);
  return {
    posts,
    now: { posts: recent.length, impressions: sum("impressions"), reactions: sum("reactions"), comments: sum("comments"), shares: sum("shares"), visits: v?.now ?? 0 },
    prev: { posts: posts.length - recent.length, visits: v?.prev ?? 0 },
    newPages: np?.n ?? 0,
  };
}
