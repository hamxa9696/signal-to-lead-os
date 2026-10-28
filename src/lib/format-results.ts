// What works, by format and channel. Hubs: visits and form fills per published piece in its first
// 28 days, by slot and lead-magnet type. Spokes: visits and form fills that came through Kizashi's
// tracked links, per channel, divided by how many posts were marked as posted.
import { sql } from "./db";
import { CHANNELS, MAGNET_TYPES, SLOTS, type Channel } from "./formats";

const SITE_PATH = "*";

export type HubResult = { key: string; label: string; pieces: number; sessions: number; leads: number; perPiece: number; leadsPerPiece: number };
export type ChannelResult = { channel: Channel; label: string; posts: number; sessions: number; engaged: number; leads: number; perPost: number };

export async function hubResults(): Promise<HubResult[]> {
  const rows = await sql<{ slot: string | null; magnet: string | null; sessions: number; leads: number }[]>`
    select t.slot, case when t.kind = 'lead_magnet' then t.magnet_format end as magnet,
           coalesce((select sum(m.sessions) from metrics_daily m where m.channel = 'website' and m.source_medium = ''
                      and m.page_path = p.page_path and m.page_path <> ${SITE_PATH}
                      and m.date between (p.published_at at time zone 'Asia/Tokyo')::date and (p.published_at at time zone 'Asia/Tokyo')::date + 27), 0)::int as sessions,
           coalesce((select sum(m.leads) from metrics_daily m where m.channel = 'website' and m.source_medium = ''
                      and m.page_path = p.page_path
                      and m.date between (p.published_at at time zone 'Asia/Tokyo')::date and (p.published_at at time zone 'Asia/Tokyo')::date + 27), 0)::int
             + (select count(*) from form_submissions fs where fs.content_item_id = ci.id)::int as leads
    from publications p
    join content_items ci on ci.id = p.content_item_id
    join topics t on t.id = ci.topic_id
    where p.channel = 'website' and p.status = 'live' and p.page_path is not null`;
  type R = (typeof rows)[number];
  const groups = new Map<string, { label: string; rows: R[] }>();
  for (const r of rows) {
    const slot = (r.slot ?? "evergreen") as keyof typeof SLOTS;
    const key = r.magnet ? `lead_magnet:${r.magnet}` : slot;
    const label = r.magnet ? `Lead magnet · ${MAGNET_TYPES[r.magnet as keyof typeof MAGNET_TYPES]?.label ?? r.magnet}` : SLOTS[slot]?.label ?? slot;
    groups.set(key, { label, rows: [...(groups.get(key)?.rows ?? []), r] });
  }
  return [...groups.entries()].map(([key, g]) => {
    const sessions = g.rows.reduce((a, r) => a + r.sessions, 0);
    const leads = g.rows.reduce((a, r) => a + r.leads, 0);
    return { key, label: g.label, pieces: g.rows.length, sessions, leads, perPiece: Math.round(sessions / g.rows.length), leadsPerPiece: Math.round((leads / g.rows.length) * 10) / 10 };
  }).sort((a, b) => b.perPiece - a.perPiece);
}

export async function channelResults(days = 90): Promise<ChannelResult[]> {
  const [visits, posts] = await Promise.all([
    sql<{ source: string; sessions: number; engaged: number; leads: number }[]>`
      select source, sum(sessions)::int as sessions, sum(engaged)::int as engaged, sum(leads)::int as leads
      from channel_metrics_daily where date >= current_date - ${days}::int group by source`,
    sql<{ channel: string; n: number }[]>`
      select channel, count(*)::int as n from topic_spokes where posted_at >= now() - make_interval(days => ${days}) group by channel`,
  ]);
  return (Object.keys(CHANNELS) as Channel[]).map((c) => {
    const v = visits.find((x) => x.source === CHANNELS[c].utm.source);
    const n = posts.find((x) => x.channel === c)?.n ?? 0;
    const sessions = v?.sessions ?? 0;
    return { channel: c, label: CHANNELS[c].formatLabel, posts: n, sessions, engaged: v?.engaged ?? 0, leads: v?.leads ?? 0, perPost: n ? Math.round((sessions / n) * 10) / 10 : 0 };
  }).sort((a, b) => b.perPost - a.perPost || b.sessions - a.sessions);
}

/** Short text for Gemini prompts; empty until there is real data, so the planner isn't misled. */
export async function resultsSummary(): Promise<string> {
  const [hubs, channels] = await Promise.all([hubResults(), channelResults()]);
  const h = hubs.filter((x) => x.pieces >= 1);
  const c = channels.filter((x) => x.posts >= 2);
  if (!h.length && !c.length) return "";
  return [
    "RESULTS SO FAR (favour what works; still try others occasionally):",
    ...h.map((x) => `- Hub ${x.label}: ${x.pieces} piece(s), ${x.perPiece} visits and ${x.leadsPerPiece} form fills per piece in the first 28 days`),
    ...c.map((x) => `- ${x.label}: ${x.posts} posts, ${x.perPost} visits per post, ${x.leads} form fills (last 90 days)`),
  ].join("\n");
}
