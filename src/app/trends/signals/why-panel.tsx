import { loadTaxonomy } from "@/lib/taxonomy";

export type Row = {
  title: string; url: string | null; source: string; published_at: Date | null;
  relevance: string | null; service: string | null; buyer_problem: string | null; angle: string | null; sub: string | null;
  source_kind: string | null; source_url: string | null; summary: string | null; body: string | null; status: string;
  why: string | null; sort_why: string | null; sort_by: string | null; subcategory_id: string | null; category_id: string | null;
  analyzed_at: Date | null; persona_from_deep: string | null;
  deep: { facts?: string[]; implication?: string; persona?: string | null; industries?: string[]; questions?: string[]; full_text?: boolean } | null;
};

export const fmt = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", month: "short", day: "numeric" }).format(d) : "—";

const SOURCE_KIND: Record<string, string> = {
  industry_news: "Japanese news site (RSS)",
  developer_news: "Japanese developer news (RSS)",
  keyword_search: "Google News search",
  custom: "Feed you added",
};

function scoreLabel(r: number): { label: string; cls: string } {
  if (r >= 0.8) return { label: "Strong match", cls: "bg-good-soft text-good" };
  if (r >= 0.6) return { label: "Good match", cls: "bg-accent-soft text-accent-ink" };
  if (r >= 0.35) return { label: "Possible match", cls: "bg-subtle text-muted" };
  return { label: "Not relevant", cls: "bg-subtle text-faint" };
}

/** Everything the signal's place on this page is based on, in plain words. */
export function WhyPanel({ r, tax, personas }: {
  r: Row;
  tax: Awaited<ReturnType<typeof loadTaxonomy>>;
  personas: { id: string; name: string }[];
}) {
  const sub = tax.subcategories.find((x) => x.id === r.subcategory_id);
  const cat = tax.categories.find((c) => c.id === (sub?.category_id ?? r.category_id));
  const text = `${r.title}\n${r.summary ?? ""}\n${r.body ?? ""}`.toLowerCase();
  const matched = (sub?.keywords ?? []).filter((k) => k.split(/\s+/).every((w) => text.includes(w.toLowerCase())));
  const readers = [...new Set([r.persona_from_deep, ...(sub?.persona_ids ?? []).map((id) => personas.find((p) => p.id === id)?.name)].filter(Boolean))];
  const query = r.source_kind === "keyword_search" ? r.source.replace(/^Google News:\s*/, "") : null;
  const rel = r.relevance != null ? Number(r.relevance) : null;
  const score = rel != null ? scoreLabel(rel) : null;
  const row = "grid gap-0.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3";
  const key = "text-[11.5px] font-semibold uppercase tracking-wide text-faint sm:pt-0.5";

  return (
    <details className="group mt-2">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline">
        <span className="transition group-open:rotate-90">›</span> How we found and sorted it
      </summary>
      <div className="mt-2 flex flex-col gap-2.5 rounded-lg border border-line bg-subtle/60 px-4 py-3 text-[13px]">
        <div className={row}>
          <span className={key}>Found by</span>
          <span>
            {r.source}
            <span className="text-faint"> · {SOURCE_KIND[r.source_kind ?? ""] ?? "Feed"}</span>
            {query && <> searching for <span lang="ja" className="font-medium">「{query}」</span></>}
            {r.published_at && <span className="text-faint"> · published {fmt(r.published_at)}</span>}
          </span>
        </div>
        <div className={row}>
          <span className={key}>Relevance</span>
          <span>
            {score && rel != null ? (
              <>
                <span className={`mr-2 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${score.cls}`}>{score.label} · {rel.toFixed(2)}</span>
                {r.why || <span className="text-faint">Scored by Gemini against your personas, industries and services (reason recorded from the next run).</span>}
              </>
            ) : (
              <span className="text-faint">Not scored yet: waiting for the next Gemini run.</span>
            )}
          </span>
        </div>
        <div className={row}>
          <span className={key}>Sorted into</span>
          <span>
            {cat ? (
              <>
                <span className="font-medium">{cat.name_en}{sub && <> › {sub.name_en}</>}</span>
                {r.sort_by === "service" && <span className="text-faint"> (from its matching service)</span>}
                {r.sort_why && <span className="text-muted"> — {r.sort_why}</span>}
              </>
            ) : (
              <span className="text-faint">No category fits{r.sort_why ? ` — ${r.sort_why}` : ""}</span>
            )}
          </span>
        </div>
        {sub && (
          <div className={row}>
            <span className={key}>Keywords found</span>
            <span lang="ja">
              {matched.length ? (
                <span className="flex flex-wrap gap-1">{matched.map((k) => <span key={k} className="rounded bg-surface px-1.5 py-0.5 text-[12px] ring-1 ring-line">{k}</span>)}</span>
              ) : (
                <span className="text-faint" lang="en">None of this niche&apos;s keywords appear word-for-word; Gemini placed it by meaning.</span>
              )}
            </span>
          </div>
        )}
        {(r.service || readers.length > 0) && (
          <div className={row}>
            <span className={key}>Matches</span>
            <span lang="ja">
              {r.service && <>Service: {r.service}</>}
              {r.service && readers.length > 0 && " · "}
              {readers.length > 0 && <>Readers: {readers.join("、")}</>}
            </span>
          </div>
        )}
        {r.deep && (
          <div className={row}>
            <span className={key}>Evidence</span>
            <span>{r.deep.full_text ? "Full article read; the facts above are taken from it." : "Article is paywalled or not readable; analysed from its summary."}</span>
          </div>
        )}
      </div>
    </details>
  );
}
