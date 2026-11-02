import Link from "next/link";
import { PendingButton } from "../../pending-button";
import { topicPackage } from "@/lib/content/package";
import { ContentPackage, SlotBadge } from "../content-package";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { sql } from "@/lib/db";
import { getTopic } from "@/lib/content/topic";
import { ensurePromptPack } from "@/lib/content/workflow";
import { buildRevisionPrompt, PASS_SCORE, type ReviewResult } from "@/lib/content/review";
import { adminUrl, payloadReady } from "@/lib/content/publish";
import { CopyButton } from "../../copy-button";
import { setTopicStatus } from "../../actions";
import { markReadyAction, rebuildPackAction, setAuthorAction } from "./actions";
import { loadExperts } from "@/lib/experts";
import { citability, type Citability } from "@/lib/content/citability";
import { BuildPdf, DraftForm, PushToPayload, RerunReview, ResearchButton, UploadPdf } from "./forms";
import type { Research } from "@/lib/research";
import { downloadBaseUrl, storageReady } from "@/lib/magnet/storage";
import { env, has } from "@/lib/env";
import { pagePerformance, sourcesForPath, topQueriesForPath } from "@/lib/performance";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Gemini and PDF actions can take minutes

type Item = { id: string; status: string; title: string; slug: string | null; current_version_id: string | null };
type Version = {
  id: string; version: number; drafted_by: string; created_at: Date; review_passed: boolean | null;
  human_checked: boolean; body_md: string; review: ReviewResult | null;
};
type Pub = { external_id: string | null; url: string | null; status: string; published_at: Date | null; page_path: string | null };
type MagnetFile = { slug: string; bytes: number; pages: number | null; public_url: string | null; version_id: string; created_at: Date };

const ITEM_STATUS: Record<string, string> = {
  in_review: "Reviewing",
  needs_revision: "Needs revision",
  ready: "Ready to publish",
  published: "Published",
};

function previewHtml(md: string): string {
  // Local admin preview: escape raw HTML from the paste and drop non-http links.
  const safe = md.replace(/</g, "&lt;").replace(/\]\((?!https?:\/\/)[^)]*\)/g, "](#)");
  return marked.parse(safe, { async: false }) as string;
}

function Section({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2.5 font-semibold">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs ${done ? "bg-good text-white" : "bg-accent-soft text-accent-ink"}`}>
          {done ? "✓" : n}
        </span>
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export default async function TopicWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topic = await getTopic(id);
  if (!topic) notFound();

  const active = ["approved", "in_progress", "done"].includes(topic.status);
  const pack = active ? await ensurePromptPack(id) : null;

  const [item] = await sql<Item[]>`
    select id, status, title, slug, current_version_id from content_items where topic_id = ${id} and parent_id is null`;
  const versions = item
    ? await sql<Version[]>`
        select id, version, drafted_by, created_at, review_passed, human_checked, body_md, review
        from content_versions where content_item_id = ${item.id} order by version desc`
    : [];
  const current = versions.find((v) => v.id === item?.current_version_id) ?? versions[0];
  const [pub] = item
    ? await sql<Pub[]>`select external_id, url, status, published_at, page_path from publications where content_item_id = ${item.id} and channel = 'website'`
    : [];
  const [file] = item
    ? await sql<MagnetFile[]>`select slug, bytes, pages, public_url, version_id, created_at from magnet_files where content_item_id = ${item.id}`
    : [];
  const review = current?.review ?? null;
  const experts = (await loadExperts()).filter((e) => e.active || e.id === topic.author?.id);
  const cite = topic.kind === "article" && current ? (review?.citability ?? citability(current.body_md, item?.title ?? "")) : null;
  const payload = payloadReady();
  const isArticle = topic.kind === "article";

  return (
    <main className="page overflow-x-hidden">
      <div className="-mb-3"><Link href={`/topics?week=${topic.week_of}`} className="text-sm text-faint hover:text-ink">← Week of {topic.week_of}</Link></div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">
            {topic.kind === "lead_magnet" ? `Lead magnet · ${topic.magnet_format}` : "Article"} · topic {topic.status}
            {item && <> · <span className="text-ink">{ITEM_STATUS[item.status] ?? item.status}</span></>}
          </p>
          <h1 lang="ja" className="mt-1.5 text-[24px] leading-snug font-bold tracking-tight">{item?.title ?? topic.title_ja}</h1>
          <p lang="ja" className="mt-1 text-sm text-faint">{topic.primary_keyword} · {topic.secondary_keywords.join("、")}</p>
          {topic.persona && (
            <p className="mt-1 text-sm text-muted">
              Written for <span lang="ja" className="font-medium text-ink">{topic.persona.name}</span>
            </p>
          )}
          <form action={setAuthorAction} className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            <input type="hidden" name="topicId" value={topic.id} />
            <span title="AI search cites people far more than company pages: the prompts write in this expert's voice and add their byline">Author</span>
            {experts.length ? (
              <>
                <select name="authorId" defaultValue={topic.author && !topic.author.auto ? topic.author.id : ""} aria-label="Author"
                  className="rounded-lg border border-line-strong bg-surface px-2 py-1 text-[13px] text-ink">
                  <option value="">Automatic{topic.author?.auto ? ` (${topic.author.name})` : " (no match)"}</option>
                  {experts.map((e) => <option key={e.id} value={e.id}>{e.name}{e.role ? ` · ${e.role}` : ""}</option>)}
                </select>
                <PendingButton className="btn !py-1 !text-[12.5px]" pendingText="Saving…">Set</PendingButton>
              </>
            ) : (
              <Link href="/audience#experts" className="text-accent hover:underline">add your experts on Audience</Link>
            )}
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={topicPackage({ ...topic, week_of: topic.week_of, service: topic.service_name, service_url: topic.service_url, persona: topic.persona?.name })} label="⧉ Copy package" className="btn" title="Copies the topic, keywords, signals and research with URLs, outline and links" />
        {topic.status === "proposed" && (
          <form action={setTopicStatus}>
            <input type="hidden" name="id" value={topic.id} />
            <input type="hidden" name="status" value="approved" />
            <PendingButton className="btn-primary" pendingText="Approving…">Approve to start</PendingButton>
          </form>
        )}
        </div>
      </div>

      <section aria-label="Content package" className="card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Content package</h2>
          <SlotBadge slot={topic.slot} deadline={topic.slot === "fast_take" ? topic.deadline : null} />
        </div>
        <p className="mb-3 text-[13px] text-faint">One hub on renesistech.jp where traffic and leads land, plus the channels that send people to it. Each channel has a ready prompt with a tracked link.</p>
        <ContentPackage t={{ ...topic, service: topic.service_name, persona: topic.persona?.name }} plan={topic.format_plan} scores={topic.format_scores} slot={topic.slot} hubUrl={topic.hub_url} posted={topic.posted} />
      </section>

      <ResearchPanel topicId={id} research={topic.research} />

      {!active ? (
        <p className="card px-5 py-6 text-sm text-muted">
          Approve this topic to get its prompt pack.
        </p>
      ) : (
        <div className="space-y-4">
          <Section n={1} title="Prompt pack: copy into ChatGPT or Claude" done={versions.length > 0}>
            <p className="text-sm text-muted">
              Start a new chat, paste this, and copy the whole answer back into step 2. It includes the style guide, banned phrases and fact sheet from{" "}
              <Link href="/knowledge" className="underline decoration-line-strong">Knowledge</Link>.
            </p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={pack!} label="Copy prompt pack" />
              <form action={rebuildPackAction}>
                <input type="hidden" name="topicId" value={id} />
                <PendingButton pendingText="Rebuilding…">Rebuild (after editing Knowledge)</PendingButton>
              </form>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-faint hover:text-ink">Show prompt ({pack!.length.toLocaleString()} chars)</summary>
              <pre lang="ja" className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-surface p-3 text-xs text-body">{pack}</pre>
            </details>
          </Section>

          <Section n={2} title={versions.length ? `Paste a revised draft (now on v${current?.version})` : "Paste the draft"} done={item?.status === "ready" || item?.status === "published"}>
            <DraftForm topicId={id} />
          </Section>

          {current && (
            <Section n={3} title={`Review of v${current.version}`} done={current.review_passed === true || current.human_checked}>
              <ReviewView review={review} humanChecked={current.human_checked} />
              {cite && <CitabilityView c={cite} />}
              <div className="flex flex-wrap items-center gap-3">
                <RerunReview topicId={id} />
                {item && item.status === "needs_revision" && (
                  <form action={markReadyAction}>
                    <input type="hidden" name="topicId" value={id} />
                    <PendingButton className="rounded-lg border border-warn/40 px-3 py-1.5 text-sm text-warn hover:bg-warn-soft">
                      Accept anyway (I checked it)
                    </PendingButton>
                  </form>
                )}
              </div>
              {review && !review.passed && (
                <div className="rounded-md border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-body">Revision prompt: paste into the <b>same</b> chat that wrote the draft.</p>
                    <CopyButton text={buildRevisionPrompt(review)} label="Copy revision prompt" />
                  </div>
                </div>
              )}
              <details>
                <summary className="cursor-pointer text-sm text-faint hover:text-ink">Preview v{current.version}</summary>
                <article lang="ja" className="prose-preview mt-3 rounded-md bg-subtle p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: previewHtml(current.body_md) }} />
              </details>
              {versions.length > 1 && (
                <p className="text-xs text-faint">
                  History: {versions.map((v) => `v${v.version} ${v.drafted_by} ${v.review_passed ? "✓" : v.review_passed === false ? "✗" : "·"}`).join(" · ")}
                </p>
              )}
            </Section>
          )}

          {item && (
            <Section n={4} title={topic.origin === "refresh" ? "Update the live post" : isArticle ? "Send to Payload as a draft" : "PDF, download link and landing page"} done={pub?.status === "live"}>
              {topic.origin === "refresh" ? (
                <RefreshFinish markdown={current?.body_md ?? ""} path={topic.target_path} ready={item.status === "ready"} />
              ) : !isArticle ? (
                <MagnetSteps
                  topicId={id}
                  itemId={item.id}
                  ready={item.status === "ready" || item.status === "published"}
                  file={file ?? null}
                  currentVersionId={current?.id ?? null}
                  pub={pub ?? null}
                  payloadOk={payload.ok}
                  payloadReason={payload.reason}
                />
              ) : (
                <>
                  <p className="text-sm text-muted">
                    Creates (or updates) a post with status <code>draft</code> on renesistech.jp. Drafts are not visible to the public. Add the featured image, check the category, then publish in the Payload admin.
                  </p>
                  {!payload.ok && <p className="text-sm text-warn">{payload.reason}</p>}
                  {item.status !== "ready" && item.status !== "published" && (
                    <p className="text-sm text-faint">Available once the review passes (or you accept it).</p>
                  )}
                  <PushToPayload
                    topicId={id}
                    itemId={item.id}
                    disabled={!payload.ok || item.status !== "ready"}
                    label={pub?.external_id ? "Update Payload draft" : "Create Payload draft"}
                  />
                  {pub?.external_id && (
                    <p className="text-sm text-muted">
                      Status: <b>{pub.status}</b> ·{" "}
                      <a href={adminUrl(pub.external_id)} target="_blank" rel="noreferrer" className="underline decoration-line-strong">Open in Payload admin</a>
                      {pub.status === "live" && pub.url && <> · <a href={pub.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong">View live</a></>}
                    </p>
                  )}
                </>
              )}
            </Section>
          )}
          {pub?.status === "live" && pub.page_path && <Results path={pub.page_path} publishedAt={pub.published_at} />}
        </div>
      )}
    </main>
  );
}

async function Results({ path, publishedAt }: { path: string; publishedAt: Date | null }) {
  const [rows, queries, sources] = await Promise.all([pagePerformance(28), topQueriesForPath(path), sourcesForPath(path)]);
  const r = rows.find((x) => x.path === path);
  const stat = (label: string, v: string) => (
    <div className="rounded-md bg-subtle p-2">
      <p className="text-xs text-faint">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{v}</p>
    </div>
  );
  return (
    <section className="card p-4">
      <h2 className="font-semibold">Results (last 28 days)</h2>
      <p className="text-xs text-faint">Published {publishedAt ? new Date(publishedAt).toISOString().slice(0, 10) : "-"} · {path}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        {stat("Sessions", (r?.sessions ?? 0).toLocaleString())}
        {stat("Engaged", r?.engaged_rate != null ? `${Math.round(r.engaged_rate * 100)}%` : "-")}
        {stat("Leads", String((r?.leads ?? 0) + (r?.downloads ?? 0)))}
        {stat("Search clicks", (r?.clicks ?? 0).toLocaleString())}
        {stat("Avg position", r?.position != null ? r.position.toFixed(1) : "-")}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-ink">Top search queries</h3>
          <ul lang="ja" className="mt-1 space-y-0.5 text-sm">
            {queries.map((q) => (
              <li key={q.query} className="flex min-w-0 justify-between gap-3">
                <span className="min-w-0 truncate">{q.query}</span>
                <span className="shrink-0 tabular-nums text-faint">{q.impressions} imp · {q.clicks} clk · {q.position.toFixed(1)}</span>
              </li>
            ))}
            {!queries.length && <li className="text-faint">No search data yet.</li>}
          </ul>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-ink">Traffic sources</h3>
          <ul className="mt-1 space-y-0.5 text-sm">
            {sources.map((s) => (
              <li key={s.source_medium} className="flex min-w-0 justify-between gap-3">
                <span className="min-w-0 truncate">{s.source_medium}</span>
                <span className="shrink-0 tabular-nums text-faint">{s.sessions}</span>
              </li>
            ))}
            {!sources.length && <li className="text-faint">No GA4 data yet.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ReviewView({ review, humanChecked }: { review: ReviewResult | null; humanChecked: boolean }) {
  if (!review) return <p className="text-sm text-faint">Not reviewed yet.</p>;
  const ai = review.ai;
  return (
    <div className="space-y-3">
      <div className={`rounded-md px-3 py-2 text-sm ${review.passed ? "bg-good-soft text-good" : humanChecked ? "bg-accent-soft text-accent" : "bg-warn-soft text-warn"}`}>
        {review.passed ? "Passed: ready to publish." : humanChecked ? "Accepted manually despite the issues below." : `Needs revision: ${review.reasons.join(" · ")}`}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-ink">Automatic checks</h3>
          <ul className="mt-1 space-y-0.5 text-sm">
            {review.checks.map((c) => (
              <li key={c.id} className="flex min-w-0 gap-2">
                <span className={c.ok ? "text-good" : c.blocking ? "text-warn" : "text-faint"}>{c.ok ? "✓" : c.blocking ? "✗" : "!"}</span>
                <span className={`shrink-0 ${c.ok ? "text-muted" : "text-ink"}`}>{c.label}</span>
                {c.detail && c.detail !== "ok" && <span lang="ja" className="min-w-0 truncate text-faint">{c.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-ink">
            Gemini review {ai && <span className="text-faint">· {ai.overall}/100 (pass ≥ {PASS_SCORE})</span>}
          </h3>
          {review.aiError && <p className="mt-1 text-sm text-warn">Review failed: {review.aiError}</p>}
          {ai && (
            <>
              <p className="mt-1 text-sm text-muted">{ai.summary}</p>
              <ul className="mt-2 space-y-0.5 text-sm">
                {ai.scores.map((s) => (
                  <li key={s.id} className="flex min-w-0 gap-2" title={s.note}>
                    <span className={`w-8 tabular-nums ${s.score >= 4 ? "text-good" : s.score >= 3 ? "text-muted" : "text-warn"}`}>{s.score}/5</span>
                    <span className="shrink-0 text-body">{s.id}</span>
                    <span className="min-w-0 truncate text-faint">{s.note}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {ai && ai.issues.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-ink">Issues ({ai.issues.length})</h3>
          <ol className="mt-1 space-y-2 text-sm">
            {ai.issues.map((i, n) => (
              <li key={n} className="break-words rounded-md bg-subtle p-2">
                <span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${i.severity === "high" ? "bg-warn-soft text-warn" : i.severity === "medium" ? "bg-subtle" : "bg-subtle text-faint"}`}>{i.severity}</span>
                {i.quote && <span lang="ja" className="text-ink">「{i.quote}」</span>}
                <p className="mt-1 text-muted">{i.problem}</p>
                {i.fix && <p lang="ja" className="mt-0.5 text-faint">→ {i.fix}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function CitabilityView({ c }: { c: Citability }) {
  const tone = c.score >= 80 ? "text-good" : c.score >= 60 ? "text-warn" : "text-bad";
  return (
    <div className="rounded-lg border border-line p-3">
      <h3 className="text-sm font-medium text-ink">
        AI-search citability <span className={`font-mono ${tone}`}>{c.score}/100</span>
        <span className="ml-2 font-normal text-faint">how easily ChatGPT, Gemini, Copilot and Perplexity can quote it · advisory, not blocking</span>
      </h3>
      <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm md:grid-cols-2">
        {c.parts.map((p) => (
          <li key={p.id} className="flex min-w-0 items-center gap-2" title={p.tip}>
            <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-subtle">
              <span className="block h-full bg-accent" style={{ width: `${(p.points / p.max) * 100}%` }} />
            </span>
            <span className={`shrink-0 ${p.points >= p.max * 0.7 ? "text-muted" : "text-ink"}`}>{p.label}</span>
            <span lang="ja" className="min-w-0 truncate text-faint">{p.points < p.max * 0.7 ? p.tip : p.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function RefreshFinish({ markdown, path, ready }: { markdown: string; path: string | null; ready: boolean }) {
  const { fetchLivePost, adminUrl } = await import("@/lib/content/publish");
  const live = path ? await fetchLivePost(path).catch(() => null) : null;
  return (
    <div className="space-y-2 text-sm text-muted">
      <p>
        The post is already live, and the API user may only create drafts, so the rewrite is applied in the Payload admin:
        copy the Markdown, open the post, replace the body, check the title and meta, then save.
      </p>
      {!ready && <p className="text-faint">Available once the review passes (or you accept it).</p>}
      <div className="flex flex-wrap gap-2">
        {ready && <CopyButton text={markdown} label="Copy rewritten Markdown" />}
        {live && (
          <a href={adminUrl(live.id)} target="_blank" rel="noreferrer" className="btn">
            Open live post in Payload admin
          </a>
        )}
      </div>
    </div>
  );
}

function MagnetSteps({ topicId, itemId, ready, file, currentVersionId, pub, payloadOk, payloadReason }: {
  topicId: string; itemId: string; ready: boolean; file: MagnetFile | null; currentVersionId: string | null;
  pub: Pub | null; payloadOk: boolean; payloadReason?: string;
}) {
  const stale = Boolean(file && currentVersionId && file.version_id !== currentVersionId);
  const storage = storageReady();
  const base = downloadBaseUrl();
  const landingCategory = has(env.payloadResourcesCategoryId);
  return (
    <div className="space-y-4 text-sm">
      {!ready && <p className="text-faint">Available once the review passes (or you accept it).</p>}

      <div className="space-y-2">
        <h3 className="font-medium text-ink">a. PDF</h3>
        <BuildPdf topicId={topicId} disabled={!ready} rebuild={Boolean(file)} />
        {file && (
          <p className="text-muted">
            <a href={`/api/magnets/${file.slug}`} target="_blank" rel="noreferrer" className="underline decoration-line-strong">Open {file.slug}.pdf</a>{" "}
            · {file.pages ?? "?"} pages · {(file.bytes / 1024).toFixed(0)} KB
            {stale && <span className="text-warn"> · from an older version, rebuild</span>}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-medium text-ink">b. Public download link</h3>
        {!storage.ok && <p className="text-warn">{storage.reason}</p>}
        <UploadPdf topicId={topicId} disabled={!file || stale || !storage.ok} again={Boolean(file?.public_url)} />
        {file?.public_url ? (
          <p className="break-all text-muted">Link: <a href={file.public_url} target="_blank" rel="noreferrer" className="underline decoration-line-strong">{file.public_url}</a></p>
        ) : (
          base && file && <p className="break-all text-faint">Will be: {base}/{file.slug}.pdf</p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-medium text-ink">c. Landing page (Payload draft, 資料ダウンロード category)</h3>
        <p className="text-faint">Intro, “この資料でわかること”, “こんな方におすすめ”, and the section list. The website shows the download form under it.</p>
        {!payloadOk && <p className="text-warn">{payloadReason}</p>}
        {payloadOk && !landingCategory && <p className="text-warn">PAYLOAD_RESOURCES_CATEGORY_ID not set (SETUP.md §6)</p>}
        <PushToPayload
          topicId={topicId}
          itemId={itemId}
          disabled={!payloadOk || !landingCategory || !ready || !file?.public_url}
          label={pub?.external_id ? "Update landing draft" : "Create landing draft"}
        />
        {!file?.public_url && <p className="text-faint">Upload the PDF first, so the form's link works when the page goes live.</p>}
        {pub?.external_id && (
          <p className="text-muted">
            Status: <b>{pub.status}</b> · <a href={adminUrl(pub.external_id)} target="_blank" rel="noreferrer" className="underline decoration-line-strong">Open in Payload admin</a>
            {pub.status === "live" && pub.url && <> · <a href={pub.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong">View live</a></>}
          </p>
        )}
      </div>
    </div>
  );
}

function ResearchPanel({ topicId, research: r }: { topicId: string; research: Research | null }) {
  const byN = new Map((r?.sources ?? []).map((s) => [s.n, s]));
  return (
    <section aria-label="Research" className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Research &amp; sources</h2>
          <p className="text-[13px] text-faint">
            Recent Japanese coverage (Google News) plus the signals behind this topic. Findings cite their sources and go into the prompt pack.
          </p>
        </div>
        <ResearchButton topicId={topicId} again={!!r} />
      </div>
      {r && (
        <div className="mt-4 grid gap-5 md:grid-cols-[1.4fr_1fr]">
          <div lang="ja" className="min-w-0 space-y-3 text-sm">
            {r.summary && <p className="text-body">{r.summary}</p>}
            <ol className="space-y-1.5">
              {r.points.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>
                    {p.text}{" "}
                    {p.refs.map((n) => (
                      <a key={n} href={`#src-${n}`} className="ml-0.5 rounded bg-accent-soft px-1 font-mono text-[11px] text-accent-ink">{n}</a>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
            {r.questions.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-faint">Reader questions</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">{r.questions.map((q) => <li key={q}>{q}</li>)}</ul>
              </div>
            )}
          </div>
          <ol className="min-w-0 space-y-2 text-[13px]">
            {[...byN.values()].map((s) => (
              <li key={s.n} id={`src-${s.n}`} className="flex gap-2">
                <span className="w-5 shrink-0 text-right font-mono text-[11px] text-faint">{s.n}</span>
                <span className="min-w-0">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" lang="ja" className="line-clamp-2 hover:underline">{s.title}</a>
                  ) : (
                    <span lang="ja" className="line-clamp-2">{s.title}</span>
                  )}
                  <span className="block text-[11.5px] text-faint">
                    {s.kind === "signal" ? "Signal · " : ""}{s.publisher ?? ""}{s.date ? ` · ${s.date}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
