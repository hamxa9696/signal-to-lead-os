// Gemini review pass: a second model checks the draft against the checklist and fact sheet.
import "server-only";
import { z } from "zod";
import { generateJson } from "@/lib/gemini";
import type { Check } from "./checks";
import type { ParsedDraft } from "./draft";
import type { Knowledge } from "./knowledge";
import type { TopicFull } from "./topic";

export const PASS_SCORE = 75;

const ReviewOut = z.object({
  scores: z.array(z.object({ id: z.string(), score: z.number().min(1).max(5), note: z.string().catch("") })).catch([]),
  issues: z
    .array(
      z.object({
        severity: z.enum(["high", "medium", "low"]).catch("medium"),
        quote: z.string().catch(""),
        problem: z.string(),
        fix: z.string().catch(""),
      }),
    )
    .catch([]),
  overall: z.number().min(0).max(100),
  summary: z.string().catch(""),
});
export type AiReview = z.infer<typeof ReviewOut>;

export type ReviewResult = {
  ai: AiReview | null;
  aiError: string | null;
  checks: Check[];
  passed: boolean;
  reasons: string[];
  model_note: string;
};

function prompt(d: ParsedDraft, t: TopicFull, k: Knowledge): string {
  return [
    "You are a strict native-Japanese editor reviewing a B2B blog draft for Renesis Tech Japan before publication.",
    "Judge it as a Japanese 情報システム部門 manager would read it. Be specific; quote the exact Japanese text you criticise.",
    "",
    "Score each CHECKLIST item 1–5 (5 = publishable as is). List concrete issues with severity:",
    "- high: factual claim not supported by the FACT SHEET, invented client/number/price, wrong or misleading statement,",
    "  clearly unnatural Japanese that would embarrass the brand.",
    "- medium: awkward phrasing, filler, weak structure, missing intent coverage.",
    "- low: polish.",
    "Always flag as high: a title that promises a number (e.g. 10項目, 5つ, 7選) the content does not deliver.",
    "For every issue give `quote` (exact text from the draft, ≤ 80 chars), `problem` (English), `fix` (concrete Japanese rewrite or instruction).",
    "overall: 0–100 publishability. summary: 2 English sentences.",
    "",
    `TOPIC: ${t.title_ja} | primary keyword: ${t.primary_keyword} | secondary: ${t.secondary_keywords.join("、")} | intent: ${t.search_intent}`,
    `TYPE: ${t.kind === "lead_magnet" ? `lead magnet (${t.magnet_format})` : "SEO article"}`,
    "",
    "CHECKLIST (id: what good looks like):",
    ...k.checklist.map((c) => `- ${c.id}: ${c.label}`),
    "",
    "FACT SHEET (the only allowed source for Renesis-specific claims):",
    k.factSheet.slice(0, 6000),
    "",
    "DRAFT:",
    `title: ${d.frontmatter.title ?? ""}`,
    `meta_description: ${d.frontmatter.meta_description ?? ""}`,
    "",
    d.body.slice(0, 24000),
    "",
    'Return ONLY JSON: {"scores":[{"id","score","note"}],"issues":[{"severity","quote","problem","fix"}],"overall":0,"summary":""}',
  ].join("\n");
}

export async function reviewDraft(d: ParsedDraft, t: TopicFull, k: Knowledge, checks: Check[]): Promise<ReviewResult> {
  let ai: AiReview | null = null;
  let aiError: string | null = null;
  try {
    ai = await generateJson(prompt(d, t, k), ReviewOut, { temperature: 0.1 });
  } catch (err) {
    aiError = (err as Error).message.slice(0, 500);
  }

  const reasons: string[] = [];
  for (const c of checks) if (c.blocking && !c.ok) reasons.push(`${c.label}: ${c.detail}`);
  if (!ai) reasons.push("AI review did not run");
  else {
    if (ai.overall < PASS_SCORE) reasons.push(`AI overall score ${ai.overall} < ${PASS_SCORE}`);
    const high = ai.issues.filter((i) => i.severity === "high").length;
    if (high) reasons.push(`${high} high-severity issue(s)`);
    const low = ai.scores.filter((s) => s.score < 3).map((s) => s.id);
    if (low.length) reasons.push(`checklist below 3/5: ${low.join(", ")}`);
  }
  return { ai, aiError, checks, passed: reasons.length === 0, reasons, model_note: "Gemini review (cross-model)" };
}

/** Prompt to paste back into the same ChatGPT/Claude conversation to fix the draft. */
export function buildRevisionPrompt(r: ReviewResult): string {
  const failed = r.checks.filter((c) => !c.ok);
  const issues = r.ai?.issues ?? [];
  return [
    "An editor reviewed your draft. Revise it and return the COMPLETE article again in exactly the same",
    "output format (frontmatter + Markdown). Keep what works; fix everything below. Do not add new unsupported facts.",
    "",
    ...(failed.length ? ["## Format and SEO checks that failed", ...failed.map((c) => `- ${c.label} (now: ${c.detail})`), ""] : []),
    ...(issues.length
      ? [
          "## Editor's issues",
          ...issues.map((i, n) => `${n + 1}. [${i.severity}] 「${i.quote}」: ${i.problem}${i.fix ? `\n   → 修正案: ${i.fix}` : ""}`),
          "",
        ]
      : []),
    ...(r.checks.some((c) => c.id === "unresolved" && !c.ok)
      ? ["## [要確認] markers", "- Replace each with a fact from the FACT SHEET, rephrase without the number, or remove the claim.", ""]
      : []),
  ].join("\n");
}
