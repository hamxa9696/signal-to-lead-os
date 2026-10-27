"use client";
import { useActionState } from "react";
import { runJobAction } from "./actions";

export function RunButton({ job, label, force = false }: { job: string; label: string; force?: boolean }) {
  const [result, action, pending] = useActionState(runJobAction, null);
  const last = result?.[result.length - 1];
  const summary = !last
    ? null
    : !last.ok
      ? `failed: ${last.error}`
      : last.result?.status === "skipped"
        ? `skipped: ${last.result.note ?? ""}`
        : "done";

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="job" value={job} />
      {force && <input type="hidden" name="force" value="1" />}
      <button
        disabled={pending}
        className="min-h-10 rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:bg-subtle disabled:opacity-50"
      >
        {pending ? "Running…" : label}
      </button>
      {summary && <span className={`max-w-56 text-xs ${last?.ok ? "text-faint" : "text-warn"}`}>{summary}</span>}
    </form>
  );
}
