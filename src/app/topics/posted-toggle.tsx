"use client";
import { useState, useTransition } from "react";
import { markPosted, savePostLink } from "./spoke-actions";

/**
 * "Mark posted" for the main piece (channel = null) or a spoke (e.g. the LinkedIn post). One click
 * marks it; once posted, an optional link field appears so results can be traced to the post.
 */
export function PostedToggle({ topicId, channel, initial, initialUrl = null, compact, label }: {
  topicId: string; channel: string | null; initial: boolean; initialUrl?: string | null; compact?: boolean; label?: string;
}) {
  const [on, setOn] = useState(initial);
  const [url, setUrl] = useState(initialUrl ?? "");
  const [saved, setSaved] = useState(initialUrl ?? "");
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState(false);
  const [, start] = useTransition();
  const what = label ?? (channel === null ? "the main piece" : "this post");

  const flip = () => {
    const next = !on;
    setOn(next);
    setEditing(next && !saved);
    start(async () => {
      const r = await markPosted(topicId, channel, next).catch(() => ({ ok: false }));
      if (!r.ok) { setOn(!next); setEditing(false); }
    });
  };
  const save = () => {
    const v = url.trim();
    if (v === saved) { setEditing(false); return; }
    start(async () => {
      const r = await savePostLink(topicId, channel, v).catch(() => ({ ok: false }));
      setErr(!r.ok);
      if (r.ok) { setSaved(v); setEditing(false); }
    });
  };

  const size = compact ? "py-0 text-[11px]" : "min-h-7 py-0.5 text-[12px]";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={flip}
        aria-pressed={on}
        aria-label={on ? `Posted: undo for ${what}` : `Mark ${what} as posted`}
        className={`inline-flex items-center gap-1 rounded-md border px-2 ${size} ${on ? "border-good bg-good-soft font-semibold text-good" : "border-line-strong bg-surface text-muted hover:text-ink"}`}
      >
        <span aria-hidden="true">{on ? "✓" : "○"}</span> {on ? "Posted" : "Mark posted"}
      </button>
      {on && !editing && (
        saved
          ? <span className="inline-flex items-center gap-1 text-[11.5px]">
              <a href={saved} target="_blank" rel="noreferrer" className="text-accent hover:underline">post ↗</a>
              <button type="button" onClick={() => setEditing(true)} className="text-faint hover:text-ink">edit link</button>
            </span>
          : <button type="button" onClick={() => setEditing(true)} className="text-[11.5px] text-accent hover:underline">+ add link</button>
      )}
      {on && editing && (
        <span className="inline-flex items-center gap-1">
          <input
            type="url"
            value={url}
            autoFocus
            onChange={(e) => { setUrl(e.target.value); setErr(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") setEditing(false); }}
            placeholder="Paste the post link (optional)"
            aria-label={`Link to ${what}`}
            aria-invalid={err}
            className={`w-56 rounded-md border bg-surface px-2 py-0.5 text-[12px] ${err ? "border-bad" : "border-line-strong"}`}
          />
          <button type="button" onClick={save} className="rounded-md border border-line-strong bg-surface px-2 py-0.5 text-[12px] text-body hover:bg-subtle">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="text-[11.5px] text-faint hover:text-ink">skip</button>
        </span>
      )}
    </span>
  );
}
