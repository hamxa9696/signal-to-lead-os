"use client";
// Approve / Reject that update on screen immediately; the server catches up in the background.
import Link from "next/link";
import { useState, useTransition } from "react";
import { decideTopic } from "../actions";
import { Spinner } from "../pending-button";

type Status = "approved" | "rejected" | "proposed";

export function TopicDecision({ id, initial = "proposed" }: { id: string; initial?: Status }) {
  const [state, setState] = useState<Status>(initial);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  const decide = (status: Status) => {
    const before = state;
    setState(status); // instant
    setError(false);
    start(async () => {
      let ok = false;
      try {
        ok = (await decideTopic(id, status)).ok;
      } catch {
        ok = false;
      }
      if (!ok) {
        setState(before); // put it back if the save failed
        setError(true);
      }
    });
  };

  if (state === "approved")
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Link href={`/topics/${id}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-[7px] bg-ink px-3 text-[12.5px] font-semibold text-white hover:bg-body">
          {pending && <Spinner />} Start writing →
        </Link>
      </span>
    );
  if (state === "rejected")
    return (
      <span className="flex items-center gap-2 text-[12.5px] text-faint">
        {pending && <Spinner />} Rejected
        <button type="button" onClick={() => decide("proposed")} className="font-medium text-accent hover:underline">Undo</button>
      </span>
    );
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => decide("approved")} className="min-h-8 rounded-[7px] bg-accent px-3 text-[12.5px] font-semibold text-white hover:bg-accent-ink">Approve</button>
      <button type="button" onClick={() => decide("rejected")} className="min-h-8 rounded-[7px] border border-line-strong bg-surface px-3 text-[12.5px] text-muted hover:bg-subtle">Reject</button>
      {error && <span className="text-[12px] text-bad">Didn&apos;t save, try again</span>}
    </span>
  );
}
