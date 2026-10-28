"use client";
import { useFormStatus } from "react-dom";

export function Submit({ label = "Save", danger = false, formAction }: { label?: string; danger?: boolean; formAction?: (f: FormData) => Promise<void> }) {
  const { pending } = useFormStatus();
  return (
    <button
      formAction={formAction}
      disabled={pending}
      className={
        danger
          ? "rounded-lg px-3 py-1.5 text-[13px] font-medium text-bad hover:bg-bad-soft disabled:opacity-50"
          : "rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent-ink disabled:opacity-50"
      }
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
