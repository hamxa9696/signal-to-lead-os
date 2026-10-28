"use client";
import { useActionState } from "react";
import { generateAction, resortAction, type Msg } from "./actions";

function Note({ m }: { m: Msg }) {
  if (!m) return null;
  return <p role="status" className={`text-[13px] ${m.ok ? "text-good" : "text-bad"}`}>{m.message}</p>;
}

export function GenerateButton({ profileId, label, primary }: { profileId?: string; label: string; primary?: boolean }) {
  const [m, action, pending] = useActionState(generateAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {profileId && <input type="hidden" name="profile_id" value={profileId} />}
      <button disabled={pending} className={primary ? "btn-primary" : "btn"}>{pending ? "Asking Gemini…" : label}</button>
      <Note m={m} />
    </form>
  );
}

export function ResortButton() {
  const [m, action, pending] = useActionState(resortAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <button disabled={pending} className="btn">{pending ? "Sorting… (1–3 min)" : "Re-sort signals now"}</button>
      <Note m={m} />
    </form>
  );
}
