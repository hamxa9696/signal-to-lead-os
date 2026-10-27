import { sql } from "@/lib/db";
import { KnowledgeEditor } from "./editor";

export const dynamic = "force-dynamic";

const DOCS = [
  { kind: "fact_sheet", title: "Fact sheet", help: "The only source writers and the reviewer may use for Renesis-specific claims. Verify every line.", rows: 22 },
  { kind: "style_guide", title: "Japanese style guide", help: "Voice, structure and formatting rules included in every prompt pack.", rows: 18 },
  { kind: "banned_phrases", title: "Banned phrases", help: "One per line. Any match blocks a draft from passing review.", rows: 10 },
  { kind: "review_checklist", title: "Review checklist", help: "One per line as `id: what good looks like`. Gemini scores each 1–5.", rows: 10 },
];

export default async function KnowledgePage() {
  const rows = await sql<{ kind: string; content: string; updated_at: Date }[]>`select kind, content, updated_at from knowledge_docs`;
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-xl font-semibold">Knowledge</h1>
      <p className="mt-1 text-sm text-muted">
        These documents set the quality bar, since there is no human reviewer. Changes apply to new prompt packs and reviews.
      </p>
      <div className="mt-6 space-y-6">
        {DOCS.map((d) => {
          const row = rows.find((r) => r.kind === d.kind);
          return (
            <section key={d.kind} className="card p-4">
              <h2 className="font-semibold">{d.title}</h2>
              <p className="mb-3 text-sm text-faint">{d.help}</p>
              <KnowledgeEditor kind={d.kind} content={row?.content ?? ""} rows={d.rows} />
            </section>
          );
        })}
      </div>
    </main>
  );
}
