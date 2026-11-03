// Today: what is moving, where this week's content stands, and the few tasks that need a person.
import Link from "next/link";
import { sql } from "@/lib/db";
import { topStories, STORY_USES } from "@/lib/top-stories";
import { calendarItems } from "@/lib/calendar";
import { spanTotals } from "@/lib/performance";
import { outcomes, leading } from "@/lib/geo/measure";
import { SLOTS, type Slot } from "@/lib/formats";
import { addDays, tokyoToday, weekOf } from "@/lib/week";
import { PageHeader } from "./page-header";
import { PostedToggle } from "./topics/posted-toggle";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Task = { kind: "Decide" | "Write" | "Revise" | "Publish" | "Post" | "Check" | "Enter"; title: string; meta: string; href: string; action: string; urgent?: boolean;
  /** Show "Mark posted" for the main piece (channel null) or a spoke. */
  mark?: { topicId: string; channel: string | null; label: string } };
const KIND_COLOR: Record<Task["kind"], string> = { Decide: "#A65A44", Write: "#B0573D", Revise: "#B4432F", Publish: "#2F6B55", Post: "#3F6A7B", Check: "#7A4D6B", Enter: "#5E6B64" };
const n = (v: number) => v.toLocaleString("en-US");
const fmtDay = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export default async function TodayPage() {
  const today = tokyoToday();
  const week = weekOf();
  const span = { start: addDays(today, -28), end: addDays(today, -1) };
  const prevSpan = { start: addDays(today, -56), end: addDays(today, -29) };

  const [top, topics, cal, cur, prev, out, lead, manual, breaking] = await Promise.all([
    topStories({ hours: 72, limit: 3 }).catch(() => []),
    sql<{ id: string; title_ja: string; slot: Slot | null; status: string; item: string | null; deadline: Date | null; planned_date: string | null; week_of: string }[]>`
      select t.id, t.title_ja, t.slot, t.status, ci.status as item, t.deadline, t.planned_date::text, t.week_of::text
      from topics t left join content_items ci on ci.topic_id = t.id and ci.parent_id is null
      where t.week_of >= ${addDays(week, -14)}::date and t.status in ('approved', 'in_progress', 'done')
      order by t.deadline nulls last, t.planned_date nulls last`,
    calendarItems(addDays(today, -14), today),
    spanTotals(span),
    spanTotals(prevSpan),
    outcomes(),
    leading(),
    sql<{ questions: number; done: number }[]>`
      select (select count(*)::int from geo_questions where week_of = (select max(week_of) from geo_questions) and manual) as questions,
             (select count(*)::int from geo_checks g join geo_questions q on q.id = g.question_id
               where q.week_of = (select max(week_of) from geo_questions) and g.engine like '%_manual') as done`,
    sql<{ id: string; title_ja: string; rationale: string | null; slot: Slot | null; created_at: Date }[]>`
      select id, title_ja, rationale, slot, created_at from topics
      where origin = 'breaking' and status = 'proposed' and week_of >= ${addDays(week, -7)}::date order by created_at desc`,
  ]);

  const thisWeek = topics.filter((t) => t.week_of === week);
  const stage = (t: (typeof topics)[number]) =>
    t.item === "published" || t.status === "done" ? 3 : t.item && ["in_review", "needs_revision", "ready"].includes(t.item) ? 2 : t.item ? 1 : 0;
  const STAGES = ["Brief ready", "Drafting", "In review", "Published"];
  const counts = STAGES.map((_, i) => thisWeek.filter((t) => stage(t) === i).length);

  // Tasks: only what needs a person, most urgent first.
  const tasks: Task[] = [];
  for (const b of breaking) {
    tasks.push({ kind: "Decide", title: b.title_ja, meta: `Breaking story proposed ${Math.max(1, Math.round((Date.now() - new Date(b.created_at).getTime()) / 3_600_000))}h ago · approve or reject while it is fresh`, href: `/topics/${b.id}`, action: "Decide", urgent: true });
  }
  for (const t of topics) {
    if (t.status === "done" || t.item === "published") continue;
    const hoursLeft = t.deadline ? Math.round((new Date(t.deadline).getTime() - Date.now()) / 3_600_000) : null;
    const when = hoursLeft != null ? (hoursLeft > 0 ? `window closes in ${hoursLeft}h` : "window passed") : t.planned_date ? `planned ${fmtDay(t.planned_date)}` : "";
    const slot = t.slot ? SLOTS[t.slot].short : "Article";
    if (!t.item) tasks.push({ kind: "Write", title: t.title_ja, meta: `${slot}${when ? ` · ${when}` : ""} · writing prompt ready`, href: `/topics/${t.id}`, action: "Open prompt", urgent: hoursLeft != null && hoursLeft > 0 && hoursLeft <= 48, mark: { topicId: t.id, channel: null, label: slot } });
    else if (t.item === "needs_revision") tasks.push({ kind: "Revise", title: t.title_ja, meta: `${slot} · the review found issues; copy the revision prompt`, href: `/topics/${t.id}`, action: "Open review", mark: { topicId: t.id, channel: null, label: slot } });
    else if (t.item === "ready") tasks.push({ kind: "Publish", title: t.title_ja, meta: `${slot} · review passed; send to Payload and publish`, href: `/topics/${t.id}`, action: "Publish", mark: { topicId: t.id, channel: null, label: slot } });
  }
  for (const i of cal.items.filter((x) => x.kind === "spoke" && x.state === "due" && x.date <= today).slice(0, 4)) {
    tasks.push({ kind: "Post", title: i.title, meta: `${i.label}${i.date < today ? ` · due ${fmtDay(i.date)}` : " · due today"}`, href: "/topics/calendar", action: "Copy & post", mark: { topicId: i.topicId, channel: i.channel, label: i.label } });
  }
  if (manual[0].questions && manual[0].done < manual[0].questions * 3) {
    tasks.push({ kind: "Check", title: `Weekly AI check: ${manual[0].questions} questions`, meta: `Ask ChatGPT, Gemini and Copilot · ${manual[0].done} of ${manual[0].questions * 3} answers marked · about 5 minutes`, href: "/trends/ai-search#manual-check", action: "Start check" });
  }
  const noStats = lead.posts.filter((p) => p.impressions == null && new Date(`${p.posted_at}T00:00:00Z`).getTime() < Date.now() - 5 * 86_400_000);
  if (noStats.length) tasks.push({ kind: "Enter", title: `LinkedIn numbers for ${noStats.length} post${noStats.length === 1 ? "" : "s"}`, meta: "Impressions, reactions, comments and shares from LinkedIn analytics", href: "/performance#linkedin", action: "Enter numbers" });
  tasks.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));

  const next = thisWeek.filter((t) => stage(t) < 3).slice(0, 2);
  const delta = (a: number, b: number) => (!b ? null : Math.round(((a - b) / b) * 100));
  const clicksDelta = delta(cur.clicks, prev.clicks);

  return (
    <main className="page">
      <PageHeader
        eyebrow={`Today · ${fmtDay(today)} · week of ${fmtDay(week)}`}
        title="What to do today"
        description="What is moving in your market, where this week's content stands, and the few tasks that need you. Everything else (collecting news, Google and AI data, forecasting, planning) runs by itself."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <section className="card flex flex-col gap-3 p-5">
          <Head title="Top stories now" href="/trends#top-stories" link="Use one" />
          {top.length ? top.map((t) => (
            <Link key={t.id} href={t.planned ? `/topics/${t.planned.id}` : "/trends#top-stories"} prefetch={false} className="flex items-center gap-3 rounded-lg hover:bg-subtle/60">
              <span translate="no" className="notranslate w-8 shrink-0 font-mono text-[16px] font-semibold">{t.strength}</span>
              <span className="min-w-0">
                <span lang="ja" className="block truncate text-[13.5px] font-semibold">{t.title}</span>
                <span className="block truncate text-[11.5px] text-muted">
                  {t.planned ? <span className="text-good">✓ In the plan</span> : <>Best as {STORY_USES[t.uses[0]].label.toLowerCase()}</>} · {t.outlets} outlet{t.outlets === 1 ? "" : "s"}
                </span>
              </span>
            </Link>
          )) : <p className="text-[13px] text-faint">No strong stories in the last 3 days.</p>}
        </section>

        <section className="card flex flex-col gap-3 p-5">
          <Head title="This week's plan" href="/topics" link="Open Plan" />
          <div className="flex gap-1" aria-hidden="true">
            {thisWeek.map((t) => <span key={t.id} className="h-2.5 flex-1 rounded-sm" style={{ background: ["#D8CBB0", "#C8735A", "#7FA58E", "#2F6B55"][stage(t)] }} />)}
          </div>
          <p className="text-[12px] text-muted">
            {thisWeek.length ? STAGES.map((s, i) => (counts[i] ? `${counts[i]} ${s.toLowerCase()}` : null)).filter(Boolean).join(" · ") : "No approved topics for this week yet."}
          </p>
          <ul className="flex flex-col gap-1 text-[12.5px]">
            {next.map((t) => (
              <li key={t.id} className="truncate">
                <span className="font-semibold" style={{ color: t.slot ? SLOTS[t.slot].color : undefined }}>{t.slot ? SLOTS[t.slot].short : "Article"}</span>
                {" · "}<Link href={`/topics/${t.id}`} prefetch={false} lang="ja" className="hover:underline">{t.title_ja}</Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card flex flex-col gap-3 p-5">
          <Head title="Results · last 4 weeks" href="/performance" link="Open Results" />
          <div className="grid grid-cols-3 gap-2">
            <Stat l="Google clicks" v={n(cur.clicks)} s={clicksDelta == null ? "first month" : `${clicksDelta >= 0 ? "▲" : "▼"} ${Math.abs(clicksDelta)}%`} good={clicksDelta == null || clicksDelta >= 0} />
            <Stat l="AI cited" v={out.now.answers ? `${out.now.cited}/${out.now.answers}` : "—"} s={out.now.answers ? "answers citing us" : "no checks yet"} />
            <Stat l="Form fills" v={n(cur.leads + cur.downloads)} s={`${n(prev.leads + prev.downloads)} the 4 weeks before`} />
          </div>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="text-base font-semibold">Your tasks</h2>
        <p className="mt-0.5 text-[12.5px] text-faint">Only what needs a person, most urgent first.</p>
        <ul className="mt-2">
          {tasks.slice(0, 10).map((k, i) => (
            <li key={`${k.kind}:${k.title}:${i}`} className="flex flex-wrap items-center gap-3 border-t border-line py-3">
              <span className="w-[66px] shrink-0 rounded-full py-1 text-center text-[11px] font-bold text-white" style={{ background: KIND_COLOR[k.kind] }}>{k.kind}</span>
              <div className="min-w-0 flex-[1_1_280px]">
                <p lang="ja" className="truncate font-semibold">{k.title}</p>
                <p className={`text-[12px] ${k.urgent ? "font-semibold text-sprout" : "text-muted"}`}>{k.meta}</p>
              </div>
              {k.mark && <PostedToggle key={`${k.mark.topicId}:${k.mark.channel}`} topicId={k.mark.topicId} channel={k.mark.channel} initial={false} label={k.mark.label} />}
              <Link href={k.href} prefetch={false} className="btn-primary shrink-0">{k.action}</Link>
            </li>
          ))}
          {!tasks.length && <li className="border-t border-line py-4 text-[13px] text-muted">Nothing needs you right now. New topics arrive on Monday; check <Link href="/trends" className="underline">Trends</Link> to add one yourself.</li>}
        </ul>
      </section>
    </main>
  );
}

function Head({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <Link href={href} prefetch={false} className="text-[12.5px] font-semibold text-accent hover:underline">{link} →</Link>
    </div>
  );
}

function Stat({ l, v, s, good }: { l: string; v: string; s: string; good?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-faint">{l}</p>
      <p translate="no" className="notranslate font-mono text-[22px] tracking-tight">{v}</p>
      <p className={`truncate text-[11px] ${good ? "text-good" : "text-faint"}`}>{s}</p>
    </div>
  );
}
