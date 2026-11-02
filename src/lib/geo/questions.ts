// The weekly set of Japanese buyer questions to track in AI assistants. Built from free demand
// signals; ~70% carried over from last week so trends stay comparable.
import { z } from "zod";
import { sql } from "../db";
import { generateJson } from "../gemini";
import { googleSuggest } from "../keywords";
import { addDays, weekOf } from "../week";

const SET_SIZE = 25;
const MANUAL = 10;
const PATTERNS = ["とは", "おすすめ", "比較", "費用", "会社", "事例"];

const Out = z.object({
  questions: z.array(z.object({
    question: z.string().min(6),
    category: z.string().nullable().catch(null),
    intent: z.enum(["informational", "commercial", "transactional"]).catch("informational"),
    keywords: z.array(z.string()).catch([]),
    demand: z.number().min(0).max(100).catch(30),
    evidence: z.array(z.string()).catch([]),
    manual: z.boolean().catch(false),
  })).min(5),
});

export async function buildQuestionSet(force = false): Promise<{ week: string; questions: number }> {
  const week = weekOf();
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from geo_questions where week_of = ${week}`;
  if (n && !force) return { week, questions: n };

  const [last, topicQs, gsc, trends, cats] = await Promise.all([
    sql<{ question: string }[]>`select question from geo_questions where week_of = (select max(week_of) from geo_questions where week_of < ${week}) order by demand desc`,
    sql<{ q: string }[]>`
      select distinct q from (
        select jsonb_array_elements_text(research->'questions') as q from topics where week_of >= ${addDays(week, -14)}::date and research is not null
        union all
        select k->>'kw' from topics, jsonb_array_elements(keyword_plan->'keywords') k
          where week_of >= ${addDays(week, -14)}::date and k->>'role' in ('faq', 'heading')
      ) x where q is not null limit 60`,
    sql<{ query: string; impressions: number }[]>`
      select query, sum(impressions)::int as impressions from search_queries_daily
      where date >= current_date - 28 and (array_length(regexp_split_to_array(trim(query), '\\s+'), 1) >= 3
        or query ~ '(とは|おすすめ|比較|費用|方法|やり方|選び方|会社|なぜ|どう)')
      group by query order by 2 desc limit 40`.catch(() => []),
    sql<{ term: string; direction: string; predicted: number }[]>`
      select term, direction, predicted from trend_forecasts
      where window_start = (select max(window_start) from trend_forecasts) and term_kind <> 'type'
      order by p_rise desc, predicted desc limit 12`.catch(() => []),
    sql<{ slug: string; name_en: string }[]>`select slug, name_en from categories where active order by sort`,
  ]);

  // Google's suggestions for the top terms in question form: real phrasing people use in Japan.
  const suggest: Record<string, number> = {};
  for (const t of trends.slice(0, 8)) {
    const lists = await Promise.all(PATTERNS.map((p) => googleSuggest(`${t.term} ${p}`)));
    for (const s of lists.flat()) suggest[s] = (suggest[s] ?? 0) + 1;
  }

  const out = await generateJson(
    [
      "Build this week's GEO question set for Renesis Tech Japan (AI, blockchain/Web3, software, cloud, QA services for Japanese companies).",
      `Return exactly ${SET_SIZE} questions in natural Japanese, phrased the way a Japanese business buyer would ASK an AI assistant`,
      "(ChatGPT, Gemini, Perplexity, Copilot), e.g. 「生成AIの導入支援を外注するなら、どんな会社を選べばいい？」.",
      "Rules:",
      `- Keep about 70% of LAST WEEK'S QUESTIONS unchanged (so weekly trends compare like with like); replace the weakest with rising demand.`,
      "- Mix intents: ~40% commercial (choosing a vendor/service, costs, comparisons), the rest informational/transactional.",
      "- Spread across categories: " + cats.map((c) => c.slug).join(", ") + ". category = one of these slugs.",
      "- keywords: 2–4 Japanese terms to find our matching page (e.g. [\"生成AI\", \"導入支援\"]).",
      "- demand 0–100 from the evidence below (Search Console impressions, Google suggestions, forecast). evidence: short ENGLISH notes.",
      `- manual = true for exactly ${MANUAL} questions with the highest commercial value (checked by hand each week).`,
      "",
      "LAST WEEK'S QUESTIONS:", ...(last.length ? last.map((x) => `- ${x.question}`) : ["- (none: first week)"]),
      "",
      "SEARCH CONSOLE QUESTION-LIKE QUERIES (28d impressions):", ...(gsc.length ? gsc.map((g) => `- ${g.query} (${g.impressions})`) : ["- (no data yet)"]),
      "",
      "GOOGLE SUGGESTIONS FOR TRENDING TERMS (times seen):", ...Object.entries(suggest).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([k, v]) => `- ${k} (${v})`),
      "",
      "TREND FORECAST (next 7 days):", ...trends.map((t) => `- ${t.term}: ${t.direction}, ~${t.predicted} articles`),
      "",
      "READER QUESTIONS FROM OUR TOPICS:", ...topicQs.map((t) => `- ${t.q}`),
      "",
      'Return ONLY JSON: {"questions":[{"question":"","category":null,"intent":"commercial","keywords":[],"demand":50,"evidence":[],"manual":false}]}',
    ].join("\n"),
    Out,
    { temperature: 0.3 },
  );

  const catId = new Map((await sql<{ id: string; slug: string }[]>`select id, slug from categories`).map((c) => [c.slug, c.id]));
  let manualLeft = MANUAL;
  await sql.begin(async (tx) => {
    await tx`delete from geo_questions where week_of = ${week} and not exists (select 1 from geo_checks c where c.question_id = geo_questions.id)`;
    for (const q of out.questions.slice(0, SET_SIZE)) {
      const manual = q.manual && manualLeft-- > 0;
      await tx`
        insert into geo_questions ${tx({
          week_of: week, question: q.question, category_id: (q.category && catId.get(q.category)) || null, intent: q.intent,
          demand: Math.round(q.demand), evidence: tx.json(q.evidence), keywords: q.keywords.slice(0, 5), manual,
        })}
        on conflict (week_of, question) do nothing`;
    }
  });
  return { week, questions: Math.min(SET_SIZE, out.questions.length) };
}
