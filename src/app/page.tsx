import { runHealthChecks } from "@/lib/health";

export const dynamic = "force-dynamic";

export default async function Home() {
  const checks = await runHealthChecks();
  const ready = checks.filter((c) => c.ok).length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Signal-to-Lead OS</h1>
      <p className="mt-1 text-sm text-white/60">
        Phase 1 · connections — {ready}/{checks.length} ready. Setup steps are in{" "}
        <code className="text-white/80">docs/SETUP.md</code>.
      </p>

      <ul className="mt-6 divide-y divide-white/10 rounded-lg border border-white/10">
        {checks.map((c) => (
          <li key={c.name} className="flex items-start gap-3 px-4 py-3">
            <span
              aria-label={c.ok ? "ok" : "not ready"}
              className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${c.ok ? "bg-emerald-400" : "bg-amber-400"}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-white/40">{c.setup}</span>
              </div>
              <p className="break-words text-sm text-white/60">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
