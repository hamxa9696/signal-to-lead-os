// Trending keywords: how many signals each tracked keyword pulled in over the last 7 days vs the
// 7 days before. Keywords = the sub-category keywords you define + the Google News search phrases.
import { sql } from "./db";

export type KeywordTrend = {
  keyword: string;
  kind: "niche" | "search";
  niche: string | null; // sub-category name, or null for a news search
  color: string | null; // category colour
  now: number; // signals in the last 7 days
  prev: number; // signals in the 7 days before
  relevant: number; // of `now`, how many Gemini marked relevant
};

export async function keywordTrends(limit = 20): Promise<KeywordTrend[]> {
  const rows = await sql<KeywordTrend[]>`
    with recent as (
      select s.id, s.status, s.source_id, coalesce(s.published_at, s.fetched_at) as at,
             lower(s.title || ' ' || coalesce(s.summary, '') || ' ' || coalesce(left(s.body, 6000), '')) as text
      from signals s
      where coalesce(s.published_at, s.fetched_at) >= now() - interval '14 days'
    ),
    niche_kw as (
      select distinct on (lower(k)) k as keyword, sc.name_en as niche, c.color
      from subcategories sc join categories c on c.id = sc.category_id, unnest(sc.keywords) k
      where sc.active and c.active and length(trim(k)) >= 2
      order by lower(k), sc.created_at
    ),
    niche as (
      select n.keyword, 'niche'::text as kind, n.niche, n.color,
             count(*) filter (where r.at >= now() - interval '7 days')::int as now,
             count(*) filter (where r.at < now() - interval '7 days')::int as prev,
             count(*) filter (where r.at >= now() - interval '7 days' and r.status = 'analyzed')::int as relevant
      from niche_kw n
      join recent r on not exists (
        select 1 from unnest(string_to_array(lower(trim(n.keyword)), ' ')) w
        where w <> '' and case
          -- Latin words match whole words only ("sto" must not match "store"); Japanese matches anywhere.
          when w ~ '^[a-z0-9]+$' then r.text !~ ('(^|[^a-z0-9])' || w || '($|[^a-z0-9])')
          else position(w in r.text) = 0 end)
      group by n.keyword, n.niche, n.color
    ),
    search as (
      select regexp_replace(src.name, '^Google News:\\s*', '') as keyword, 'search'::text as kind, null::text as niche, null::text as color,
             count(r.id) filter (where r.at >= now() - interval '7 days')::int as now,
             count(r.id) filter (where r.at < now() - interval '7 days')::int as prev,
             count(r.id) filter (where r.at >= now() - interval '7 days' and r.status = 'analyzed')::int as relevant
      from sources src left join recent r on r.source_id = src.id
      where src.active and src.category = 'keyword_search'
      group by src.name
    )
    select * from (select * from niche union all select * from search) t
    where now + prev > 0
    order by now desc, (now - prev) desc
    limit ${limit}`;
  return rows;
}
