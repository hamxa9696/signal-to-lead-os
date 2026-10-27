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
  service_name: string | null;
  service_url: string | null;
  signals: { title: string; url: string | null; buyer_problem: string | null }[];
};

export async function getTopic(id: string): Promise<TopicFull | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [t] = await sql<TopicFull[]>`
    select t.id, t.kind, t.magnet_format, t.title_ja, t.title_en, t.primary_keyword, t.secondary_keywords,
           t.search_intent, t.rationale, t.outline, t.cta, t.status, t.week_of::text,
           sv.name_ja as service_name, sv.landing_url as service_url,
           coalesce((select json_agg(json_build_object('title', s.title, 'url', s.url, 'buyer_problem', s.buyer_problem))
                     from topic_signals ts join signals s on s.id = ts.signal_id where ts.topic_id = t.id), '[]') as signals
    from topics t left join services sv on sv.id = t.service_id
    where t.id = ${id}`;
  return t ?? null;
}
