import type { PendingQuery, Row as PgRow } from "postgres";
import { sql } from "@/lib/db";
import { loadTaxonomy } from "@/lib/taxonomy";
import { STRENGTH_MAX, storyStrength, type StrengthParts } from "@/lib/strength";
import { typeInfo } from "@/lib/signal-types";
import { HoverCard } from "../../hover-card";
import { Rate } from "./rate";
import { fmt, WhyPanel, type Row } from "./why-panel";

type Story = {
  id: string; title: string; signal_type: string | null; articles: number; outlets: number; strength: number;
  strength_parts: StrengthParts | null; first_seen: Date; last_seen: Date; feedback: number | null; sub: string | null; cat: string | null; color: string | null;
  pending?: boolean; // not grouped yet: a single article shown as its own story
};
type Member = Row & { story_id: string; outlet: string | null; at: Date };

const PART_LABEL: Record<keyof typeof STRENGTH_MAX, { label: string; color: string; what: string }> = {
  relevance: { label: "Relevance", color: "#2F6B55", what: "How useful it is for your personas, industries and services." },
  coverage: { label: "Coverage", color: "#7FA58E", what: "How many independent outlets reported it." },
  momentum: { label: "Momentum", color: "#C8735A", what: "Whether coverage is rising or fading." },
  source: { label: "Source weight", color: "#4E7A8C", what: "How authoritative the strongest source is." },
  evidence: { label: "Evidence", color: "#8A5A7A", what: "Whether the full article was read." },
};

const ago = (d: Date) => {
  const h = (Date.now() - new Date(d).getTime()) / 3_600_000;
  return h < 1 ? "<1h ago" : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
};

function StrengthBadge({ s }: { s: Story }) {
  const p = s.strength_parts;
  const tone = s.strength >= 75 ? "bg-good text-white" : s.strength >= 55 ? "bg-accent text-white" : "bg-subtle text-muted";
  const card = p ? (
    <>
      <p className="font-semibold">Strength {s.strength} / 100</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {(Object.keys(STRENGTH_MAX) as (keyof typeof STRENGTH_MAX)[]).map((k) => (
          <li key={k}>
            <p className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-semibold"><span className="h-2 w-2 rounded-sm" style={{ background: PART_LABEL[k].color }} />{PART_LABEL[k].label}</span>
              <span className="font-mono">{p[k]} / {STRENGTH_MAX[k]}</span>
            </p>
            <p className="text-white/75">{p.notes[k]}</p>
          </li>
        ))}
      </ul>
    </>
  ) : <p>Not scored yet.</p>;
  return (
    <HoverCard label={`Strength ${s.strength} of 100`} card={card} width={330}>
      <span className="flex flex-col items-center gap-1">
        <span translate="no" className={`notranslate inline-flex h-9 w-11 items-center justify-center rounded-lg font-mono text-[15px] font-semibold ${tone}`}>{s.strength}</span>
        {p && (
          <span className="flex h-1.5 w-11 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
            {(Object.keys(STRENGTH_MAX) as (keyof typeof STRENGTH_MAX)[]).map((k) => (
              <span key={k} style={{ width: `${p[k]}%`, background: PART_LABEL[k].color }} />
            ))}
          </span>
        )}
      </span>
    </HoverCard>
  );
}

export async function StoriesList({ where, signalWhere, personas }: { where: PendingQuery<PgRow[]>; signalWhere: PendingQuery<PgRow[]>; personas: { id: string; name: string }[] }) {
  const [stories, tax] = await Promise.all([
    sql<Story[]>`
      select st.id, st.title, st.signal_type, st.articles, st.outlets, st.strength, st.strength_parts,
             st.first_seen, st.last_seen, st.feedback, sc.name_en as sub, c.name_en as cat, c.color
      from stories st
      left join subcategories sc on sc.id = st.subcategory_id
      left join categories c on c.id = st.category_id
      where st.last_seen >= now() - interval '21 days' ${where}
      order by st.strength desc, st.last_seen desc
      limit 120`,
    loadTaxonomy(),
  ]);
  const ids = stories.map((s) => s.id);
  const members: Member[] = ids.length
    ? await sql<Member[]>`
        select s.story_id, s.title, s.url, src.name as source, s.published_at, s.relevance::text,
               sv.name_ja as service, s.buyer_problem, s.analysis->>'angle' as angle, s.deep,
               coalesce(nullif(sc.name_ja, ''), sc.name_en) as sub,
               src.category as source_kind, src.url as source_url, s.summary, left(s.body, 6000) as body, s.status,
               s.analysis->>'why' as why, s.analysis->>'sort_why' as sort_why, s.analysis->>'sort_by' as sort_by,
               s.subcategory_id, s.category_id, s.analyzed_at, s.deep->>'persona' as persona_from_deep,
               coalesce(s.outlet, src.name) as outlet, coalesce(s.published_at, s.fetched_at) as at
        from signals s join sources src on src.id = s.source_id
        left join services sv on sv.id = s.service_id
        left join subcategories sc on sc.id = s.subcategory_id
        where s.story_id = any(${ids}::uuid[])
        order by s.relevance desc nulls last, at desc`
    : [];

  // Relevant articles not grouped yet (grouping runs each morning) still show, as one-article stories.
  const loose = await sql<(Member & { tier: string; signal_type: string | null; id: string })[]>`
    select s.id, s.id as story_id, s.title, s.url, src.name as source, s.published_at, s.relevance::text,
           sv.name_ja as service, s.buyer_problem, s.analysis->>'angle' as angle, s.deep,
           coalesce(nullif(sc.name_ja, ''), sc.name_en) as sub,
           src.category as source_kind, src.url as source_url, s.summary, left(s.body, 6000) as body, s.status,
           s.analysis->>'why' as why, s.analysis->>'sort_why' as sort_why, s.analysis->>'sort_by' as sort_by,
           s.subcategory_id, s.category_id, s.analyzed_at, s.deep->>'persona' as persona_from_deep,
           coalesce(s.outlet, src.name) as outlet, coalesce(s.published_at, s.fetched_at) as at, src.tier, s.signal_type
    from signals s join sources src on src.id = s.source_id
    left join services sv on sv.id = s.service_id
    left join subcategories sc on sc.id = s.subcategory_id
    where s.status = 'analyzed' and s.story_id is null
      and coalesce(s.published_at, s.fetched_at) >= now() - interval '21 days' ${signalWhere}
    order by s.relevance desc nulls last limit 120`;
  for (const l of loose) {
    const outlet = l.source_kind === "keyword_search" && l.title.lastIndexOf(" - ") > 0 ? l.title.slice(l.title.lastIndexOf(" - ") + 3) : l.outlet ?? l.source;
    const { total, parts } = storyStrength([{ relevance: Number(l.relevance ?? 0), outlet: outlet ?? "", tier: l.tier, at: new Date(l.at), deep: l.deep }]);
    stories.push({
      id: l.id, title: l.title, signal_type: l.signal_type, articles: 1, outlets: 1, strength: total, strength_parts: parts,
      first_seen: l.at, last_seen: l.at, feedback: null, sub: l.sub, cat: null, color: null, pending: true,
    });
    members.push(l);
  }
  stories.sort((a, b) => b.strength - a.strength || +new Date(b.last_seen) - +new Date(a.last_seen));

  if (!stories.length) return <li className="px-5 py-6 text-sm text-faint">No relevant news here in the last 21 days. Try another category or type, or &ldquo;All&rdquo;.</li>;
  return (
    <>
      {stories.map((s) => {
        const arts = members.filter((m) => m.story_id === s.id);
        const rep = arts[0];
        const type = typeInfo(s.signal_type);
        return (
          <li key={s.id} className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-4 px-5 py-4">
            <StrengthBadge s={s} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-faint">
                {type && (
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${type.color}1A`, color: type.color }} title={`Angle: ${type.angle}`}>
                    {type.label}
                  </span>
                )}
                <span translate="no" className="notranslate">{s.articles} article{s.articles === 1 ? "" : "s"} · {s.outlets} outlet{s.outlets === 1 ? "" : "s"}</span>
                <span>· latest {ago(s.last_seen)}</span>
                {s.sub && <span>· {s.sub}</span>}
                {s.pending && <span title="Grouped with other outlets' coverage at the next morning run">· not grouped yet</span>}
                <span className="ml-auto">{!s.pending && <Rate id={s.id} initial={s.feedback} />}</span>
              </div>
              <p lang="ja" className="mt-1 font-medium leading-snug">
                {rep?.url ? <a href={rep.url} target="_blank" rel="noreferrer" className="hover:underline">{s.title}</a> : s.title}
              </p>
              {rep && (rep.buyer_problem || rep.angle) && (
                <p lang="ja" className="mt-1 text-sm text-muted">
                  {rep.buyer_problem && <>課題: {rep.buyer_problem} </>}
                  {rep.angle && <span className="text-faint">· 切り口: {rep.angle}</span>}
                </p>
              )}
              {rep?.deep?.facts?.length ? (
                <ul lang="ja" className="mt-2 list-disc space-y-0.5 border-l-2 border-accent bg-accent-soft/40 py-1.5 pr-3 pl-7 text-[13px] text-body">
                  {rep.deep.facts.slice(0, 3).map((f) => <li key={f}>{f}</li>)}
                </ul>
              ) : null}
              {arts.length > 1 && (
                <details className="group mt-2">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline">
                    <span className="transition group-open:rotate-90">›</span> Covered by {s.outlets} outlets
                  </summary>
                  <ul className="mt-1.5 flex flex-col gap-1 border-l border-line pl-3 text-[12.5px]">
                    {arts.map((a, i) => (
                      <li key={i} className="flex flex-wrap gap-x-2">
                        <span className="font-medium text-ink">{a.outlet}</span>
                        <span className="text-faint">{fmt(a.at)}</span>
                        <a lang="ja" href={a.url ?? "#"} target="_blank" rel="noreferrer" className="min-w-0 truncate text-muted hover:underline">{a.title}</a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {rep && <WhyPanel r={rep} tax={tax} personas={personas} />}
            </div>
          </li>
        );
      })}
    </>
  );
}
