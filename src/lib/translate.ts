// Japanese → English for the in-app English view. Cached forever in `translations`, so a
// string costs one Gemini call the first time anyone sees it and nothing after that.
import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { sql } from "./db";
import { generateJson } from "./gemini";

const BATCH_CHARS = 3_000;
const BATCH_ITEMS = 30;
const PARALLEL = 4;
const FAST_MODEL = "gemini-3.5-flash-lite"; // translation is easy; the lite model answers far faster
export const MAX_TEXT = 4_000; // longer strings are not translated (drafts are split into paragraphs by the DOM)

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

const Out = z.preprocess((v) => (Array.isArray(v) ? { items: v } : v), z.object({
  items: z.array(z.object({ i: z.number().int(), en: z.string() })),
}));

async function translateBatch(texts: string[]): Promise<Map<number, string>> {
  const { items } = await generateJson(
    [
      "Translate each Japanese text into natural, concise business English for an English-speaking manager.",
      "Keep numbers, company names, product names, URLs, Markdown and punctuation structure. Keep any English as is.",
      "Translate short UI fragments (labels, single words) as short fragments. Do not add explanations.",
      "",
      ...texts.map((t, i) => `[${i}] ${t}`),
      "",
      'Return ONLY JSON: {"items":[{"i":0,"en":"..."}]} with one entry per text.',
    ].join("\n"),
    Out,
    { temperature: 0.1, rounds: 2, prefer: FAST_MODEL },
  );
  return new Map(items.map((x) => [x.i, x.en]));
}

/** Translate many strings; returns { source: english } for every string it could translate. */
export async function translateMany(input: string[]): Promise<Record<string, string>> {
  const texts = [...new Set(input.map((t) => t.trim()).filter((t) => t && t.length <= MAX_TEXT))];
  if (!texts.length) return {};
  const out: Record<string, string> = {};
  const hashes = texts.map(hash);
  const cached = await sql<{ src_hash: string; en: string }[]>`select src_hash, en from translations where src_hash in ${sql(hashes)}`;
  const byHash = new Map(cached.map((c) => [c.src_hash, c.en]));
  const missing: string[] = [];
  texts.forEach((t, i) => {
    const en = byHash.get(hashes[i]);
    if (en != null) out[t] = en;
    else missing.push(t);
  });

  // Batch the misses by size.
  const batches: string[][] = [];
  let cur: string[] = [];
  let chars = 0;
  for (const t of missing) {
    if (cur.length && (chars + t.length > BATCH_CHARS || cur.length >= BATCH_ITEMS)) {
      batches.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(t);
    chars += t.length;
  }
  if (cur.length) batches.push(cur);

  const one = async (batch: string[]) => {
    let map: Map<number, string>;
    try {
      map = await translateBatch(batch);
    } catch {
      return; // left untranslated; retried next time the page is opened
    }
    const rows = batch.flatMap((src, i) => {
      const en = map.get(i)?.trim();
      return en ? [{ src_hash: hash(src), src, en }] : [];
    });
    for (const r of rows) out[r.src] = r.en;
    if (rows.length) await sql`insert into translations ${sql(rows)} on conflict (src_hash) do nothing`;
  };
  for (let i = 0; i < batches.length; i += PARALLEL) await Promise.all(batches.slice(i, i + PARALLEL).map(one));
  return out;
}
