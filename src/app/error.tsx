"use client";
// Any page that fails to load shows this instead of a blank screen or a click that "does nothing".
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page">
      <div className="card flex flex-col gap-3 p-6">
        <h1 className="text-lg font-semibold">This page didn&apos;t load</h1>
        <p className="text-sm text-muted">
          Usually the database was busy for a moment. Try again; if it keeps happening, the reference below helps find the cause.
        </p>
        {error.digest && <p className="font-mono text-xs text-faint">Ref: {error.digest}</p>}
        <div>
          <button onClick={reset} className="btn-primary">Try again</button>
        </div>
      </div>
    </main>
  );
}
