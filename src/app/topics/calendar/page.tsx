import { randomBytes } from "node:crypto";
import { sql } from "@/lib/db";
import { calendarItems } from "@/lib/calendar";
import { getTopic } from "@/lib/content/topic";
import { spokePrompt } from "@/lib/content/spokes";
import { getSetting, setSetting } from "@/lib/settings";
import { addDays, tokyoToday, weekOf } from "@/lib/week";
import { PageHeader } from "../../page-header";
import { TopicTabs } from "../tabs";
import { CalendarBoard, type View } from "./board";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const q = await searchParams;
  const view: View = q.view === "month" || q.view === "agenda" ? q.view : "weeks";
  const today = tokyoToday();
  const anchor = ISO.test(q.date ?? "") ? q.date! : today;

  let start: string, end: string, prev: string, next: string;
  if (view === "month") {
    const first = `${anchor.slice(0, 7)}-01`;
    start = weekOf(new Date(`${first}T03:00:00Z`));
    end = addDays(start, 41);
    const d = new Date(`${first}T00:00:00Z`);
    prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
    next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  } else if (view === "agenda") {
    start = anchor;
    end = addDays(anchor, 20);
    prev = addDays(anchor, -21);
    next = addDays(anchor, 21);
  } else {
    start = weekOf(new Date(`${anchor}T03:00:00Z`));
    end = addDays(start, 13);
    prev = addDays(start, -7);
    next = addDays(start, 7);
  }

  let token = await getSetting<string>("calendar_token");
  if (!token) {
    token = randomBytes(24).toString("hex");
    await setSetting("calendar_token", token);
  }

  const [{ items, backlog }, trends] = await Promise.all([
    calendarItems(start, end),
    sql<{ term: string; direction: string; last_7d: number; predicted: number; window_start: string; window_end: string }[]>`
      select term, direction, last_7d, predicted, window_start::text, window_end::text from trend_forecasts
      where window_start = (select max(window_start) from trend_forecasts) and direction in ('rising', 'emerging')
      order by p_rise desc limit 6`,
  ]);

  // Ready prompts for spokes still to post (copied straight from the detail panel).
  const prompts: Record<string, string> = {};
  const topicIds = [...new Set(items.filter((i) => i.kind === "spoke" && i.state !== "posted").map((i) => i.topicId))].slice(0, 40);
  const topics = await Promise.all(topicIds.map((id) => getTopic(id)));
  for (const t of topics) {
    if (!t) continue;
    for (const i of items.filter((x) => x.topicId === t.id && x.kind === "spoke" && x.channel)) {
      prompts[i.key] = spokePrompt(i.channel!, { ...t, service: t.service_name, persona: t.persona?.name }, t.hub_url);
    }
  }

  const title = view === "month"
    ? new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`))
    : "Content calendar";

  return (
    <main className="page">
      <TopicTabs current="calendar" />
      <PageHeader
        eyebrow="Plan · drag items to reschedule · JST"
        title={title}
        description="Hubs on renesistech.jp and the posts that send people to them. Drag to move, click for details, prompts and “posted”."
      />
      <CalendarBoard
        view={view} start={start} end={end} today={today} anchor={anchor} prev={prev} next={next}
        items={items} backlog={backlog} prompts={prompts} trends={trends}
        feedPath={`/api/calendar/${token}`}
      />
    </main>
  );
}
