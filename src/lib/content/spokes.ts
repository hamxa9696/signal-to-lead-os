// Ready-to-paste prompts for each off-site spoke (X thread, LinkedIn carousel, note.com post,
// newsletter blurb, YouTube script). Each carries a tracked link back to the on-site hub.
import { CHANNELS, type Channel } from "../formats";
import type { PackageInput } from "./package";

const SITE = "https://renesistech.jp";

/** Tracked hub link; before the hub is live, a placeholder plus the tracking tags to append. */
export function hubLink(hubUrl: string | null, channel: Channel, topicId: string): string {
  const c = CHANNELS[channel];
  const qs = `utm_source=${c.utm.source}&utm_medium=${c.utm.medium}&utm_campaign=kizashi-${topicId.slice(0, 8)}&utm_content=${c.format}`;
  return hubUrl ? `${hubUrl}${hubUrl.includes("?") ? "&" : "?"}${qs}` : `【公開後の記事URL】?${qs}`;
}

function context(t: PackageInput): string[] {
  const facts = [
    ...(t.research?.points ?? []).map((p) => `- ${p.text}`),
    ...t.signals.slice(0, 4).map((s) => `- ${s.title}${s.source ? `（${s.source}）` : ""}${s.url ? ` ${s.url}` : ""}`),
  ];
  return [
    `Topic: ${t.title_ja}${t.title_en ? ` (${t.title_en})` : ""}`,
    `Main keyword: ${t.keyword_plan?.primary ?? t.primary_keyword ?? "-"}`,
    t.persona ? `Reader: ${t.persona}` : "Reader: 日本企業の情報システム部門・DX推進・経営企画の管理職",
    t.rationale ? `Why now: ${t.rationale}` : "",
    "",
    "Facts you may use (never invent numbers, clients or prices; write [要確認] if unsure):",
    ...(facts.length ? facts : ["- (use general, verifiable knowledge only)"]),
    "",
    "Article outline (the full article lives on the website):",
    ...(t.outline ?? []).map((h, i) => `${i + 1}. ${h}`),
  ].filter((l) => l !== "");
}

const RULES = [
  "Write in natural, native-level Japanese for Japanese business readers. No sales pitch, no exaggeration,",
  "no emojis overload (max 2). Keep one useful thing back for the full article so readers have a reason to click.",
];

export function spokePrompt(channel: Channel, t: PackageInput & { id: string }, hubUrl: string | null): string {
  const link = hubLink(hubUrl, channel, t.id);
  const base = [...RULES, "", ...context(t), ""];
  switch (channel) {
    case "x":
      return [
        "Write an X (Twitter) thread in Japanese, 5–7 posts, each ≤ 140 characters.",
        ...base,
        "Format:",
        "1/ A hook: the most surprising fact or the reader's pain, in one line. No link in this post.",
        "2/–5/ One concrete point per post (numbers, steps, what to check).",
        "Last/ What the full article covers + the link below. 1–2 relevant hashtags at most.",
        "",
        `Link (use exactly): ${link}`,
        "Also give one alternative hook for post 1/.",
      ].join("\n");
    case "linkedin":
      return [
        "Write a LinkedIn carousel (PDF slides) in Japanese, 7–9 slides, plus the post caption.",
        ...base,
        "For each slide give: タイトル (≤ 20 characters) and 本文 (≤ 60 characters), plus a visual hint (icon/chart).",
        "Slide 1: a hook title that promises a clear payoff. Last slide: the key takeaway + 「詳しくはコメント欄のリンクから」.",
        "Caption: 3–4 short lines, a question to invite comments, no link in the caption.",
        `First comment (post it right after publishing): one line + ${link}`,
      ].join("\n");
    case "note":
      return [
        "Write a note.com post in Japanese, 1,500–2,500 characters: a personal, insightful essay (not an ad).",
        ...base,
        "Structure: a short story or observation → 3 insights with headings (##) → what readers should do next.",
        `Link to the full guide naturally once in the middle and once at the end: ${link}`,
        "Give a title (≤ 40 characters) and 3 note hashtags.",
      ].join("\n");
    case "newsletter":
      return [
        "Write a newsletter (メルマガ) item in Japanese for existing readers.",
        ...base,
        "Give: 件名 (subject, ≤ 30 characters), 3–4 sentence summary that creates curiosity, and a CTA line.",
        `CTA link: ${link}`,
      ].join("\n");
    case "youtube":
      return [
        "Write a 5–7 minute YouTube explainer script in Japanese (talking head or narrated slides).",
        ...base,
        "Give: title (≤ 40 characters, with the main keyword), thumbnail text (≤ 12 characters),",
        "a 15-second hook, then sections with timestamps (00:00 …), what to show on screen for each,",
        "and a closing call to action to read the full guide.",
        `Description: 3 lines + chapters + the link: ${link}`,
      ].join("\n");
  }
}

export const SPOKE_SITE = SITE;
