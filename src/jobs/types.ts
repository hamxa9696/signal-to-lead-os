export type JobResult = { status: "ok" | "skipped"; stats: Record<string, unknown>; note?: string };
export type Job = { name: string; description: string; run: () => Promise<JobResult> };
