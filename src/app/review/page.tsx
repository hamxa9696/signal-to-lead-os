import Link from "next/link";
import { sql } from "@/lib/db";
import { monthStart, RULES } from "@/lib/monthly";
import { RunButton } from "../run-button";
import { PageHeader } from "../page-header";
import { actAction, statusAction } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Gemini and PDF actions can take minutes

type Row = {
  id: string; kind: "refresh" | "expand" | "prune"; path: string; title: string | null; reason: string;
  data: { queries?: { query: string; impressions: number; position: number }[]; query?: string };
  status: string; topic_id: string | null;
};

const KINDS = [
  { kind: "refresh", title: "Refresh", help: `Pages at Google positions ${RULES.refresh.minPosition}–${RULES.refresh.maxPosition} with ≥ ${RULES.refresh.minImpressions} impressions. A rewrite can reach page 1.`, cta: "Create rewrite task" },
  { kind: "expand", title: "Expand", help: "Winning pages that also show up for queries they don't answer well. Write a dedicated article.", cta: "Add to next week" },
  { kind: "prune", title: "Prune", help: `Pages older than ${RULES.prune.minAgeDays} days with ≤ ${RULES.prune.maxSessions} sessions and ≤ ${RULES.prune.maxImpressions} impressions in 28 days. Merge, rewrite or remove in Payload.`, cta: null },
] as const;

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: m } = await searchParams;
  const [{ latest }] = await sql<{ latest: string | null }[]>`select max(month)::text as latest from review_actions`;
  const month = /^\d{4}-\d{2}-01$/.test(m ?? "") ? m! : (latest ?? monthStart());
  const months = await sql<{ month: string }[]>`select distinct month::text from review_actions order by 1 desc limit 12`;
  const rows = await sql<Row[]>`
    select id, kind, path, title, reason, data, status, topic_id from review_actions
    where month = ${month} order by status = 'open' desc, priority desc`;

  return (
    <main className="page">
      <PageHeader
        eyebrow={`${month.slice(0, 7)} · last 28 days of GA4 + Search Console`}
        title="Monthly review"
        description="Existing pages to refresh, expand or prune. Generated on the 2nd of each month."
        actions={
          <>
            {months.length > 1 && (
              <nav aria-label="Month" className="seg">
                {months.map((x) => (
                  <Link key={x.month} href={`/review?month=${x.month}`} className={x.month === month ? "seg-on" : "seg-item"}>
                    {x.month.slice(0, 7)}
                  </Link>
                ))}
              </nav>
            )}
            <RunButton job="monthly-review" label="Regenerate now" />
          </>
        }
      />

      <div className="space-y-8">
        {KINDS.map((k) => {
          const items = rows.filter((r) => r.kind === k.kind);
          return (
            <section key={k.kind}>
              <h2 className="font-semibold">{k.title} <span className="text-faint">({items.filter((i) => i.status === "open").length} open)</span></h2>
              <p className="text-[13px] text-faint">{k.help}</p>
              <ul className="mt-3 space-y-3">
                {items.map((r) => (
                  <li key={r.id} className={`card p-4 ${r.status !== "open" ? "opacity-60" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-[14rem] flex-1">
                        <p lang="ja" className="font-medium">
                          <a href={`https://renesistech.jp${r.path}`} target="_blank" rel="noreferrer" className="hover:underline">{r.title ?? r.path}</a>
                        </p>
                        <p className="truncate text-xs text-faint">{r.path}</p>
                        <p lang="ja" className="mt-2 text-sm text-body">{r.reason}</p>
                        {r.data.queries?.length ? (
                          <p lang="ja" className="mt-1 text-xs text-faint">
                            Queries: {r.data.queries.map((q) => `${q.query} (${q.impressions} imp, pos ${q.position.toFixed(1)})`).join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {r.topic_id ? (
                          <Link href={`/topics/${r.topic_id}`} className="btn-primary !bg-ink hover:!bg-body">Open task →</Link>
                        ) : (
                          r.status === "open" && k.cta && (
                            <form action={actAction}>
                              <input type="hidden" name="id" value={r.id} />
                              <button className="btn-primary">{k.cta}</button>
                            </form>
                          )
                        )}
                        {r.status === "open" ? (
                          <>
                            {k.kind === "prune" && <StatusButton id={r.id} status="done" label="Done" />}
                            <StatusButton id={r.id} status="dismissed" label="Dismiss" />
                          </>
                        ) : (
                          !r.topic_id && <StatusButton id={r.id} status="open" label="Reopen" />
                        )}
                      </div>
                    </div>
                  </li>
                ))}
                {!items.length && <li className="card px-4 py-4 text-sm text-faint">Nothing this month.</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function StatusButton({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <form action={statusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className="btn">{label}</button>
    </form>
  );
}
