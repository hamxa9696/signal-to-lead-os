"use client";
import { useState, useTransition } from "react";
import { markSpoke } from "./spoke-actions";

/** "Posted" checkbox for a spoke; updates instantly, results are then counted per post. */
export function PostedToggle({ topicId, channel, initial, compact }: { topicId: string; channel: string; initial: boolean; compact?: boolean }) {
  const [on, setOn] = useState(initial);
  const [, start] = useTransition();
  const flip = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      const r = await markSpoke(topicId, channel, next).catch(() => ({ ok: false }));
      if (!r.ok) setOn(!next);
    });
  };
  return (
    <button
      type="button"
      onClick={flip}
      aria-pressed={on}
      title={on ? "Posted: click to undo" : "Mark as posted"}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 ${compact ? "py-0 text-[11px]" : "py-0.5 text-[12px]"} ${on ? "border-good bg-good-soft font-semibold text-good" : "border-line-strong bg-surface text-muted hover:text-ink"}`}
    >
      <span aria-hidden="true">{on ? "✓" : "○"}</span> {on ? "Posted" : "Mark posted"}
    </button>
  );
}
