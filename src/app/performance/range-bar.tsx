"use client";
import Link from "next/link";
import { useState } from "react";
import { PRESETS, type PresetKey } from "@/lib/range";

/** Date-range picker for the dashboard: presets as links, custom range as a small GET form. */
export function RangeBar({ current, from, to, scope }: { current: PresetKey; from: string; to: string; scope?: string }) {
  const [open, setOpen] = useState(current === "custom");
  const [going, setGoing] = useState(false);
  const qs = (range: string) => `/performance?${new URLSearchParams({ ...(range !== "28d" ? { range } : {}), ...(scope ? { scope } : {}) })}`;
  return (
    <div className="flex flex-col items-end gap-2">
      <nav aria-label="Date range" className="seg">
        {PRESETS.map((p) => (
          <Link key={p.key} prefetch={false} href={qs(p.key)} aria-current={current === p.key ? "page" : undefined} className={current === p.key ? "seg-on" : "seg-item"} onClick={() => setOpen(false)}>
            {p.label}
          </Link>
        ))}
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={current === "custom" ? "seg-on" : "seg-item"}>
          Custom
        </button>
      </nav>
      {open && (
        <form action="/performance" onSubmit={() => setGoing(true)} className="card flex flex-wrap items-end gap-2 px-3 py-2.5">
          <input type="hidden" name="range" value="custom" />
          {scope && <input type="hidden" name="scope" value={scope} />}
          <label className="text-[11.5px] font-semibold uppercase tracking-wide text-faint">
            From
            <input type="date" name="from" defaultValue={from} required className="mt-1 block rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] font-normal normal-case tracking-normal text-ink focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft" />
          </label>
          <label className="text-[11.5px] font-semibold uppercase tracking-wide text-faint">
            To
            <input type="date" name="to" defaultValue={to} required className="mt-1 block rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-[13px] font-normal normal-case tracking-normal text-ink focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft" />
          </label>
          <button disabled={going} className="btn-primary">{going ? "Loading…" : "Apply"}</button>
        </form>
      )}
    </div>
  );
}
