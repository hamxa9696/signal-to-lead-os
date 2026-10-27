"use client";
import { useActionState } from "react";
import { setupBrevoAction, testMakeAction, type State } from "./actions";

function ActionButton({ act, label, disabled }: { act: () => Promise<State>; label: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(act, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button disabled={pending || disabled} className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-sm text-black hover:bg-emerald-400 disabled:opacity-50">
        {pending ? "Working…" : label}
      </button>
      {state && <span className={`text-sm ${state.ok ? "text-emerald-300" : "text-amber-300"}`}>{state.message}</span>}
    </form>
  );
}

export const SetupBrevo = ({ disabled, again }: { disabled?: boolean; again?: boolean }) => (
  <ActionButton act={setupBrevoAction} label={again ? "Re-check Brevo setup" : "Set up Brevo"} disabled={disabled} />
);
export const TestMake = ({ disabled }: { disabled?: boolean }) => <ActionButton act={testMakeAction} label="Send test to Make" disabled={disabled} />;
