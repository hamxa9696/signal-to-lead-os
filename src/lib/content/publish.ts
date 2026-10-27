// Push an approved article to Payload as a DRAFT (status: "draft"), and sync publish status back.
// Anonymous visitors can only read status = "published" posts, so drafts stay private.
import "server-only";
import { sql } from "@/lib/db";
import { env, has } from "@/lib/env";
import { payloadFetch } from "@/lib/payload";
import type { Frontmatter } from "./draft";
import { markdownToLexical } from "./lexical";

const SITE = "https://renesistech.jp";

type PayloadPost = { id: string; slug: string; status: string; publishedAt?: string | null };

export function payloadReady(): { ok: boolean; reason?: string } {
  if (!has(env.payloadApiKey)) return { ok: false, reason: "PAYLOAD_API_KEY not set: ask the website developer for an API user (SETUP.md §6)" };
  return { ok: true };
}

export function adminUrl(postId: string): string {
  return `${env.payloadUrl}/admin/collections/${env.payloadPostsCollection}/${postId}`;
}

/**
 * Landing page for a lead magnet, as a blog post in the 資料ダウンロード category. The website
 * renders the download form under posts in that category (see integrations/website).
 */
export function landingMarkdown(fm: Frontmatter, magnetBody: string): string {
  const sections = [...magnetBody.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim()).filter((h) => !/使い方/.test(h));
  return [
    fm.landing_lead ?? fm.excerpt ?? "",
    "",
    "## この資料でわかること",
    ...(fm.landing_bullets ?? []).map((b) => `- ${b}`),
    "",
    ...(fm.landing_for?.length ? ["## こんな方におすすめ", ...fm.landing_for.map((b) => `- ${b}`), ""] : []),
    ...(sections.length ? ["## 資料の構成", ...sections.map((h) => `- ${h}`), ""] : []),
    "## ダウンロード方法",
    "下のフォームに必要事項をご入力ください。ご入力いただいたメールアドレスに、資料のダウンロードリンクをお送りします（無料）。",
  ].join("\n");
}

export async function pushDraftToPayload(contentItemId: string): Promise<{ postId: string; created: boolean }> {
  const ready = payloadReady();
  if (!ready.ok) throw new Error(ready.reason);

  const [item] = await sql<{ id: string; type: string; body_md: string; frontmatter: Frontmatter; pub_id: string | null; external_id: string | null }[]>`
    select ci.id, ci.type, v.body_md, v.frontmatter, p.id as pub_id, p.external_id
    from content_items ci
    join content_versions v on v.id = ci.current_version_id
    left join publications p on p.content_item_id = ci.id and p.channel = 'website'
    where ci.id = ${contentItemId}`;
  if (!item) throw new Error("content item not found");
  const isMagnet = item.type === "lead_magnet";
  if (isMagnet && !has(env.payloadResourcesCategoryId)) {
    throw new Error("PAYLOAD_RESOURCES_CATEGORY_ID not set: landing pages need the 資料ダウンロード category so the site shows the download form (SETUP.md §6)");
  }

  const fm = item.frontmatter;
  const coll = env.payloadPostsCollection;
  const markdown = isMagnet ? landingMarkdown(fm, item.body_md) : item.body_md;
  const data: Record<string, unknown> = {
    title: fm.title,
    slug: fm.slug,
    excerpt: fm.excerpt ?? "",
    content: markdownToLexical(markdown, fm.title),
    status: "draft",
    featured: false,
    seo: { metaTitle: fm.meta_title ?? fm.title, metaDescription: fm.meta_description ?? "", noIndex: false },
  };
  const category = isMagnet ? env.payloadResourcesCategoryId : env.payloadCategoryId;
  if (has(category)) data.category = category;
  if (has(env.payloadPlaceholderImageId)) {
    data.featuredImage = env.payloadPlaceholderImageId;
    (data.seo as Record<string, unknown>).ogImage = env.payloadPlaceholderImageId;
  }

  let post: PayloadPost;
  let created = false;
  if (item.external_id) {
    // Never overwrite something an editor has already published.
    const current = await payloadFetch<PayloadPost>(`/${coll}/${item.external_id}?depth=0`);
    if (current.status === "published") throw new Error("this post is already published in Payload; edit it there");
    post = (await payloadFetch<{ doc: PayloadPost }>(`/${coll}/${item.external_id}`, { method: "PATCH", body: JSON.stringify(data) })).doc;
  } else {
    const clash = await payloadFetch<{ totalDocs: number }>(`/${coll}?where[slug][equals]=${encodeURIComponent(fm.slug ?? "")}&limit=1&depth=0`);
    if (clash.totalDocs > 0) throw new Error(`slug "${fm.slug}" already exists in Payload; change the slug in the draft`);
    post = (await payloadFetch<{ doc: PayloadPost }>(`/${coll}`, { method: "POST", body: JSON.stringify(data) })).doc;
    created = true;
  }

  const path = `/blog/${post.slug}`;
  if (item.pub_id) {
    await sql`update publications set external_id = ${post.id}, url = ${SITE + path}, page_path = ${path}, status = 'draft' where id = ${item.pub_id}`;
  } else {
    await sql`
      insert into publications (content_item_id, channel, external_id, url, page_path, status)
      values (${item.id}, 'website', ${post.id}, ${SITE + path}, ${path}, 'draft')`;
  }
  return { postId: post.id, created };
}

/** Daily: mark items published once an editor publishes them in Payload. */
export async function syncPayloadPublications(): Promise<{ checked: number; nowLive: number }> {
  if (!payloadReady().ok) return { checked: 0, nowLive: 0 };
  const pubs = await sql<{ id: string; content_item_id: string; external_id: string }[]>`
    select id, content_item_id, external_id from publications
    where channel = 'website' and status = 'draft' and external_id is not null`;
  let nowLive = 0;
  for (const p of pubs) {
    try {
      const post = await payloadFetch<PayloadPost>(`/${env.payloadPostsCollection}/${p.external_id}?depth=0`);
      if (post.status !== "published") continue;
      await sql`update publications set status = 'live', published_at = ${post.publishedAt ?? new Date().toISOString()}, url = ${`${SITE}/blog/${post.slug}`}, page_path = ${`/blog/${post.slug}`} where id = ${p.id}`;
      await sql`update content_items set status = 'published' where id = ${p.content_item_id}`;
      await sql`update topics set status = 'done' where id = (select topic_id from content_items where id = ${p.content_item_id})`;
      nowLive++;
    } catch {
      // deleted in Payload or temporarily unavailable: check again tomorrow
    }
  }
  return { checked: pubs.length, nowLive };
}
