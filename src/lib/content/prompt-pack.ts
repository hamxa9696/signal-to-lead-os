// Builds the ready-to-paste prompt for ChatGPT / Claude. Deterministic: no AI call.
import type { Knowledge } from "./knowledge";
import type { TopicFull } from "./topic";

const SITE = "https://renesistech.jp";

const MAGNET_SPECS: Record<string, string> = {
  checklist:
    "A practical checklist of 25–40 items grouped under 4–6 ## stage headings. Each item is one line: `- 項目 — なぜ重要か（1文）`. Start with a 2–3 sentence 使い方 paragraph, end with a short 判定の目安 section (how to read the result).",
  calculator:
    "A spreadsheet-ready calculator spec: ## 入力項目 (each input with unit and a typical range), ## 計算式 (plain formulas), ## 計算例 (one fully worked example with realistic numbers marked as 例), ## 前提と注意点.",
  comparison:
    "A comparison guide: ## 比較の観点 (6–10 criteria with why each matters), then one ## section per option with 向いているケース / 注意点, then ## 選び方のフロー as a numbered decision list. You MAY use one Markdown table here.",
  template:
    "A fill-in template the reader can copy: ## sections with placeholders in 【】 and one line of guidance under each placeholder, followed by ## 記入例 with a short realistic example marked as 例.",
  mini_report:
    "A 2,000–3,000 character mini report: ## 要約 (3 bullets), ## 背景, ## 主なポイント (3–5 H3 findings), ## 日本企業への示唆, ## 次の一手. Cite the background sources by name where you use them.",
};

function targetReader(t: TopicFull): string[] {
  const p = t.persona;
  if (!p) return ["- Target reader: 日本企業の情報システム部門・DX推進・経営企画の管理職"];
  return [
    `- Target reader: ${p.name}${p.description ? `（${p.description}）` : ""}`,
    p.pains && `- Their problems (address these directly): ${p.pains}`,
    p.industries.length && `- Their industries (use examples from these): ${p.industries.join("、")}`,
  ].filter((l): l is string => Boolean(l));
}

export function buildPromptPack(t: TopicFull, k: Knowledge, existing?: { markdown: string; url: string } | null): string {
  if (t.origin === "refresh") return buildRefreshPack(t, k, existing ?? null);
  const isMagnet = t.kind === "lead_magnet";
  const links = [
    t.service_url && `- ${t.service_name}: ${t.service_url}`,
    `- 無料AI業務診断: ${SITE}/ai-shindan`,
    `- 成功事例: ${SITE}/success-stories`,
    `- RAEFフレームワーク: ${SITE}/renesis-autonomous-enterprise-framework`,
    `- お問い合わせ: ${SITE}/contact`,
  ].filter(Boolean);

  const sources = t.signals.length
    ? t.signals.map((s) => `- ${s.title}${s.url ? ` (${s.url})` : ""}${s.buyer_problem ? ` — 課題: ${s.buyer_problem}` : ""}`)
    : ["- (none: this is an evergreen topic)"];

  return [
    `You are a senior Japanese B2B content writer for Renesis Tech Japan (${SITE}).`,
    isMagnet
      ? `Write a downloadable lead magnet (${t.magnet_format}) in natural, native-level Japanese.`
      : "Write one SEO blog article in natural, native-level Japanese.",
    "Follow the STYLE GUIDE and use ONLY facts from the FACT SHEET. Never invent clients, statistics or prices.",
    "If you need a number or claim you cannot support, write [要確認] right after it.",
    "",
    "## Assignment",
    `- Working title: ${t.title_ja}${t.title_en ? ` (${t.title_en})` : ""}`,
    `- Primary keyword: ${t.primary_keyword ?? "-"}`,
    `- Secondary keywords: ${t.secondary_keywords.join("、") || "-"}`,
    `- Search intent: ${t.search_intent ?? "-"}`,
    `- Why this topic: ${t.rationale ?? "-"}`,
    ...targetReader(t),
    `- Call to action: ${t.cta ?? "無料AI業務診断へ誘導"}`,
    "",
    isMagnet ? "## Content specification" : "## Suggested outline (improve it if you can)",
    ...(isMagnet
      ? [MAGNET_SPECS[t.magnet_format ?? ""] ?? MAGNET_SPECS.checklist, "", "Suggested sections:", ...(t.outline ?? []).map((h) => `- ${h}`)]
      : (t.outline ?? []).map((h, i) => `${i + 1}. ${h}`)),
    "",
    "## Requirements",
    ...(isMagnet
      ? [
          "- Specific, reusable, worth trading an email address for. No sales pitch inside the content except one closing paragraph.",
          "- The closing paragraph points to the matching service page or the free AI業務診断.",
          "- You may improve the working title. If the title states a number (〇項目, 〇つ), it must equal the real count in the content.",
        ]
      : [
          "- 4,000–6,000 Japanese characters.",
          "- The first two paragraphs answer the primary keyword's intent directly.",
          "- Use the primary keyword in the title and the first paragraph; use secondary keywords naturally.",
          "- 5–8 H2 sections, finishing with ## まとめ, then a CTA paragraph with a link from INTERNAL LINKS.",
          "- Add 1–3 internal links in the body where they genuinely help the reader.",
        ]),
    "",
    "## Internal links you may use",
    ...links,
    "",
    "## Background sources (for context only: do not copy or translate them)",
    ...sources,
    "",
    "## Output format (exactly this, nothing before or after)",
    "```",
    "---",
    `title: ${isMagnet ? "資料タイトル（40字以内）" : "記事タイトル（40字以内、主キーワードを含む）"}`,
    "slug: english-kebab-case-slug",
    "meta_title: 検索結果用タイトル（32字以内）",
    "meta_description: 検索結果用説明文（80〜120字）",
    "excerpt: 一覧ページ用の要約（100〜150字）",
    ...(isMagnet
      ? [
          "landing_lead: ダウンロードページの導入文（2〜3文、120〜200字。誰のどんな課題を解決する資料か）",
          "landing_bullets:",
          "  - この資料でわかること（3〜5項目、各40字以内）",
          "landing_for:",
          "  - こんな方におすすめ（3項目、各40字以内）",
        ]
      : []),
    "---",
    "",
    "## 最初の見出し",
    "",
    "本文…",
    "```",
    isMagnet
      ? "Markdown only. Do not include an H1 (the title is added automatically). No images or HTML."
      : "Markdown only: ## / ### headings, paragraphs, - and 1. lists, **bold**, [links](url). No H1, no tables, no images, no code blocks, no HTML.",
    "",
    "---",
    "## STYLE GUIDE",
    k.styleGuide || "(empty)",
    "",
    "## PHRASES YOU MUST NOT USE",
    k.bannedPhrases.map((p) => `- ${p}`).join("\n") || "(none)",
    "",
    "## FACT SHEET",
    k.factSheet || "(empty)",
  ].join("\n");
}

/** Rewrite of an existing live article that ranks on page 2 of Google. */
function buildRefreshPack(t: TopicFull, k: Knowledge, existing: { markdown: string; url: string } | null): string {
  return [
    `You are a senior Japanese B2B content editor for Renesis Tech Japan (${SITE}).`,
    "Update the EXISTING ARTICLE below so it can reach page 1 of Google for the target queries.",
    "Keep what is accurate and useful; fix what is weak. Follow the STYLE GUIDE and use ONLY facts from the FACT SHEET.",
    "If you need a number or claim you cannot support, write [要確認] right after it.",
    "",
    "## Why this page",
    `- ${t.rationale ?? "Ranks on page 2 of Google."}`,
    `- URL: ${existing?.url ?? SITE + (t.target_path ?? "")}`,
    `- Main query: ${t.primary_keyword ?? "-"}`,
    `- Other queries it appears for: ${t.secondary_keywords.join("、") || "-"}`,
    "",
    "## What to change",
    "- Make the title and first two paragraphs answer the main query directly.",
    "- Add sections or FAQs that cover the other queries where they genuinely fit.",
    "- Update anything outdated; remove filler and repetition; strengthen specifics.",
    "- Keep the same slug (the URL must not change). Target 4,000–6,000 Japanese characters.",
    "- End with ## まとめ and a CTA paragraph linking to the matching service page or the free AI業務診断.",
    "",
    "## Output format (exactly this, nothing before or after)",
    "```",
    "---",
    "title: 更新後のタイトル（40字以内、主キーワードを含む）",
    `slug: ${t.target_path?.split("/").pop() ?? "same-slug-as-before"}`,
    "meta_title: 検索結果用タイトル（32字以内）",
    "meta_description: 検索結果用説明文（80〜120字）",
    "excerpt: 一覧ページ用の要約（100〜150字）",
    "---",
    "",
    "## 最初の見出し",
    "",
    "本文…",
    "```",
    "Markdown only: ## / ### headings, paragraphs, - and 1. lists, **bold**, [links](url). No H1, no tables, no images, no HTML.",
    "",
    "## EXISTING ARTICLE",
    existing?.markdown?.slice(0, 20000) || "(could not load the current text: open the URL above and paste it below this line)",
    "",
    "---",
    "## STYLE GUIDE",
    k.styleGuide || "(empty)",
    "",
    "## PHRASES YOU MUST NOT USE",
    k.bannedPhrases.map((p) => `- ${p}`).join("\n") || "(none)",
    "",
    "## FACT SHEET",
    k.factSheet || "(empty)",
  ].join("\n");
}
