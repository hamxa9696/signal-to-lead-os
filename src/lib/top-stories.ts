// Top stories: the strongest news of the last few days, whatever its keywords or category, and the
// ways to use one (fast take, case study, white paper, checklist). Shared by Trends, Today, the
// Signals list and the daily breaking-story check.
import { z } from "zod";
import { sql } from "./db";
import { generateJson } from "./gemini";
import { env, has } from "./env";
import { activePersonas, loadTargeting, targetingBrief } from "./targeting";
import { plannedHubDate } from "./schedule";
import { weekOf } from "./week";
import type { Slot } from "./formats";

export const STORY_USES = {
  fast_take: { label: "Fast take", sub: "Article within 48h", kind: "article", slot: "fast_take", magnet: null,
    brief: "A fast take article published within 48 hours: what happened (3 key points), why it matters now, the impact on Japanese companies, and what to check or do this week." },
  case_study: { label: "Case study", sub: "Lessons article (事例から学ぶ)", kind: "article", slot: "evergreen", magnet: null,
    brief: "A case-study article that uses this story as the example: what happened, the causes or success factors, lessons, and how readers apply them. Written to stay useful and rank on Google after the news fades." },
  whitepaper: { label: "White paper", sub: "Lead magnet report", kind: "lead_magnet", slot: "lead_magnet", magnet: "mini_report",
    brief: "A downloadable white paper / mini report built around this story and the trend behind it: background, data, the risks or opportunities, a framework, and recommendations. Readers give their email for it." },
  checklist: { label: "Checklist", sub: "Lead magnet", kind: "lead_magnet", slot: "lead_magnet", magnet: "checklist",
    brief: "A downloadable checklist that turns this story's lessons into concrete items a manager can check in their own company. Readers give their email for it." },
} as const;
export type StoryUse = keyof typeof STORY_USES;
export const USE_KEYS = Object.keys(STORY_USES) as StoryUse[];

/** Best uses for a kind of news, best first. */
const BY_TYPE: Record<string, StoryUse[]> = {
  incident: ["fast_take", "checklist"],
  regulation: ["checklist", "fast_take"],
  survey: ["whitepaper", "fast_take"],
  case_study: ["case_study", "whitepaper"],
  launch: ["fast_take", "case_study"],
  funding: ["fast_take", "whitepaper"],
  partnership: ["fast_take", "case_study"],
  opinion: ["case_study", "fast_take"],
};
export const usesFor = (type: string | null): StoryUse[] => BY_TYPE[type ?? ""] ?? ["fast_take", "case_study"];

export type TopStory = {
  id: string; title: string; type: string | null; strength: number; outlets: number; articles: number;
  lastSeen: Date; saved: boolean; category: string | null; color: string | null; url: string | null; outlet: string | null;
  problem: string | null; uses: StoryUse[];
  planned: { id: string; title: string; status: string } | null; // a topic made from this story, or a fast take on it
  mentioned: { id: string; title: string } | null; // a topic that only cites one of its articles
  related: { id: string; title: string; strength: number }[];
};

// Latin words that name a subject rather than a company, so they don't merge unrelated stories.
const COMMON = new Set(["ai", "api", "dx", "it", "saas", "rpa", "rwa", "sto", "llm", "iot", "ceo", "cfo", "cto", "web", "web3", "pr", "times", "news", "nft", "erp", "crm", "oci", "php", "aws"]);
const names = (t: string) => new Set((t.match(/[A-Za-z][A-Za-z0-9]{2,}/g) ?? []).map((w) => w.toLowerCase()).filter((w) => !COMMON.has(w)));

/** The strongest stories seen in the last `hours`, follow-ups of the same event folded under the first. */
export async function topStories(opts: { hours?: number; limit?: number; minStrength?: number } = {}): Promise<TopStory[]> {
  const hours = opts.hours ?? 72;
  const rows = await sql<{
    id: string; title: string; signal_type: string | null; strength: number; outlets: number; articles: number; last_seen: Date; saved: boolean;
    cat: string | null; color: string | null; url: string | null; outlet: string | null; problem: string | null;
    topic_id: string | null; topic_title: string | null; topic_status: string | null; direct: boolean | null;
  }[]>`
    select st.id, st.title, st.signal_type, st.strength, st.outlets, st.articles, st.last_seen, st.saved_at is not null as saved,
           c.name_en as cat, c.color, rep.url, rep.outlet, rep.buyer_problem as problem,
           pl.id as topic_id, pl.title_ja as topic_title, pl.status as topic_status, pl.direct
    from stories st
    left join categories c on c.id = st.category_id
    left join lateral (
      select s.url, coalesce(s.outlet, src.name) as outlet, s.buyer_problem from signals s join sources src on src.id = s.source_id
      where s.story_id = st.id and s.status = 'analyzed' order by s.relevance desc nulls last, s.published_at desc limit 1
    ) rep on true
    left join lateral (
      select t.id, t.title_ja, t.status, (t.story_id is not distinct from st.id or (t.story_id is null and t.slot = 'fast_take')) as direct from topics t
      where t.status <> 'rejected' and (t.story_id = st.id
        or exists (select 1 from topic_signals ts join signals s on s.id = ts.signal_id where ts.topic_id = t.id and s.story_id = st.id))
      order by (t.story_id is not distinct from st.id or (t.story_id is null and t.slot = 'fast_take')) desc, t.created_at desc limit 1
    ) pl on true
    where st.last_seen >= now() - make_interval(hours => ${hours})
      and coalesce(st.feedback, 0) >= 0 and st.strength >= ${opts.minStrength ?? 0}
    order by st.strength desc, st.last_seen desc
    limit 80`;

  // Several stories about one event (e.g. a breach, then the press conference): keep the strongest, list the rest.
  const out: (TopStory & { _names: Set<string> })[] = [];
  for (const r of rows) {
    const nm = names(r.title);
    const same = out.find((o) => [...nm].some((w) => o._names.has(w)));
    if (same) {
      same.related.push({ id: r.id, title: r.title, strength: r.strength });
      if (!same.planned && r.topic_id && r.direct) same.planned = { id: r.topic_id, title: r.topic_title ?? "", status: r.topic_status ?? "" };
      if (!same.mentioned && r.topic_id && !r.direct) same.mentioned = { id: r.topic_id, title: r.topic_title ?? "" };
      continue;
    }
    out.push({
      id: r.id, title: r.title, type: r.signal_type, strength: r.strength, outlets: r.outlets, articles: r.articles, lastSeen: r.last_seen, saved: r.saved,
      category: r.cat, color: r.color, url: r.url, outlet: r.outlet, problem: r.problem, uses: usesFor(r.signal_type),
      planned: r.topic_id && r.direct ? { id: r.topic_id, title: r.topic_title ?? "", status: r.topic_status ?? "" } : null,
      mentioned: r.topic_id && !r.direct ? { id: r.topic_id, title: r.topic_title ?? "" } : null,
      related: [], _names: nm,
    });
  }
  return out.slice(0, opts.limit ?? 8).map(({ _names, ...s }) => s);
}

/** A topic already made from this story or article (or a fast take on it), if any. */
export async function plannedFor(src: { story?: string; signal?: string }): Promise<string | null> {
  if (src.signal) {
    const [sig] = await sql<{ story_id: string | null }[]>`select story_id from signals where id = ${src.signal}`;
    if (sig?.story_id) return plannedFor({ story: sig.story_id });
    const [t] = await sql<{ id: string }[]>`
      select t.id from topics t join topic_signals ts on ts.topic_id = t.id
      where ts.signal_id = ${src.signal} and t.status <> 'rejected' and (t.origin in ('story', 'breaking') or t.slot = 'fast_take')
      order by t.created_at desc limit 1`;
    return t?.id ?? null;
  }
  const storyId = src.story ?? "";
  const [t] = await sql<{ id: string }[]>`
    select t.id from topics t
    where t.status <> 'rejected' and (t.story_id = ${storyId} or (t.slot = 'fast_take' and exists (
      select 1 from topic_signals ts join signals s on s.id = ts.signal_id where ts.topic_id = t.id and s.story_id = ${storyId})))
    order by t.created_at desc limit 1`;
  return t?.id ?? null;
}

const TopicOut = z.object({
  title_ja: z.string().min(4),
  title_en: z.string().catch(""),
  primary_keyword: z.string().min(1),
  secondary_keywords: z.array(z.string()).catch([]),
  search_intent: z.enum(["informational", "commercial", "transactional", "navigational"]).catch("informational"),
  service_slug: z.string().nullable().catch(null),
  persona_ref: z.number().int().nullable().catch(null),
  fit: z.number().min(0).max(10).catch(5),
  demand_estimate: z.number().min(0).max(10).catch(3),
  outline: z.array(z.string()).catch([]),
  cta: z.string().catch(""),
  rationale: z.string().catch(""),
});
const Out = z.preprocess((v) => (Array.isArray(v) ? v[0] : v), TopicOut);

const FALLBACK_OUTLINE: Record<StoryUse, string[]> = {
  fast_take: ["結論：何が起きたか（要点3つ）", "背景：なぜ今これが重要か", "日本企業への影響", "今週確認すべきこと", "まとめ"],
  case_study: ["何が起きたか：事例の概要", "原因・成功要因の分析", "企業が学ぶべき教訓", "自社で取り組むステップ", "よくある質問", "まとめ"],
  whitepaper: ["エグゼクティブサマリー", "背景と最新動向", "データで見る現状", "リスクと機会", "判断のためのフレームワーク", "提言とチェックポイント"],
  checklist: ["体制・ガバナンス", "現状把握", "技術的対策", "運用・委託先管理", "有事の対応"],
};

/**
 * Turn a story into a topic for this week: Gemini writes the title, keyword, outline and CTA for
 * the chosen use, with a plain fallback if it is busy. Returns the new topic id.
 */
export async function createStoryTopic(src: { story?: string; signal?: string }, use: StoryUse, opts: { status: "approved" | "proposed"; origin: "story" | "breaking" }): Promise<string> {
  // An article that belongs to a story is planned as its whole story.
  let storyId: string | null = src.story ?? null;
  let single: string | null = null;
  if (!storyId && src.signal) {
    const [sig] = await sql<{ story_id: string | null }[]>`select story_id from signals where id = ${src.signal}`;
    if (!sig) throw new Error("article not found");
    storyId = sig.story_id;
    if (!storyId) single = src.signal;
  }
  const [story] = storyId
    ? await sql<{ title: string; signal_type: string | null; strength: number; outlets: number; last_seen: Date }[]>`
        select title, signal_type, strength, outlets, last_seen from stories where id = ${storyId}`
    : await sql<{ title: string; signal_type: string | null; strength: number; outlets: number; last_seen: Date }[]>`
        select title, signal_type, round(coalesce(relevance, 0) * 100)::int as strength, 1 as outlets,
               coalesce(published_at, fetched_at) as last_seen from signals where id = ${single}`;
  if (!story) throw new Error("story not found");
  const arts = await sql<{ id: string; title: string; outlet: string | null; buyer_problem: string | null; angle: string | null; facts: string[] | null; service: string | null; published_at: Date | null }[]>`
    select s.id, s.title, coalesce(s.outlet, src.name) as outlet, s.buyer_problem, s.analysis->>'angle' as angle,
           case when jsonb_typeof(s.deep->'facts') = 'array' then (select array_agg(f) from jsonb_array_elements_text(s.deep->'facts') f) end as facts,
           sv.slug as service, s.published_at
    from signals s join sources src on src.id = s.source_id left join services sv on sv.id = s.service_id
    where ${storyId ? sql`s.story_id = ${storyId}` : sql`s.id = ${single}`} and s.status = 'analyzed'
    order by s.relevance desc nulls last, s.published_at desc limit 6`;

  const u = STORY_USES[use];
  const targeting = await loadTargeting();
  const personas = activePersonas(targeting);
  const services = new Map(targeting.services.filter((s) => s.active).map((s) => [s.slug, s.id]));

  const prompt = [
    "You are the content strategist for Renesis Tech Japan (renesistech.jp), an AI-native engineering firm selling to",
    "Japanese companies. A news story is trending in Japan. Turn it into ONE piece of content that earns market traction",
    "for Renesis: search traffic, shares, and leads. Connect the story to a service we sell, honestly (no invented facts).",
    "",
    `FORMAT: ${u.label} — ${u.brief}`,
    "",
    `STORY (${story.outlets} outlets, strength ${story.strength}/100${story.signal_type ? `, type ${story.signal_type}` : ""}): ${story.title}`,
    ...arts.map((a) => `- ${a.outlet ?? ""}: ${a.title}${a.buyer_problem ? ` | 課題: ${a.buyer_problem}` : ""}${a.angle ? ` | 切り口: ${a.angle}` : ""}${a.facts?.length ? ` | 事実: ${a.facts.slice(0, 3).join(" / ")}` : ""}`),
    "",
    "AUDIENCE (service_slug must be a slug from SERVICES; persona_ref is the [index] of the persona):",
    targetingBrief(targeting),
    "",
    "RULES:",
    "- title_ja: natural Japanese, ≤ 40 characters, no clickbait. Name the event or company when it helps searches.",
    "  Lead magnets: no item count in the title.",
    "- primary_keyword: the Japanese query (2–5 words) a buyer would type to find this. secondary_keywords: 3–6 related.",
    "- outline: 5–8 Japanese headings (for lead magnets: its sections). cta: one Japanese call to action to the matching",
    "  service or the free AI診断 (renesistech.jp/ai-shindan).",
    "- fit 0–10: how directly this leads a reader toward a Renesis service. demand_estimate 0–10: Japanese search demand.",
    "- rationale: 1–2 English sentences on why this story, this format, now.",
    "",
    'Return ONLY JSON: {"title_ja","title_en","primary_keyword","secondary_keywords","search_intent","service_slug","persona_ref","fit","demand_estimate","outline","cta","rationale"}',
  ].join("\n");

  let t: z.infer<typeof TopicOut> | null = null;
  if (has(env.geminiApiKey)) t = await generateJson(prompt, Out, { temperature: 0.4, rounds: 1, prefer: "gemini-3.5-flash" }).catch(() => null);
  const svcFromArticles = arts.find((a) => a.service)?.service ?? null;
  const topic = t ?? {
    title_ja: use === "case_study" ? `${story.title.slice(0, 28)}から学ぶ教訓` : use === "checklist" ? `${story.title.slice(0, 24)}を受けた点検チェックリスト` : use === "whitepaper" ? `${story.title.slice(0, 24)}の背景と企業への提言` : story.title.slice(0, 40),
    title_en: "", primary_keyword: story.title.replace(/[「」『』【】、。！？!?]/g, " ").trim().split(/\s+/).slice(0, 3).join(" "),
    secondary_keywords: [], search_intent: "informational" as const, service_slug: svcFromArticles, persona_ref: null,
    fit: 5, demand_estimate: 3, outline: FALLBACK_OUTLINE[use], cta: "", rationale: "",
  };

  const week = weekOf();
  const ageH = (Date.now() - new Date(story.last_seen).getTime()) / 3_600_000;
  const freshness = ageH <= 72 ? 20 : ageH <= 168 ? 15 : 10;
  const fit = Math.round(topic.fit * 3);
  const demand = Math.round(topic.demand_estimate * 2);
  const serviceId = (topic.service_slug && services.get(topic.service_slug)) || (svcFromArticles && services.get(svcFromArticles)) || null;
  const why = `${opts.origin === "breaking" ? "Breaking story" : storyId ? "From a top story" : "From an article"} (${story.outlets} outlet${story.outlets === 1 ? "" : "s"}, strength ${story.strength}): ${story.title}. ${topic.rationale}`.trim();

  const [row] = await sql<{ id: string }[]>`
    insert into topics (kind, magnet_format, title_ja, title_en, primary_keyword, secondary_keywords, search_intent, service_id, icp_id,
                        rationale, outline, cta, week_of, slot, origin, status, decided_at, score, score_breakdown, deadline, planned_date, story_id)
    values (${u.kind}, ${u.magnet}, ${topic.title_ja}, ${topic.title_en || null}, ${topic.primary_keyword}, ${topic.secondary_keywords.slice(0, 6)},
            ${topic.search_intent}, ${serviceId}, ${topic.persona_ref != null ? (personas[topic.persona_ref]?.id ?? null) : null},
            ${why}, ${sql.json(topic.outline.length ? topic.outline : FALLBACK_OUTLINE[use])}, ${topic.cta || null}, ${week},
            ${u.slot}, ${opts.origin}, ${opts.status}, ${opts.status === "approved" ? new Date() : null},
            ${demand + fit + freshness + 5},
            ${sql.json({ demand, demand_source: "estimate", gsc_impressions_28d: 0, fit, freshness, performance: 5, evergreen: use === "case_study", performance_note: `Made from a news story (${u.label})` })},
            ${use === "fast_take" ? new Date(Date.now() + 48 * 3_600_000) : null},
            ${plannedHubDate(week, u.slot as Slot)}::date, ${storyId})
    returning id`;
  for (const a of arts.slice(0, 5)) {
    await sql`insert into topic_signals (topic_id, signal_id) values (${row.id}, ${a.id}) on conflict do nothing`;
  }
  return row.id;
}
