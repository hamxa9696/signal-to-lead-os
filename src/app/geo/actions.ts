"use server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { weekOf } from "@/lib/week";
import { planFormats } from "@/lib/format-plan";

const MANUAL_ENGINES = ["chatgpt_manual", "gemini_manual", "copilot_manual"];

/** Weekly manual check: was Renesis cited / mentioned / absent in this assistant's answer? */
export async function saveManualCheck(questionId: string, engine: string, result: "cited" | "mentioned" | "absent" | "clear", competitors?: string): Promise<{ ok: boolean }> {
  if (!/^[0-9a-f-]{36}$/.test(questionId) || !MANUAL_ENGINES.includes(engine)) return { ok: false };
  if (result === "clear") {
    await sql`delete from geo_checks where question_id = ${questionId} and engine = ${engine}`;
    return { ok: true };
  }
  const domains = (competitors ?? "").split(/[\s,、]+/).map((d) => d.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]).filter((d) => d.includes("."));
  await sql`
    insert into geo_checks (question_id, engine, citations, we_cited, we_mentioned, our_position)
    values (${questionId}, ${engine}, ${sql.json(domains.map((d) => ({ url: `https://${d}`, title: d, domain: d })) as never)}, ${result === "cited"}, ${result !== "absent"}, null)
    on conflict (question_id, engine) do update set we_cited = excluded.we_cited, we_mentioned = excluded.we_mentioned,
      citations = case when jsonb_array_length(excluded.citations) > 0 then excluded.citations else geo_checks.citations end, checked_at = now()`;
  return { ok: true };
}

/** Turn a GEO gap (a question we have no good page for) into a proposed evergreen topic. */
export async function topicFromQuestion(questionId: string): Promise<{ ok: boolean; id?: string }> {
  if (!/^[0-9a-f-]{36}$/.test(questionId)) return { ok: false };
  const [q] = await sql<{ question: string; keywords: string[]; intent: string | null; category_id: string | null }[]>`
    select question, keywords, intent, category_id from geo_questions where id = ${questionId}`;
  if (!q) return { ok: false };
  const svc = await sql<{ id: string }[]>`select id from services where category_id = ${q.category_id} and active order by focus desc limit 1`;
  const [row] = await sql<{ id: string }[]>`
    insert into topics (kind, title_ja, primary_keyword, secondary_keywords, search_intent, service_id, rationale, outline, week_of, slot, status, score, score_breakdown)
    values ('article', ${q.question}, ${q.keywords.join(" ")}, ${q.keywords}, ${q.intent === "commercial" || q.intent === "transactional" ? q.intent : "informational"},
            ${svc[0]?.id ?? null}, ${"GEO gap: buyers ask AI assistants this question and renesistech.jp has no page that answers it. Write an answer-first article with a よくある質問 section."},
            ${sql.json(["結論：この質問への答え", "判断のポイント", "費用・期間の目安", "選び方と比較のポイント", "よくある質問"])}, ${weekOf()}, 'evergreen', 'approved', 50,
            ${sql.json({ demand: 20, demand_source: "estimate", gsc_impressions_28d: 0, fit: 20, freshness: 10, performance: 5, evergreen: true, performance_note: "GEO gap" })})
    returning id`;
  await planFormats([row.id]).catch(() => null);
  revalidatePath("/geo");
  revalidatePath("/topics");
  return { ok: true, id: row.id };
}
