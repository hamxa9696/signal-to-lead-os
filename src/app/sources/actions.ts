"use server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { fetchXml, parseFeed } from "@/lib/feeds";
import { googleNewsUrl } from "@/lib/research";

export type AddState = { ok: boolean; message: string } | null;
const UUID = /^[0-9a-f-]{36}$/;

export async function toggleSource(form: FormData): Promise<void> {
  const id = String(form.get("id"));
  if (!UUID.test(id)) return;
  await sql`update sources set active = not active where id = ${id}`;
  revalidatePath("/sources");
}

export async function deleteSource(form: FormData): Promise<void> {
  const id = String(form.get("id"));
  if (!UUID.test(id)) return;
  // Only sources the owner added; signals already used by topics keep the topic intact.
  await sql`delete from sources where id = ${id} and category in ('keyword_search', 'custom')`;
  revalidatePath("/sources");
}

async function addFeed(name: string, url: string, category: string): Promise<AddState> {
  let items: ReturnType<typeof parseFeed>;
  try {
    items = parseFeed(await fetchXml(url));
  } catch (err) {
    return { ok: false, message: `Could not read that feed: ${(err as Error).message}` };
  }
  if (!items.length) return { ok: false, message: "That URL is reachable but has no feed items (is it an RSS/Atom feed?)." };
  const [dup] = await sql`select 1 from sources where url = ${url}`;
  if (dup) return { ok: false, message: "That source is already in the list." };
  await sql`insert into sources (kind, name, url, category) values ('rss', ${name}, ${url}, ${category})`;
  revalidatePath("/sources");
  return { ok: true, message: `Added: ${items.length} items found. They arrive with the next collection run.` };
}

export async function addKeyword(_prev: AddState, form: FormData): Promise<AddState> {
  const q = String(form.get("keyword") ?? "").trim();
  if (q.length < 2) return { ok: false, message: "Enter a Japanese search phrase." };
  return addFeed(`Google News: ${q}`, googleNewsUrl(q, 14), "keyword_search");
}

export async function addRss(_prev: AddState, form: FormData): Promise<AddState> {
  const url = String(form.get("url") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  if (!/^https?:\/\//.test(url)) return { ok: false, message: "Enter the feed URL (https://…)." };
  return addFeed(name || new URL(url).hostname, url, "custom");
}
