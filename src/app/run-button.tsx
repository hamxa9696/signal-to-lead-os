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
        className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50"
      >
        {pending ? "Running…" : label}
      </button>
      {summary && <span className={`max-w-56 text-xs ${last?.ok ? "text-white/50" : "text-amber-300"}`}>{summary}</span>}
    </form>
  );
}
