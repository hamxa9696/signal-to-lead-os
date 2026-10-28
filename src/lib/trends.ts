// Trending keywords: how many signals each tracked keyword pulled in over the last 7 days vs the
// 7 days before. Keywords = the sub-category keywords you define + the Google News search phrases.
import { sql } from "./db";

export type KeywordTrend = {
  keyword: string;
  kind: "niche" | "search";
  niche: string | null; // sub-category name, or null for a news search
  color: string | null; // category colour
  category: string | null; // category name
  cat_slug: string | null;
  now: number; // signals in the last 7 days
  prev: number; // signals in the 7 days before
  relevant: number; // of `now`, how many Gemini marked relevant
  latest: Date | null; // newest matching article (how fresh the trend is)
};

/** Trend windows: each is compared with the same length just before it. */
export const TREND_PERIODS = [
  { key: "24h", label: "24 hours", hours: 24 },
  { key: "7d", label: "7 days", hours: 24 * 7 },
  { key: "30d", label: "30 days", hours: 24 * 30 },
  { key: "90d", label: "90 days", hours: 24 * 90 },
] as const;
export type TrendPeriod = (typeof TREND_PERIODS)[number]["key"];

export async function keywordTrends(limit = 20, period: TrendPeriod = "7d", catSlug?: string): Promise<KeywordTrend[]> {
  const hours = TREND_PERIODS.find((p) => p.key === period)?.hours ?? 168;
  // Rolling windows on the article's publish time: last N hours vs the N hours before.
  const cur = sql`r.at >= now() - make_interval(hours => ${hours})`;
  const prev = sql`r.at < now() - make_interval(hours => ${hours})`;
  const window = sql`coalesce(s.published_at, s.fetched_at) >= now() - make_interval(hours => ${hours * 2})`;
  const rows = await sql<KeywordTrend[]>`
    with recent as (
      select s.id, s.status, s.source_id, coalesce(s.published_at, s.fetched_at) as at,
             lower(s.title || ' ' || coalesce(s.summary, '') || ' ' || coalesce(left(s.body, 6000), '')) as text
      from signals s
      where ${window}
    ),
    niche_kw as (
      select distinct on (lower(k)) k as keyword, sc.name_en as niche, c.color, c.name_en as category, c.slug as cat_slug
      from subcategories sc join categories c on c.id = sc.category_id, unnest(sc.keywords) k
      where sc.active and c.active and length(trim(k)) >= 2
      order by lower(k), sc.created_at
    ),
    niche as (
      select n.keyword, 'niche'::text as kind, n.niche, n.color, n.category, n.cat_slug,
             count(*) filter (where ${cur})::int as now,
             count(*) filter (where ${prev})::int as prev,
             count(*) filter (where ${cur} and r.status = 'analyzed')::int as relevant,
             max(r.at) filter (where ${cur}) as latest
      from niche_kw n
      join recent r on not exists (
        select 1 from unnest(string_to_array(lower(trim(n.keyword)), ' ')) w
        where w <> '' and case
          -- Latin words match whole words only ("sto" must not match "store"); Japanese matches anywhere.
          when w ~ '^[a-z0-9]+$' then r.text !~ ('(^|[^a-z0-9])' || w || '($|[^a-z0-9])')
          else position(w in r.text) = 0 end)
      group by n.keyword, n.niche, n.color, n.category, n.cat_slug
    ),
    search as (
      select regexp_replace(src.name, '^Google News:\\s*', '') as keyword, 'search'::text as kind, null::text as niche,
             c.color, c.name_en as category, c.slug as cat_slug,
             count(r.id) filter (where ${cur})::int as now,
             count(r.id) filter (where ${prev})::int as prev,
             count(r.id) filter (where ${cur} and r.status = 'analyzed')::int as relevant,
             max(r.at) filter (where ${cur}) as latest
      from sources src left join recent r on r.source_id = src.id left join categories c on c.id = src.category_id
      where src.active and src.category = 'keyword_search'
      group by src.name, c.color, c.name_en, c.slug
    )
    select * from (select * from niche union all select * from search) t
    where now + prev > 0 ${catSlug ? sql`and cat_slug = ${catSlug}` : sql``}
    order by now desc, latest desc nulls last, (now - prev) desc
    limit ${limit}`;
  return rows;
}
