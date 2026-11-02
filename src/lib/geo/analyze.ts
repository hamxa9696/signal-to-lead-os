// Read each AI answer the way the LinkedIn AI-search guide measures it: how prominently we are
// cited (primary / supporting / reference), how we are described (sentiment), which competing
// vendors the answer names, and whether LinkedIn (ours or anyone's) is among the sources.
import { z } from "zod";
import { sql } from "../db";
import { generateJson } from "../gemini";
import type { Citation } from "./engines";

export type Quality = "primary" | "supporting" | "reference" | "none";

/** Prominence from our rank among the cited sources. */
export function qualityOf(position: number | null, cited: boolean): Quality {
  if (!cited || position == null) return "none";
  return position === 1 ? "primary" : position <= 3 ? "supporting" : "reference";
}

/** LinkedIn URLs that are ours: the experts' profiles or a Renesis company page. */
export async function ourLinkedin(): Promise<(u: string) => boolean> {
  const rows = await sql<{ linkedin_url: string }[]>`select linkedin_url from experts where linkedin_url is not null`.catch(() => []);
  const slugs = rows.map((r) => r.linkedin_url.toLowerCase().replace(/\/+$/, "").split("/").pop() ?? "").filter(Boolean);
  return (u: string) => {
    const x = u.toLowerCase();
    return /linkedin\.com\/company\/renesis/.test(x) || slugs.some((s) => x.includes(`/in/${s}`) || x.includes(`/pulse/`) && x.includes(s));
  };
}

export function linkedinOf(citations: Citation[], ours: (u: string) => boolean) {
  const li = citations.filter((c) => c.domain.endsWith("linkedin.com"));
  return { linkedin_cited: li.length > 0, linkedin_ours: li.some((c) => ours(c.url)) };
}

const Out = z.object({
  items: z.array(z.object({
    i: z.number().int(),
    sentiment: z.enum(["positive", "neutral", "negative"]).nullable().catch(null),
    recommended: z.boolean().catch(false),
    competitors: z.array(z.string()).catch([]),
  })),
});

/** Sentiment, competitors and "are we the main recommendation" for this week's un-analyzed answers. */
export async function analyzeAnswers(week: string): Promise<{ analyzed: number }> {
  const rows = await sql<{ id: string; question: string; answer: string; we_mentioned: boolean; we_cited: boolean; our_position: number | null }[]>`
    select g.id, q.question, g.answer, g.we_mentioned, g.we_cited, g.our_position
    from geo_checks g join geo_questions q on q.id = g.question_id
    where q.week_of = ${week} and g.analyzed_at is null and coalesce(g.answer, '') <> ''
    order by q.demand desc limit 160`;
  let analyzed = 0;
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20);
    const out = await generateJson(
      [
        "You read answers that AI assistants gave to Japanese B2B buyers. Our company is Renesis Tech Japan (レネシス, renesistech.jp).",
        "For each answer return:",
        "- sentiment: how the answer describes Renesis Tech Japan: positive / neutral / negative; null if it does not mention Renesis at all.",
        "- recommended: true only if Renesis is the main or first recommendation in the answer.",
        "- competitors: up to 6 other companies or services the answer names as vendors/options to choose (company names as written; not media, not government bodies).",
        "",
        ...batch.map((r, k) => `[${k}] Q: ${r.question}\nA: ${r.answer.slice(0, 1500).replace(/\s+/g, " ")}`),
        "",
        'Return ONLY JSON: {"items":[{"i":0,"sentiment":null,"recommended":false,"competitors":[]}]}',
      ].join("\n"),
      Out,
      { temperature: 0, prefer: "gemini-3.5-flash-lite" },
    ).catch(() => null);
    if (!out) continue;
    for (const [k, r] of batch.entries()) {
      const it = out.items.find((x) => x.i === k);
      if (!it) continue;
      const quality = it.recommended && (r.we_cited || r.we_mentioned) ? "primary" : qualityOf(r.our_position, r.we_cited);
      await sql`
        update geo_checks set sentiment = ${r.we_mentioned || r.we_cited ? it.sentiment ?? "neutral" : null},
          competitors = ${it.competitors.map((c) => c.slice(0, 60)).slice(0, 6)}, citation_quality = ${quality}, analyzed_at = now()
        where id = ${r.id}`;
      analyzed++;
    }
  }
  return { analyzed };
}
