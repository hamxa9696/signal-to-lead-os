// Topic → prompt pack → pasted draft versions → checks + Gemini review → ready / needs revision.
import "server-only";
import { sql } from "@/lib/db";
import { runChecks } from "./checks";
import { parseDraft } from "./draft";
import { getKnowledge } from "./knowledge";
import { buildPromptPack } from "./prompt-pack";
import { reviewDraft, type ReviewResult } from "./review";
import { getTopic } from "./topic";

export const DRAFTED_BY = ["claude", "chatgpt", "gemini", "manual"] as const;
export type DraftedBy = (typeof DRAFTED_BY)[number];

/** Create (or rebuild) the prompt pack for an approved topic. */
export async function ensurePromptPack(topicId: string, rebuild = false): Promise<string> {
  const t = await getTopic(topicId);
  if (!t) throw new Error("topic not found");
  if (!rebuild) {
    const [b] = await sql<{ prompt_pack: string }[]>`
      select prompt_pack from briefs where topic_id = ${topicId} order by created_at desc limit 1`;
    if (b) return b.prompt_pack;
  }
  const pack = buildPromptPack(t, await getKnowledge());
  await sql`insert into briefs (topic_id, prompt_pack) values (${topicId}, ${pack})`;
  return pack;
}

async function reviewAndStore(versionId: string, itemId: string, topicId: string, raw: string): Promise<ReviewResult> {
  const [t, k] = await Promise.all([getTopic(topicId), getKnowledge()]);
  if (!t) throw new Error("topic not found");
  const parsed = parseDraft(raw);
  const checks = runChecks(parsed, t, k);
  const result = await reviewDraft(parsed, t, k, checks);
  await sql`update content_versions set review = ${sql.json(result as never)}, review_passed = ${result.passed} where id = ${versionId}`;
  await sql`update content_items set status = ${result.passed ? "ready" : "needs_revision"} where id = ${itemId}`;
  return result;
}

/** Save a pasted draft as the next version and review it. */
export async function saveDraft(topicId: string, raw: string, draftedBy: DraftedBy): Promise<{ version: number; result: ReviewResult }> {
  const t = await getTopic(topicId);
  if (!t) throw new Error("topic not found");
  if (raw.trim().length < 200) throw new Error("the draft looks empty; paste the full output from ChatGPT/Claude");
  const parsed = parseDraft(raw);
  const title = parsed.frontmatter.title || t.title_ja;
  const slug = parsed.frontmatter.slug || null;

  const { versionId, itemId, version } = await sql.begin(async (tx) => {
    let [item] = await tx<{ id: string }[]>`select id from content_items where topic_id = ${topicId} and parent_id is null`;
    if (!item) {
      [item] = await tx<{ id: string }[]>`
        insert into content_items (topic_id, type, channel, title, slug, status)
        values (${topicId}, ${t.kind}, 'website', ${title}, ${slug}, 'in_review') returning id`;
    }
    const [{ next }] = await tx<{ next: number }[]>`
      select coalesce(max(version), 0) + 1 as next from content_versions where content_item_id = ${item.id}`;
    const [v] = await tx<{ id: string }[]>`
      insert into content_versions (content_item_id, version, body_md, frontmatter, drafted_by)
      values (${item.id}, ${next}, ${parsed.body}, ${tx.json(parsed.frontmatter as never)}, ${draftedBy}) returning id`;
    await tx`update content_items set current_version_id = ${v.id}, title = ${title}, slug = ${slug}, status = 'in_review' where id = ${item.id}`;
    await tx`update topics set status = 'in_progress' where id = ${topicId} and status = 'approved'`;
    return { versionId: v.id, itemId: item.id, version: next };
  }).catch((err: Error) => {
    if (/content_items_channel_slug_key/.test(err.message)) throw new Error(`slug "${slug}" is already used by another piece; change it in the draft`);
    throw err;
  });

  // Keep the raw paste for review (frontmatter included) by rebuilding it from parts.
  const result = await reviewAndStore(versionId, itemId, topicId, raw);
  return { version, result };
}

/** Re-run checks + Gemini on the current version (e.g. after editing the knowledge docs). */
export async function rerunReview(topicId: string): Promise<ReviewResult> {
  const [row] = await sql<{ item_id: string; version_id: string; body_md: string; frontmatter: Record<string, string> }[]>`
    select ci.id as item_id, v.id as version_id, v.body_md, v.frontmatter
    from content_items ci join content_versions v on v.id = ci.current_version_id
    where ci.topic_id = ${topicId} and ci.parent_id is null`;
  if (!row) throw new Error("no draft yet");
  const fm = Object.entries(row.frontmatter ?? {}).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n");
  return reviewAndStore(row.version_id, row.item_id, topicId, `---\n${fm}\n---\n\n${row.body_md}`);
}

/** Human override: accept the current version even though the review did not pass. */
export async function markReady(topicId: string): Promise<void> {
  await sql`
    update content_items set status = 'ready'
    where topic_id = ${topicId} and parent_id is null and current_version_id is not null`;
  await sql`
    update content_versions set human_checked = true
    where id = (select current_version_id from content_items where topic_id = ${topicId} and parent_id is null)`;
}
