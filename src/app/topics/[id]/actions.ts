"use server";
import { revalidatePath } from "next/cache";
import { ensurePromptPack, markReady, rerunReview, saveDraft, DRAFTED_BY, type DraftedBy } from "@/lib/content/workflow";
import { pushDraftToPayload } from "@/lib/content/publish";

export type ActionState = { ok: boolean; message: string } | null;

const path = (id: string) => `/topics/${id}`;
const fail = (err: unknown): ActionState => ({ ok: false, message: (err as Error).message });

export async function rebuildPackAction(form: FormData): Promise<void> {
  const id = String(form.get("topicId"));
  await ensurePromptPack(id, true);
  revalidatePath(path(id));
}

export async function saveDraftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("topicId"));
  const by = String(form.get("draftedBy")) as DraftedBy;
  try {
    if (!DRAFTED_BY.includes(by)) throw new Error("pick who drafted it");
    const { version, result } = await saveDraft(id, String(form.get("draft") ?? ""), by);
    revalidatePath(path(id));
    return { ok: true, message: `Saved as version ${version}: ${result.passed ? "review passed ✓" : "needs revision"}` };
  } catch (err) {
    return fail(err);
  }
}

export async function rerunReviewAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("topicId"));
  try {
    const r = await rerunReview(id);
    revalidatePath(path(id));
    return { ok: true, message: r.passed ? "Review passed ✓" : "Still needs revision" };
  } catch (err) {
    return fail(err);
  }
}

export async function markReadyAction(form: FormData): Promise<void> {
  const id = String(form.get("topicId"));
  await markReady(id);
  revalidatePath(path(id));
}

export async function pushToPayloadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("topicId"));
  const itemId = String(form.get("itemId"));
  try {
    const { created } = await pushDraftToPayload(itemId);
    revalidatePath(path(id));
    return { ok: true, message: created ? "Draft created in Payload ✓" : "Payload draft updated ✓" };
  } catch (err) {
    return fail(err);
  }
}

export async function buildPdfAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("topicId"));
  try {
    const { buildMagnetPdf } = await import("@/lib/magnet/workflow");
    const r = await buildMagnetPdf(id);
    revalidatePath(path(id));
    return { ok: true, message: `PDF built: ${r.pages} pages, ${(r.bytes / 1024).toFixed(0)} KB${r.url ? " · uploaded" : ""}` };
  } catch (err) {
    return fail(err);
  }
}

export async function uploadPdfAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("topicId"));
  try {
    const { uploadMagnetPdf } = await import("@/lib/magnet/workflow");
    const url = await uploadMagnetPdf(id);
    revalidatePath(path(id));
    return { ok: true, message: `Uploaded: ${url}` };
  } catch (err) {
    return fail(err);
  }
}

export async function researchAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("topicId"));
  try {
    const { researchTopic } = await import("@/lib/research");
    const r = await researchTopic(id);
    const { ensurePromptPack } = await import("@/lib/content/workflow");
    await ensurePromptPack(id, true).catch(() => null); // only exists once approved
    revalidatePath(path(id));
    return { ok: true, message: `${r.sources.length} sources, ${r.points.length} findings` };
  } catch (err) {
    return fail(err);
  }
}
