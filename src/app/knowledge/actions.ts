"use server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";

const KINDS = ["fact_sheet", "style_guide", "banned_phrases", "review_checklist"];

export async function saveKnowledge(_prev: string | null, form: FormData): Promise<string> {
  const kind = String(form.get("kind"));
  if (!KINDS.includes(kind)) return "Unknown document";
  await sql`update knowledge_docs set content = ${String(form.get("content") ?? "")} where kind = ${kind}`;
  revalidatePath("/knowledge");
  return `Saved ${new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Tokyo" })} JST. Rebuild prompt packs to use it.`;
}
