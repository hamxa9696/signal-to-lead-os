// Run this week's questions through every enabled engine and record who got cited.
import { sql } from "../db";
import { askEngine, enabledEngines, type EngineResult } from "./engines";
import { linkedinOf, ourLinkedin, qualityOf } from "./analyze";

export const OUR_DOMAIN = "renesistech.jp";
const BRAND = /renesis|レネシス/i;

export function scoreResult(r: EngineResult) {
  const pos = r.citations.findIndex((c) => c.domain.endsWith(OUR_DOMAIN));
  return { we_cited: pos >= 0, our_position: pos >= 0 ? pos + 1 : null, we_mentioned: BRAND.test(r.answer) || pos >= 0 };
}

export async function runEngineChecks(week: string): Promise<{ engines: string[]; checked: number; failed: number; cited: number }> {
  const engines = enabledEngines();
  if (!engines.length) return { engines: [], checked: 0, failed: 0, cited: 0 };
  const ours = await ourLinkedin();
  const qs = await sql<{ id: string; question: string }[]>`select id, question from geo_questions where week_of = ${week} order by demand desc`;
  let checked = 0, failed = 0, cited = 0;
  for (const e of engines) {
    for (const q of qs) {
      try {
        const r = await askEngine(e, q.question);
        const s = scoreResult(r);
        const li = linkedinOf(r.citations, ours);
        await sql`
          insert into geo_checks (question_id, engine, answer, citations, we_cited, we_mentioned, our_position, citation_quality, linkedin_cited, linkedin_ours)
          values (${q.id}, ${e}, ${r.answer.slice(0, 6000)}, ${sql.json(r.citations.slice(0, 15) as never)}, ${s.we_cited}, ${s.we_mentioned}, ${s.our_position},
                  ${qualityOf(s.our_position, s.we_cited)}, ${li.linkedin_cited}, ${li.linkedin_ours})
          on conflict (question_id, engine) do update set answer = excluded.answer, citations = excluded.citations, checked_at = now(),
            we_cited = excluded.we_cited, we_mentioned = excluded.we_mentioned, our_position = excluded.our_position,
            citation_quality = excluded.citation_quality, linkedin_cited = excluded.linkedin_cited, linkedin_ours = excluded.linkedin_ours,
            analyzed_at = null`;
        checked++;
        if (s.we_cited) cited++;
      } catch (err) {
        failed++;
        // Out of quota / not enabled on this key: stop asking this engine this week.
        if (/\b(401|403|429)\b/.test((err as Error).message)) break;
      }
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }
  return { engines, checked, failed, cited };
}
