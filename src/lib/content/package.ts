// Everything about one topic as a single copyable brief (Markdown): what to write, who for, which
// keywords, the evidence behind it with URLs, and where it should link. Same text on the Topics
// list and the topic page.
import type { KeywordPlan } from "../keywords";
import type { Research } from "../research";

const SITE = "https://renesistech.jp";

export type PackageInput = {
  title_ja: string;
  title_en: string | null;
  kind: string;
  magnet_format: string | null;
  week_of?: string | null;
  score?: number | null;
  primary_keyword: string | null;
  secondary_keywords: string[];
  search_intent: string | null;
  rationale: string | null;
  outline: string[] | null;
  cta: string | null;
  persona?: string | null;
  service?: string | null;
  service_url?: string | null;
  keyword_plan: KeywordPlan | null;
  research: Research | null;
  signals: { title: string; url: string | null; source?: string | null; published?: string | null; why?: string | null }[];
};

const ROLE: Record<string, string> = { primary: "Main keyword", heading: "Use as H2 headings", long_tail: "Work into the body", faq: "Answer as FAQ" };

export function topicPackage(t: PackageInput): string {
  const plan = t.keyword_plan;
  const lines: (string | false | null | undefined)[] = [
    `# ${t.title_ja}`,
    t.title_en && `(${t.title_en})`,
    "",
    `- Type: ${t.kind === "lead_magnet" ? `Lead magnet (${t.magnet_format ?? "-"})` : "Blog article"}`,
    t.week_of && `- Week: ${t.week_of}`,
    t.score != null && `- Score: ${Math.round(t.score)}/100`,
    t.persona && `- Reader: ${t.persona}`,
    t.service && `- Service: ${t.service}${t.service_url ? ` — ${t.service_url}` : ""}`,
    t.search_intent && `- Search intent: ${t.search_intent}`,
    "",
    "## Why this topic",
    t.rationale || "-",
    "",
    "## Keywords",
    `- Main keyword: ${plan?.primary ?? t.primary_keyword ?? "-"}`,
    plan && t.primary_keyword && plan.primary !== t.primary_keyword && `- (Original main keyword: ${t.primary_keyword})`,
    t.secondary_keywords.length > 0 && `- Secondary: ${t.secondary_keywords.join("、")}`,
    ...(plan
      ? (["heading", "long_tail", "faq"] as const).flatMap((r) => {
          const ks = plan.keywords.filter((k) => k.role === r);
          return ks.length ? [`- ${ROLE[r]}: ${ks.map((k) => `${k.kw} (${k.competition})`).join("、")}`] : [];
        })
      : []),
    plan && `- Source: ${plan.candidates} real Google Japan searches (suggestions + Search Console), ranked by Gemini.`,
    "",
    "## Outline",
    ...((t.outline ?? []).length ? (t.outline ?? []).map((h, i) => `${i + 1}. ${h}`) : ["-"]),
    "",
    "## Call to action",
    t.cta || `Free AI業務診断: ${SITE}/ai-shindan`,
    "",
    "## Signals behind it",
    ...(t.signals.length
      ? t.signals.map((s) => `- ${s.title}${s.source ? ` — ${s.source}` : ""}${s.published ? `, ${s.published}` : ""}${s.url ? `\n  ${s.url}` : ""}${s.why ? `\n  Why: ${s.why}` : ""}`)
      : ["- Evergreen topic: chosen for search demand, not a news item."]),
  ];

  const r = t.research;
  if (r && (r.points.length || r.sources.length)) {
    lines.push("", "## Research (recent Japanese coverage)");
    if (r.summary) lines.push(r.summary);
    lines.push(...r.points.map((p) => `- ${p.text}${p.refs.length ? ` [${p.refs.join(", ")}]` : ""}`));
    if (r.questions.length) lines.push("", "Reader questions:", ...r.questions.map((q) => `- ${q}`));
    lines.push("", "Sources:", ...r.sources.map((s) => `[${s.n}] ${s.title}${s.publisher ? ` — ${s.publisher}` : ""}${s.date ? `, ${s.date}` : ""}${s.url ? `\n    ${s.url}` : ""}`));
  }

  lines.push(
    "",
    "## Internal links",
    t.service_url && `- ${t.service ?? "Service page"}: ${t.service_url}`,
    `- Free AI業務診断: ${SITE}/ai-shindan`,
    `- Success stories: ${SITE}/success-stories`,
    `- Contact: ${SITE}/contact`,
  );
  return lines.filter((l) => l !== false && l !== null && l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
