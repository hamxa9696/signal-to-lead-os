// Research this week's topics (Google News + deep signals → cited findings) so prompt packs
// carry current background. Runs after the weekly shortlist.
import { sql } from "@/lib/db";
import { env, has } from "@/lib/env";
import { researchTopic } from "@/lib/research";
import { weekOf } from "@/lib/week";
import type { Job } from "./types";

export const researchTopics: Job = {
  name: "research-topics",
  description: "Find recent coverage for this week's topics and summarise it with cited sources",
  async run() {
    if (!has(env.geminiApiKey)) return { status: "skipped", stats: {}, note: "GEMINI_API_KEY not set" };
    const topics = await sql<{ id: string }[]>`
      select id from topics where week_of = ${weekOf()} and status <> 'rejected' and researched_at is null`;
    let done = 0;
    const errors: string[] = [];
    for (const [i, t] of topics.entries()) {
      try {
        await researchTopic(t.id);
        done++;
      } catch (err) {
        errors.push((err as Error).message.slice(0, 200));
      }
      if (i < topics.length - 1) await new Promise((r) => setTimeout(r, 6_000));
    }
    if (topics.length && !done) throw new Error(`every topic failed: ${errors[0]}`);
    return { status: "ok", stats: { topics: topics.length, researched: done, errors: errors.length } };
  },
};
