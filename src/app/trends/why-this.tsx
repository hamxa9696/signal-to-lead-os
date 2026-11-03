// The tools under every story and article: Copy package, Save for later, Add to plan, and
// "Why this" (why it's relevant, where it's trending, why it would perform).
import type { Why } from "@/lib/story-why";
import { packageText, whyLines } from "@/lib/story-why";
import type { StoryUse } from "@/lib/top-stories";
import { CopyButton, SaveButton } from "../story-tools";
import { PlannedLink, StoryUseButtons } from "./top-stories";

const SECTIONS = [
  { key: "relevant", label: "Why it's relevant", color: "#2F6B55" },
  { key: "trending", label: "Where it's trending", color: "#4E7A8C" },
  { key: "perform", label: "Why it would perform", color: "#A65A44" },
] as const;

export function WhyThis({ w, open = false, label = "Why this story" }: { w: Why; open?: boolean; label?: string }) {
  const lines = whyLines(w);
  return (
    <details className="group/why" open={open}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:underline">
        <span className="transition group-open/why:rotate-90">›</span> {label}
      </summary>
      <div className="mt-2 grid gap-3 rounded-lg border border-line bg-subtle/60 px-4 py-3 text-[12.5px] md:grid-cols-3">
        {SECTIONS.map((s) => (
          <section key={s.key} className="min-w-0">
            <h4 className="text-[11px] font-bold tracking-[0.06em]" style={{ color: s.color }}>{s.label.toUpperCase()}</h4>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-body marker:text-faint">
              {lines[s.key].map((l, i) => <li key={i} lang="ja">{l}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}

/** Copy · Save · Add to plan · Why this, for one story (story id) or one article (signal id). */
export function StoryToolbar({ target, saved, why, planned, uses, whyLabel, saveAs }: {
  target: { story?: string; signal?: string };
  saveAs?: { kind: "story" | "signal"; id: string };
  saved: boolean;
  why: Why | undefined;
  planned: { id: string; title: string; status: string } | null;
  uses: StoryUse[];
  whyLabel?: string;
}) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {why && <CopyButton text={packageText(why)} />}
        <SaveButton kind={saveAs?.kind ?? (target.story ? "story" : "signal")} id={saveAs?.id ?? (target.story ?? target.signal)!} initial={saved} />
        {planned && <PlannedLink p={planned} />}
      </div>
      {!planned && (
        <details className="group/plan">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:underline">
            <span className="transition group-open/plan:rotate-90">›</span> Add to this week&apos;s plan
          </summary>
          <div className="mt-1.5"><StoryUseButtons target={target} uses={uses} /></div>
        </details>
      )}
      {why && <WhyThis w={why} label={whyLabel} />}
    </div>
  );
}
