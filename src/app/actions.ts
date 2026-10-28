"use server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { jobGroups, runJob, type RunOutcome } from "@/jobs/registry";

const UI_JOBS = ["collect-feeds", "collect-gsc", "collect-ga4", "analyze", "sort", "deepen", "cluster", "research", "shortlist", "monthly-review"] as const;

export async function runJobAction(_prev: RunOutcome[] | null, form: FormData): Promise<RunOutcome[]> {
  const name = String(form.get("job"));
  if (!UI_JOBS.includes(name as (typeof UI_JOBS)[number])) throw new Error(`unknown job ${name}`);
  const jobs = jobGroups({ force: form.get("force") === "1" })[name];
  const out: RunOutcome[] = [];
  for (const job of jobs) out.push(await runJob(job));
  revalidatePath("/", "layout");
  return out;
}

export async function setTopicStatus(form: FormData): Promise<void> {
  const id = String(form.get("id"));
  const status = String(form.get("status"));
  if (!["approved", "rejected", "proposed"].includes(status)) throw new Error("bad status");
  // Topics with drafts in progress keep their status.
  await sql`
    update topics set status = ${status},
      decided_at = ${status === "proposed" ? null : sql`now()`}
    where id = ${id} and status in ('proposed', 'approved', 'rejected')`;
  revalidatePath("/topics");
  revalidatePath(`/topics/${id}`);
}

/** Approve / reject / undo from the Topics list (called directly with plain values). */
export async function decideTopic(id: string, status: "approved" | "rejected" | "proposed"): Promise<{ ok: boolean }> {
  if (!/^[0-9a-f-]{36}$/.test(id) || !["approved", "rejected", "proposed"].includes(status)) return { ok: false };
  const rows = await sql`
    update topics set status = ${status},
      decided_at = ${status === "proposed" ? null : sql`now()`}
    where id = ${id} and status in ('proposed', 'approved', 'rejected')
    returning id`;
  revalidatePath("/topics");
  revalidatePath(`/topics/${id}`);
  return { ok: rows.length > 0 };
}
