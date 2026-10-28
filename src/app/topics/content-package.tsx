import { CHANNELS, HUBS, MAGNET_TYPES, SLOTS, type FormatPlan, type FormatScores, type Slot } from "@/lib/formats";
import { spokePrompt } from "@/lib/content/spokes";
import type { PackageInput } from "@/lib/content/package";
import { CopyButton } from "../copy-button";
import { HoverCard } from "../hover-card";

const SCORE_META = {
  search: { label: "Search", color: "#2F6B55", what: "Will people Google it? High = an SEO article keeps bringing visitors for months." },
  reach: { label: "Reach", color: "#C8735A", what: "Is it hot and shareable right now? High = post on social fast." },
  lead: { label: "Lead", color: "#8A5A7A", what: "Is the reader close to buying? High = strong for emails and inquiries." },
} as const;

export function SlotBadge({ slot, deadline }: { slot: Slot | null; deadline?: Date | string | null }) {
  if (!slot) return null;
  const s = SLOTS[slot];
  const due = deadline ? new Date(deadline) : null;
  const left = due ? Math.round((due.getTime() - Date.now()) / 3_600_000) : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${s.color}1A`, color: s.color }} title={s.what}>{s.short}</span>
      {left != null && (
        <span className={`text-[11px] font-semibold ${left < 0 ? "text-faint line-through" : left <= 24 ? "text-bad" : "text-warn"}`} title="Fast takes lose value after ~48 hours">
          {left < 0 ? "window passed" : `publish within ${left}h`}
        </span>
      )}
    </span>
  );
}

/** Hub + spokes + scores for one topic, with a copyable prompt for each spoke. */
export function ContentPackage({ t, plan, scores, slot, hubUrl }: {
  t: PackageInput & { id: string };
  plan: FormatPlan | null;
  scores: FormatScores | null;
  slot: Slot | null;
  hubUrl: string | null;
}) {
  if (!plan) {
    return <p className="text-[13px] text-muted">No content package yet. It is planned with the Monday slate, or run &ldquo;Plan content formats&rdquo; on the Status page.</p>;
  }
  const hubLabel = plan.hub === "lead_magnet" && plan.magnet_type ? `${HUBS.lead_magnet.label}: ${MAGNET_TYPES[plan.magnet_type].label}` : HUBS[plan.hub].label;
  return (
    <div className="flex flex-col gap-3">
      {scores && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {(Object.keys(SCORE_META) as (keyof typeof SCORE_META)[]).map((k) => (
            <HoverCard key={k} label={`${SCORE_META[k].label} ${scores[k]} of 100`} width={280}
              card={<><p className="font-semibold">{SCORE_META[k].label} potential: {scores[k]} / 100</p><p className="mt-1 text-white/80">{SCORE_META[k].what}</p><p className="mt-1 text-white/70">{scores.notes[k]}</p></>}>
              <span className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold text-muted">{SCORE_META[k].label}</span>
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-subtle"><span className="block h-full" style={{ width: `${scores[k]}%`, background: SCORE_META[k].color }} /></span>
                <span translate="no" className="notranslate font-mono text-ink">{scores[k]}</span>
              </span>
            </HoverCard>
          ))}
          <span className="text-[12px] text-muted" title={scores.notes.effort}>Effort ≈ <b translate="no" className="notranslate font-mono text-ink">{scores.effort_hours}h</b></span>
        </div>
      )}
      {plan.why && <p className="text-[13px] text-body">{plan.why}</p>}
      <ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
          <span className="rounded bg-ink px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wider text-white">HUB</span>
          <span className="text-[13px] font-semibold">renesistech.jp · {hubLabel}</span>
          {slot && <span className="text-[12px] text-faint">{SLOTS[slot].what}</span>}
          {hubUrl && <a href={hubUrl} target="_blank" rel="noreferrer" className="text-[12px] text-accent hover:underline">open ↗</a>}
        </li>
        {plan.spokes.map((s) => (
          <li key={s.channel} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
            <span className="rounded bg-subtle px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wider text-muted">SPOKE</span>
            <span className="text-[13px] font-semibold">{CHANNELS[s.channel].formatLabel}</span>
            <span className="text-[12px] text-sprout">{s.timing}</span>
            <span className="min-w-0 flex-1 text-[12px] text-muted">{s.why}</span>
            <CopyButton
              text={spokePrompt(s.channel, t, hubUrl)}
              label="⧉ Copy prompt"
              title={`Prompt for ChatGPT/Claude to write the ${CHANNELS[s.channel].formatLabel}, with the tracked link to the hub`}
              className="inline-flex min-h-7 items-center rounded-[7px] border border-line-strong bg-surface px-2.5 text-[12px] font-medium text-muted hover:bg-subtle hover:text-ink"
            />
          </li>
        ))}
      </ol>
      <p className="text-[11.5px] text-faint">Each prompt includes a tracked link (utm_…=kizashi) so GA4 shows which channel and format brought visitors and form fills.</p>
    </div>
  );
}
