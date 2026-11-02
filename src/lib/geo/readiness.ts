// How ready is our best page for each question to be cited by each AI channel? Deterministic
// checks of the live page + Search Console position, so every score is explainable.
import { sql } from "../db";
import { extractText } from "../article";

const SITE = "https://renesistech.jp";

type Q = { id: string; question: string; keywords: string[] };
type Page = { path: string; title: string };
export type Checks = {
  answer_first: boolean; question_headings: number; faq: boolean; sourced_numbers: number; cites_sources: boolean;
  fresh_days: number | null; brand: boolean; length: number;
};
type Channel = { score: number; notes: string[] };

async function fetchPage(path: string): Promise<{ html: string; text: string } | null> {
  try {
    const res = await fetch(`${SITE}${encodeURI(path)}`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; KizashiGEO/1.0)" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const html = await res.text();
    return { html, text: extractText(html) };
  } catch {
    return null;
  }
}

function contentChecks(html: string, text: string, keywords: string[]): Checks {
  const head = text.slice(0, 500);
  const headings = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)].map((m) => m[1].replace(/<[^>]+>/g, ""));
  const modified = /"dateModified":"([^"]+)"/.exec(html)?.[1] ?? /"datePublished":"([^"]+)"/.exec(html)?.[1];
  return {
    answer_first: keywords.some((k) => head.includes(k)) && /(とは|結論|まとめると|ポイントは|です。|ます。)/.test(head),
    question_headings: headings.filter((h) => /[？?]|とは|方法|なぜ|どう|いくら|選び方|比較/.test(h)).length,
    faq: /よくある質問|FAQ|Q&A|Ｑ＆Ａ/.test(html),
    sourced_numbers: (text.match(/\d[\d,.]*\s?(%|％|円|万|億|社|件|倍|人|年)/g) ?? []).length,
    cites_sources: /(出典|調査によると|によると|発表|レポート|白書|https?:\/\/)/.test(text),
    fresh_days: modified ? Math.round((Date.now() - Date.parse(modified)) / 86_400_000) : null,
    brand: /Renesis|レネシス/.test(text),
    length: text.length,
  };
}

/** Content score 0–100 from the checks; also returns the gaps in plain English. */
function contentScore(c: Checks): { score: number; gaps: string[] } {
  const gaps: string[] = [];
  let s = 0;
  if (c.answer_first) s += 20; else gaps.push("Start with a 2–3 sentence direct answer (結論) that uses the question's words");
  if (c.question_headings >= 2) s += 15; else gaps.push("Use question-style H2s (〜とは？ / 費用は？ / 選び方は？) so AI can lift answers");
  if (c.faq) s += 15; else gaps.push("Add a よくある質問 section answering this exact question");
  if (c.sourced_numbers >= 3 && c.cites_sources) s += 20; else gaps.push("Add concrete numbers with their source (調査・出典) — AI prefers quotable facts");
  if (c.fresh_days != null && c.fresh_days <= 180) s += 15; else gaps.push(c.fresh_days == null ? "Show an updated date" : `Refresh the page (last updated ${c.fresh_days} days ago)`);
  if (c.brand) s += 5; else gaps.push("Name Renesis Tech Japan and the service clearly on the page");
  if (c.length >= 3000) s += 10; else gaps.push("Expand: under 3,000 characters is thin for AI answers");
  return { score: s, gaps };
}

export async function updateReadiness(week: string): Promise<{ questions: number; withPage: number }> {
  const [qs, pages] = await Promise.all([
    sql<Q[]>`select id, question, keywords from geo_questions where week_of = ${week}`,
    sql<Page[]>`select path, coalesce(title, path) as title from site_pages where section in ('blog', 'services', 'home') and path <> '/blog'`,
  ]);
  const cache = new Map<string, Awaited<ReturnType<typeof fetchPage>>>();
  let withPage = 0;
  for (const q of qs) {
    const kws = q.keywords.length ? q.keywords : q.question.split(/[\s、。？?]+/).filter((w) => w.length >= 2).slice(0, 4);
    const best = pages
      .map((p) => ({ p, hits: kws.filter((k) => p.title.includes(k) || decodeURIComponent(p.path).includes(k)).length }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)[0]?.p ?? null;

    // Google: our Search Console position for queries sharing the question's keywords.
    const [g] = await sql<{ pos: number | null; imp: number }[]>`
      select (sum(position * impressions) / nullif(sum(impressions), 0))::float as pos, coalesce(sum(impressions), 0)::int as imp
      from search_queries_daily
      where date >= current_date - 28 and query ilike any(${kws.map((k) => `%${k}%`)})
        ${best ? sql`and regexp_replace(regexp_replace(page, '^https?://[^/]+', ''), '(.)/+$', '\\1') = ${best.path}` : sql``}`.catch(() => [{ pos: null, imp: 0 }]);

    let checks: Checks | null = null;
    let gaps: string[] = [];
    let content = 0;
    if (best) {
      if (!cache.has(best.path)) cache.set(best.path, await fetchPage(best.path));
      const page = cache.get(best.path);
      if (page) {
        checks = contentChecks(page.html, page.text, kws);
        ({ score: content, gaps } = contentScore(checks));
        withPage++;
      }
    } else {
      gaps = ["No page on renesistech.jp answers this question yet — create a topic for it"];
    }

    const gPos = g?.pos ?? null;
    const googleRank = gPos == null ? 0 : gPos <= 10 ? 40 : gPos <= 20 ? 25 : gPos <= 50 ? 10 : 0;
    const channels: Record<string, Channel> = {
      google: {
        score: Math.round(googleRank + content * 0.6),
        notes: [gPos == null ? "No Search Console data for this question yet" : `Average Google position ${gPos.toFixed(1)} (${g.imp} impressions, 28 days)`,
          "AI Overviews / Gemini mostly cite pages that already rank in Google"],
      },
      chatgpt: {
        score: Math.round(content * 0.7),
        notes: ["ChatGPT search and Copilot use Bing's index: not checked yet (connect Bing Webmaster Tools to confirm indexing)"],
      },
      perplexity: {
        score: Math.round(content * 0.85 + (checks?.fresh_days != null && checks.fresh_days <= 90 ? 15 : 0)),
        notes: ["Perplexity favours fresh, well-structured pages with sourced facts"],
      },
    };
    if (gPos != null && gPos > 10) gaps.push(`Improve Google ranking for this question (now ~${gPos.toFixed(0)}): AI Overviews rarely cite beyond page 1`);
    const overall = best ? Math.round((channels.google.score + channels.chatgpt.score + channels.perplexity.score) / 3) : 0;
    await sql`
      insert into geo_readiness (question_id, page_path, page_title, score, channels, checks, gaps, updated_at)
      values (${q.id}, ${best?.path ?? null}, ${best?.title ?? null}, ${overall}, ${sql.json(channels as never)}, ${sql.json((checks ?? {}) as never)}, ${sql.json(gaps as never)}, now())
      on conflict (question_id) do update set page_path = excluded.page_path, page_title = excluded.page_title, score = excluded.score,
        channels = excluded.channels, checks = excluded.checks, gaps = excluded.gaps, updated_at = now()`;
  }
  return { questions: qs.length, withPage };
}
