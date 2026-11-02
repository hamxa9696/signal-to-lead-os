// "Fix these" (formerly Monthly review): existing pages to rewrite, expand or prune, plus buyer
// questions AI assistants get asked that no page of ours answers. Regenerated every week.
import Link from "next/link";
import { PendingButton } from "../pending-button";
import { RunButton } from "../run-button";
import { sql } from "@/lib/db";
import { RULES } from "@/lib/monthly";
import { MakeTopic } from "../trends/ai-search/client";
import { actAction, statusAction } from "./review-actions";

type Row = {
  id: string; kind: "refresh" | "expand" | "prune"; path: string; title: string | null; reason: string;
  data: { queries?: { query: string; impressions: number; position: number }[]; query?: string };
  status: string; topic_id: string | null;
};

const KINDS = [
  { kind: "refresh", title: "Rewrite", color: "#4E7A8C", help: `On Google positions ${RULES.refresh.minPosition}–${RULES.refresh.maxPosition} with ≥ ${RULES.refresh.minImpressions} impressions: a rewrite can reach page 1.`, cta: "Plan rewrite" },
  { kind: "expand", title: "Expand", color: "#2F6B55", help: "Winning pages that also show up for queries they don't answer well: write a dedicated piece.", cta: "Add to plan" },
  { kind: "prune", title: "Merge or remove", color: "#5E6B64", help: `Older than ${RULES.prune.minAgeDays} days with ≤ ${RULES.prune.maxSessions} sessions and ≤ ${RULES.prune.maxImpressions} impressions in 28 days. Handle in Payload.`, cta: null },
] as const;

export async function FixThese() {
  const [rows, gaps] = await Promise.all([
    sql<Row[]>`
      select id, kind, path, title, reason, data, status, topic_id from review_actions
      where month = (select max(month) from review_actions) and status = 'open' order by priority desc`,
    sql<{ id: string; question: string; cluster: string | null; demand: number }[]>`
      select q.id, q.question, q.cluster, q.demand from geo_questions q left join geo_readiness r on r.question_id = q.id
      where q.week_of = (select max(week_of) from geo_questions) and r.page_path is null
        and not exists (select 1 from topics t where t.title_ja = q.question)
      order by q.demand desc limit 6`,
  ]);
  const groups = [
    ...KINDS.map((k) => ({ ...k, items: rows.filter((r) => r.kind === k.kind) })),
  ];
  return (
    <section id="fix-these" aria-labelledby="fix-these-h" className="flex scroll-mt-6 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="fix-these-h" className="text-lg font-semibold">Fix these <span className="ml-1 rounded-full bg-[#F6EBD2] px-2 py-0.5 align-middle text-[11px] font-semibold text-[#7A4A0A]">was Monthly review</span></h2>
          <p className="mt-0.5 text-[13px] text-faint">Pages that need work and buyer questions with no page. Updated every Monday; each one becomes a topic in Plan with one click.</p>
        </div>
        <RunButton job="monthly-review" label="Refresh list now" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {groups.map((g) => (
          <div key={g.kind} className="card flex min-w-0 flex-col gap-2 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[14px] font-semibold" style={{ color: g.color }}>{g.title}</h3>
              <span translate="no" className="font-mono text-[15px] font-semibold">{g.items.length}</span>
            </div>
            <p className="text-[12px] text-faint">{g.help}</p>
            <ul className="flex flex-col gap-2.5">
              {g.items.slice(0, 4).map((r) => (
                <li key={r.id} className="border-t border-line pt-2">
                  <a lang="ja" href={`https://renesistech.jp${r.path}`} target="_blank" rel="noreferrer" className="line-clamp-2 text-[13px] font-medium hover:underline">{r.title ?? r.path}</a>
                  <p lang="ja" className="mt-0.5 line-clamp-2 text-[12px] text-muted">{r.reason}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.topic_id ? (
                      <Link href={`/topics/${r.topic_id}`} prefetch={false} className="text-[12px] font-semibold text-accent hover:underline">Open in Plan →</Link>
                    ) : g.cta ? (
                      <form action={actAction}><input type="hidden" name="id" value={r.id} /><PendingButton className="btn !min-h-8 !py-1 !text-[12px]" pendingText="Creating…">{g.cta}</PendingButton></form>
                    ) : (
                      <form action={statusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="done" /><PendingButton className="btn !min-h-8 !py-1 !text-[12px]" pendingText="Saving…">Done</PendingButton></form>
                    )}
                    <form action={statusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="dismissed" /><PendingButton className="!min-h-8 rounded-md px-2 py-1 text-[12px] text-faint hover:text-ink" pendingText="…">Dismiss</PendingButton></form>
                  </div>
                </li>
              ))}
              {!g.items.length && <li className="text-[12.5px] text-faint">Nothing right now.</li>}
            </ul>
          </div>
        ))}
        <div className="card flex min-w-0 flex-col gap-2 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-[#8A5A7A]">Answer for AI</h3>
            <span translate="no" className="font-mono text-[15px] font-semibold">{gaps.length}</span>
          </div>
          <p className="text-[12px] text-faint">Buyers ask AI assistants these questions and no page of ours answers them.</p>
          <ul className="flex flex-col gap-2.5">
            {gaps.map((q) => (
              <li key={q.id} className="border-t border-line pt-2">
                <p lang="ja" className="text-[13px] font-medium">{q.question}</p>
                <p className="mt-0.5 text-[12px] text-muted">{q.cluster ?? "-"} · demand {q.demand}</p>
                <div className="mt-1.5"><MakeTopic questionId={q.id} /></div>
              </li>
            ))}
            {!gaps.length && <li className="text-[12.5px] text-faint">Every tracked question has a page.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}
