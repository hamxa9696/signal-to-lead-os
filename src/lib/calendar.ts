// Calendar items (hubs + spokes) for a date range, shared by the calendar page and the ICS feed.
import { sql } from "./db";
import { CHANNELS, HUBS, MAGNET_TYPES, SLOTS, type Channel, type FormatPlan, type Slot } from "./formats";
import { spokeDate } from "./schedule";
import { addDays, tokyoToday } from "./week";

export type CalItem = {
  key: string; topicId: string; kind: "hub" | "spoke"; channel: Channel | null; date: string;
  title: string; slot: Slot | null; color: string; label: string; timing: string; why: string;
  state: "live" | "planned" | "overdue" | "unapproved" | "posted" | "due" | "waiting"; hours: number; movable: boolean; deadline: string | null;
};

type Row = {
  id: string; title_ja: string; slot: Slot | null; status: string; item_status: string | null; planned_date: string | null;
  published: string | null; format_plan: FormatPlan | null; deadline: Date | null;
  spokes: Record<string, { posted_at: string | null; planned_date: string | null }>;
};

export async function calendarItems(start: string, end: string): Promise<{ items: CalItem[]; backlog: CalItem[] }> {
  const today = tokyoToday();
  const rows = await sql<Row[]>`
    select t.id, t.title_ja, t.slot, t.status, ci.status as item_status, t.planned_date::text, t.format_plan, t.deadline,
           (select to_char(p.published_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD') from publications p
             where p.content_item_id = ci.id and p.channel = 'website' and p.status = 'live' limit 1) as published,
           coalesce((select json_object_agg(channel, json_build_object('posted_at', posted_at, 'planned_date', planned_date))
                     from topic_spokes s where s.topic_id = t.id), '{}') as spokes
    from topics t
    left join content_items ci on ci.topic_id = t.id and ci.parent_id is null
    where t.status <> 'rejected' and t.week_of between ${addDays(start, -35)}::date and ${end}::date`;

  const items: CalItem[] = [];
  const backlog: CalItem[] = [];
  for (const t of rows) {
    const plan = t.format_plan;
    const live = !!t.published || t.item_status === "published";
    const slot = t.slot;
    const color = slot ? SLOTS[slot].color : "#2F6B55";
    const hubHours = plan ? (plan.hub === "lead_magnet" && plan.magnet_type ? MAGNET_TYPES[plan.magnet_type].hours : HUBS[plan.hub].hours) : 3;
    const hubDate = t.published ?? t.planned_date;
    const hub: CalItem = {
      key: `${t.id}:hub`, topicId: t.id, kind: "hub", channel: null, date: hubDate ?? "", title: t.title_ja, slot, color,
      label: plan ? (plan.hub === "lead_magnet" && plan.magnet_type ? MAGNET_TYPES[plan.magnet_type].label : HUBS[plan.hub].label) : "Article",
      timing: slot ? SLOTS[slot].label : "", why: plan?.why ?? "",
      state: live ? "live" : t.status === "proposed" ? "unapproved" : hubDate && hubDate < today ? "overdue" : "planned",
      hours: hubHours, movable: !live, deadline: slot === "fast_take" && t.deadline ? new Date(t.deadline).toISOString() : null,
    };
    if (!hubDate) {
      if (t.status !== "proposed") backlog.push(hub);
      continue;
    }
    items.push(hub);
    for (const s of plan?.spokes ?? []) {
      const st = t.spokes?.[s.channel];
      const date = st?.planned_date ?? spokeDate(hubDate, s.timing);
      const posted = !!st?.posted_at;
      items.push({
        key: `${t.id}:${s.channel}`, topicId: t.id, kind: "spoke", channel: s.channel, date, title: t.title_ja, slot, color,
        label: CHANNELS[s.channel].formatLabel, timing: s.timing, why: s.why,
        state: posted ? "posted" : !live ? "waiting" : date < today ? "overdue" : "due",
        hours: CHANNELS[s.channel].hours, movable: !posted, deadline: null,
      });
    }
  }
  return { items: items.filter((i) => i.date >= addDays(start, -1) && i.date <= end), backlog };
}
