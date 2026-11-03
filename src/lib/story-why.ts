// "Why this": for any story or article, why it is relevant to us, where it is trending (outlets,
// momentum, tracked keywords, Google, AI assistants) and why it would perform (strength parts, the
// best format and its time window, whether we already have a page). Deterministic, no Gemini.
// Also builds the copyable package (links, facts, why, suggested format) for the Copy button.
import { sql } from "./db";
import { matches, tokensOf } from "./trend-board";
import { outletTier, storyStrength, STRENGTH_MAX, type StrengthParts } from "./strength";
import { typeInfo } from "./signal-types";
import { STORY_USES, usesFor, type StoryUse } from "./top-stories";

type Member = {
  id: string; story_id: string | null; title: string; url: string | null; outlet: string; tier: string; at: Date;
  head: string; relevance: string | null; why: string | null; buyer_problem: string | null; angle: string | null; service: string | null;
  persona: string | null; facts: string[] | null; implication: string | null; text: string; signal_type: string | null;
  deep: { full_text?: boolean } | null; cat: string | null; sub: string | null;
};

export type Why = {
  title: string; type: string | null; strength: number;
  relevant: { reason: string | null; problem: string | null; angle: string | null; service: string | null; readers: string[]; field: string | null };
  trending: {
    outlets: { name: string; tier: string }[]; articles: number; first: Date; last: Date; last24: number;
    momentum: "rising" | "steady" | "fading" | "new"; keywords: string[];
    google: { impressions: number; queries: string[] } | null;
    ai: { question: string; cited: boolean; domains: string[] }[];
  };
  perform: { parts: StrengthParts | null; uses: StoryUse[]; hoursLeft: number; page: { title: string; path: string } | null };
  links: { outlet: string; title: string; url: string | null }[];
  facts: string[]; implication: string | null;
};

const TIER_LABEL: Record<string, string> = { official: "official", major: "major national", trade: "trade", community: "community", press_release: "press release" };

/** Why-data for stories (by story id) and articles (by signal id; an article in a story is explained with its whole story). */
export async function whyFor(ids: { stories?: string[]; signals?: string[] }): Promise<Map<string, Why>> {
  const storyIds = ids.stories ?? [];
  const signalIds = ids.signals ?? [];
  const out = new Map<string, Why>();
  if (!storyIds.length && !signalIds.length) return out;

  const membersQ = sql<Member[]>`
    select s.id, s.story_id, s.title, s.url, coalesce(s.outlet, src.name) as outlet, src.tier, coalesce(s.published_at, s.fetched_at) as at,
           s.relevance::text, s.analysis->>'why' as why, s.buyer_problem, s.analysis->>'angle' as angle, sv.name_ja as service,
           s.deep->>'persona' as persona, s.deep->>'implication' as implication, s.signal_type, s.deep,
           case when jsonb_typeof(s.deep->'facts') = 'array' then (select array_agg(f) from jsonb_array_elements_text(s.deep->'facts') f) end as facts,
           lower(s.title || ' ' || coalesce(s.summary, '') || ' ' || coalesce(left(s.body, 1200), '')) as text,
           lower(s.title || ' ' || coalesce(s.summary, '') || ' ' || coalesce(s.buyer_problem, '') || ' ' || coalesce(s.deep->>'facts', '')) as head,
           c.name_en as cat, sc.name_en as sub
    from signals s join sources src on src.id = s.source_id
    left join services sv on sv.id = s.service_id
    left join categories c on c.id = s.category_id left join subcategories sc on sc.id = s.subcategory_id
    where s.status = 'analyzed' and (
      s.story_id = any(${storyIds}::uuid[]) or s.id = any(${signalIds}::uuid[])
      or s.story_id in (select story_id from signals where id = any(${signalIds}::uuid[]) and story_id is not null))
    order by s.relevance desc nulls last, at desc`;
  const storiesQ = sql<{ id: string; title: string; strength: number; strength_parts: StrengthParts | null; signal_type: string | null; cat: string | null; sub: string | null }[]>`
    select st.id, st.title, st.strength, st.strength_parts, st.signal_type, c.name_en as cat, sc.name_en as sub
    from stories st left join categories c on c.id = st.category_id left join subcategories sc on sc.id = st.subcategory_id
    where st.id in (select distinct story_id from signals where story_id is not null and (story_id = any(${storyIds}::uuid[]) or id = any(${signalIds}::uuid[])))`;

  const [members, stories, kws, gsc, qs, pages] = await Promise.all([
    membersQ, storiesQ,
    sql<{ kw: string }[]>`
      select distinct k as kw from subcategories sc, unnest(sc.keywords) k where sc.active
      union select distinct regexp_replace(name, '^Google News:\\s*', '') from sources where category = 'keyword_search' and active`,
    sql<{ query: string; impressions: number }[]>`
      select lower(query) as query, sum(impressions)::int as impressions from search_queries_daily
      where date >= current_date - 28 group by 1 having sum(impressions) > 0 order by 2 desc limit 3000`,
    sql<{ question: string; keywords: string[]; cited: boolean; domains: string[] }[]>`
      select q.question, q.keywords, coalesce(bool_or(g.we_cited), false) as cited,
             coalesce(array_agg(distinct c->>'domain') filter (where c->>'domain' is not null), '{}') as domains
      from geo_questions q left join geo_checks g on g.question_id = q.id
      left join lateral jsonb_array_elements(g.citations) c on true
      where q.week_of = (select max(week_of) from geo_questions) group by q.id`,
    sql<{ title: string; path: string }[]>`select title, path from site_pages where section = 'blog' and title is not null and title <> 'blog'`,
  ]);
  const tracked = kws.map((k) => k.kw).filter((k) => k && !/PR TIMES|提供開始|資金調達|業務提携|調査|導入事例|シリーズA|実証実験/i.test(k));

  const build = (arts: Member[], st: (typeof stories)[number] | null): Why => {
    const text = arts.map((a) => a.text).join(" ");
    const rep = arts[0];
    const times = arts.map((a) => new Date(a.at).getTime());
    const first = new Date(Math.min(...times)), last = new Date(Math.max(...times));
    const now = Date.now();
    const last24 = times.filter((t) => t >= now - 24 * 3_600_000).length;
    const before = times.filter((t) => t >= now - 72 * 3_600_000 && t < now - 24 * 3_600_000).length;
    const momentum = first.getTime() >= now - 24 * 3_600_000 ? "new" : last24 > before ? "rising" : last24 === 0 ? "fading" : "steady";
    const outletMap = new Map<string, string>();
    for (const a of arts) if (!outletMap.has(a.outlet)) outletMap.set(a.outlet, outletTier(a.tier, a.outlet));
    const keywords = tracked.filter((k) => matches(text, tokensOf(k))).slice(0, 6);
    const gq = gsc.filter((g) => keywords.some((k) => matches(g.query, tokensOf(k))));
    // A buyer question fits when at least two of its keywords appear in the headline, summary or facts
    // (one is enough only for a long, specific keyword), so generic words like "AI" don't pull in unrelated questions.
    const head = arts.map((a) => a.head).join(" ");
    const ai = qs.filter((q) => {
      const hits = q.keywords.filter((k) => k.length >= 2 && matches(head, tokensOf(k)));
      return hits.length >= 2 || hits.some((k) => k.replace(/\s/g, "").length >= 6);
    }).slice(0, 3)
      .map((q) => ({ question: q.question, cited: q.cited, domains: q.domains.filter((d) => !d.endsWith("renesistech.jp")).slice(0, 3) }));
    const page = pages.find((p) => keywords.some((k) => matches(p.title.toLowerCase(), tokensOf(k)))) ?? null;
    const type = st?.signal_type ?? rep.signal_type;
    const parts = st?.strength_parts ?? storyStrength(arts.map((a) => ({ relevance: Number(a.relevance ?? 0), outlet: a.outlet, tier: a.tier, at: new Date(a.at), deep: a.deep }))).parts;
    const strength = st?.strength ?? (Object.keys(STRENGTH_MAX) as (keyof typeof STRENGTH_MAX)[]).reduce((s, k) => s + parts[k], 0);
    return {
      title: st?.title ?? rep.title, type, strength,
      relevant: {
        reason: arts.map((a) => a.why).find((x) => x && !/duplicate of|item \d+|same as (item|story)/i.test(x)) ?? null, problem: rep.buyer_problem, angle: rep.angle, service: rep.service,
        readers: [...new Set(arts.map((a) => a.persona).filter((p): p is string => !!p))].slice(0, 3),
        field: (st?.cat ?? rep.cat) ? `${st?.cat ?? rep.cat}${(st?.sub ?? rep.sub) ? ` › ${st?.sub ?? rep.sub}` : ""}` : null,
      },
      trending: {
        outlets: [...outletMap].map(([name, tier]) => ({ name, tier })), articles: arts.length, first, last, last24, momentum, keywords,
        google: gsc.length ? { impressions: gq.reduce((s, g) => s + g.impressions, 0), queries: gq.slice(0, 3).map((g) => g.query) } : null,
        ai,
      },
      perform: { parts, uses: usesFor(type), hoursLeft: Math.max(0, Math.round(72 - (now - last.getTime()) / 3_600_000)), page },
      links: arts.slice(0, 6).map((a) => ({ outlet: a.outlet, title: a.title, url: a.url })),
      facts: (arts.find((a) => a.facts?.length)?.facts ?? []).slice(0, 4),
      implication: arts.find((a) => a.implication)?.implication ?? null,
    };
  };

  for (const id of storyIds) {
    const arts = members.filter((m) => m.story_id === id);
    if (arts.length) out.set(id, build(arts, stories.find((s) => s.id === id) ?? null));
  }
  for (const id of signalIds) {
    const own = members.find((m) => m.id === id);
    if (!own) continue;
    const arts = own.story_id ? [own, ...members.filter((m) => m.story_id === own.story_id && m.id !== id)] : [own];
    out.set(id, build(arts, own.story_id ? stories.find((s) => s.id === own.story_id) ?? null : null));
  }
  return out;
}

const fmtJst = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
export const MOMENTUM_LABEL = { new: "New in the last 24h", rising: "Rising: more coverage in the last 24h than the 2 days before", steady: "Steady coverage", fading: "Fading: no new articles in the last 24h" } as const;

/** Plain-English lines for the three why sections (shared by the panel and the copy package). */
export function whyLines(w: Why) {
  const t = w.trending, p = w.perform;
  const tiers = Object.entries(t.outlets.reduce<Record<string, number>>((a, o) => ({ ...a, [o.tier]: (a[o.tier] ?? 0) + 1 }), {}))
    .map(([k, n]) => `${n} ${TIER_LABEL[k] ?? k}`).join(", ");
  const best = STORY_USES[p.uses[0]];
  const type = typeInfo(w.type);
  return {
    relevant: [
      w.relevant.reason && `Gemini: ${w.relevant.reason}`,
      w.relevant.problem && `Buyer problem (課題): ${w.relevant.problem}`,
      w.relevant.angle && `Angle (切り口): ${w.relevant.angle}`,
      (w.relevant.service || w.relevant.readers.length) && [w.relevant.service && `Service: ${w.relevant.service}`, w.relevant.readers.length && `Readers: ${w.relevant.readers.join("、")}`].filter(Boolean).join(" · "),
      `Field: ${w.relevant.field ?? "outside your tracked categories (shown because it scored as relevant)"}`,
    ].filter(Boolean) as string[],
    trending: [
      `${t.outlets.length} outlet${t.outlets.length === 1 ? "" : "s"} (${tiers}), ${t.articles} article${t.articles === 1 ? "" : "s"}: ${t.outlets.slice(0, 5).map((o) => o.name).join(", ")}${t.outlets.length > 5 ? "…" : ""}`,
      `${MOMENTUM_LABEL[t.momentum]} · first ${fmtJst(t.first)}, latest ${fmtJst(t.last)} JST`,
      t.keywords.length ? `Tracked keywords in it: ${t.keywords.join("、")}` : "None of your tracked keywords appear in it",
      t.google ? (t.google.impressions ? `Google: ${t.google.impressions.toLocaleString("en-US")} impressions in 28 days on related queries (${t.google.queries.join("、")})` : "Google: no related searches reach our site yet") : "Google: Search Console not connected",
      t.ai.length ? `AI assistants: buyers ask ${t.ai.map((a) => `「${a.question}」${a.cited ? " (we're cited)" : a.domains.length ? ` (AI cites ${a.domains.join(", ")})` : ""}`).join("; ")}` : "AI assistants: no tracked buyer question matches it",
    ],
    perform: [
      `Strength ${w.strength}/100${p.parts ? `: ${(Object.keys(STRENGTH_MAX) as (keyof typeof STRENGTH_MAX)[]).map((k) => p.parts!.notes[k]).filter(Boolean).join(" ")}` : ""}`,
      `Best as ${best.label} (${best.sub.toLowerCase()})${type ? ` because ${type.label.toLowerCase()} news works best as: ${type.angle.toLowerCase()}` : ""}.`,
      p.uses[0] === "fast_take" || p.uses[1] === "fast_take"
        ? (p.hoursLeft > 0 ? `A story stays hot for about 3 days after its latest coverage: roughly ${p.hoursLeft}h left for a fast take.` : "No new coverage for 3 days: better as a case study, white paper or checklist now.")
        : null,
      p.page ? `We already have a related page: ${p.page.title} (${p.page.path}). Link to it, or refresh it.` : "No Renesis page covers this yet: an open gap.",
    ].filter(Boolean) as string[],
  };
}

/** Everything about a story in one block of text, ready to paste into a doc, chat or prompt. */
export function packageText(w: Why): string {
  const l = whyLines(w);
  const type = typeInfo(w.type);
  return [
    `【${w.title}】`,
    `${type ? `${type.label} · ` : ""}strength ${w.strength}/100 · ${w.trending.outlets.length} outlets · latest ${fmtJst(w.trending.last)} JST`,
    "",
    "SOURCES",
    ...w.links.map((a) => `- ${a.outlet}: ${a.title}${a.url ? `\n  ${a.url}` : ""}`),
    ...(w.facts.length ? ["", "KEY FACTS", ...w.facts.map((f) => `- ${f}`)] : []),
    ...(w.implication ? [`→ ${w.implication}`] : []),
    "",
    "WHY IT'S RELEVANT", ...l.relevant.map((x) => `- ${x}`),
    "",
    "WHERE IT'S TRENDING", ...l.trending.map((x) => `- ${x}`),
    "",
    "WHY IT WOULD PERFORM", ...l.perform.map((x) => `- ${x}`),
    "",
    `SUGGESTED FORMATS: ${w.perform.uses.map((u, i) => `${i === 0 ? "★ " : ""}${STORY_USES[u].label}`).join(", ")}`,
  ].join("\n");
}
