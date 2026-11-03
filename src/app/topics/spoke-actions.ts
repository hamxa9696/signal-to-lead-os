"use server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { CHANNELS } from "@/lib/formats";

const ID = /^[0-9a-f-]{36}$/;
const cleanUrl = (u?: string | null) => (u && /^https?:\/\/\S+$/.test(u.trim()) ? u.trim().slice(0, 500) : null);

function refresh(topicId: string) {
  revalidatePath("/");
  revalidatePath("/topics");
  revalidatePath(`/topics/${topicId}`);
  revalidatePath("/topics/calendar");
}

/**
 * Mark something as posted, or undo it. channel = null is the main piece (hub): posting it also
 * moves the topic to done, so it counts as live everywhere; undo moves it back.
 */
export async function markPosted(topicId: string, channel: string | null, posted: boolean, postUrl?: string): Promise<{ ok: boolean }> {
  if (!ID.test(topicId) || (channel !== null && !(channel in CHANNELS))) return { ok: false };
  const url = cleanUrl(postUrl);
  if (channel === null) {
    if (posted) {
      await sql`update topics set posted_at = coalesce(posted_at, now()), posted_url = coalesce(${url}, posted_url),
                  status = case when status = 'rejected' then status else 'done' end where id = ${topicId}`;
    } else {
      await sql`update topics set posted_at = null,
                  status = case when status <> 'done' then status
                                when exists (select 1 from content_items ci where ci.topic_id = topics.id and ci.parent_id is null) then 'in_progress'
                                else 'approved' end
                where id = ${topicId}`;
    }
  } else {
    await sql`
      insert into topic_spokes (topic_id, channel, posted_at, post_url)
      values (${topicId}, ${channel}, ${posted ? sql`now()` : null}, ${url})
      on conflict (topic_id, channel) do update
        set posted_at = case when ${posted} then coalesce(topic_spokes.posted_at, now()) else null end,
            post_url = coalesce(excluded.post_url, topic_spokes.post_url)`;
  }
  refresh(topicId);
  return { ok: true };
}

/** Save (or clear) the link to a post that is already marked as posted. */
export async function savePostLink(topicId: string, channel: string | null, postUrl: string): Promise<{ ok: boolean }> {
  if (!ID.test(topicId) || (channel !== null && !(channel in CHANNELS))) return { ok: false };
  const url = cleanUrl(postUrl);
  if (postUrl.trim() && !url) return { ok: false };
  if (channel === null) await sql`update topics set posted_url = ${url} where id = ${topicId}`;
  else await sql`update topic_spokes set post_url = ${url} where topic_id = ${topicId} and channel = ${channel}`;
  refresh(topicId);
  return { ok: true };
}

/** Kept for older callers: mark a spoke as posted. */
export async function markSpoke(topicId: string, channel: string, posted: boolean, postUrl?: string): Promise<{ ok: boolean }> {
  return markPosted(topicId, channel, posted, postUrl);
}

/** Drag & drop on the calendar: move a hub (channel = null) or a spoke to another day. */
export async function moveItem(topicId: string, channel: string | null, date: string): Promise<{ ok: boolean }> {
  if (!ID.test(topicId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false };
  if (channel === null) {
    await sql`update topics set planned_date = ${date} where id = ${topicId}`;
  } else {
    if (!(channel in CHANNELS)) return { ok: false };
    await sql`
      insert into topic_spokes (topic_id, channel, planned_date) values (${topicId}, ${channel}, ${date})
      on conflict (topic_id, channel) do update set planned_date = excluded.planned_date`;
  }
  revalidatePath("/topics/calendar");
  return { ok: true };
}
