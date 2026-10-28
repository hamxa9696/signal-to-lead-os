import Link from "next/link";
import { sql } from "@/lib/db";
import { CHANNELS, HUBS, SLOTS, type Channel, type FormatPlan, type Slot } from "@/lib/formats";
import { spokeDate } from "@/lib/schedule";
import { addDays, tokyoToday, weekOf } from "@/lib/week";
import { PageHeader } from "../../page-header";
import { TopicTabs } from "../tabs";
import { PostedToggle } from "../posted-toggle";

export const dynamic = "force-dynamic";

type Row = {
  id: string; title_ja: string; slot: Slot | null; status: string; item_status: string | null; week_of: string;
  planned_date: string | null; published: string | null; format_plan: FormatPlan | null; posted: Record<string, string | null>;
};
type Item =
  | { kind: "hub"; date: string; t: Row; state: "live" | "planned" | "overdue" | "unapproved" }
  | { kind: "spoke"; date: string; t: Row; channel: Channel; timing: string; state: "posted" | "due" | "overdue" | "waiting" };

const fmtDay = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const q = await searchParams;
  const start = /^\d{4}-\d{2}-\d{2}$/.test(q.week ?? "") ? q.week! : weekOf();
  const end = addDays(start, 13);
  const today = tokyoToday();

  const rows = await sql<Row[]>`
    select t.id, t.title_ja, t.slot, t.status, ci.status as item_status, t.week_of::text, t.planned_date::text,
           (select to_char(p.published_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD') from publications p
             where p.content_item_id = ci.id and p.channel = 'website' and p.status = 'live' limit 1) as published,
           t.format_plan,
           coalesce((select json_object_agg(channel, posted_at) from topic_spokes s where s.topic_id = t.id), '{}') as posted
    from topics t
    left join content_items ci on ci.topic_id = t.id and ci.parent_id is null
    where t.status <> 'rejected' and t.week_of between ${addDays(start, -21)}::date and ${end}::date`;

  const items: Item[] = [];
  for (const t of rows) {
    const hubDate = t.published ?? t.planned_date;
    if (!hubDate) continue;
    const live = !!t.published || t.item_status === "published";
    items.push({ kind: "hub", date: hubDate, t, state: live ? "live" : t.status === "proposed" ? "unapproved" : hubDate < today ? "overdue" : "planned" });
    for (const s of t.format_plan?.spokes ?? []) {
      const date = spokeDate(hubDate, s.timing);
      const posted = !!t.posted?.[s.channel];
      items.push({ kind: "spoke", date, t, channel: s.channel, timing: s.timing, state: posted ? "posted" : !live ? "waiting" : date < today ? "overdue" : "due" });
    }
  }
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
  const overdue = items.filter((i) => i.state === "overdue").length;
  const dueToday = items.filter((i) => i.date === today && (i.state === "due" || i.state === "planned")).length;

  return (
    <main className="page">
      <TopicTabs current="calendar" />
      <PageHeader
        eyebrow={`${fmtDay(start)} – ${fmtDay(end)} · JST`}
        title="Content calendar"
        description="Each hub on its planned day (or the day it went live), and each spoke on the day it should be posted. Mark spokes as posted so results are counted per post."
        actions={
          <>
            <Link prefetch={false} href={`/topics/calendar?week=${addDays(start, -7)}`} className="btn">← Previous</Link>
            <Link prefetch={false} href="/topics/calendar" className="btn">Today</Link>
            <Link prefetch={false} href={`/topics/calendar?week=${addDays(start, 7)}`} className="btn">Next →</Link>
          </>
        }
      />
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-muted">
        <span><b className="text-ink">{dueToday}</b> due today</span>
        <span className={overdue ? "text-bad" : ""}><b>{overdue}</b> overdue</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink" /> Hub on renesistech.jp</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-line-strong bg-surface" /> Spoke (posted after the hub is live)</span>
      </div>

      {[0, 1].map((w) => (
        <section key={w} className="card overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-7 divide-x divide-line">
            {days.slice(w * 7, w * 7 + 7).map((d) => {
              const its = items.filter((i) => i.date === d).sort((a, b) => (a.kind === "hub" ? -1 : 1) - (b.kind === "hub" ? -1 : 1));
              return (
                <div key={d} className={`flex min-h-[170px] flex-col gap-1.5 p-2 ${d === today ? "bg-sprout-soft/40" : ""}`}>
                  <p className={`text-[11.5px] font-semibold ${d === today ? "text-sprout" : "text-faint"}`}>{fmtDay(d)}{d === today ? " · today" : ""}</p>
                  {its.map((i, k) => i.kind === "hub" ? (
                    <Link key={k} href={`/topics/${i.t.id}`} className={`block rounded-md px-2 py-1.5 text-[11.5px] leading-snug ${i.state === "unapproved" ? "border border-dashed border-line-strong text-faint" : "text-white"}`}
                      style={i.state === "unapproved" ? undefined : { background: i.t.slot ? SLOTS[i.t.slot].color : "#2F6B55" }}>
                      <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-85">
                        {i.t.slot ? SLOTS[i.t.slot].short : "Hub"} · {i.state === "live" ? "live ✓" : i.state === "overdue" ? "overdue" : i.state === "unapproved" ? "approve?" : i.t.format_plan ? HUBS[i.t.format_plan.hub].label : "planned"}
                      </span>
                      <span lang="ja" className="line-clamp-2">{i.t.title_ja}</span>
                    </Link>
                  ) : (
                    <div key={k} className={`rounded-md border px-2 py-1 text-[11.5px] ${i.state === "overdue" ? "border-bad/40 bg-bad-soft" : i.state === "posted" ? "border-good/30 bg-good-soft" : "border-line bg-surface"}`}>
                      <p className="flex items-center justify-between gap-1">
                        <span className="font-semibold">{CHANNELS[i.channel].formatLabel}</span>
                        {i.state !== "waiting" && <PostedToggle topicId={i.t.id} channel={i.channel} initial={i.state === "posted"} compact />}
                      </p>
                      <Link href={`/topics/${i.t.id}`} lang="ja" className="line-clamp-1 text-faint hover:underline">{i.t.title_ja}</Link>
                      {i.state === "waiting" && <p className="text-[10.5px] text-faint">after the hub goes live</p>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
