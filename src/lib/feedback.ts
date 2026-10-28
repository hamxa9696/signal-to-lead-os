// The owner's 👍/👎 on stories, turned into examples for Gemini's relevance scoring.
import { sql } from "./db";

export async function feedbackExamples(limit = 12): Promise<string> {
  const rows = await sql<{ title: string; feedback: number }[]>`
    select title, feedback from stories
    where feedback is not null and feedback_at >= now() - interval '90 days'
    order by feedback_at desc limit ${limit * 2}`;
  const liked = rows.filter((r) => r.feedback > 0).slice(0, limit);
  const disliked = rows.filter((r) => r.feedback < 0).slice(0, limit);
  if (!liked.length && !disliked.length) return "";
  return [
    "OWNER FEEDBACK (learn from these: score similar news like the owner did):",
    ...liked.map((r) => `+ USEFUL: ${r.title}`),
    ...disliked.map((r) => `- NOT USEFUL: ${r.title}`),
  ].join("\n");
}
