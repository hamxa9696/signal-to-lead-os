"use client";
import { useActionState, useState } from "react";
import { createAccount, signIn, type LoginState } from "./actions";

const input =
  "min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 shadow-[0_1px_2px_rgba(16,24,40,0.05)] focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft";

function Message({ state }: { state: LoginState }) {
  if (!state) return null;
  if (state.error) return <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>;
  return <p className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">{state.info}</p>;
}

export function LoginForm() {
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [signInState, signInAction, signingIn] = useActionState(signIn, null);
  const [createState, createAction, creating] = useActionState(createAccount, null);
  const creatingMode = mode === "create";

  return (
    <div className="space-y-4">
      <form action={creatingMode ? createAction : signInAction} className="space-y-3">
        <label className="block text-sm font-medium">
          Email
          <input name="email" type="email" required autoComplete="email" placeholder="you@renesistech.com" className={`mt-1.5 ${input}`} />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={creatingMode ? 8 : undefined}
            autoComplete={creatingMode ? "new-password" : "current-password"}
            className={`mt-1.5 ${input}`}
          />
        </label>
        {creatingMode && (
          <label className="block text-sm font-medium">
            Confirm password
            <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={`mt-1.5 ${input}`} />
          </label>
        )}
        <button
          disabled={signingIn || creating}
          className="min-h-11 w-full rounded-lg bg-accent px-3 py-2 font-semibold text-white hover:bg-accent-ink disabled:opacity-50"
        >
          {creatingMode ? (creating ? "Creating…" : "Create account") : signingIn ? "Signing in…" : "Sign in"}
        </button>
        <Message state={creatingMode ? createState : signInState} />
      </form>
      <p className="text-center text-sm text-muted">
        {creatingMode ? "Already have an account? " : "First time here? "}
        <button type="button" onClick={() => setMode(creatingMode ? "signin" : "create")} className="font-semibold text-accent-ink hover:underline">
          {creatingMode ? "Sign in" : "Create your password"}
        </button>
      </p>
    </div>
  );
}
