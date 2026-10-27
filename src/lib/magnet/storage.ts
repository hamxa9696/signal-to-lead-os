// Public hosting for lead-magnet PDFs: a public Supabase Storage bucket.
// URLs are predictable (<base>/<slug>.pdf), so Make.com can build the download link from the slug.
import "server-only";
import { readFileSync } from "node:fs";
import { env, has } from "@/lib/env";

export const BUCKET = "lead-magnets";

export function storageReady(): { ok: boolean; reason?: string } {
  if (!has(env.supabaseUrl) || !has(env.supabaseServiceRoleKey)) {
    return { ok: false, reason: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (SETUP.md §9)" };
  }
  return { ok: true };
}

/** Base URL for download links, e.g. https://xyz.supabase.co/storage/v1/object/public/lead-magnets */
export function downloadBaseUrl(): string | null {
  if (has(env.leadMagnetBaseUrl)) return env.leadMagnetBaseUrl.replace(/\/$/, "");
  if (has(env.supabaseUrl)) return `${env.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}`;
  return null;
}

async function storageFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${env.supabaseUrl.replace(/\/$/, "")}/storage/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.supabaseServiceRoleKey}`, apikey: env.supabaseServiceRoleKey, ...init.headers },
    signal: AbortSignal.timeout(60_000),
  });
}

async function ensureBucket(): Promise<void> {
  const res = await storageFetch(`/bucket/${BUCKET}`, { method: "GET" });
  if (res.ok) return;
  const create = await storageFetch("/bucket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, allowed_mime_types: ["application/pdf"], file_size_limit: 20 * 1024 * 1024 }),
  });
  if (!create.ok && create.status !== 409) throw new Error(`could not create bucket: ${create.status} ${await create.text()}`);
}

export async function uploadPdf(localPath: string, slug: string): Promise<string> {
  const ready = storageReady();
  if (!ready.ok) throw new Error(ready.reason);
  await ensureBucket();
  const res = await storageFetch(`/object/${BUCKET}/${slug}.pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf", "x-upsert": "true", "Cache-Control": "max-age=300" },
    body: readFileSync(localPath),
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
  return `${downloadBaseUrl()}/${slug}.pdf`;
}
