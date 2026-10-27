// Fact sheet, style guide, banned phrases and review checklist (editable on /knowledge).
import "server-only";
import { sql } from "@/lib/db";

export type ChecklistItem = { id: string; label: string };
export type Knowledge = {
  factSheet: string;
  styleGuide: string;
  bannedPhrases: string[];
  checklist: ChecklistItem[];
};

export async function getKnowledge(): Promise<Knowledge> {
  const rows = await sql<{ kind: string; content: string }[]>`select kind, content from knowledge_docs`;
  const get = (k: string) => rows.find((r) => r.kind === k)?.content.trim() ?? "";
  return {
    factSheet: get("fact_sheet"),
    styleGuide: get("style_guide"),
    bannedPhrases: get("banned_phrases").split("\n").map((l) => l.trim()).filter(Boolean),
    // "id: description" per line
    checklist: get("review_checklist")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes(":"))
      .map((l) => ({ id: l.slice(0, l.indexOf(":")).trim(), label: l.slice(l.indexOf(":") + 1).trim() })),
  };
}
