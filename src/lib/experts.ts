// Named Renesis experts who author content. AI search cites people's profiles far more than
// company pages, so every piece is written in (and published under) one expert's name.
import { sql } from "./db";

export type Expert = { id: string; name: string; role: string | null; bio: string | null; linkedin_url: string | null; service_ids: string[]; active: boolean };
export type Author = { id: string; name: string; role: string | null; bio: string | null; linkedin_url: string | null; auto: boolean };

export async function loadExperts(): Promise<Expert[]> {
  return sql<Expert[]>`select id, name, role, bio, linkedin_url, service_ids, active from experts order by active desc, created_at`;
}

/**
 * SQL for a topic's author (alias `t`): the manual pick, else the first active expert who covers
 * the topic's service, else the first active generalist (no services). Null if nobody fits.
 */
export function authorSelect() {
  const obj = sql`json_build_object('id', e.id, 'name', e.name, 'role', e.role, 'bio', e.bio, 'linkedin_url', e.linkedin_url)`;
  return sql`coalesce(
    (select ${obj}::jsonb || '{"auto":false}' from experts e where e.id = t.author_id),
    (select ${obj}::jsonb || '{"auto":true}' from experts e where e.active and t.service_id = any(e.service_ids) order by e.created_at limit 1),
    (select ${obj}::jsonb || '{"auto":true}' from experts e where e.active and cardinality(e.service_ids) = 0 order by e.created_at limit 1)
  )`;
}

/** One-line byline for prompts. */
export function authorLine(a: Author | null | undefined): string | null {
  if (!a) return null;
  return `${a.name}${a.role ? `（${a.role}）` : ""}${a.bio ? ` — ${a.bio}` : ""}${a.linkedin_url ? ` LinkedIn: ${a.linkedin_url}` : ""}`;
}
