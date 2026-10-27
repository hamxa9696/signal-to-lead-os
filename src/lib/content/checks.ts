// Deterministic checks run on every draft version, before and alongside the Gemini review.
import { charCount, type ParsedDraft } from "./draft";
import type { Knowledge } from "./knowledge";
import type { TopicFull } from "./topic";

export type Check = { id: string; label: string; ok: boolean; blocking: boolean; detail: string };

const len = (s?: string) => [...(s ?? "")].length;

export function runChecks(d: ParsedDraft, t: TopicFull, k: Knowledge): Check[] {
  const fm = d.frontmatter;
  const body = d.body;
  const isArticle = t.kind === "article";
  const checks: Check[] = [];
  const add = (id: string, label: string, ok: boolean, blocking: boolean, detail: string) =>
    checks.push({ id, label, ok, blocking, detail });

  add("parse", "Frontmatter parsed", d.errors.length === 0, true, d.errors.join("; ") || "ok");
  add("title", "Title (≤ 45 chars)", len(fm.title) > 0 && len(fm.title) <= 45, true, `${len(fm.title)} chars`);
  add("slug", "Slug is lowercase-kebab ASCII", /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fm.slug ?? ""), true, fm.slug || "missing");
  add("meta_title", "Meta title (≤ 35 chars)", len(fm.meta_title) > 0 && len(fm.meta_title) <= 35, false, `${len(fm.meta_title)} chars`);
  add(
    "meta_description",
    "Meta description (70–130 chars)",
    len(fm.meta_description) >= 70 && len(fm.meta_description) <= 130,
    false,
    `${len(fm.meta_description)} chars`,
  );
  add("excerpt", "Excerpt present", len(fm.excerpt) >= 40, false, `${len(fm.excerpt)} chars`);

  const chars = charCount(body);
  if (isArticle) {
    add("length", "Length 4,000–6,000 chars", chars >= 4000 && chars <= 6000, chars < 3000, `${chars.toLocaleString()} chars`);
    const h2 = (body.match(/^##\s+/gm) ?? []).length;
    add("h2", "5–8 H2 sections", h2 >= 5 && h2 <= 9, h2 < 3, `${h2} H2`);
    add("matome", "Has まとめ section", /^##\s+.*まとめ/m.test(body), false, "");
  } else {
    add("length", "Length ≥ 1,500 chars", chars >= 1500, chars < 800, `${chars.toLocaleString()} chars`);
    const bullets = fm.landing_bullets ?? [];
    const forWho = fm.landing_for ?? [];
    add("landing_lead", "Landing intro (80–220 chars)", len(fm.landing_lead) >= 80 && len(fm.landing_lead) <= 220, true, `${len(fm.landing_lead)} chars`);
    add("landing_bullets", "3–5 “what you'll learn” bullets", Array.isArray(bullets) && bullets.length >= 3 && bullets.length <= 6, true, `${bullets.length ?? 0}`);
    add("landing_for", "2–4 “recommended for” bullets", Array.isArray(forWho) && forWho.length >= 2 && forWho.length <= 4, false, `${forWho.length ?? 0}`);
  }

  // A number promised in the title (10項目 / 5つ / 7選 / 3ステップ) must match the content.
  const promised = (fm.title ?? "").match(/(\d+)\s*(項目|つの|つ|選|ステップ|のポイント|ポイント)/);
  if (promised) {
    const n = Number(promised[1]);
    const items = isArticle ? (body.match(/^###?\s+/gm) ?? []).length : (body.match(/^\s*(?:[-*]|\d+\.)\s+/gm) ?? []).length;
    const h2 = (body.match(/^##\s+/gm) ?? []).length;
    const ok = isArticle ? Math.abs(h2 - n) <= 2 || Math.abs(items - n) <= 2 : Math.abs(items - n) <= 2;
    add("title_promise", `Title promise “${promised[0]}” matches the content`, ok, !isArticle, isArticle ? `${h2} H2 / ${items} headings` : `${items} items`);
  }

  add("no_h1", "No H1 in body", !/^#\s+/m.test(body), true, "");
  if (isArticle) {
    const unsupported = [
      /^\|.*\|\s*$/m.test(body) && "table",
      /!\[[^\]]*\]\([^)]*\)/.test(body) && "image",
      /^```/m.test(body) && "code block",
      /<[a-z][^>]*>/i.test(body) && "HTML",
    ].filter(Boolean);
    add("cms_safe", "Only CMS-safe Markdown", unsupported.length === 0, true, unsupported.join(", ") || "ok");
  }

  // Keyword: every space-separated token of the primary keyword must appear.
  const tokens = (t.primary_keyword ?? "").split(/[\s　]+/).filter(Boolean);
  const inTitle = tokens.every((tk) => (fm.title ?? "").includes(tk));
  const inIntro = tokens.every((tk) => body.slice(0, 500).includes(tk));
  add("kw_title", "Primary keyword in title", tokens.length === 0 || inTitle, false, tokens.join(" + "));
  add("kw_intro", "Primary keyword in first paragraphs", tokens.length === 0 || inIntro, false, "");

  const banned = k.bannedPhrases.filter((p) => body.includes(p) || (fm.title ?? "").includes(p));
  add("banned", "No banned phrases", banned.length === 0, true, banned.join("、") || "none");

  const unresolved = (body.match(/\[要確認\]/g) ?? []).length;
  add("unresolved", "No [要確認] markers left", unresolved === 0, true, `${unresolved} found`);

  const links = [...body.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((m) => m[1]);
  const hasCta = links.some((u) => u.includes("renesistech.jp"));
  add("cta_link", "Links to a Renesis page", hasCta, false, `${links.length} links`);

  return checks;
}
