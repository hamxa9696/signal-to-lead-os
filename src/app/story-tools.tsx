"use client";
// Copy-package and Save-for-later buttons used on every story and article.
import { useState, useTransition } from "react";
import { toggleSaved } from "./trends/actions";

const BTN = "inline-flex min-h-8 items-center gap-1.5 rounded-[7px] border border-line-strong bg-surface px-2.5 text-[12.5px] text-body hover:bg-subtle";

/** Copies the story's package (sources, facts, why, suggested formats) to the clipboard. */
export function CopyButton({ text, label = "Copy package" }: { text: string; label?: string }) {
  const [done, setDone] = useState<"ok" | "fail" | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone("ok");
    } catch {
      // Clipboard blocked (e.g. not focused): fall back to a hidden textarea.
      const t = document.createElement("textarea");
      t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      const ok = document.execCommand("copy");
      t.remove();
      setDone(ok ? "ok" : "fail");
    }
    setTimeout(() => setDone(null), 2000);
  };
  return (
    <button type="button" onClick={copy} className={BTN}>
      {done === "ok" ? "✓ Copied" : done === "fail" ? "Couldn't copy" : <>⧉ {label}</>}
    </button>
  );
}

/** Marks a story or article to decide on later; listed under Signals › Saved. */
export function SaveButton({ kind, id, initial }: { kind: "story" | "signal"; id: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [, start] = useTransition();
  const flip = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      const r = await toggleSaved(kind, id, next).catch(() => ({ ok: false }));
      if (!r.ok) setOn(!next);
    });
  };
  return (
    <button type="button" aria-pressed={on} onClick={flip} className={on ? `${BTN} border-accent bg-accent-soft font-semibold text-accent-ink` : BTN}>
      {on ? "★ Saved" : "☆ Save for later"}
    </button>
  );
}
