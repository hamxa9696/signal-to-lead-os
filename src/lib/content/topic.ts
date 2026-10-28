// Loading a topic with everything the content workflow needs.
import "server-only";
import { sql } from "@/lib/db";

export type TopicFull = {
  id: string;
  kind: "article" | "lead_magnet";
  magnet_format: string | null;
  title_ja: string;
  title_en: string | null;
  primary_keyword: string | null;
  secondary_keywords: string[];
  search_intent: string | null;
  rationale: string | null;
  outline: string[] | null;
  cta: string | null;
  status: string;
  week_of: string;
  origin: "shortlist" | "refresh" | "expand";
  target_path: string | null;
  service_name: string | null;
  service_url: string | null;
  research: import("../research").Research | null;
  keyword_plan: import("../keywords").KeywordPlan | null;
  slot: import("../formats").Slot | null;
  format_plan: import("../formats").FormatPlan | null;
  format_scores: import("../formats").FormatScores | null;
  deadline: Date | null;
  hub_url: string | null;
  posted: Record<string, string | null>;
  persona: { name: string; description: string | null; pains: string | null; industries: string[] } | null;
  signals: { title: string; url: string | null; buyer_problem: string | null; source?: string | null; why?: string | null; published?: string | null }[];
};

export async function getTopic(id: string): Promise<TopicFull | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [t] = await sql<TopicFull[]>`
    select t.id, t.kind, t.magnet_format, t.title_ja, t.title_en, t.primary_keyword, t.secondary_keywords,
           t.search_intent, t.rationale, t.outline, t.cta, t.status, t.week_of::text, t.origin, t.target_path, t.research, t.keyword_plan, t.slot, t.format_plan, t.format_scores, t.deadline,
           coalesce((select json_object_agg(channel, posted_at) from topic_spokes s where s.topic_id = t.id), '{}') as posted,
           (select p.url from publications p join content_items c2 on c2.id = p.content_item_id
             where c2.topic_id = t.id and p.channel = 'website' and p.status = 'live' limit 1) as hub_url,
           sv.name_ja as service_name, sv.landing_url as service_url,
           case when i.id is null then null
                else json_build_object('name', i.name, 'description', i.description, 'pains', i.pains, 'industries', i.industries) end as persona,
           coalesce((select json_agg(json_build_object('title', s.title, 'url', s.url, 'buyer_problem', s.buyer_problem,
                       'source', src.name, 'why', s.analysis->>'why',
                       'published', to_char(coalesce(s.published_at, s.fetched_at) at time zone 'Asia/Tokyo', 'DD Mon')))
                     from topic_signals ts join signals s on s.id = ts.signal_id join sources src on src.id = s.source_id
                     where ts.topic_id = t.id), '[]') as signals
    from topics t left join services sv on sv.id = t.service_id left join icps i on i.id = t.icp_id
    where t.id = ${id}`;
  return t ?? null;
}
