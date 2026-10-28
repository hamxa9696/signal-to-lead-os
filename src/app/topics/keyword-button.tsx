"use client";
import { useActionState } from "react";
import { keywordPlanAction } from "./[id]/actions";

export function KeywordButton({ topicId, again }: { topicId: string; again: boolean }) {
  const [state, action, pending] = useActionState(keywordPlanAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="topicId" value={topicId} />
      <button disabled={pending} className="btn !min-h-8 !px-3 !text-[12.5px]">
        {pending ? "Checking Google suggestions…" : again ? "Refresh suggestions" : "Suggest keywords"}
      </button>
      {state && <span className={`text-[12px] ${state.ok ? "text-good" : "text-bad"}`}>{state.message}</span>}
    </form>
  );
}
