"use client";
import { useActionState } from "react";
import { pushToPayloadAction, rerunReviewAction, saveDraftAction, type ActionState } from "./actions";

function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return <p className={`text-sm ${state.ok ? "text-emerald-300" : "text-amber-300"}`}>{state.message}</p>;
}

const btn = "rounded-md px-3 py-1.5 text-sm disabled:opacity-50";

export function DraftForm({ topicId }: { topicId: string }) {
  const [state, action, pending] = useActionState(saveDraftAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="topicId" value={topicId} />
      <textarea
        name="draft"
        required
        rows={12}
        lang="ja"
        placeholder={"---\ntitle: …\nslug: …\nmeta_title: …\nmeta_description: …\nexcerpt: …\n---\n\n## …"}
        className="w-full rounded-md border border-white/15 bg-black/30 p-3 font-mono text-xs leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-white/60">
          Drafted by{" "}
          <select name="draftedBy" defaultValue="claude" className="ml-1 rounded border border-white/15 bg-black/30 px-2 py-1">
            <option value="claude">Claude</option>
            <option value="chatgpt">ChatGPT</option>
            <option value="gemini">Gemini</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <button disabled={pending} className={`${btn} bg-emerald-500/90 text-black hover:bg-emerald-400`}>
          {pending ? "Saving + reviewing… (up to a minute)" : "Save & review"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function RerunReview({ topicId }: { topicId: string }) {
  const [state, action, pending] = useActionState(rerunReviewAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="topicId" value={topicId} />
      <button disabled={pending} className={`${btn} border border-white/15 hover:bg-white/10`}>
        {pending ? "Reviewing…" : "Re-run review"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function PushToPayload({ topicId, itemId, disabled, label }: { topicId: string; itemId: string; disabled?: boolean; label: string }) {
  const [state, action, pending] = useActionState(pushToPayloadAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="topicId" value={topicId} />
      <input type="hidden" name="itemId" value={itemId} />
      <button disabled={pending || disabled} className={`${btn} bg-sky-400/90 text-black hover:bg-sky-300`}>
        {pending ? "Sending…" : label}
      </button>
      <Status state={state} />
    </form>
  );
}
