"use server";
import { sql } from "@/lib/db";

/** 👍 (1), 👎 (-1) or clear (0) a story. Gemini reads these as examples on its next scoring run. */
export async function rateStory(id: string, value: 1 | -1 | 0): Promise<{ ok: boolean }> {
  if (!/^[0-9a-f-]{36}$/.test(id) || ![1, -1, 0].includes(value)) return { ok: false };
  const rows = await sql`
    update stories set feedback = ${value === 0 ? null : value}, feedback_at = ${value === 0 ? null : sql`now()`}
    where id = ${id} returning id`;
  return { ok: rows.length > 0 };
}
