// Lead magnet: approved version → PDF → public storage.
import "server-only";
import { sql } from "@/lib/db";
import type { Frontmatter } from "@/lib/content/draft";
import { magnetHtml, renderPdf } from "./pdf";
import { uploadPdf } from "./storage";

type MagnetRow = {
  item_id: string; status: string; version_id: string; body_md: string; frontmatter: Frontmatter;
  magnet_format: string | null; service_name: string | null; service_url: string | null;
};

async function loadMagnet(topicId: string): Promise<MagnetRow> {
  const [row] = await sql<MagnetRow[]>`
    select ci.id as item_id, ci.status, v.id as version_id, v.body_md, v.frontmatter,
           t.magnet_format, sv.name_ja as service_name, sv.landing_url as service_url
    from content_items ci
    join content_versions v on v.id = ci.current_version_id
    join topics t on t.id = ci.topic_id
    left join services sv on sv.id = t.service_id
    where ci.topic_id = ${topicId} and ci.parent_id is null and ci.type = 'lead_magnet'`;
  if (!row) throw new Error("no lead-magnet draft for this topic yet");
  return row;
}

export async function buildMagnetPdf(topicId: string): Promise<{ bytes: number; pages: number }> {
  const m = await loadMagnet(topicId);
  if (m.status !== "ready" && m.status !== "published") throw new Error("the lead magnet must pass review (or be accepted) first");
  const slug = m.frontmatter.slug;
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error("the draft needs a valid slug");
  const html = magnetHtml({ fm: m.frontmatter, body: m.body_md, format: m.magnet_format, serviceName: m.service_name, serviceUrl: m.service_url });
  const r = await renderPdf(html, slug);
  await sql`
    insert into magnet_files (content_item_id, version_id, slug, local_path, bytes, pages)
    values (${m.item_id}, ${m.version_id}, ${slug}, ${r.path}, ${r.bytes}, ${r.pages})
    on conflict (content_item_id) do update set
      version_id = excluded.version_id, slug = excluded.slug, local_path = excluded.local_path,
      bytes = excluded.bytes, pages = excluded.pages, created_at = now()`;
  return { bytes: r.bytes, pages: r.pages };
}

export async function uploadMagnetPdf(topicId: string): Promise<string> {
  const m = await loadMagnet(topicId);
  const [f] = await sql<{ local_path: string; slug: string; version_id: string }[]>`
    select local_path, slug, version_id from magnet_files where content_item_id = ${m.item_id}`;
  if (!f) throw new Error("build the PDF first");
  if (f.version_id !== m.version_id) throw new Error("the PDF is from an older version; rebuild it first");
  const url = await uploadPdf(f.local_path, f.slug);
  await sql`update magnet_files set public_url = ${url}, uploaded_at = now() where content_item_id = ${m.item_id}`;
  return url;
}
