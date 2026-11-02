// Ready-to-paste prompts for each off-site spoke (X thread, LinkedIn carousel / article / posts,
// note.com post, newsletter blurb, YouTube script). Each carries a tracked link back to the hub.
import { CHANNELS, type Channel } from "../formats";
import type { PackageInput } from "./package";
import { authorLine } from "../experts";

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
    t.author ? `Author (write in their voice, first person, from their profile): ${authorLine(t.author)}` : "Author: a named Renesis Tech Japan expert (add their name before posting; posts from a person's profile are cited far more than company pages)",
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
        "Post it from the author's personal profile (people are cited and shared far more than company pages).",
        ...base,
        "For each slide give: タイトル (≤ 20 characters) and 本文 (≤ 60 characters), plus a visual hint (icon/chart).",
        "Slide 1: a hook title that promises a clear payoff. Last slide: the key takeaway + 「詳しくはコメント欄のリンクから」.",
        "Caption: 3–4 short lines, a question to invite comments, no link in the caption.",
        `First comment (post it right after publishing): one line + ${link}`,
      ].join("\n");
    case "linkedin_article":
      return [
        "Write a LinkedIn ARTICLE in Japanese, 2,000–3,500 characters, published from the author's personal profile.",
        "Goal: be the source ChatGPT, Gemini, Copilot and Perplexity quote for this question. LinkedIn is the most-cited",
        "domain in AI answers to business questions, and AI quotes clear, structured, specific text almost word for word.",
        ...base,
        "This is the author's own take, NOT a copy of the website article: a different angle, their point of view, what",
        "they see in practice (no invented clients or numbers; use [要確認] where a real example is needed).",
        "",
        "Structure (follow exactly):",
        "- Title: the question a buyer would type into ChatGPT, main keyword first (the title becomes the URL).",
        "- **要点** right under the title: 3 bullets, each a complete answer on its own.",
        "- 4–6 ## headings phrased as buyer questions. The first paragraph under each = a 60–150 character direct answer",
        "  that makes sense quoted alone; then explanation, examples, a bullet or numbered list.",
        "- Name specific tools, companies, standards, laws and agencies (e.g. 金融庁, ERC-3643) instead of vague words.",
        "- Use hard numbers (costs, timelines, percentages) only with their source in the same sentence.",
        "- Include one evaluation framework: criteria to judge options, as a numbered list.",
        "- ## まとめ: a 3–5 item checklist of next steps.",
        "- End with a 2-sentence natural 著者紹介 (who they are, why their view counts).",
        `- Link the full guide once mid-article and once at the end: ${link}`,
        "No hashtags in the body; 3 relevant hashtags only at the very end. Also give a 1-line cover image idea.",
      ].join("\n");
    case "linkedin_posts":
      return [
        "Write a series of 4 LinkedIn POSTS in Japanese for the author's personal profile (original posts, not reshares;",
        "95% of LinkedIn content cited by AI is original posts). Post them 2–3 a week over two weeks.",
        ...base,
        "Rules for EVERY post:",
        "- 400–700 characters, ONE idea only (one statistic, one mistake, one criterion, one step).",
        "- First line = the core keyword + the takeaway in plain words. No hashtags, emojis or symbols in the first line",
        "  (the first line becomes the post's URL and what AI quotes).",
        "- Structure as a question and its answer, or a short list.",
        "- End with a clear takeaway and an open question that invites comments from practitioners.",
        "- Max 3 hashtags at the very end. No link in the body.",
        "",
        "Angles: post 1 = the most surprising fact; post 2 = a common mistake; post 3 = how to judge / choose;",
        "post 4 = a practical checklist. Label them 投稿1–4 and suggest a weekday for each.",
        `For each post, the first comment to add right after posting: one line + ${link}`,
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
