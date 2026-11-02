// Decide each topic's content package: the on-site hub (fixed by its slot) and the off-site spokes
// (Gemini, within clear rules), then score it. One Gemini call for the whole week.
import { z } from "zod";
import { plannedHubDate } from "./schedule";
import { resultsSummary } from "./format-results";
import { sql } from "./db";
import { generateJson } from "./gemini";
import {
  CHANNELS, enabledChannels, formatScores, MAGNET_TYPES, type Channel, type FormatPlan, type Hub, type MagnetType, type Slot,
} from "./formats";

const HUB_BY_SLOT: Record<Slot, Hub> = { evergreen: "seo_article", fast_take: "news_take", lead_magnet: "lead_magnet", refresh: "rewrite" };

const Out = z.preprocess((v) => (Array.isArray(v) ? { items: v } : v), z.object({
  items: z.array(z.object({
    i: z.number().int(),
    magnet_type: z.string().nullable().catch(null),
    spokes: z.array(z.object({ channel: z.string(), timing: z.string().catch(""), why: z.string().catch("") })).catch([]),
    video: z.boolean().catch(false),
    why: z.string().catch(""),
  })),
}));

type T = {
  id: string; title_ja: string; kind: string; slot: Slot | null; origin: string; magnet_format: string | null;
  search_intent: string | null; primary_keyword: string | null; created_at: Date; week_of: string;
  score_breakdown: { demand?: number; demand_source?: string; fit?: number } | null;
  signal_type: string | null; best_strength: number | null; best_outlets: number | null; momentum: number | null; signals: number;
};

export async function planFormats(topicIds: string[]): Promise<{ planned: number }> {
  if (!topicIds.length) return { planned: 0 };
  const topics = await sql<T[]>`
    select t.id, t.title_ja, t.kind, t.slot, t.origin, t.magnet_format, t.search_intent, t.primary_keyword, t.created_at,
           t.week_of::text, t.score_breakdown,
           (select s.signal_type from topic_signals ts join signals s on s.id = ts.signal_id
             where ts.topic_id = t.id and s.signal_type is not null order by s.relevance desc nulls last limit 1) as signal_type,
           (select max(st.strength) from topic_signals ts join signals s on s.id = ts.signal_id join stories st on st.id = s.story_id
             where ts.topic_id = t.id) as best_strength,
           (select max(st.outlets) from topic_signals ts join signals s on s.id = ts.signal_id join stories st on st.id = s.story_id
             where ts.topic_id = t.id) as best_outlets,
           (select max((st.strength_parts->>'momentum')::int) from topic_signals ts join signals s on s.id = ts.signal_id join stories st on st.id = s.story_id
             where ts.topic_id = t.id) as momentum,
           (select count(*)::int from topic_signals ts where ts.topic_id = t.id) as signals
    from topics t where t.id = any(${topicIds}::uuid[])
    order by t.score desc nulls last`;
  const [channels, results] = await Promise.all([enabledChannels(), resultsSummary().catch(() => "")]);
  const slotOf = (t: T): Slot => t.slot ?? (t.kind === "lead_magnet" ? "lead_magnet" : t.origin === "refresh" ? "refresh" : "evergreen");
  const firstWeekOfMonth = Number((topics[0]?.week_of ?? "2000-01-01").slice(8, 10)) <= 7;

  const out = await generateJson(
    [
      "You plan the distribution of Renesis Tech Japan's weekly content (B2B, Japanese market). Goal: maximum",
      "traffic, emails and inquiries on renesistech.jp. Every topic already has an on-site HUB (article or lead",
      "magnet). Choose the off-site SPOKES that will bring the most people to that hub. Rules:",
      "- Only use these channels: " + channels.map((c) => `${c} (${CHANNELS[c].formatLabel})`).join(", ") + ".",
      "- X thread: fast takes, risks, data; post within 24h for fast takes. Japan's strongest social channel.",
      "- LinkedIn carousel: surveys/statistics, case studies, checklists, step-by-step guides (visual, shareable).",
      "- LinkedIn article: an expert's own 2,000–3,500 character article on LinkedIn (posted from a person's profile).",
      "  LinkedIn is the most-cited source in AI answers for business questions, so use it for topics buyers ask",
      "  AI about: how to choose, cost, comparisons, regulation explained, evergreen guides. Not for minor news.",
      "- LinkedIn posts: 3–5 short posts (one idea each) cut from the article or hub over ~2 weeks. Add it",
      "  whenever you choose a LinkedIn article; it can also stand alone for fast takes.",
      "- Do not pick all three LinkedIn formats for one topic; carousel OR article (+ posts).",
      "- note.com post: opinions/trends, case studies, deeper essays for Japanese business readers.",
      "- Newsletter: include every hub and lead magnet (cheap, repeat visits).",
      "- 2–5 spokes per topic; fewer for low-reach evergreen topics. Never a spoke without a reason.",
      firstWeekOfMonth && channels.includes("youtube")
        ? "- YouTube: this is the first week of the month: set video=true for exactly ONE topic, the best explainer candidate (a trend or regulation people need explained)."
        : "- YouTube: not this week (video=false for all).",
      "- Lead magnets: choose magnet_type by the reader's need: " +
        Object.entries(MAGNET_TYPES).map(([k, v]) => `${k} = ${v.when}`).join("; ") + ". Other topics: magnet_type null.",
      "- timing: when to post relative to the hub going live, e.g. \"same day\", \"within 24h\", \"day 3\", \"in Friday newsletter\".",
      "- why: ENGLISH ONLY, max 140 characters, for the whole plan: why this mix will bring traffic.",
      "",
      ...(results ? [results, ""] : []),
      "TOPICS:",
      ...topics.map((t, i) => [
        `[${i}] ${t.title_ja}`,
        `    slot: ${slotOf(t)}, intent: ${t.search_intent ?? "-"}, keyword: ${t.primary_keyword ?? "-"}`,
        `    news type: ${t.signal_type ?? "evergreen (no news)"}, story strength: ${t.best_strength ?? "-"}, outlets: ${t.best_outlets ?? "-"}`,
        `    search demand pts: ${t.score_breakdown?.demand ?? "-"}/40, service fit: ${t.score_breakdown?.fit ?? "-"}/30`,
      ].join("\n")),
      "",
      'Return ONLY JSON: {"items":[{"i":0,"magnet_type":null,"spokes":[{"channel":"x","timing":"","why":""}],"video":false,"why":""}]}',
    ].join("\n"),
    Out,
    { temperature: 0.3 },
  );

  let planned = 0;
  let videoUsed = false;
  const nth = new Map<string, number>(); // order within each slot, to spread evergreen days
  for (const [i, t] of topics.entries()) {
    const it = out.items.find((x) => x.i === i);
    const slot = slotOf(t);
    const spokes = (it?.spokes ?? [])
      .filter((s): s is { channel: Channel; timing: string; why: string } => channels.includes(s.channel as Channel) && s.channel !== "youtube")
      .filter((s, k, a) => a.findIndex((x) => x.channel === s.channel) === k);
    if (spokes.some((s) => s.channel === "linkedin_article")) {
      const c = spokes.findIndex((s) => s.channel === "linkedin");
      if (c >= 0) spokes.splice(c, 1); // article replaces the carousel
      if (channels.includes("linkedin_posts") && !spokes.some((s) => s.channel === "linkedin_posts")) {
        spokes.push({ channel: "linkedin_posts", timing: "days 2–14, 2–3 a week", why: "Short posts cut from the article keep the expert visible and point to it." });
      }
    }
    if (channels.includes("newsletter") && !spokes.some((s) => s.channel === "newsletter")) spokes.push({ channel: "newsletter", timing: "next newsletter", why: "Every hub goes in the newsletter for repeat visits." });
    const video = !!it?.video && firstWeekOfMonth && channels.includes("youtube") && !videoUsed;
    if (video) {
      videoUsed = true;
      spokes.push({ channel: "youtube", timing: "within 2 weeks", why: "This month's explainer video, linking to the article." });
    }
    const magnet = slot === "lead_magnet"
      ? ((it?.magnet_type && it.magnet_type in MAGNET_TYPES ? it.magnet_type : t.magnet_format && t.magnet_format in MAGNET_TYPES ? t.magnet_format : "checklist") as MagnetType)
      : null;
    const plan: FormatPlan = { hub: HUB_BY_SLOT[slot], magnet_type: magnet, spokes, why: it?.why ?? "", video };
    const scores = formatScores({
      demandPts: t.score_breakdown?.demand ?? 0, demandFromGsc: t.score_breakdown?.demand_source === "search_console",
      fitPts: t.score_breakdown?.fit ?? 0, intent: t.search_intent, kind: t.kind,
      bestStrength: t.best_strength, bestOutlets: t.best_outlets ?? 0, momentumPts: t.momentum, signalType: t.signal_type, plan,
    });
    await sql`
      update topics set slot = ${slot}, format_plan = ${sql.json(plan as never)}, format_scores = ${sql.json(scores as never)},
        magnet_format = ${slot === "lead_magnet" ? magnet : sql`magnet_format`},
        deadline = ${slot === "fast_take" ? new Date(new Date(t.created_at).getTime() + 48 * 3_600_000) : null},
        planned_date = coalesce(planned_date, ${plannedHubDate(t.week_of, slot, nth.get(slot) ?? 0)}::date)
      where id = ${t.id}`;
    nth.set(slot, (nth.get(slot) ?? 0) + 1);
    planned++;
  }
  return { planned };
}
