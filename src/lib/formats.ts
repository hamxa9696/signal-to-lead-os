// Content formats. Every topic has ONE hub on renesistech.jp (where traffic and leads land) and
// spokes on other channels that point to it. Channels can be switched on/off on /audience.
import { getSetting } from "./settings";

export const SLOTS = {
  evergreen: { label: "Evergreen SEO", short: "Evergreen", color: "#2F6B55", what: "An article people search for; builds Google traffic for months." },
  fast_take: { label: "Fast take (48h)", short: "Fast take", color: "#C8735A", what: "A quick article on a hot story, published within 48 hours while it is trending." },
  lead_magnet: { label: "Lead magnet", short: "Lead magnet", color: "#8A5A7A", what: "A downloadable resource that turns readers into emails and inquiries." },
  refresh: { label: "Rewrite", short: "Rewrite", color: "#4E7A8C", what: "Improve an existing page close to Google's first page." },
} as const;
export type Slot = keyof typeof SLOTS;

export const HUBS = {
  seo_article: { label: "SEO article", hours: 3 },
  news_take: { label: "Short news-take article", hours: 1.5 },
  lead_magnet: { label: "Lead magnet + landing page", hours: 5 },
  rewrite: { label: "Rewrite of an existing page", hours: 2 },
} as const;
export type Hub = keyof typeof HUBS;

export const MAGNET_TYPES = {
  checklist: { label: "Checklist", when: "a rule, deadline or risk to act on", hours: 4 },
  calculator: { label: "Calculator (cost / ROI)", when: "budgeting: 費用・相場・ROI", hours: 8 },
  comparison: { label: "Comparison guide (比較表)", when: "choosing between vendors or technologies", hours: 5 },
  template: { label: "Template (要件定義書 / RFP)", when: "planning or starting a project", hours: 4 },
  mini_report: { label: "Mini report / white paper", when: "needing the big picture or data", hours: 6 },
  self_assessment: { label: "Self-assessment quiz (自己診断)", when: "unsure where they stand; very shareable", hours: 5 },
  case_collection: { label: "Case-study collection (事例集)", when: "wanting proof it works", hours: 5 },
} as const;
export type MagnetType = keyof typeof MAGNET_TYPES;

export const CHANNELS = {
  x: { label: "X", format: "x_thread", formatLabel: "X thread", hours: 0.5, utm: { source: "x", medium: "social" } },
  linkedin: { label: "LinkedIn carousel", format: "carousel", formatLabel: "LinkedIn carousel", hours: 1, utm: { source: "linkedin", medium: "social" } },
  linkedin_article: { label: "LinkedIn article", format: "li_article", formatLabel: "LinkedIn article (expert)", hours: 1.5, utm: { source: "linkedin", medium: "social" } },
  linkedin_posts: { label: "LinkedIn posts", format: "li_posts", formatLabel: "LinkedIn post series (3–5)", hours: 0.75, utm: { source: "linkedin", medium: "social" } },
  note: { label: "note.com", format: "note_post", formatLabel: "note.com post", hours: 1, utm: { source: "note", medium: "referral" } },
  newsletter: { label: "Newsletter", format: "newsletter", formatLabel: "Newsletter blurb", hours: 0.3, utm: { source: "newsletter", medium: "email" } },
  youtube: { label: "YouTube (monthly)", format: "youtube_script", formatLabel: "YouTube explainer script", hours: 4, utm: { source: "youtube", medium: "video" } },
} as const;
export type Channel = keyof typeof CHANNELS;
export const DEFAULT_CHANNELS: Channel[] = ["x", "linkedin", "linkedin_article", "linkedin_posts", "note", "newsletter", "youtube"];

export async function enabledChannels(): Promise<Channel[]> {
  const v = await getSetting<Channel[]>("channels").catch(() => null);
  return Array.isArray(v) ? v.filter((c): c is Channel => c in CHANNELS) : DEFAULT_CHANNELS;
}

export type Spoke = { channel: Channel; timing: string; why: string };
export type FormatPlan = { hub: Hub; magnet_type?: MagnetType | null; spokes: Spoke[]; why: string; video?: boolean };
export type FormatScores = {
  search: number; reach: number; lead: number; effort_hours: number;
  notes: { search: string; reach: string; lead: string; effort: string };
};

/** Tracked link to the hub so GA4 shows which channel/format brought the visit. */
export function trackedUrl(hubUrl: string, channel: Channel, topicId: string): string {
  const c = CHANNELS[channel];
  const u = new URL(hubUrl);
  u.searchParams.set("utm_source", c.utm.source);
  u.searchParams.set("utm_medium", c.utm.medium);
  u.searchParams.set("utm_campaign", `kizashi-${topicId.slice(0, 8)}`);
  u.searchParams.set("utm_content", c.format);
  return u.toString();
}

/**
 * Four plain scores (0–100, effort in hours) so the plan is explainable:
 * search = will people Google it, reach = is it hot / shareable, lead = is the reader close to buying.
 */
export function formatScores(i: {
  demandPts: number; demandFromGsc: boolean; fitPts: number; intent: string | null; kind: string;
  bestStrength: number | null; bestOutlets: number; momentumPts: number | null; signalType: string | null; plan: FormatPlan;
}): FormatScores {
  const search = Math.round((i.demandPts / 40) * 100);
  const shareableType = i.signalType === "survey" || i.signalType === "incident" || i.signalType === "regulation";
  const reach = i.bestStrength == null
    ? 30
    : Math.min(100, Math.round(i.bestStrength * 0.7 + (i.momentumPts ?? 0) * 1.5 + (shareableType ? 10 : 0)));
  const lead = Math.min(100, Math.round((i.fitPts / 30) * 60 + (["commercial", "transactional"].includes(i.intent ?? "") ? 25 : 5) + (i.kind === "lead_magnet" ? 15 : 0)));
  const hubHours = i.plan.hub === "lead_magnet" && i.plan.magnet_type ? MAGNET_TYPES[i.plan.magnet_type].hours : HUBS[i.plan.hub].hours;
  const effort = hubHours + i.plan.spokes.reduce((a, s) => a + CHANNELS[s.channel].hours, 0);
  return {
    search, reach, lead, effort_hours: Math.round(effort * 10) / 10,
    notes: {
      search: i.demandFromGsc ? "From real Google impressions (Search Console)." : "Gemini's estimate of Google search demand (Search Console data not in yet).",
      reach: i.bestStrength == null
        ? "Evergreen topic with no news behind it: reach comes from search, not timing."
        : `Strongest story behind it scores ${i.bestStrength}/100 (${i.bestOutlets} outlet${i.bestOutlets === 1 ? "" : "s"})${shareableType ? "; data / risk / rule stories spread well" : ""}.`,
      lead: `Service fit ${i.fitPts}/30, search intent ${i.intent ?? "unknown"}${i.kind === "lead_magnet" ? ", and it is a lead magnet" : ""}.`,
      effort: `Hub ~${hubHours}h + ${i.plan.spokes.length} spoke${i.plan.spokes.length === 1 ? "" : "s"}.`,
    },
  };
}
