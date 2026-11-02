import Link from "next/link";
import { Fragment } from "react";
import { sql } from "@/lib/db";
import { ENGINES, enabledEngines, type EngineKey } from "@/lib/geo/engines";
import { OUR_DOMAIN } from "@/lib/geo/check";
import { aiTraffic, AI_SOURCES } from "@/lib/geo/traffic";
import { PageHeader } from "../../page-header";
import { RunButton } from "../../run-button";
import { HoverCard } from "../../hover-card";
import { CopyButton } from "../../copy-button";
import { LinkedinStats, MakeTopic, ManualCell } from "./client";
import { competitors, diagnostics, leading, outcomes, MATURE_DAYS, type Slice } from "@/lib/geo/measure";
import { CHANNELS, SLOTS, type Channel, type Slot } from "@/lib/formats";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Q = {
  id: string; question: string; intent: string | null; cluster: string | null; published_at: string | null; demand: number; evidence: string[]; manual: boolean; cat: string | null; color: string | null;
  score: number | null; page_path: string | null; page_title: string | null; channels: Record<string, { score: number; notes: string[] }> | null; gaps: string[] | null;
  checks: { engine: string; we_cited: boolean; we_mentioned: boolean; our_position: number | null; quality: string | null; sentiment: string | null; linkedin: boolean }[];
};
const ENGINE_LABEL: Record<string, string> = {
  tavily: "AI search (Tavily)", perplexity: "Perplexity", openai: "ChatGPT search", gemini: "Gemini",
  chatgpt_manual: "ChatGPT (manual)", gemini_manual: "Gemini (manual)", copilot_manual: "Copilot (manual)",
};
const CH = { google: { l: "Google AI / Gemini", c: "#2F6B55" }, chatgpt: { l: "ChatGPT / Copilot", c: "#4E7A8C" }, perplexity: { l: "Perplexity", c: "#8A5A7A" } } as const;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const n = (v: number) => v.toLocaleString("en-US");

/** AI search results (Results page): leading indicators, outcomes, diagnostics, competitors, LinkedIn. */
export async function GeoResults() {
  const [traffic, out, diag, comp, lead] = await Promise.all([aiTraffic(12), outcomes(), diagnostics(), competitors(), leading()]);
  const lastAi = traffic.weeks.slice(-4).reduce((a, w) => a + w.sessions, 0);
  const prevAi = traffic.weeks.slice(-8, -4).reduce((a, w) => a + w.sessions, 0);
  const aiLeads = traffic.totals.reduce((a, t) => a + t.leads, 0);
  const today = new Date().toISOString().slice(0, 10);
  const mature = out.matureFrom != null && out.matureFrom <= today;
  return (
    <>
      <div className={`rounded-xl border px-4 py-3 text-[13px] ${mature ? "border-line bg-surface text-muted" : "border-sprout/40 bg-sprout-soft text-ink"}`}>
        {out.firstCheck == null
          ? <>No AI answers checked yet. Start with the weekly manual check on <Link href="/trends/ai-search#manual-check" className="underline">Trends › AI search</Link> or connect a free engine (Tavily). Outcomes are judged after {MATURE_DAYS} days.</>
          : mature
            ? <>Outcomes compare the last 4 weeks with the 4 weeks before. AI tools take a median of ~7 days (up to ~5 weeks) to cite a new page, so read trends across windows, not single weeks.</>
            : <><b>Building the baseline.</b> First check {out.firstCheck}; outcomes become meaningful from <b>{out.matureFrom}</b>. Until then watch the leading indicators: flat citations in the first weeks are expected, not a verdict.</>}
      </div>

      <section aria-labelledby="leading" className="flex flex-col gap-3">
        <LayerHead id="leading" n={1} title="Leading indicators" help="Move first, weeks before AI answers change. Strong numbers here suggest citations will follow; they are not proof." />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(165px,1fr))] gap-3">
          <Kpi l="Visits from AI assistants" v={n(lastAi)} s={prevAi ? `${lastAi >= prevAi ? "▲" : "▼"} vs ${n(prevAi)} the 4 weeks before` : "last 4 weeks"} />
          <Kpi l="LinkedIn posts by experts" v={n(lead.now.posts)} s={`last 4 weeks · ${lead.prev.posts} the 4 before`} />
          <Kpi l="LinkedIn impressions" v={lead.now.impressions ? n(lead.now.impressions) : "—"} s={lead.now.impressions ? `${n(lead.now.reactions)} reactions · ${n(lead.now.comments)} comments · ${n(lead.now.shares)} shares` : "type them in below"} />
          <Kpi l="Visits from LinkedIn" v={n(lead.now.visits)} s={lead.prev.visits ? `${lead.now.visits >= lead.prev.visits ? "▲" : "▼"} vs ${n(lead.prev.visits)} before` : "tracked links, last 4 weeks"} />
          <Kpi l="Pages too new to judge" v={n(lead.newPages)} s={`published in the last ${MATURE_DAYS} days`} />
        </div>
      </section>

      <section aria-labelledby="outcomes" className="flex flex-col gap-3">
        <LayerHead id="outcomes" n={2} title="Outcomes · last 4 weeks" help="What the program is judged on. They move slowly, so they are shown per 4-week window against the one before." />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(165px,1fr))] gap-3">
          <Kpi l="Citation rate" v={out.now.answers ? pct(out.now.citeRate) : "—"} s={`${out.now.cited} of ${out.now.answers} answers${delta(out.now.citeRate, out.prev.citeRate, out.prev.answers)}`}
            tip="Share of AI answers that link to renesistech.jp. The strongest signal." />
          <Kpi l="Share of voice" v={out.now.allCitations ? pct(out.now.sov) : "—"} s={`${out.now.ourCitations} of ${out.now.allCitations} citations${delta(out.now.sov, out.prev.sov, out.prev.answers)}`}
            tip="Our citations ÷ all citations across tracked questions. Rising citations with flat share = the category is growing; rising share = we are beating competitors." />
          <Kpi l="Brand mentions" v={out.now.answers ? pct(out.now.mentionRate) : "—"} s={`named in ${out.now.mentioned} answers, with or without a link`} />
          <Kpi l="Average citation rank" v={out.now.avgRank != null ? `#${out.now.avgRank}` : "—"} s="where we sit in the source list (1 = first)" />
          <Kpi l="LinkedIn in answers" v={out.now.answers ? pct(out.now.linkedinRate) : "—"} s={`${out.now.linkedinOurs} cite our own LinkedIn`}
            tip="How often AI answers to these questions cite linkedin.com at all, and how often it is one of our experts. Tells us whether LinkedIn is worth the effort in Japan." />
          <Kpi l="Form fills from AI" v={n(aiLeads)} s="12 weeks, from GA4" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <MixBar title="How prominently we are cited" parts={[
            { l: "Primary", v: out.now.quality.primary, c: "#2F6B55", tip: "first source or the main recommendation" },
            { l: "Supporting", v: out.now.quality.supporting, c: "#7FA58E", tip: "source #2–3" },
            { l: "Reference", v: out.now.quality.reference, c: "#D8CBB0", tip: "listed further down" },
          ]} empty="No citations yet." />
          <MixBar title="How AI describes Renesis" parts={[
            { l: "Positive", v: out.now.sentiment.positive, c: "#2F6B55", tip: "recommended or praised" },
            { l: "Neutral", v: out.now.sentiment.neutral, c: "#A29A88", tip: "listed without a view; often means weak differentiation" },
            { l: "Negative", v: out.now.sentiment.negative, c: "#C8735A", tip: "check the answer and fix the source it relies on" },
          ]} empty="Appears once an engine is connected (read from the answer text)." />
        </div>
      </section>

      <section aria-labelledby="diagnostics" className="flex flex-col gap-3">
        <LayerHead id="diagnostics" n={3} title="Diagnostics · where it works and where it doesn't" help="The same outcomes split up. Usually one cluster, question type, format or author is the problem, not the whole program. Review monthly." />
        <div className="grid gap-3 lg:grid-cols-2">
          <DiagTable title="By topic cluster" rows={diag.cluster} />
          <DiagTable title="By question type" rows={diag.intent} label={(k) => INTENT[k]?.l ?? k} tip={(k) => INTENT[k]?.tip} />
          <DiagTable title="By content format (our page)" rows={diag.format} label={(k) => SLOTS[k as Slot]?.label ?? k} />
          <DiagTable title="By author" rows={diag.author} />
          <DiagTable title="By engine" rows={diag.engine} label={(k) => ENGINE_LABEL[k] ?? k} />
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-base font-semibold">Who AI cites instead · share of all citations</h2>
          <p className="mt-0.5 text-[12.5px] text-faint">Sites cited for your buyers&apos; questions in the last 4 weeks: your real competitors in AI search.</p>
          {comp.domains.length ? (
            <ol className="mt-3 space-y-1.5 text-[13px]">
              {comp.domains.map((o, i) => (
                <li key={o.domain} className={`flex items-center gap-2 ${o.ours ? "font-semibold text-good" : ""}`}>
                  <span className="w-5 font-mono text-faint">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{o.domain}</span>
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-subtle"><span className="block h-full bg-accent" style={{ width: `${Math.min(100, o.share * 300)}%` }} /></span>
                  <span translate="no" className="w-10 text-right font-mono text-[12px] text-muted">{pct(o.share)}</span>
                </li>
              ))}
            </ol>
          ) : <p className="mt-2 text-[13px] text-muted">Appears once an engine is connected, or when you note competitor sites in the manual check.</p>}
          {comp.vendors.length > 0 && (
            <>
              <h3 className="mt-4 text-[13px] font-semibold">Vendors AI recommends</h3>
              <p className="flex flex-wrap gap-1.5 pt-1.5">{comp.vendors.map((v) => <span key={v.name} className="rounded-full bg-subtle px-2 py-0.5 text-[12px]">{v.name} <span className="text-faint">{v.n}</span></span>)}</p>
            </>
          )}
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

      <section id="linkedin" className="card scroll-mt-6 p-5">
        <h2 className="text-base font-semibold">LinkedIn engagement (leading indicator)</h2>
        <p className="mt-0.5 text-[12.5px] text-faint">
          Posts marked as posted on the calendar in the last 60 days. Copy the numbers from each post&apos;s LinkedIn analytics about a week after posting;
          they save as you leave the box. Highly cited posts usually draw 10+ thoughtful comments.
        </p>
        {lead.posts.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[820px] text-[12.5px]">
              <thead className="text-left text-[11px] text-faint">
                <tr><th className="py-1 font-medium">Post</th><th className="font-medium">Author</th><th className="font-medium">Posted</th>
                  <th className="px-1 text-right font-medium">Impressions</th><th className="px-1 text-right font-medium">Reactions</th><th className="px-1 text-right font-medium">Comments</th><th className="px-1 text-right font-medium">Shares</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lead.posts.map((p) => (
                  <tr key={`${p.topic_id}:${p.channel}`}>
                    <td className="max-w-[320px] py-1.5 pr-3">
                      <span className="mr-1.5 rounded bg-subtle px-1.5 text-[11px] text-muted">{CHANNELS[p.channel as Channel]?.label ?? p.channel}</span>
                      {p.post_url ? <a href={p.post_url} target="_blank" rel="noreferrer" lang="ja" className="text-accent hover:underline">{p.title}</a> : <span lang="ja">{p.title}</span>}
                    </td>
                    <td className="text-muted">{p.author ?? "—"}</td>
                    <td translate="no" className="font-mono text-muted">{p.posted_at.slice(5)}</td>
                    <LinkedinStats topicId={p.topic_id} channel={p.channel} initial={{ impressions: p.impressions, reactions: p.reactions, comments: p.comments, shares: p.shares }} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-2 text-[13px] text-muted">No LinkedIn posts marked as posted yet. Mark them on the <Link href="/topics/calendar" className="underline">calendar</Link> and they appear here.</p>}
      </section>

    </>
  );
}

/** What buyers ask AI assistants (Trends › AI search): questions by cluster, readiness, the manual check, engines. */
export async function GeoQuestions() {
  const [{ week }] = await sql<{ week: string | null }[]>`select max(week_of)::text as week from geo_questions`;
  const questions = await (
    week
      ? sql<Q[]>`
          select q.id, q.question, q.intent, q.cluster, q.demand,
                 (select max(p.published_at)::date::text from publications p where p.channel = 'website' and p.status = 'live' and p.page_path = r.page_path) as published_at, q.evidence, q.manual, c.name_en as cat, c.color,
                 r.score, r.page_path, r.page_title, r.channels, r.gaps,
                 coalesce((select json_agg(json_build_object('engine', g.engine, 'we_cited', g.we_cited, 'we_mentioned', g.we_mentioned, 'our_position', g.our_position,
                             'quality', g.citation_quality, 'sentiment', g.sentiment, 'linkedin', g.linkedin_cited))
                           from geo_checks g where g.question_id = q.id), '[]') as checks
          from geo_questions q left join categories c on c.id = q.category_id left join geo_readiness r on r.question_id = q.id
          where q.week_of = ${week} order by q.cluster nulls last, q.demand desc`
      : Promise.resolve([] as Q[])
  );
  const enabled = enabledEngines();
  const ready = questions.filter((q) => (q.score ?? 0) >= 60).length;
  const noPage = questions.filter((q) => !q.page_path).length;
  const clusters = [...new Set(questions.map((q) => q.cluster ?? "Unclustered"))];
  const manual = questions.filter((q) => q.manual);
  return (
    <>
      <p className="-mt-2 text-[13px] text-muted">{questions.length} questions{week ? ` · week of ${week}` : ""} · <b className="text-ink">{ready}</b> have a page ready to be cited · <b className="text-ink">{noPage}</b> have no page at all. Results (citations, share of voice, AI visits) are on <Link href="/performance#ai-search" className="underline">Results</Link>.</p>
      <section className="card overflow-x-auto">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold">This week&apos;s questions by topic cluster: demand, readiness and results</h2>
          <p className="mt-0.5 text-[12.5px] text-faint">
            Natural Japanese questions buyers ask AI assistants, built from Google suggestions, Search Console, the trend forecast and your topics.
            Readiness = how likely your best page is to be cited by each channel (hover for why).
          </p>
        </div>
        <div className="min-w-[1050px]">
          <div className="eyebrow grid grid-cols-[minmax(0,2fr)_70px_200px_minmax(0,1.2fr)_150px] gap-4 border-y border-line bg-[#FAF6EE] px-5 py-2.5 text-[10.5px]">
            <span>Question</span><span className="text-right">Demand</span><span>Readiness by channel</span><span>Our page &amp; fixes</span><span>Results</span>
          </div>
          {clusters.map((cl) => {
            const qs = questions.filter((q) => (q.cluster ?? "Unclustered") === cl);
            const cited = qs.filter((q) => q.checks.some((c) => c.we_cited)).length;
            return (
            <Fragment key={cl}>
            <div className="flex flex-wrap items-baseline gap-x-3 border-b border-line bg-subtle/60 px-5 py-2">
              <span lang="ja" className="text-[13px] font-semibold">{cl}</span>
              <span className="text-[11.5px] text-faint">{qs.length} questions · cited in {cited} · {qs.filter((q) => q.page_path).length} have a page</span>
            </div>
          {qs.map((q) => (
            <div key={q.id} className="grid grid-cols-[minmax(0,2fr)_70px_200px_minmax(0,1.2fr)_150px] items-start gap-4 border-b border-line px-5 py-3 last:border-b-0">
              <div className="min-w-0">
                <p lang="ja" className="text-[13.5px] font-medium leading-snug">{q.question}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-faint">
                  {q.cat && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: q.color ?? "#A29A88" }} />{q.cat}</span>}
                  <span title={INTENT[q.intent ?? ""]?.tip}>{INTENT[q.intent ?? ""]?.l ?? q.intent}</span>
                  {q.published_at && q.published_at > daysAgo(MATURE_DAYS) && <span className="rounded bg-sprout-soft px-1.5 text-sprout" title={`Our page went live ${q.published_at}: AI needs up to ~5 weeks to pick it up`}>too early to judge</span>}
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
                      {c.we_cited ? `✓ ${c.quality && c.quality !== "none" ? c.quality : "cited"}${c.our_position ? ` #${c.our_position}` : ""}` : c.we_mentioned ? "named" : "✗"}
                      {c.sentiment && <span title={`Described ${c.sentiment}ly`} className={c.sentiment === "positive" ? "text-good" : c.sentiment === "negative" ? "text-bad" : "text-faint"}> {c.sentiment === "positive" ? "+" : c.sentiment === "negative" ? "−" : "·"}</span>}
                      {c.linkedin && <span title="LinkedIn was among the sources" className="text-faint"> in</span>}
                    </span>
                  </span>
                )) : <span className="text-faint">not checked yet</span>}
              </div>
            </div>
          ))}
            </Fragment>
            );
          })}
          {!questions.length && <p className="px-5 py-6 text-sm text-muted">No question set yet. It builds every Monday, or click &ldquo;Rebuild this week&apos;s check&rdquo;.</p>}
        </div>
      </section>

      <section id="manual-check" className="card scroll-mt-6 p-5">
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
        <p className="mt-2 text-[11.5px] text-faint">See <Link href="/trends/forecast" className="underline">Trend forecast</Link> for what is rising in the news; this page covers how AI answers buyers.</p>
      </section>
    </>
  );
}

const INTENT: Record<string, { l: string; tip: string }> = {
  informational: { l: "Informational", tip: "Explain something (〜とは, how it works). AI cites clear explainers and definitions." },
  comparative: { l: "Comparative", tip: "Compare or choose (比較, おすすめ, 選び方). AI cites evaluation frameworks and how-to-choose guides." },
  commercial: { l: "Comparative", tip: "Compare or choose (比較, おすすめ, 選び方). AI cites evaluation frameworks and how-to-choose guides." },
  transactional: { l: "Transactional", tip: "Ready to act (費用, 見積もり, 依頼). AI cites pages with prices, timelines and steps." },
  navigational: { l: "Navigational", tip: "About a named company (e.g. Renesis Tech Japanの評判). AI cites the brand's own pages and reviews." },
};

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

function delta(now: number, prev: number, prevN: number): string {
  if (!prevN) return "";
  const d = Math.round((now - prev) * 100);
  return d === 0 ? " · = previous 4 weeks" : ` · ${d > 0 ? "▲" : "▼"} ${Math.abs(d)} pts vs previous 4 weeks`;
}

function LayerHead({ id, n: num, title, help }: { id: string; n: number; title: string; help: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[12px] font-semibold text-white">{num}</span>
      <div>
        <h2 id={id} className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-[12.5px] text-faint">{help}</p>
      </div>
    </div>
  );
}

function Kpi({ l, v, s: sub, tip }: { l: string; v: string; s: string; tip?: string }) {
  const body = (
    <div className="card h-full px-[18px] py-4">
      <p className="text-[12.5px] text-faint">{l}{tip && <span className="ml-1 text-line-strong">ⓘ</span>}</p>
      <p translate="no" className="notranslate mt-2 mb-0.5 font-mono text-[26px] tracking-tight">{v}</p>
      <p className="text-xs text-faint">{sub}</p>
    </div>
  );
  return tip ? <HoverCard label={l} width={280} card={<p>{tip}</p>}>{body}</HoverCard> : body;
}

function MixBar({ title, parts, empty }: { title: string; parts: { l: string; v: number; c: string; tip: string }[]; empty: string }) {
  const total = parts.reduce((a, p) => a + p.v, 0);
  return (
    <div className="card p-4">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {total ? (
        <>
          <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-subtle">
            {parts.map((p) => p.v > 0 && <span key={p.l} title={`${p.l}: ${p.v}`} style={{ width: `${(p.v / total) * 100}%`, background: p.c }} />)}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
            {parts.map((p) => (
              <li key={p.l} title={p.tip} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: p.c }} />{p.l} <span translate="no" className="font-mono text-ink">{p.v}</span>
              </li>
            ))}
          </ul>
        </>
      ) : <p className="mt-2 text-[12.5px] text-muted">{empty}</p>}
    </div>
  );
}

function DiagTable({ title, rows, label = (k) => k, tip }: { title: string; rows: Slice[]; label?: (k: string) => string; tip?: (k: string) => string | undefined }) {
  return (
    <div className="card p-4">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {rows.length ? (
        <table className="mt-2 w-full text-[12.5px]">
          <thead className="text-left text-[11px] text-faint">
            <tr className="whitespace-nowrap [&>th]:pl-3 [&>th]:text-right [&>th]:font-medium">
              <th className="py-1 !pl-0 !text-left" /><th title="Questions tracked">Qs</th><th title="Share of answers citing renesistech.jp">Cited</th>
              <th title="Our citations ÷ all citations">Share</th><th title="Answers that cite linkedin.com">LinkedIn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.key} title={tip?.(r.key)} className="[&>td]:pl-3">
                <td lang="ja" className="max-w-[200px] truncate py-1.5 !pl-0">{label(r.key)}</td>
                <td translate="no" className="text-right font-mono text-muted">{r.questions}</td>
                <td translate="no" className={`text-right font-mono ${r.citeRate > 0 ? "text-good" : ""}`}>{pct(r.citeRate)}</td>
                <td translate="no" className="text-right font-mono">{r.allCitations ? pct(r.sov) : "—"}</td>
                <td translate="no" className="text-right font-mono text-muted">{pct(r.linkedinRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="mt-2 text-[12.5px] text-muted">No checked answers in the last 4 weeks.</p>}
    </div>
  );
}


