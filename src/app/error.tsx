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
        {(error.digest || error.message) && (
          <p className="font-mono text-xs break-words text-faint">
            {error.digest ? `Ref: ${error.digest}` : `Browser error: ${error.message.slice(0, 200)}`}
          </p>
        )}
        <p className="text-[13px] text-muted">
          If your browser is translating this page (e.g. Chrome Translate), turn that off and use the app&apos;s own English switch at the bottom of the sidebar.
        </p>
        <div>
          <button onClick={reset} className="btn-primary">Try again</button>
        </div>
      </div>
    </main>
  );
}
