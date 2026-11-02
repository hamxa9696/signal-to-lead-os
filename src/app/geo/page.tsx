import Link from "next/link";
import { sql } from "@/lib/db";
import { ENGINES, enabledEngines, type EngineKey } from "@/lib/geo/engines";
import { OUR_DOMAIN } from "@/lib/geo/check";
import { aiTraffic, AI_SOURCES } from "@/lib/geo/traffic";
import { PageHeader } from "../page-header";
import { RunButton } from "../run-button";
import { HoverCard } from "../hover-card";
import { CopyButton } from "../copy-button";
import { MakeTopic, ManualCell } from "./client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Q = {
  id: string; question: string; intent: string | null; demand: number; evidence: string[]; manual: boolean; cat: string | null; color: string | null;
  score: number | null; page_path: string | null; page_title: string | null; channels: Record<string, { score: number; notes: string[] }> | null; gaps: string[] | null;
  checks: { engine: string; we_cited: boolean; we_mentioned: boolean; our_position: number | null }[];
};
const ENGINE_LABEL: Record<string, string> = {
  tavily: "AI search (Tavily)", perplexity: "Perplexity", openai: "ChatGPT search", gemini: "Gemini",
  chatgpt_manual: "ChatGPT (manual)", gemini_manual: "Gemini (manual)", copilot_manual: "Copilot (manual)",
};
const CH = { google: { l: "Google AI / Gemini", c: "#2F6B55" }, chatgpt: { l: "ChatGPT / Copilot", c: "#4E7A8C" }, perplexity: { l: "Perplexity", c: "#8A5A7A" } } as const;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const n = (v: number) => v.toLocaleString("en-US");

export default async function GeoPage() {
  const [{ week }] = await sql<{ week: string | null }[]>`select max(week_of)::text as week from geo_questions`;
  const [questions, weekly, owners, traffic] = await Promise.all([
    week
      ? sql<Q[]>`
          select q.id, q.question, q.intent, q.demand, q.evidence, q.manual, c.name_en as cat, c.color,
                 r.score, r.page_path, r.page_title, r.channels, r.gaps,
                 coalesce((select json_agg(json_build_object('engine', g.engine, 'we_cited', g.we_cited, 'we_mentioned', g.we_mentioned, 'our_position', g.our_position))
                           from geo_checks g where g.question_id = q.id), '[]') as checks
          from geo_questions q left join categories c on c.id = q.category_id left join geo_readiness r on r.question_id = q.id
          where q.week_of = ${week} order by q.demand desc`
      : Promise.resolve([] as Q[]),
    sql<{ week: string; engine: string; n: number; cited: number; mentioned: number }[]>`
      select q.week_of::text as week, g.engine, count(*)::int as n, count(*) filter (where g.we_cited)::int as cited, count(*) filter (where g.we_mentioned)::int as mentioned
      from geo_checks g join geo_questions q on q.id = g.question_id
      where q.week_of >= current_date - 84 group by 1, 2 order by 1`,
    week
      ? sql<{ domain: string; n: number; questions: number }[]>`
          select c->>'domain' as domain, count(*)::int as n, count(distinct g.question_id)::int as questions
          from geo_checks g join geo_questions q on q.id = g.question_id, jsonb_array_elements(g.citations) c
          where q.week_of = ${week} and coalesce(c->>'domain', '') <> '' group by 1 order by 3 desc, 2 desc limit 15`
      : Promise.resolve([]),
    aiTraffic(12),
  ]);
  const enabled = enabledEngines();
  const thisWeek = weekly.filter((w) => w.week === week);
  const checksN = thisWeek.reduce((a, w) => a + w.n, 0);
  const citedN = thisWeek.reduce((a, w) => a + w.cited, 0);
  const ready = questions.filter((q) => (q.score ?? 0) >= 60).length;
  const noPage = questions.filter((q) => !q.page_path).length;
  const weeks = [...new Set(weekly.map((w) => w.week))].slice(-8);
  const engines = [...new Set(weekly.map((w) => w.engine))];
  const lastAi = traffic.weeks.slice(-4).reduce((a, w) => a + w.sessions, 0);
  const prevAi = traffic.weeks.slice(-8, -4).reduce((a, w) => a + w.sessions, 0);
  const aiLeads = traffic.totals.reduce((a, t) => a + t.leads, 0);
  const manual = questions.filter((q) => q.manual);

  return (
    <main className="page">
      <PageHeader
        eyebrow={week ? `AI search · week of ${week} · Japan` : "AI search · Japan"}
        title="GEO: AI search"
        description="Whether ChatGPT, Gemini, Copilot and Perplexity cite renesistech.jp when Japanese buyers ask about your services: the questions they ask, who AI cites instead, how ready each page is, and the visitors AI sends."
        actions={<RunButton job="geo" label="Rebuild this week's check" force />}
      />

      <section aria-label="Key numbers" className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {[
          { l: "Visits from AI assistants", v: n(lastAi), s: prevAi ? `${lastAi >= prevAi ? "▲" : "▼"} vs ${n(prevAi)} the 4 weeks before` : "last 4 weeks" },
          { l: "Share of all visits", v: pct(traffic.share), s: "from AI assistants, 12 weeks" },
          { l: "Form fills from AI", v: n(aiLeads), s: "12 weeks" },
          { l: "Cited by AI this week", v: checksN ? pct(citedN / checksN) : "—", s: checksN ? `${citedN} of ${checksN} answers` : "no checks yet" },
          { l: "Questions with a ready page", v: `${ready}/${questions.length}`, s: `${noPage} with no page at all` },
        ].map((k) => (
          <div key={k.l} className="card px-[18px] py-4">
            <p className="text-[12.5px] text-faint">{k.l}</p>
            <p translate="no" className="notranslate mt-2 mb-0.5 font-mono text-[26px] tracking-tight">{k.v}</p>
            <p className="text-xs text-faint">{k.s}</p>
          </div>
        ))}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-base font-semibold">Citation share by engine, week by week</h2>
          <p className="mt-0.5 text-[12.5px] text-faint">Share of this week&apos;s questions where the engine cited renesistech.jp.</p>
          {weeks.length ? (
            <table className="mt-3 w-full text-[12.5px]">
              <thead className="text-left text-[11px] text-faint"><tr><th className="py-1 font-medium">Engine</th>{weeks.map((w) => <th key={w} className="text-right font-medium">{w.slice(5)}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {engines.map((e) => (
                  <tr key={e}><td className="py-1.5">{ENGINE_LABEL[e] ?? e}</td>{weeks.map((w) => {
                    const x = weekly.find((r) => r.week === w && r.engine === e);
                    return <td key={w} translate="no" className="text-right font-mono">{x ? `${pct(x.cited / Math.max(1, x.n))}` : "—"}</td>;
                  })}</tr>
                ))}
              </tbody>
            </table>
          ) : <p className="mt-3 text-[13px] text-muted">No checks yet. Do this week&apos;s manual check below, or connect an engine.</p>}
        </section>

        <section className="card p-5">
          <h2 className="text-base font-semibold">Visits from AI assistants</h2>
          <p className="mt-0.5 text-[12.5px] text-faint">From GA4 (12 weeks). ChatGPT tags its links, so its visits are counted exactly.</p>
          <table className="mt-3 w-full text-[12.5px]">
            <thead className="text-left text-[11px] text-faint"><tr><th className="py-1 font-medium">Assistant</th><th className="text-right font-medium">Visits</th><th className="text-right font-medium">Form fills</th></tr></thead>
            <tbody className="divide-y divide-line">
              {traffic.totals.map((t) => (
                <tr key={t.key} className={t.sessions ? "" : "text-faint"}><td className="py-1.5">{t.label}</td><td translate="no" className="text-right font-mono">{n(t.sessions)}</td><td translate="no" className="text-right font-mono">{t.leads}</td></tr>
              ))}
            </tbody>
          </table>
          {!traffic.totals.some((t) => t.sessions) && <p className="mt-2 text-[12px] text-muted">No AI-assistant visits recorded yet. This is the baseline to grow from.</p>}
        </section>
      </div>

      <section className="card p-5">
        <h2 className="text-base font-semibold">Who AI cites for your buyers&apos; questions</h2>
        <p className="mt-0.5 text-[12.5px] text-faint">The sites AI engines cite most often this week: your real competitors in AI search.</p>
        {owners.length ? (
          <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
            {owners.map((o, i) => (
              <li key={o.domain} className={`flex items-center justify-between gap-2 ${o.domain.endsWith(OUR_DOMAIN) ? "font-semibold text-good" : ""}`}>
                <span className="truncate"><span className="mr-2 font-mono text-faint">{i + 1}</span>{o.domain}</span>
                <span translate="no" className="font-mono text-[12px] text-muted">{o.questions} question{o.questions === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ol>
        ) : <p className="mt-2 text-[13px] text-muted">Appears once an engine is connected, or when you note competitor sites in the manual check.</p>}
      </section>

      <section className="card overflow-x-auto">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold">This week&apos;s questions: demand, readiness and results</h2>
          <p className="mt-0.5 text-[12.5px] text-faint">
            Natural Japanese questions buyers ask AI assistants, built from Google suggestions, Search Console, the trend forecast and your topics.
            Readiness = how likely your best page is to be cited by each channel (hover for why).
          </p>
        </div>
        <div className="min-w-[1050px]">
          <div className="eyebrow grid grid-cols-[minmax(0,2fr)_70px_200px_minmax(0,1.2fr)_150px] gap-4 border-y border-line bg-[#FAF6EE] px-5 py-2.5 text-[10.5px]">
            <span>Question</span><span className="text-right">Demand</span><span>Readiness by channel</span><span>Our page &amp; fixes</span><span>Results</span>
          </div>
          {questions.map((q) => (
            <div key={q.id} className="grid grid-cols-[minmax(0,2fr)_70px_200px_minmax(0,1.2fr)_150px] items-start gap-4 border-b border-line px-5 py-3 last:border-b-0">
              <div className="min-w-0">
                <p lang="ja" className="text-[13.5px] font-medium leading-snug">{q.question}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-faint">
                  {q.cat && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: q.color ?? "#A29A88" }} />{q.cat}</span>}
                  <span>{q.intent}</span>
                  {q.manual && <span className="rounded bg-subtle px-1.5">manual check</span>}
                </p>
              </div>
              <HoverCard label={`Demand ${q.demand}`} width={300} card={<><p className="font-semibold">Demand {q.demand}/100</p><ul className="mt-1 list-disc pl-4 text-white/85">{(q.evidence ?? []).map((e) => <li key={e}>{e}</li>)}</ul></>}>
                <p translate="no" className="notranslate text-right font-mono text-[14px] font-semibold">{q.demand}</p>
              </HoverCard>
              <div className="flex flex-col gap-1">
                {(Object.keys(CH) as (keyof typeof CH)[]).map((k) => {
                  const c = q.channels?.[k];
                  return (
                    <HoverCard key={k} label={`${CH[k].l} ${c?.score ?? 0}`} width={300} card={<><p className="font-semibold">{CH[k].l}: {c?.score ?? 0}/100</p><ul className="mt-1 list-disc pl-4 text-white/85">{(c?.notes ?? ["No page yet"]).map((x) => <li key={x}>{x}</li>)}</ul></>}>
                      <span className="flex items-center gap-2 text-[11.5px]">
                        <span className="w-[86px] truncate text-muted">{CH[k].l}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle"><span className="block h-full" style={{ width: `${c?.score ?? 0}%`, background: CH[k].c }} /></span>
                        <span translate="no" className="w-6 text-right font-mono">{c?.score ?? 0}</span>
                      </span>
                    </HoverCard>
                  );
                })}
              </div>
              <div className="min-w-0 text-[12px]">
                {q.page_path ? (
                  <a href={`https://renesistech.jp${q.page_path}`} target="_blank" rel="noreferrer" lang="ja" className="line-clamp-1 font-medium text-accent hover:underline">{q.page_title}</a>
                ) : <span className="font-semibold text-bad">No page answers this</span>}
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">{(q.gaps ?? []).slice(0, 3).map((g) => <li key={g}>{g}</li>)}</ul>
                {(!q.page_path || (q.score ?? 0) < 50) && <div className="mt-1.5"><MakeTopic questionId={q.id} /></div>}
              </div>
              <div className="flex flex-col gap-0.5 text-[11.5px]">
                {q.checks.length ? q.checks.map((c) => (
                  <span key={c.engine} className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted">{ENGINE_LABEL[c.engine] ?? c.engine}</span>
                    <span className={c.we_cited ? "font-semibold text-good" : c.we_mentioned ? "text-accent-ink" : "text-bad"}>
                      {c.we_cited ? `✓ cited${c.our_position ? ` #${c.our_position}` : ""}` : c.we_mentioned ? "named" : "✗"}
                    </span>
                  </span>
                )) : <span className="text-faint">not checked yet</span>}
              </div>
            </div>
          ))}
          {!questions.length && <p className="px-5 py-6 text-sm text-muted">No question set yet. It builds every Monday, or click &ldquo;Rebuild this week&apos;s check&rdquo;.</p>}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold">Weekly manual check (about 5 minutes)</h2>
        <p className="mt-0.5 text-[12.5px] text-faint">
          Copy each question into ChatGPT, Gemini and Copilot, set to Japanese. Mark whether renesistech.jp was <b>cited</b> as a source, Renesis was only <b>named</b>,
          or it was <b>absent</b>. These count in the weekly citation share next to the automated engines.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-[12.5px]">
            <thead className="text-left text-[11px] text-faint"><tr><th className="py-1 font-medium">Question</th><th className="font-medium">ChatGPT</th><th className="font-medium">Gemini</th><th className="font-medium">Copilot</th></tr></thead>
            <tbody className="divide-y divide-line">
              {manual.map((q) => {
                const v = (e: string) => {
                  const c = q.checks.find((x) => x.engine === e);
                  return c ? (c.we_cited ? "cited" : c.we_mentioned ? "mentioned" : "absent") : null;
                };
                return (
                  <tr key={q.id}>
                    <td className="py-2 pr-3">
                      <span lang="ja" className="mr-2">{q.question}</span>
                      <CopyButton text={q.question} label="⧉" title="Copy question" className="rounded border border-line-strong px-1.5 text-[11px] text-muted hover:text-ink" />
                    </td>
                    <td><ManualCell questionId={q.id} engine="chatgpt_manual" initial={v("chatgpt_manual")} /></td>
                    <td><ManualCell questionId={q.id} engine="gemini_manual" initial={v("gemini_manual")} /></td>
                    <td><ManualCell questionId={q.id} engine="copilot_manual" initial={v("copilot_manual")} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold">Engines</h2>
        <p className="mt-0.5 text-[12.5px] text-faint">Automated weekly checks switch on as soon as an engine&apos;s key is added. Until then the manual check covers ChatGPT, Gemini and Copilot.</p>
        <ul className="mt-3 divide-y divide-line text-[13px]">
          {(Object.keys(ENGINES) as EngineKey[]).map((k) => (
            <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className={`h-2.5 w-2.5 rounded-full ${enabled.includes(k) ? "bg-good-dot" : "bg-line-strong"}`} />
              <span className="font-medium">{ENGINES[k].label}</span>
              <span className="text-[12px] text-faint">stands in for {ENGINES[k].stands_for} · {ENGINES[k].free ? "free tier" : "paid (small)"}</span>
              <span className="ml-auto text-[12px] text-muted">{enabled.includes(k) ? "Connected" : ENGINES[k].how}</span>
            </li>
          ))}
          <li className="flex flex-wrap items-center gap-x-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            <span className="font-medium">Bing Webmaster Tools</span>
            <span className="text-[12px] text-faint">confirms Bing indexing (what ChatGPT search and Copilot use) and reports AI citations for your site · free</span>
            <span className="ml-auto text-[12px] text-muted">Add the site at bing.com/webmasters (import from Search Console)</span>
          </li>
        </ul>
        <p className="mt-2 text-[11.5px] text-faint">See <Link href="/forecast" className="underline">Trend forecast</Link> for what is rising in the news; this page covers how AI answers buyers.</p>
      </section>
    </main>
  );
}
