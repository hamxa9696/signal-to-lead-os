// Daily, after stories are grouped: if a big story broke since Monday's plan (strength ≥ 80, or
// ≥ 5 outlets at strength ≥ 70) and nothing covers it yet, propose it for this week in its best
// format. At most one a day and two a week, so the plan never floods; a person approves each.
import { sql } from "@/lib/db";
import { env, has } from "@/lib/env";
import { weekOf } from "@/lib/week";
import { planFormats } from "@/lib/format-plan";
import { createStoryTopic, topStories } from "@/lib/top-stories";
import type { Job } from "./types";

const WEEKLY_CAP = 2;

export const breakingStories: Job = {
  name: "breaking-stories",
  description: "Propose a fast topic for any big story that broke since the weekly plan",
  async run() {
    if (!has(env.geminiApiKey)) return { status: "skipped", stats: {}, note: "GEMINI_API_KEY not set" };
    const week = weekOf();
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from topics where origin = 'breaking' and week_of = ${week} and status <> 'rejected'`;
    if (n >= WEEKLY_CAP) return { status: "ok", stats: { week, proposedThisWeek: n }, note: "weekly cap reached" };

    const stories = await topStories({ hours: 36, limit: 10, minStrength: 70 });
    // Skip stories someone already rejected as a topic.
    const rejected = new Set((await sql<{ story_id: string }[]>`
      select story_id from topics where story_id is not null and status = 'rejected'`).map((r) => r.story_id));
    const pick = stories.find((s) => !s.planned && !rejected.has(s.id) && (s.strength >= 80 || s.outlets >= 5));
    if (!pick) return { status: "ok", stats: { week, checked: stories.length, proposed: 0 }, note: "no new big story" };

    const id = await createStoryTopic({ story: pick.id }, pick.uses[0], { status: "proposed", origin: "breaking" });
    await planFormats([id]).catch(() => null);
    return { status: "ok", stats: { week, checked: stories.length, proposed: 1, story: pick.title.slice(0, 80), strength: pick.strength, use: pick.uses[0] } };
  },
};
