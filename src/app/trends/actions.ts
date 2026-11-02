"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { planFormats } from "@/lib/format-plan";
import { themeStories, trendBoard } from "@/lib/trend-board";
import { TREND_PERIODS, type TrendPeriod } from "@/lib/trends";
import { weekOf } from "@/lib/week";
import { plannedHubDate } from "@/lib/schedule";

const OUTLINES: Record<string, string[]> = {
  evergreen: ["結論：この質問への答え", "〜とは？基本と背景", "企業にとってのメリットと注意点", "費用・期間の目安", "選び方と比較のポイント", "よくある質問", "まとめ"],
  fast_take: ["結論：何が起きたか（要点3つ）", "背景：なぜ今これが重要か", "日本企業への影響", "今確認すべきこと", "まとめ"],
  lead_magnet: ["比較の観点", "選択肢ごとの向き・不向き", "選び方のフロー", "よくある失敗"],
  refresh: [],
};

/** Turn a trending theme into an approved topic for this week, with the signals behind it. */
export async function addThemeToPlan(form: FormData): Promise<void> {
  const keyword = String(form.get("keyword") ?? "");
  const period = (TREND_PERIODS.find((p) => p.key === form.get("period"))?.key ?? "7d") as TrendPeriod;
  const { themes } = await trendBoard(period);
  const t = themes.find((x) => x.keyword === keyword);
  if (!t) throw new Error("theme not found; refresh the page");
  if (t.planned) redirect(`/topics/${t.planned.id}`);

  const r = t.rec;
  const [svc] = await sql<{ id: string }[]>`
    select s.id from services s join categories c on c.id = s.category_id
    where c.slug = ${t.catSlug ?? ""} and s.active order by s.focus desc limit 1`;
  const title = r.slot === "refresh" ? `${r.seoKeyword}（リライト）`
    : r.slot === "lead_magnet" ? `${t.keyword} 比較ガイド：選び方チェックリスト付き`
    : r.aiQuestion ?? `${t.keyword}とは？企業が知っておくべきポイント`;
  const evidence = [
    `News: ${t.news.relevant} relevant articles (${t.news.now} vs ${t.news.prev} before)`,
    t.google ? `Google: ${t.google.now} impressions${t.google.position ? `, avg #${t.google.position}` : ""}` : null,
    t.ai.questions.length ? `AI: ${t.ai.questions.length} buyer questions, cited in ${t.ai.cited}` : null,
    t.forecast ? `Forecast: ${t.forecast.direction}` : null,
  ].filter(Boolean).join(" · ");
  const week = weekOf();
  const deadline = r.slot === "fast_take" ? new Date(Date.now() + 48 * 3_600_000) : null;
  const [row] = await sql<{ id: string }[]>`
    insert into topics (kind, magnet_format, title_ja, primary_keyword, secondary_keywords, search_intent, service_id, rationale, outline,
                        week_of, slot, origin, target_path, status, score, score_breakdown, deadline, planned_date)
    values (${r.slot === "lead_magnet" ? "lead_magnet" : "article"}, ${r.slot === "lead_magnet" ? "comparison" : null}, ${title},
            ${r.seoKeyword}, ${[t.keyword, ...(t.google?.queries.map((q) => q.query) ?? [])].filter((v, i, a) => v !== r.seoKeyword && a.indexOf(v) === i).slice(0, 4)},
            ${r.slot === "lead_magnet" ? "commercial" : "informational"}, ${svc?.id ?? null},
            ${`From Trends (${t.keyword}, score ${t.score}): ${r.why} ${evidence}.${r.aiQuestion ? ` Answer the AI question: ${r.aiQuestion}` : ""}`},
            ${sql.json(OUTLINES[r.slot])}, ${week}, ${r.slot}, ${r.slot === "refresh" ? "refresh" : "shortlist"}, ${r.targetPath},
            'approved', ${t.score},
            ${sql.json({ demand: Math.round((t.parts.google / 25) * 40), demand_source: t.google ? "search_console" : "estimate", fit: 20, freshness: Math.round(t.parts.news / 3), performance: 5, evergreen: r.slot === "evergreen", performance_note: "Added from Trends" })},
            ${deadline}, ${plannedHubDate(week, r.slot)}::date)
    returning id`;
  const stories = await themeStories(t.keyword, period);
  for (const s of stories.slice(0, 5)) {
    await sql`insert into topic_signals (topic_id, signal_id) values (${row.id}, ${s.signalId}) on conflict do nothing`;
  }
  await planFormats([row.id]).catch(() => null);
  revalidatePath("/trends");
  revalidatePath("/topics");
  redirect(`/topics/${row.id}`);
}
