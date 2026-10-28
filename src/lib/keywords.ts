// Suggested keywords for a topic. Candidates are real Japanese searches: Google's search
// suggestions for the topic's keywords (+ common buyer modifiers) and Search Console queries.
// Gemini then picks the ones most likely to rank and bring buyers. Free, no API key.
import { z } from "zod";
import { sql } from "./db";
import { generateJson } from "./gemini";

const MODIFIERS = ["とは", "費用", "比較", "事例", "方法", "メリット", "選び方", "外注"];
const MAX_CANDIDATES = 120;

export type PlannedKeyword = {
  kw: string;
  intent: "informational" | "commercial" | "transactional" | "navigational";
  role: "primary" | "heading" | "long_tail" | "faq";
  competition: "low" | "medium" | "high";
  why: string;
  source: "google_suggest" | "search_console" | "topic";
};
export type KeywordPlan = { primary: string; keywords: PlannedKeyword[]; candidates: number };

/** Google's search suggestions (what people actually type in Japan) for one phrase. */
export async function googleSuggest(q: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&hl=ja&gl=jp&ie=utf-8&oe=utf-8&q=${encodeURIComponent(q)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; RenesisSignalBot/0.2)" }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as [string, string[]];
    return Array.isArray(data?.[1]) ? data[1] : [];
  } catch {
    return [];
  }
}

const Out = z.object({
  primary: z.string().min(2),
  keywords: z.array(z.object({
    kw: z.string().min(2),
    intent: z.enum(["informational", "commercial", "transactional", "navigational"]).catch("informational"),
    role: z.enum(["primary", "heading", "long_tail", "faq"]).catch("long_tail"),
    competition: z.enum(["low", "medium", "high"]).catch("medium"),
    why: z.string().catch(""),
  })).min(1),
});

export async function buildKeywordPlan(topicId: string): Promise<KeywordPlan> {
  const [t] = await sql<{ title_ja: string; primary_keyword: string | null; secondary_keywords: string[]; kind: string; persona: string | null; service: string | null }[]>`
    select t.title_ja, t.primary_keyword, t.secondary_keywords, t.kind, i.name as persona, sv.name_ja as service
    from topics t left join icps i on i.id = t.icp_id left join services sv on sv.id = t.service_id
    where t.id = ${topicId}`;
  if (!t) throw new Error("topic not found");
  const primary = (t.primary_keyword ?? t.title_ja).trim();
  const seeds = [primary, ...t.secondary_keywords.slice(0, 4)];

  // Google returns few suggestions for long phrases, so also ask for the head term (first word)
  // with buyer modifiers, and each seed followed by a space ("what comes next").
  const head = primary.split(/\s+/)[0];
  const queries = [
    ...seeds, ...seeds.map((s) => `${s} `), `${head} `,
    ...MODIFIERS.map((m) => `${head} ${m}`), ...MODIFIERS.slice(0, 4).map((m) => `${primary} ${m}`),
  ];
  const lists = await Promise.all([...new Set(queries)].map(googleSuggest));
  // Merge variants that differ only in case/width (Google lowercases: "aiエージェント").
  const norm = (k: string) => k.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const byNorm = new Map<string, string>();
  for (const k of [...seeds, ...lists.flat()]) {
    const key = norm(k);
    if (key && !byNorm.has(key)) byNorm.set(key, k.trim().replace(/^ai/i, "AI"));
  }
  const fromGoogle = new Set(lists.flat().map((k) => byNorm.get(norm(k))!).filter(Boolean));

  // Search Console queries that share a word with the primary keyword (once data exists).
  const words = primary.split(/\s+/).filter((w) => w.length >= 2);
  const gsc = words.length
    ? await sql<{ query: string; impressions: number; position: number }[]>`
        select query, sum(impressions)::int as impressions, (sum(position * impressions) / nullif(sum(impressions), 0))::float as position
        from search_queries_daily
        where date >= current_date - 90 and query ilike any(${words.map((w) => `%${w}%`)})
        group by query order by 2 desc limit 30`.catch(() => [])
    : [];

  const candidates = [...new Set([...seeds, ...fromGoogle, ...gsc.map((g) => byNorm.get(norm(g.query)) ?? g.query)])].slice(0, MAX_CANDIDATES);
  const source = (kw: string): PlannedKeyword["source"] =>
    gsc.some((g) => g.query === kw) ? "search_console" : fromGoogle.has(kw) ? "google_suggest" : "topic";

  const out = await generateJson(
    [
      "You are an SEO strategist for Renesis Tech Japan (renesistech.jp), a B2B AI/software firm writing in Japanese.",
      `Article: ${t.title_ja} (${t.kind === "lead_magnet" ? "lead magnet landing page" : "blog article"})`,
      t.persona ? `Reader: ${t.persona}` : "",
      t.service ? `Service it should lead to: ${t.service}` : "",
      "",
      "From the CANDIDATE keywords (real Japanese searches from Google suggestions and Search Console), choose",
      "8–12 that give this article the best chance to rank on Google Japan AND attract business buyers.",
      "- primary: the single best main keyword for the title (may differ from the current one if a candidate is better).",
      "- role: primary (1), heading (use as an H2), long_tail (work into the body), faq (answer as a FAQ question).",
      "- Prefer specific long-tail phrases a small site can win over broad head terms; drop consumer/irrelevant ones.",
      "- competition: your estimate of how hard it is to rank (low/medium/high) for a young B2B site.",
      "- why: ENGLISH ONLY, max 90 characters.",
      "- Only use keywords from the CANDIDATES list, copied exactly.",
      "",
      "CANDIDATES:",
      ...candidates.map((c) => {
        const g = gsc.find((x) => x.query === c);
        return `- ${c}${g ? ` (Search Console: ${g.impressions} impressions, position ${g.position.toFixed(1)})` : ""}`;
      }),
      "",
      'Return ONLY JSON: {"primary":"","keywords":[{"kw":"","intent":"informational","role":"heading","competition":"medium","why":""}]}',
    ].filter((l) => l !== "").join("\n"),
    Out,
    { temperature: 0.2 },
  );

  const allowed = new Set(candidates);
  const plan: KeywordPlan = {
    primary: allowed.has(out.primary) ? out.primary : primary,
    keywords: out.keywords.filter((k) => allowed.has(k.kw)).map((k) => ({ ...k, source: source(k.kw) })),
    candidates: candidates.length,
  };
  await sql`update topics set keyword_plan = ${sql.json(plan as never)}, keyword_plan_at = now() where id = ${topicId}`;
  return plan;
}
