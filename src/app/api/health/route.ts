import { runHealthChecks } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = await runHealthChecks();
  return Response.json({ ok: checks.every((c) => c.ok), checks });
}
