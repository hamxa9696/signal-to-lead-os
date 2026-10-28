"use client";
import { useActionState } from "react";
import { setNewPassword } from "../login/actions";

const input =
  "min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 shadow-[0_1px_2px_rgba(16,24,40,0.05)] focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft";

export function ResetForm() {
  const [state, action, pending] = useActionState(setNewPassword, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-medium">
        New password
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={`mt-1.5 ${input}`} />
      </label>
      <label className="block text-sm font-medium">
        Confirm new password
        <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={`mt-1.5 ${input}`} />
      </label>
      <button disabled={pending} className="min-h-11 w-full rounded-lg bg-accent px-3 py-2 font-semibold text-white hover:bg-accent-ink disabled:opacity-50">
        {pending ? "Saving…" : "Save password and continue"}
      </button>
      {state?.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
    </form>
  );
}
