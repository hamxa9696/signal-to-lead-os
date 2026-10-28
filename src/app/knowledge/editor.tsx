"use client";
import { useActionState } from "react";
import { saveKnowledge } from "./actions";

export function KnowledgeEditor({ kind, content, rows }: { kind: string; content: string; rows: number }) {
  const [msg, action, pending] = useActionState(saveKnowledge, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="kind" value={kind} />
      <textarea
        name="content"
        defaultValue={content}
        rows={rows}
        lang="ja"
        className="w-full rounded-lg border border-line-strong bg-surface p-3 font-mono text-xs leading-relaxed focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
      />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary">
          {pending ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-sm text-faint">{msg}</span>}
      </div>
    </form>
  );
}
