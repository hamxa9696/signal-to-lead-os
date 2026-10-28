"use client";
import { useActionState } from "react";
import { buildPdfAction, pushToPayloadAction, rerunReviewAction, researchAction, saveDraftAction, uploadPdfAction, type ActionState } from "./actions";

function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return <p className={`text-sm ${state.ok ? "text-good" : "text-warn"}`}>{state.message}</p>;
}

const btn = "inline-flex min-h-9 items-center rounded-lg px-3.5 py-1.5 text-sm font-medium disabled:opacity-50";

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
        className="w-full rounded-lg border border-line-strong bg-surface p-3 font-mono text-xs leading-relaxed focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted">
          Drafted by{" "}
          <select name="draftedBy" defaultValue="claude" className="ml-1 rounded border border-line-strong bg-surface px-2 py-1">
            <option value="claude">Claude</option>
            <option value="chatgpt">ChatGPT</option>
            <option value="gemini">Gemini</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <button disabled={pending} className={`${btn} bg-accent text-white hover:bg-accent-ink`}>
          {pending ? "Saving + reviewing… (up to a minute)" : "Save & review"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function ResearchButton({ topicId, again }: { topicId: string; again: boolean }) {
  const [state, action, pending] = useActionState(researchAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="topicId" value={topicId} />
      <button disabled={pending} className={`${btn} border border-line-strong hover:bg-subtle`}>
        {pending ? "Researching… (up to a minute)" : again ? "Research again" : "Research this topic"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function RerunReview({ topicId }: { topicId: string }) {
  const [state, action, pending] = useActionState(rerunReviewAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="topicId" value={topicId} />
      <button disabled={pending} className={`${btn} border border-line-strong hover:bg-subtle`}>
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
      <button disabled={pending || disabled} className={`${btn} bg-ink text-white hover:bg-body`}>
        {pending ? "Sending…" : label}
      </button>
      <Status state={state} />
    </form>
  );
}

function SimpleAction({ topicId, label, pendingLabel, act, disabled, primary }: {
  topicId: string; label: string; pendingLabel: string; disabled?: boolean; primary?: boolean;
  act: (prev: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const [state, action, pending] = useActionState(act, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="topicId" value={topicId} />
      <button disabled={pending || disabled} className={`${btn} ${primary ? "bg-ink text-white hover:bg-body" : "border border-line-strong hover:bg-subtle"}`}>
        {pending ? pendingLabel : label}
      </button>
      <Status state={state} />
    </form>
  );
}

export function BuildPdf({ topicId, disabled, rebuild }: { topicId: string; disabled?: boolean; rebuild?: boolean }) {
  return <SimpleAction topicId={topicId} act={buildPdfAction} disabled={disabled} primary={!rebuild} label={rebuild ? "Rebuild PDF" : "Build PDF"} pendingLabel="Rendering… (~10 s)" />;
}

export function UploadPdf({ topicId, disabled, again }: { topicId: string; disabled?: boolean; again?: boolean }) {
  return <SimpleAction topicId={topicId} act={uploadPdfAction} disabled={disabled} primary={!again} label={again ? "Re-upload PDF" : "Upload PDF (public link)"} pendingLabel="Uploading…" />;
}
