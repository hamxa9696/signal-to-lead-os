import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { sql } from "@/lib/db";
import { getTopic } from "@/lib/content/topic";
import { ensurePromptPack } from "@/lib/content/workflow";
import { buildRevisionPrompt, PASS_SCORE, type ReviewResult } from "@/lib/content/review";
import { adminUrl, payloadReady } from "@/lib/content/publish";
import { CopyButton } from "../../copy-button";
import { setTopicStatus } from "../../actions";
import { markReadyAction, rebuildPackAction } from "./actions";
import { BuildPdf, DraftForm, PushToPayload, RerunReview, UploadPdf } from "./forms";
import { downloadBaseUrl, storageReady } from "@/lib/magnet/storage";
import { env, has } from "@/lib/env";

export const dynamic = "force-dynamic";

type Item = { id: string; status: string; title: string; slug: string | null; current_version_id: string | null };
type Version = {
  id: string; version: number; drafted_by: string; created_at: Date; review_passed: boolean | null;
  human_checked: boolean; body_md: string; review: ReviewResult | null;
};
type Pub = { external_id: string | null; url: string | null; status: string; published_at: Date | null };
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
    <section className="rounded-lg border border-white/10 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${done ? "bg-emerald-500 text-black" : "bg-white/10"}`}>
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
    ? await sql<Pub[]>`select external_id, url, status, published_at from publications where content_item_id = ${item.id} and channel = 'website'`
    : [];
  const [file] = item
    ? await sql<MagnetFile[]>`select slug, bytes, pages, public_url, version_id, created_at from magnet_files where content_item_id = ${item.id}`
    : [];
  const review = current?.review ?? null;
  const payload = payloadReady();
  const isArticle = topic.kind === "article";

  return (
    <main className="mx-auto max-w-5xl overflow-x-hidden px-4 py-8">
      <Link href={`/topics?week=${topic.week_of}`} className="text-sm text-white/50 hover:text-white">← Week of {topic.week_of}</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-white/50">
            {topic.kind === "lead_magnet" ? `Lead magnet · ${topic.magnet_format}` : "Article"} · topic {topic.status}
            {item && <> · <span className="text-white/80">{ITEM_STATUS[item.status] ?? item.status}</span></>}
          </p>
          <h1 lang="ja" className="mt-1 text-xl font-semibold">{item?.title ?? topic.title_ja}</h1>
          <p lang="ja" className="mt-1 text-sm text-white/50">{topic.primary_keyword} · {topic.secondary_keywords.join("、")}</p>
        </div>
        {topic.status === "proposed" && (
          <form action={setTopicStatus}>
            <input type="hidden" name="id" value={topic.id} />
            <input type="hidden" name="status" value="approved" />
            <button className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-sm text-black hover:bg-emerald-400">Approve to start</button>
          </form>
        )}
      </div>

      {!active ? (
        <p className="mt-6 rounded-lg border border-white/10 px-4 py-6 text-sm text-white/60">
          Approve this topic to get its prompt pack.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          <Section n={1} title="Prompt pack: copy into ChatGPT or Claude" done={versions.length > 0}>
            <p className="text-sm text-white/60">
              Start a new chat, paste this, and copy the whole answer back into step 2. It includes the style guide, banned phrases and fact sheet from{" "}
              <Link href="/knowledge" className="underline decoration-white/30">Knowledge</Link>.
            </p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={pack!} label="Copy prompt pack" />
              <form action={rebuildPackAction}>
                <input type="hidden" name="topicId" value={id} />
                <button className="rounded-md border border-white/15 px-3 py-1.5 text-sm hover:bg-white/10">Rebuild (after editing Knowledge)</button>
              </form>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-white/50 hover:text-white">Show prompt ({pack!.length.toLocaleString()} chars)</summary>
              <pre lang="ja" className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-black/30 p-3 text-xs text-white/70">{pack}</pre>
            </details>
          </Section>

          <Section n={2} title={versions.length ? `Paste a revised draft (now on v${current?.version})` : "Paste the draft"} done={item?.status === "ready" || item?.status === "published"}>
            <DraftForm topicId={id} />
          </Section>

          {current && (
            <Section n={3} title={`Review of v${current.version}`} done={current.review_passed === true || current.human_checked}>
              <ReviewView review={review} humanChecked={current.human_checked} />
              <div className="flex flex-wrap items-center gap-3">
                <RerunReview topicId={id} />
                {item && item.status === "needs_revision" && (
                  <form action={markReadyAction}>
                    <input type="hidden" name="topicId" value={id} />
                    <button className="rounded-md border border-amber-400/40 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-400/10">
                      Accept anyway (I checked it)
                    </button>
                  </form>
                )}
              </div>
              {review && !review.passed && (
                <div className="rounded-md border border-white/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-white/70">Revision prompt: paste into the <b>same</b> chat that wrote the draft.</p>
                    <CopyButton text={buildRevisionPrompt(review)} label="Copy revision prompt" />
                  </div>
                </div>
              )}
              <details>
                <summary className="cursor-pointer text-sm text-white/50 hover:text-white">Preview v{current.version}</summary>
                <article lang="ja" className="prose-preview mt-3 rounded-md bg-white/[0.03] p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: previewHtml(current.body_md) }} />
              </details>
              {versions.length > 1 && (
                <p className="text-xs text-white/40">
                  History: {versions.map((v) => `v${v.version} ${v.drafted_by} ${v.review_passed ? "✓" : v.review_passed === false ? "✗" : "·"}`).join(" · ")}
                </p>
              )}
            </Section>
          )}

          {item && (
            <Section n={4} title={isArticle ? "Send to Payload as a draft" : "PDF, download link and landing page"} done={pub?.status === "live"}>
              {!isArticle ? (
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
                  <p className="text-sm text-white/60">
                    Creates (or updates) a post with status <code>draft</code> on renesistech.jp. Drafts are not visible to the public. Add the featured image, check the category, then publish in the Payload admin.
                  </p>
                  {!payload.ok && <p className="text-sm text-amber-300">{payload.reason}</p>}
                  {item.status !== "ready" && item.status !== "published" && (
                    <p className="text-sm text-white/50">Available once the review passes (or you accept it).</p>
                  )}
                  <PushToPayload
                    topicId={id}
                    itemId={item.id}
                    disabled={!payload.ok || item.status !== "ready"}
                    label={pub?.external_id ? "Update Payload draft" : "Create Payload draft"}
                  />
                  {pub?.external_id && (
                    <p className="text-sm text-white/60">
                      Status: <b>{pub.status}</b> ·{" "}
                      <a href={adminUrl(pub.external_id)} target="_blank" rel="noreferrer" className="underline decoration-white/30">Open in Payload admin</a>
                      {pub.status === "live" && pub.url && <> · <a href={pub.url} target="_blank" rel="noreferrer" className="underline decoration-white/30">View live</a></>}
                    </p>
                  )}
                </>
              )}
            </Section>
          )}
        </div>
      )}
    </main>
  );
}

function ReviewView({ review, humanChecked }: { review: ReviewResult | null; humanChecked: boolean }) {
  if (!review) return <p className="text-sm text-white/50">Not reviewed yet.</p>;
  const ai = review.ai;
  return (
    <div className="space-y-3">
      <div className={`rounded-md px-3 py-2 text-sm ${review.passed ? "bg-emerald-500/15 text-emerald-200" : humanChecked ? "bg-sky-500/15 text-sky-200" : "bg-amber-500/15 text-amber-200"}`}>
        {review.passed ? "Passed: ready to publish." : humanChecked ? "Accepted manually despite the issues below." : `Needs revision: ${review.reasons.join(" · ")}`}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-white/80">Automatic checks</h3>
          <ul className="mt-1 space-y-0.5 text-sm">
            {review.checks.map((c) => (
              <li key={c.id} className="flex min-w-0 gap-2">
                <span className={c.ok ? "text-emerald-400" : c.blocking ? "text-amber-300" : "text-white/40"}>{c.ok ? "✓" : c.blocking ? "✗" : "!"}</span>
                <span className={`shrink-0 ${c.ok ? "text-white/60" : "text-white/85"}`}>{c.label}</span>
                {c.detail && c.detail !== "ok" && <span lang="ja" className="min-w-0 truncate text-white/40">{c.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-white/80">
            Gemini review {ai && <span className="text-white/50">· {ai.overall}/100 (pass ≥ {PASS_SCORE})</span>}
          </h3>
          {review.aiError && <p className="mt-1 text-sm text-amber-300">Review failed: {review.aiError}</p>}
          {ai && (
            <>
              <p className="mt-1 text-sm text-white/60">{ai.summary}</p>
              <ul className="mt-2 space-y-0.5 text-sm">
                {ai.scores.map((s) => (
                  <li key={s.id} className="flex min-w-0 gap-2" title={s.note}>
                    <span className={`w-8 tabular-nums ${s.score >= 4 ? "text-emerald-400" : s.score >= 3 ? "text-white/60" : "text-amber-300"}`}>{s.score}/5</span>
                    <span className="shrink-0 text-white/70">{s.id}</span>
                    <span className="min-w-0 truncate text-white/40">{s.note}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {ai && ai.issues.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-white/80">Issues ({ai.issues.length})</h3>
          <ol className="mt-1 space-y-2 text-sm">
            {ai.issues.map((i, n) => (
              <li key={n} className="break-words rounded-md bg-white/[0.03] p-2">
                <span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${i.severity === "high" ? "bg-amber-500/30 text-amber-100" : i.severity === "medium" ? "bg-white/10" : "bg-white/5 text-white/50"}`}>{i.severity}</span>
                {i.quote && <span lang="ja" className="text-white/80">「{i.quote}」</span>}
                <p className="mt-1 text-white/60">{i.problem}</p>
                {i.fix && <p lang="ja" className="mt-0.5 text-white/45">→ {i.fix}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
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
      {!ready && <p className="text-white/50">Available once the review passes (or you accept it).</p>}

      <div className="space-y-2">
        <h3 className="font-medium text-white/80">a. PDF</h3>
        <BuildPdf topicId={topicId} disabled={!ready} rebuild={Boolean(file)} />
        {file && (
          <p className="text-white/60">
            <a href={`/api/magnets/${file.slug}`} target="_blank" rel="noreferrer" className="underline decoration-white/30">Open {file.slug}.pdf</a>{" "}
            · {file.pages ?? "?"} pages · {(file.bytes / 1024).toFixed(0)} KB
            {stale && <span className="text-amber-300"> · from an older version, rebuild</span>}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-medium text-white/80">b. Public download link</h3>
        {!storage.ok && <p className="text-amber-300">{storage.reason}</p>}
        <UploadPdf topicId={topicId} disabled={!file || stale || !storage.ok} again={Boolean(file?.public_url)} />
        {file?.public_url ? (
          <p className="break-all text-white/60">Link: <a href={file.public_url} target="_blank" rel="noreferrer" className="underline decoration-white/30">{file.public_url}</a></p>
        ) : (
          base && file && <p className="break-all text-white/40">Will be: {base}/{file.slug}.pdf</p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-medium text-white/80">c. Landing page (Payload draft, 資料ダウンロード category)</h3>
        <p className="text-white/50">Intro, “この資料でわかること”, “こんな方におすすめ”, and the section list. The website shows the download form under it.</p>
        {!payloadOk && <p className="text-amber-300">{payloadReason}</p>}
        {payloadOk && !landingCategory && <p className="text-amber-300">PAYLOAD_RESOURCES_CATEGORY_ID not set (SETUP.md §6)</p>}
        <PushToPayload
          topicId={topicId}
          itemId={itemId}
          disabled={!payloadOk || !landingCategory || !ready || !file?.public_url}
          label={pub?.external_id ? "Update landing draft" : "Create landing draft"}
        />
        {!file?.public_url && <p className="text-white/40">Upload the PDF first, so the form's link works when the page goes live.</p>}
        {pub?.external_id && (
          <p className="text-white/60">
            Status: <b>{pub.status}</b> · <a href={adminUrl(pub.external_id)} target="_blank" rel="noreferrer" className="underline decoration-white/30">Open in Payload admin</a>
            {pub.status === "live" && pub.url && <> · <a href={pub.url} target="_blank" rel="noreferrer" className="underline decoration-white/30">View live</a></>}
          </p>
        )}
      </div>
    </div>
  );
}
