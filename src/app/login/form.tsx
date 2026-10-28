"use client";
import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@renesistech.com"
          className="mt-1.5 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 shadow-[0_1px_2px_rgba(16,24,40,0.05)] focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
        />
      </label>
      <button disabled={pending} className="min-h-11 w-full rounded-lg bg-accent px-3 py-2 font-semibold text-white hover:bg-accent-ink disabled:opacity-50">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {state?.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
    </form>
  );
}
