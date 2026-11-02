// Monthly "Kizashi signal index": original data on what moved in Japan's AI, blockchain, cloud,
// software and QA news, computed only from our own signals (no AI-made numbers). Published each
// month as an original-research article, which AI search cites far more than opinion pieces.
import { sql } from "./db";
import { typeInfo } from "./signal-types";
import { planFormats } from "./format-plan";
import { weekOf } from "./week";

export type CategoryIndex = {
  slug: string; name_en: string; name_ja: string; color: string | null;
  articles: number; prev: number | null; index: number; change: number | null;
  stories: number; outlets: number; official: number;
  types: { key: string; label: string; n: number; share: number }[];
  niches: { name: string; n: number; prev: number }[];
  rising: { keyword: string; n: number; prev: number }[];
  top: { title: string; strength: number; outlets: number; articles: number; type: string | null; url: string | null }[];
};

export type SignalIndex = {
  month: string; label_ja: string; edition: number; base_month: string;
  totals: { articles: number; screened: number; stories: number; outlets: number; sources: number; prev: number | null };
  coverage: { first_fetch: string | null; partial: boolean; note: string | null };
  categories: CategoryIndex[];
  types: { key: string; label: string; n: number; share: number }[];
  highlights: string[];
};

const monthStart = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
const shiftMonth = (m: string, by: number) => {
  const d = new Date(`${m}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return monthStart(d);
};
/** The month before the current one (JST). */
export function lastMonth(now = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 3_600_000);
  return shiftMonth(monthStart(jst), -1);
}
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export async function computeIndex(month: string): Promise<SignalIndex> {
  const next = shiftMonth(month, 1);
  const prevM = shiftMonth(month, -1);
  // Signals are counted by publish date in Japan time; "relevant" = Gemini kept it (status analyzed).
  const inMonth = (m: string, n: string) =>
    sql`coalesce(s.published_at, s.fetched_at) >= (${m}::date)::timestamp at time zone 'Asia/Tokyo'
        and coalesce(s.published_at, s.fetched_at) < (${n}::date)::timestamp at time zone 'Asia/Tokyo'`;

  const [cats, prevCats, typeRows, niches, rising, top, [tot], [cov], [srcs], bases] = await Promise.all([
    sql<{ slug: string; name_en: string; name_ja: string; color: string | null; articles: number; stories: number; outlets: number; official: number }[]>`
      select c.slug, c.name_en, c.name_ja, c.color, count(*)::int as articles, count(distinct s.story_id)::int as stories,
             count(distinct coalesce(nullif(s.outlet, ''), src.name))::int as outlets,
             count(*) filter (where src.tier = 'official')::int as official
      from signals s join categories c on c.id = s.category_id join sources src on src.id = s.source_id
      where s.status = 'analyzed' and ${inMonth(month, next)}
      group by 1, 2, 3, 4 order by articles desc`,
    sql<{ slug: string; articles: number }[]>`
      select c.slug, count(*)::int as articles from signals s join categories c on c.id = s.category_id
      where s.status = 'analyzed' and ${inMonth(prevM, month)} group by 1`,
    sql<{ slug: string | null; type: string | null; n: number }[]>`
      select c.slug, s.signal_type as type, count(*)::int as n from signals s left join categories c on c.id = s.category_id
      where s.status = 'analyzed' and ${inMonth(month, next)} group by 1, 2`,
    sql<{ slug: string; name: string; n: number; prev: number }[]>`
      select c.slug, sc.name_ja as name,
             count(*) filter (where ${inMonth(month, next)})::int as n,
             count(*) filter (where ${inMonth(prevM, month)})::int as prev
      from signals s join subcategories sc on sc.id = s.subcategory_id join categories c on c.id = sc.category_id
      where s.status = 'analyzed' and coalesce(s.published_at, s.fetched_at) >= (${prevM}::date)::timestamp at time zone 'Asia/Tokyo'
      group by 1, 2 having count(*) filter (where ${inMonth(month, next)}) >= 3`,
    sql<{ slug: string; keyword: string; n: number; prev: number }[]>`
      with kw as (
        select distinct on (lower(k)) c.slug, k as keyword
        from subcategories sc join categories c on c.id = sc.category_id, unnest(sc.keywords) k
        where sc.active and c.active and length(trim(k)) >= 2 order by lower(k)
      ), sig as (
        select lower(s.title || ' ' || coalesce(s.summary, '')) as text, ${inMonth(month, next)} as cur
        from signals s where s.status = 'analyzed' and coalesce(s.published_at, s.fetched_at) >= (${prevM}::date)::timestamp at time zone 'Asia/Tokyo'
          and coalesce(s.published_at, s.fetched_at) < (${next}::date)::timestamp at time zone 'Asia/Tokyo'
      )
      select kw.slug, kw.keyword, count(*) filter (where sig.cur)::int as n, count(*) filter (where not sig.cur)::int as prev
      from kw join sig on case when kw.keyword ~ '^[A-Za-z0-9 .-]+$'
                               then sig.text ~ ('\\m' || lower(kw.keyword) || '\\M') else position(lower(kw.keyword) in sig.text) > 0 end
      group by 1, 2 having count(*) filter (where sig.cur) >= 5`,
    sql<{ slug: string; title: string; strength: number; outlets: number; articles: number; type: string | null; url: string | null }[]>`
      select slug, title, strength, outlets, articles, type, url from (
        select c.slug, st.title, st.strength, st.outlets, st.articles, st.signal_type as type,
               (select s2.url from signals s2 where s2.story_id = st.id order by s2.relevance desc nulls last limit 1) as url,
               row_number() over (partition by c.slug order by st.strength desc, st.outlets desc) as rk
        from stories st join categories c on c.id = st.category_id
        where st.first_seen >= (${month}::date)::timestamp at time zone 'Asia/Tokyo'
          and st.first_seen < (${next}::date)::timestamp at time zone 'Asia/Tokyo'
      ) x where rk <= 3`,
    sql<{ articles: number; screened: number; stories: number; outlets: number; prev: number }[]>`
      select count(*) filter (where s.status = 'analyzed')::int as articles, count(*)::int as screened,
             count(distinct s.story_id) filter (where s.status = 'analyzed')::int as stories,
             count(distinct coalesce(nullif(s.outlet, ''), src.name)) filter (where s.status = 'analyzed')::int as outlets,
             (select count(*)::int from signals s where s.status = 'analyzed' and ${inMonth(prevM, month)}) as prev
      from signals s join sources src on src.id = s.source_id where ${inMonth(month, next)}`,
    sql<{ first: string | null }[]>`select (min(fetched_at) at time zone 'Asia/Tokyo')::date::text as first from signals`,
    sql<{ n: number }[]>`select count(*)::int as n from sources where active`,
    sql<{ month: string; data: SignalIndex }[]>`select month::text, data from signal_index_reports where month < ${month} order by month limit 1`,
  ]);

  const base = bases[0];
  const baseOf = (slug: string) => base?.data.categories.find((c) => c.slug === slug)?.articles ?? null;
  const prevOf = (slug: string) => prevCats.find((c) => c.slug === slug)?.articles ?? null;
  const typesFor = (slug: string | null, total: number) =>
    typeRows.filter((t) => (slug === null || t.slug === slug) && t.type)
      .reduce<{ key: string; n: number }[]>((acc, t) => {
        const e = acc.find((x) => x.key === t.type);
        if (e) e.n += t.n; else acc.push({ key: t.type!, n: t.n });
        return acc;
      }, [])
      .map((t) => ({ key: t.key, label: typeInfo(t.key)?.label ?? t.key, n: t.n, share: pctOf(t.n, total) }))
      .sort((a, b) => b.n - a.n);

  const categories: CategoryIndex[] = cats.map((c) => {
    const prev = prevOf(c.slug);
    const b = baseOf(c.slug);
    return {
      ...c, prev,
      index: b ? Math.round((c.articles / b) * 100) : 100,
      change: prev && prev >= 20 ? Math.round(((c.articles - prev) / prev) * 100) : null,
      types: typesFor(c.slug, c.articles).slice(0, 5),
      niches: niches.filter((n) => n.slug === c.slug).sort((a, b) => b.n - a.n).slice(0, 5).map(({ name, n, prev }) => ({ name, n, prev })),
      rising: rising.filter((r) => r.slug === c.slug)
        .sort((a, b) => (b.n - b.prev) - (a.n - a.prev) || b.n - a.n).slice(0, 5).map(({ keyword, n, prev }) => ({ keyword, n, prev })),
      top: top.filter((t) => t.slug === c.slug).map(({ title, strength, outlets, articles, type, url }) => ({ title, strength, outlets, articles, type, url })),
    };
  });

  // Collection started part-way through the month → early-month counts are incomplete; say so.
  const first = cov?.first ?? null;
  const partial = !!first && first > month;
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const allTypes = typesFor(null, tot.articles);
  const lead = categories[0];

  const highlights = [
    `${tot.screened.toLocaleString()} Japanese articles screened; ${tot.articles.toLocaleString()} (${pctOf(tot.articles, tot.screened)}%) judged relevant to B2B technology buyers, grouped into ${tot.stories.toLocaleString()} distinct stories from ${tot.outlets} outlets.`,
    lead && `${lead.name_ja} was the most active field with ${lead.articles} relevant articles (${pctOf(lead.articles, tot.articles)}% of the total).`,
    allTypes[0] && `The most common kind of news was ${allTypes[0].label.toLowerCase()} (${allTypes[0].share}%), followed by ${allTypes[1]?.label.toLowerCase() ?? "-"} (${allTypes[1]?.share ?? 0}%).`,
    ...categories.filter((c) => c.types.some((t) => t.key === "regulation")).slice(0, 2).map((c) => {
      const r = c.types.find((t) => t.key === "regulation")!;
      return `${c.name_ja}: ${r.n} regulation/policy articles (${r.share}% of the field)${c.official ? `, ${c.official} from official sources such as ministries and regulators` : ""}.`;
    }),
    ...categories.filter((c) => c.change != null && Math.abs(c.change) >= 15).map((c) => `${c.name_ja} coverage ${c.change! > 0 ? "rose" : "fell"} ${Math.abs(c.change!)}% versus the previous month.`),
  ].filter((h): h is string => Boolean(h));

  return {
    month, label_ja: `${y}年${m}月`, edition: base ? (await sql<{ n: number }[]>`select count(*)::int + 1 as n from signal_index_reports where month < ${month}`)[0].n : 1,
    base_month: base?.month ?? month,
    totals: { ...tot, sources: srcs.n, prev: tot.prev >= 20 ? tot.prev : null },
    coverage: {
      first_fetch: first, partial,
      note: partial ? `Collection started on ${first}; articles published earlier in ${y}-${String(m).padStart(2, "0")} were picked up only where feeds still listed them, so this edition undercounts the first part of the month and serves as the baseline (index = 100).` : null,
    },
    categories, types: allTypes, highlights,
  };
}

/** The original-data brief the writer must build the article from (Markdown, no tables). */
export function dataBrief(x: SignalIndex): string {
  const L: string[] = [
    `# Kizashi シグナル指数 ${x.label_ja}（第${x.edition}号）`,
    "",
    "## Method (state this in the article's 調査方法 section)",
    `- Source: Renesis Tech Japan's Kizashi system monitors ${x.totals.sources} Japanese news feeds, official sites (金融庁・経済産業省・デジタル庁 など), PR TIMES and Google News searches every day.`,
    `- Each article is screened by AI for relevance to B2B technology buyers in Japan and grouped into stories (the same news across outlets counts once as a story).`,
    `- Counted by publish date (Japan time). Index: each field's relevant-article count vs the base month ${x.base_month.slice(0, 7)} (= 100).`,
    ...(x.coverage.note ? [`- Coverage note: ${x.coverage.note}`] : []),
    "- Cite as 「出典：Renesis Tech Japan調べ（Kizashiシグナル指数）」.",
    "",
    "## Totals",
    `- Articles screened: ${x.totals.screened}; relevant: ${x.totals.articles}; stories: ${x.totals.stories}; outlets: ${x.totals.outlets}${x.totals.prev ? `; previous month relevant: ${x.totals.prev}` : ""}`,
    `- By kind of news: ${x.types.map((t) => `${t.label} ${t.n} (${t.share}%)`).join(", ")}`,
    "",
    "## Key findings (computed)",
    ...x.highlights.map((h) => `- ${h}`),
  ];
  for (const c of x.categories) {
    L.push(
      "",
      `## ${c.name_ja} (${c.name_en})`,
      `- Index ${c.index} · relevant articles ${c.articles}${c.prev != null ? ` (previous month ${c.prev}${c.change != null ? `, ${c.change > 0 ? "+" : ""}${c.change}%` : ""})` : ""} · stories ${c.stories} · outlets ${c.outlets} · from official sources ${c.official}`,
      `- Kinds of news: ${c.types.map((t) => `${t.label} ${t.share}%`).join(", ") || "-"}`,
      c.niches.length ? `- Busiest niches: ${c.niches.map((n) => `${n.name} ${n.n}`).join("、")}` : "",
      c.rising.length ? `- Most-mentioned keywords (this month / previous): ${c.rising.map((r) => `${r.keyword} ${r.n}/${r.prev}`).join("、")}` : "",
      ...(c.top.length ? ["- Strongest stories (strength 0–100, number of outlets):", ...c.top.map((t) => `  - ${t.title}（strength ${t.strength}, ${t.outlets} outlets${t.type ? `, ${typeInfo(t.type)?.label ?? t.type}` : ""}）${t.url ? ` ${t.url}` : ""}`)] : []),
    );
  }
  return L.filter((l) => l !== "").join("\n").replace(/\n(## )/g, "\n\n$1");
}

/** Compute, store and turn the month's index into an approved original-research topic. */
export async function buildMonthlyIndex(month = lastMonth(), force = false): Promise<{ month: string; created: boolean; topicId: string | null; articles: number }> {
  const [existing] = await sql<{ topic_id: string | null }[]>`select topic_id from signal_index_reports where month = ${month}`;
  if (existing && !force) return { month, created: false, topicId: existing.topic_id, articles: 0 };
  const x = await computeIndex(month);
  if (x.totals.articles < 50) throw new Error(`only ${x.totals.articles} relevant articles in ${month.slice(0, 7)}: too few for an index`);
  const brief = dataBrief(x);
  const fields = x.categories.slice(0, 2).map((c) => c.name_ja.replace(/・.*$/, "")).join("・");

  let topicId = existing?.topic_id ?? null;
  const outline = [
    `結論：${x.label_ja}の日本の${fields}動向（要点3つ）`,
    "調査方法：Kizashiシグナル指数とは",
    "分野別シグナル指数と前月比",
    ...x.categories.slice(0, 3).map((c) => `${c.name_ja}で何が動いたか`),
    "規制・資金調達・導入事例の動き",
    "企業が来月までに確認すべきこと",
    "よくある質問",
    "まとめ",
  ];
  const v = {
    title_ja: `日本の${fields}動向レポート【${x.label_ja}】Kizashiシグナル指数`,
    title_en: `Japan ${x.categories.slice(0, 2).map((c) => c.name_en).join(" & ")} Signal Index — ${month.slice(0, 7)}`,
    primary_keyword: `${x.categories[0]?.name_ja.replace(/・.*$/, "") ?? "AI"} 動向 ${x.label_ja}`,
    secondary_keywords: [...x.categories.slice(0, 3).map((c) => `${c.name_ja.replace(/・.*$/, "")} 動向`), "AI ニュース まとめ", "ブロックチェーン 最新動向"],
    rationale: `Original research: Renesis's own monthly count of ${x.totals.articles} relevant Japanese tech articles (${x.totals.stories} stories). Unique data is what AI assistants and journalists cite; publish monthly so each edition links to the last.`,
    data_brief: brief,
  };
  if (topicId) {
    await sql`update topics set ${sql(v)}, outline = ${sql.json(outline)} where id = ${topicId}`;
  } else {
    const [row] = await sql<{ id: string }[]>`
      insert into topics (kind, title_ja, title_en, primary_keyword, secondary_keywords, search_intent, rationale, outline, cta, week_of, slot, status, score, score_breakdown, data_brief)
      values ('article', ${v.title_ja}, ${v.title_en}, ${v.primary_keyword}, ${v.secondary_keywords}, 'informational', ${v.rationale}, ${sql.json(outline)},
              ${"毎月のシグナル指数をメールで受け取る / 無料AI業務診断"}, ${weekOf()}, 'evergreen', 'approved', 70,
              ${sql.json({ demand: 20, demand_source: "estimate", gsc_impressions_28d: 0, fit: 25, freshness: 15, performance: 10, evergreen: false, performance_note: "Monthly original research (signal index)" })},
              ${brief})
      returning id`;
    topicId = row.id;
    await planFormats([topicId]).catch(() => null);
  }
  await sql`
    insert into signal_index_reports (month, data, topic_id) values (${month}, ${sql.json({ ...x, brief } as never)}, ${topicId})
    on conflict (month) do update set data = excluded.data, topic_id = excluded.topic_id, created_at = now()`;
  return { month, created: true, topicId, articles: x.totals.articles };
}
