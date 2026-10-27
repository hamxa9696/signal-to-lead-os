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
        className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2"
      />
      <button disabled={pending} className="w-full rounded-md bg-emerald-500/90 px-3 py-2 text-black hover:bg-emerald-400 disabled:opacity-50">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {msg && <p className="text-sm text-white/70">{msg}</p>}
    </form>
  );
}
