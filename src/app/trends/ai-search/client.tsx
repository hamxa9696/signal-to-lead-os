"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { saveLinkedinStats, saveManualCheck, topicFromQuestion } from "./actions";

const OPTS = [
  { k: "cited", l: "Cited", cls: "border-good bg-good-soft text-good" },
  { k: "mentioned", l: "Named", cls: "border-accent bg-accent-soft text-accent-ink" },
  { k: "absent", l: "Absent", cls: "border-bad bg-bad-soft text-bad" },
] as const;

/** One assistant's result for one question in the weekly manual check; saves instantly. */
export function ManualCell({ questionId, engine, initial }: { questionId: string; engine: string; initial: string | null }) {
  const [v, setV] = useState(initial);
  const [, start] = useTransition();
  const set = (k: string) => {
    const next = v === k ? null : k;
    const before = v;
    setV(next);
    start(async () => {
      const r = await saveManualCheck(questionId, engine, (next ?? "clear") as "cited").catch(() => ({ ok: false }));
      if (!r.ok) setV(before);
    });
  };
  return (
    <span className="inline-flex gap-1">
      {OPTS.map((o) => (
        <button key={o.k} type="button" onClick={() => set(o.k)} aria-pressed={v === o.k}
          className={`rounded-md border px-1.5 py-0.5 text-[11px] ${v === o.k ? o.cls + " font-semibold" : "border-line-strong bg-surface text-faint hover:text-ink"}`}>{o.l}</button>
      ))}
    </span>
  );
}

export function MakeTopic({ questionId }: { questionId: string }) {
  const [state, setState] = useState<{ id?: string; err?: boolean } | null>(null);
  const [pending, start] = useTransition();
  if (state?.id) return <Link href={`/topics/${state.id}`} className="text-[12px] font-semibold text-good hover:underline">Topic created →</Link>;
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => { const r = await topicFromQuestion(questionId).catch(() => ({ ok: false })); setState(r.ok ? { id: (r as { id?: string }).id } : { err: true }); })}
      className="inline-flex items-center rounded-md border border-sprout/40 bg-sprout-soft px-2 py-0.5 text-[11.5px] font-semibold text-sprout hover:bg-sprout-soft/70 disabled:opacity-60">
      {pending ? "Creating…" : state?.err ? "Try again" : "+ Make topic"}
    </button>
  );
}

/** One LinkedIn post's engagement, typed in from LinkedIn analytics; saves on blur. */
export function LinkedinStats({ topicId, channel, initial }: {
  topicId: string; channel: string;
  initial: { impressions: number | null; reactions: number | null; comments: number | null; shares: number | null };
}) {
  const [v, setV] = useState(initial);
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");
  const [, start] = useTransition();
  const save = (next: typeof v) => {
    setState("saving");
    start(async () => {
      const r = await saveLinkedinStats(topicId, channel, next).catch(() => ({ ok: false }));
      setState(r.ok ? "saved" : "error");
    });
  };
  const keys = ["impressions", "reactions", "comments", "shares"] as const;
  return (
    <>
      {keys.map((k) => (
        <td key={k} className="px-1 text-right">
          <input type="number" min={0} inputMode="numeric" aria-label={k} value={v[k] ?? ""}
            onChange={(e) => setV({ ...v, [k]: e.target.value === "" ? null : Number(e.target.value) })}
            onBlur={() => { if (v[k] !== initial[k]) save(v); }}
            className="w-[72px] rounded-md border border-line-strong bg-surface px-1.5 py-0.5 text-right font-mono text-[12px] focus:border-accent focus:outline-none" />
        </td>
      ))}
      <td className="w-14 pl-1 text-[11px] text-faint">{state === "saving" ? "…" : state === "saved" ? "Saved" : state === "error" ? "Failed" : ""}</td>
    </>
  );
}
