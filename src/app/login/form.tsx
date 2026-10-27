"use client";
import { useActionState } from "react";
import { sendLink } from "./actions";

export function LoginForm() {
  const [msg, action, pending] = useActionState(sendLink, null);
  return (
    <form action={action} className="space-y-3">
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@renesistech.com"
        className="min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 shadow-[0_1px_2px_rgba(16,24,40,0.05)] focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
      />
      <button disabled={pending} className="min-h-11 w-full rounded-lg bg-accent px-3 py-2 font-semibold text-white hover:bg-accent-ink disabled:opacity-50">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {msg && <p className="text-sm text-body">{msg}</p>}
    </form>
  );
}
