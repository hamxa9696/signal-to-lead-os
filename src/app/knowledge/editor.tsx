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
        className="w-full rounded-md border border-white/15 bg-black/30 p-3 font-mono text-xs leading-relaxed"
      />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-sm text-black hover:bg-emerald-400 disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-sm text-white/50">{msg}</span>}
      </div>
    </form>
  );
}
