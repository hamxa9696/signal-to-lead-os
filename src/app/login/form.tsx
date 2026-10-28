"use client";
import { useActionState, useState } from "react";
import { createAccount, requestReset, signIn, type LoginState } from "./actions";

const input =
  "min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 shadow-[0_1px_2px_rgba(16,24,40,0.05)] focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft";

type Mode = "signin" | "create" | "reset";

function Message({ state }: { state: LoginState }) {
  if (!state) return null;
  if (state.error) return <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>;
  return <p className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">{state.info}</p>;
}

const link = "font-semibold text-accent-ink hover:underline";

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [signInState, signInAction, signingIn] = useActionState(signIn, null);
  const [createState, createAction, creating] = useActionState(createAccount, null);
  const [resetState, resetAction, resetting] = useActionState(requestReset, null);

  const action = mode === "create" ? createAction : mode === "reset" ? resetAction : signInAction;
  const state = mode === "create" ? createState : mode === "reset" ? resetState : signInState;
  const pending = signingIn || creating || resetting;
  const label =
    mode === "create" ? (creating ? "Creating…" : "Create account") : mode === "reset" ? (resetting ? "Sending…" : "Email me a reset link") : signingIn ? "Signing in…" : "Sign in";

  return (
    <div className="space-y-4">
      {mode !== "signin" && (
        <p className="text-sm font-semibold">{mode === "create" ? "Create your password" : "Reset your password"}</p>
      )}
      <form action={action} className="space-y-3">
        <label className="block text-sm font-medium">
          Email
          <input name="email" type="email" required autoComplete="email" placeholder="you@renesistech.com" className={`mt-1.5 ${input}`} />
        </label>
        {mode !== "reset" && (
          <label className="block text-sm font-medium">
            <span className="flex items-baseline justify-between">
              Password
              {mode === "signin" && (
                <button type="button" onClick={() => setMode("reset")} className="text-[13px] font-medium text-accent-ink hover:underline">
                  Forgot password?
                </button>
              )}
            </span>
            <input
              name="password"
              type="password"
              required
              minLength={mode === "create" ? 8 : undefined}
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              className={`mt-1.5 ${input}`}
            />
          </label>
        )}
        {mode === "create" && (
          <label className="block text-sm font-medium">
            Confirm password
            <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={`mt-1.5 ${input}`} />
          </label>
        )}
        <button disabled={pending} className="min-h-11 w-full rounded-lg bg-accent px-3 py-2 font-semibold text-white hover:bg-accent-ink disabled:opacity-50">
          {label}
        </button>
        <Message state={state} />
      </form>
      <p className="text-center text-sm text-muted">
        {mode === "signin" ? (
          <>
            First time here?{" "}
            <button type="button" onClick={() => setMode("create")} className={link}>Create your password</button>
          </>
        ) : (
          <>
            {mode === "create" ? "Already have an account? " : "Remembered it? "}
            <button type="button" onClick={() => setMode("signin")} className={link}>Sign in</button>
          </>
        )}
      </p>
    </div>
  );
}
