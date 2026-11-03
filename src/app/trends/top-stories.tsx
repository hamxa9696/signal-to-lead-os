// Top stories and the "use this story as…" buttons. Shown on Trends, Today (compact) and each story
// card on Signals. One click makes an approved topic for this week with its writing prompt.
import Link from "next/link";
import { typeInfo } from "@/lib/signal-types";
import { STORY_USES, USE_KEYS, type StoryUse, type TopStory } from "@/lib/top-stories";
import { PendingButton } from "../pending-button";
import { addStoryToPlan } from "./actions";

const PRIMARY = "min-h-8 rounded-[7px] bg-accent px-3 text-[12.5px] font-semibold text-white hover:bg-accent-ink";
const SECONDARY = "min-h-8 rounded-[7px] border border-line-strong bg-surface px-3 text-[12.5px] text-body hover:bg-subtle";

export const ago = (d: Date) => {
  const h = (Date.now() - new Date(d).getTime()) / 3_600_000;
  return h < 1 ? "<1h ago" : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
};

/** The four ways to use a story; the best ones for its kind of news come first and the top one is highlighted. */
export function StoryUseButtons({ storyId, uses, label = true }: { storyId: string; uses: StoryUse[]; label?: boolean }) {
  const order = [...uses, ...USE_KEYS.filter((k) => !uses.includes(k))];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {label && <span className="mr-0.5 text-[11.5px] font-semibold text-faint">Use as</span>}
      {order.map((k, i) => (
        <form key={k} action={addStoryToPlan}>
          <input type="hidden" name="story" value={storyId} />
          <input type="hidden" name="use" value={k} />
          <PendingButton className={i === 0 ? PRIMARY : SECONDARY} pendingText="Planning…" ariaLabel={`Use as ${STORY_USES[k].label}: ${STORY_USES[k].sub}`}>
            {i === 0 ? "★ " : ""}{STORY_USES[k].label}
          </PendingButton>
        </form>
      ))}
    </div>
  );
}

function Strength({ v }: { v: number }) {
  const tone = v >= 75 ? "bg-good text-white" : v >= 55 ? "bg-accent text-white" : "bg-subtle text-muted";
  return <span translate="no" className={`notranslate inline-flex h-9 w-11 shrink-0 items-center justify-center rounded-lg font-mono text-[15px] font-semibold ${tone}`}>{v}</span>;
}

export function PlannedLink({ p }: { p: NonNullable<TopStory["planned"]> }) {
  return (
    <Link href={`/topics/${p.id}`} prefetch={false} className="inline-flex items-center gap-1.5 rounded-[7px] bg-good-soft px-2.5 py-1 text-[12px] font-semibold text-good hover:underline">
      ✓ In the plan{p.status === "proposed" ? " (proposed)" : ""}: <span lang="ja" className="max-w-[260px] truncate font-normal">{p.title}</span> →
    </Link>
  );
}

export function TopStoriesSection({ stories }: { stories: TopStory[] }) {
  return (
    <section id="top-stories" aria-label="Top stories" className="card scroll-mt-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Top stories · last 3 days</h2>
        <Link href="/trends/signals" prefetch={false} className="text-[12.5px] font-semibold text-accent hover:underline">All stories →</Link>
      </div>
      <p className="mt-0.5 text-[12.5px] text-faint">
        The strongest news right now, in any field. Pick how to use one and it goes into this week&apos;s plan with a writing prompt. ★ = the best fit for that kind of news.
        <span className="block">{USE_KEYS.map((k) => `${STORY_USES[k].label}: ${STORY_USES[k].sub.toLowerCase()}`).join(" · ")}.</span>
      </p>
      {!stories.length ? <p className="mt-3 text-[13px] text-muted">No strong stories in the last 3 days.</p> : (
        <ul className="mt-2">
          {stories.map((s) => {
            const type = typeInfo(s.type);
            return (
              <li key={s.id} className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 border-t border-line py-3.5">
                <Strength v={s.strength} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-faint">
                    {type && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${type.color}1A`, color: type.color }}>{type.label}</span>}
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: s.color ?? "#A29A88" }} />{s.category ?? "Outside your tracked fields"}</span>
                    <span translate="no" className="notranslate">· {s.outlets} outlet{s.outlets === 1 ? "" : "s"}</span>
                    <span>· latest {ago(s.lastSeen)}</span>
                  </div>
                  <p lang="ja" className="mt-1 font-medium leading-snug">
                    {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">{s.title}</a> : s.title}
                  </p>
                  {s.problem && <p lang="ja" className="mt-0.5 text-[12.5px] text-muted">課題: {s.problem}</p>}
                  {s.related.length > 0 && (
                    <details className="group mt-1">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] text-accent hover:underline">
                        <span className="transition group-open:rotate-90">›</span> {s.related.length} more stor{s.related.length === 1 ? "y" : "ies"} on the same event
                      </summary>
                      <ul className="mt-1 flex flex-col gap-0.5 border-l border-line pl-3 text-[12px] text-muted">
                        {s.related.map((r) => <li key={r.id} lang="ja">{r.title} <span className="text-faint">· {r.strength}</span></li>)}
                      </ul>
                    </details>
                  )}
                  <div className="mt-2">{s.planned ? <PlannedLink p={s.planned} /> : <StoryUseButtons storyId={s.id} uses={s.uses} />}</div>
                  {!s.planned && s.mentioned && (
                    <p className="mt-1 text-[11.5px] text-faint">
                      Cited as background in <Link href={`/topics/${s.mentioned.id}`} prefetch={false} lang="ja" className="underline">{s.mentioned.title}</Link>, not covered as its own piece.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
