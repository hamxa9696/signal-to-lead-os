// Topic research with cited sources, on the free tier: Google News search (RSS, no key) finds
// recent coverage, our own deep-read signals add full-text facts, and Gemini summarises ONLY
// from those numbered sources. (Gemini's built-in Google Search grounding has no free quota.)
import { z } from "zod";
import { sql } from "./db";
import { fetchXml, parseFeed } from "./feeds";
import { generateJson } from "./gemini";

export type ResearchSource = { n: number; title: string; publisher: string | null; url: string | null; date: string | null; kind: "news_search" | "signal" };
export type Research = { summary: string; points: { text: string; refs: number[] }[]; questions: string[]; sources: ResearchSource[] };

const PER_QUERY = 6;
const MAX_SOURCES = 14;

export const googleNewsUrl = (q: string, days = 90) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${days}d`)}&hl=ja&gl=JP&ceid=JP:ja`;

async function newsSearch(q: string): Promise<Omit<ResearchSource, "n">[]> {
  try {
    const items = parseFeed(await fetchXml(googleNewsUrl(q))).slice(0, PER_QUERY);
    return items.map((i) => {
      const cut = i.title.lastIndexOf(" - ");
      return {
        title: cut > 0 ? i.title.slice(0, cut) : i.title,
        publisher: cut > 0 ? i.title.slice(cut + 3) : null,
        url: i.url,
        date: i.publishedAt ? i.publishedAt.toISOString().slice(0, 10) : null,
        kind: "news_search" as const,
      };
    });
  } catch {
    return [];
  }
}

const Out = z.object({
  summary: z.string().catch(""),
  points: z.array(z.object({ text: z.string(), refs: z.array(z.number().int()).catch([]) })).catch([]),
  questions: z.array(z.string()).catch([]),
});

type TopicRow = { title_ja: string; primary_keyword: string | null; secondary_keywords: string[]; persona: string | null };
type SignalRow = { title: string; url: string | null; source: string; published_at: Date | null; deep: { facts?: string[]; implication?: string } | null; summary: string | null };

export async function researchTopic(topicId: string): Promise<Research> {
  const [t] = await sql<TopicRow[]>`
    select t.title_ja, t.primary_keyword, t.secondary_keywords, i.name as persona
    from topics t left join icps i on i.id = t.icp_id where t.id = ${topicId}`;
  if (!t) throw new Error("topic not found");

  const signals = await sql<SignalRow[]>`
    select s.title, s.url, src.name as source, s.published_at, s.deep, s.summary
    from topic_signals ts join signals s on s.id = ts.signal_id join sources src on src.id = s.source_id
    where ts.topic_id = ${topicId}`;

  const queries = [...new Set([t.primary_keyword, ...t.secondary_keywords.slice(0, 2)].filter((q): q is string => !!q))];
  const found = (await Promise.all(queries.map(newsSearch))).flat();
  const seen = new Set<string>();
  const news = found.filter((s) => (seen.has(s.title) ? false : (seen.add(s.title), true)));

  const sources: ResearchSource[] = [
    ...signals.map((s) => ({ title: s.title, publisher: s.source, url: s.url, date: s.published_at?.toISOString().slice(0, 10) ?? null, kind: "signal" as const })),
    ...news,
  ].slice(0, MAX_SOURCES).map((s, i) => ({ ...s, n: i + 1 }));

  const material = sources.map((s) => {
    const sig = s.kind === "signal" ? signals.find((x) => x.title === s.title) : undefined;
    const detail = sig?.deep?.facts?.length ? sig.deep.facts.map((f) => `  - ${f}`).join("\n") : sig?.summary ? `  - ${sig.summary.slice(0, 300)}` : "";
    return `[${s.n}] ${s.title}${s.publisher ? ` — ${s.publisher}` : ""}${s.date ? ` (${s.date})` : ""}${detail ? `\n${detail}` : ""}`;
  });

  const out = sources.length
    ? await generateJson(
        [
          "You are researching a Japanese B2B article for Renesis Tech Japan.",
          `Topic: ${t.title_ja}`,
          `Primary keyword: ${t.primary_keyword ?? "-"}`,
          t.persona ? `Reader: ${t.persona}` : "",
          "",
          "Using ONLY the numbered SOURCES below (headlines, and facts where given), write in Japanese:",
          "- summary: ≤ 200 characters — what is happening around this topic right now.",
          "- points: 5–8 findings, each one sentence, each with refs = the source numbers that support it.",
          "  A headline supports a point about exactly what it says (e.g. which company did what, which theme is",
          "  being covered); group sources that show the same trend. Facts listed under a source support details.",
          "  Never add a number, company or claim that is not in the sources.",
          "- questions: 3–5 questions the reader is likely asking that the article should answer.",
          "",
          "SOURCES:",
          ...material,
          "",
          'Return ONLY JSON: {"summary":"","points":[{"text":"","refs":[1]}],"questions":[]}',
        ].filter((l) => l !== "").join("\n"),
        Out,
        { temperature: 0.2 },
      )
    : { summary: "", points: [], questions: [] };

  const valid = new Set(sources.map((s) => s.n));
  const research: Research = { ...out, points: out.points.map((p) => ({ ...p, refs: p.refs.filter((r) => valid.has(r)) })), sources };
  await sql`update topics set research = ${sql.json(research as never)}, researched_at = now() where id = ${topicId}`;
  return research;
}
