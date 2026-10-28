"use client";
import { useState, useTransition } from "react";
import { rateStory } from "./actions";

/** 👍 / 👎 that update instantly; Gemini learns from them on the next morning run. */
export function Rate({ id, initial }: { id: string; initial: number | null }) {
  const [v, setV] = useState<number | null>(initial);
  const [, start] = useTransition();
  const set = (next: 1 | -1) => {
    const before = v;
    const value = v === next ? 0 : next;
    setV(value === 0 ? null : value);
    start(async () => {
      const r = await rateStory(id, value as 1 | -1 | 0).catch(() => ({ ok: false }));
      if (!r.ok) setV(before);
    });
  };
  const btn = (on: boolean, tone: string) =>
    `inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 text-[13px] ${on ? tone : "border-line-strong bg-surface text-faint hover:text-ink"}`;
  return (
    <span className="inline-flex items-center gap-1" title="Useful for your content? Gemini learns from your votes.">
      <button type="button" aria-pressed={v === 1} aria-label="Useful" onClick={() => set(1)} className={btn(v === 1, "border-good bg-good-soft text-good")}>👍</button>
      <button type="button" aria-pressed={v === -1} aria-label="Not useful" onClick={() => set(-1)} className={btn(v === -1, "border-bad bg-bad-soft text-bad")}>👎</button>
    </span>
  );
}
