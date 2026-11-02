// Visits and form fills that AI assistants sent to renesistech.jp (from GA4 source/medium).
import { sql } from "../db";

export const AI_SOURCES: { key: string; label: string; match: RegExp }[] = [
  { key: "chatgpt", label: "ChatGPT", match: /chatgpt\.com|chat\.openai\.com|openai/i },
  { key: "gemini", label: "Gemini", match: /gemini\.google|bard\.google/i },
  { key: "perplexity", label: "Perplexity", match: /perplexity/i },
  { key: "copilot", label: "Copilot", match: /copilot\.microsoft|copilot\.cloud|edgeservices\.bing/i },
  { key: "claude", label: "Claude", match: /claude\.ai|anthropic/i },
  { key: "felo", label: "Felo (Japan)", match: /felo\.ai/i },
  { key: "other_ai", label: "Other AI", match: /genspark|you\.com|phind|meta\.ai|grok|deepseek|mistral|poe\.com/i },
];

export type AiWeek = { week: string; byAssistant: Record<string, number>; leads: number; sessions: number };

export async function aiTraffic(weeks = 12): Promise<{ weeks: AiWeek[]; totals: { key: string; label: string; sessions: number; leads: number }[]; share: number }> {
  const rows = await sql<{ week: string; source_medium: string; sessions: number; leads: number }[]>`
    select to_char(date_trunc('week', date), 'YYYY-MM-DD') as week, source_medium, sum(sessions)::int as sessions, coalesce(sum(leads), 0)::int as leads
    from metrics_daily
    where channel = 'website' and page_path = '*' and source_medium <> '' and date >= current_date - ${weeks * 7}::int
    group by 1, 2`;
  const [{ all }] = await sql<{ all: number }[]>`
    select coalesce(sum(sessions), 0)::int as "all" from metrics_daily
    where channel = 'website' and page_path = '*' and source_medium = '' and date >= current_date - ${weeks * 7}::int`;
  const keyOf = (sm: string) => AI_SOURCES.find((a) => a.match.test(sm))?.key;
  const wk = new Map<string, AiWeek>();
  const tot = new Map<string, { sessions: number; leads: number }>();
  for (const r of rows) {
    const k = keyOf(r.source_medium);
    if (!k) continue;
    const w = wk.get(r.week) ?? { week: r.week, byAssistant: {}, leads: 0, sessions: 0 };
    w.byAssistant[k] = (w.byAssistant[k] ?? 0) + r.sessions;
    w.sessions += r.sessions;
    w.leads += r.leads;
    wk.set(r.week, w);
    const t = tot.get(k) ?? { sessions: 0, leads: 0 };
    t.sessions += r.sessions;
    t.leads += r.leads;
    tot.set(k, t);
  }
  const totals = AI_SOURCES.map((a) => ({ key: a.key, label: a.label, ...(tot.get(a.key) ?? { sessions: 0, leads: 0 }) }));
  const aiSessions = totals.reduce((x, t) => x + t.sessions, 0);
  return { weeks: [...wk.values()].sort((a, b) => a.week.localeCompare(b.week)), totals, share: all ? aiSessions / all : 0 };
}
