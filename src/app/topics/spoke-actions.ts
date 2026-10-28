"use server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { CHANNELS } from "@/lib/formats";

/** Mark a spoke (e.g. the X thread for a topic) as posted, or undo it. */
export async function markSpoke(topicId: string, channel: string, posted: boolean, postUrl?: string): Promise<{ ok: boolean }> {
  if (!/^[0-9a-f-]{36}$/.test(topicId) || !(channel in CHANNELS)) return { ok: false };
  const url = postUrl && /^https?:\/\//.test(postUrl) ? postUrl.slice(0, 500) : null;
  await sql`
    insert into topic_spokes (topic_id, channel, posted_at, post_url)
    values (${topicId}, ${channel}, ${posted ? sql`now()` : null}, ${url})
    on conflict (topic_id, channel) do update set posted_at = excluded.posted_at, post_url = coalesce(excluded.post_url, topic_spokes.post_url)`;
  revalidatePath("/topics/calendar");
  return { ok: true };
}
