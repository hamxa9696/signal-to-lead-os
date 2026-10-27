import { LoginForm } from "./form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="card w-full max-w-[400px] px-8 py-9">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-ink">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--color-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h4l3-7 4 14 3-7h4" />
            </svg>
          </span>
          <span>
            <span className="block font-bold tracking-tight">Signal-to-Lead</span>
            <span className="block text-[11px] text-faint">Renesis Tech Japan</span>
          </span>
        </div>
        <h1 className="mt-7 text-[22px] font-bold tracking-tight">Sign in</h1>
        <p className="mt-1 mb-6 text-sm text-muted">We'll email you a one-time sign-in link. Access is limited to approved addresses.</p>
        {error === "not_allowed" && <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">That account doesn't have access.</p>}
        {error === "link" && <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">The sign-in link was invalid or expired. Request a new one.</p>}
        <LoginForm />
      </div>
    </main>
  );
}
