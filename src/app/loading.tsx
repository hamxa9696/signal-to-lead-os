// Shown instantly while a page's data loads, so a click always gives feedback.
export default function Loading() {
  return (
    <main className="page" aria-busy="true">
      <div role="status" className="flex items-center gap-2.5 text-sm text-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
        Loading…
      </div>
      <div className="flex flex-col gap-3" aria-hidden="true">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-subtle" />
        <div className="h-24 animate-pulse rounded-[14px] bg-subtle" />
        <div className="h-24 animate-pulse rounded-[14px] bg-subtle" />
        <div className="h-24 animate-pulse rounded-[14px] bg-subtle" />
      </div>
    </main>
  );
}
