import { LoginForm } from "./form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="card w-full max-w-[400px] px-8 py-9">
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/kizashi-logo.png" alt="Kizashi 兆し" width={120} height={113} className="h-[113px] w-[120px] rounded-[24px] shadow-[0_2px_10px_rgba(30,58,49,0.12)]" />
          <p className="mt-4 text-[12px] font-semibold tracking-[0.3em] text-faint">KIZASHI · RENESIS TECH JAPAN</p>
        </div>
        <h1 className="mt-7 text-center font-[family-name:var(--font-mincho)] text-[24px] font-bold">Sign in</h1>
        <p className="mt-1 mb-6 text-center text-sm text-muted">Early signals from the Japanese market, turned into content and leads.</p>
        {error === "not_allowed" && <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">That account doesn't have access.</p>}
        <LoginForm />
      </div>
    </main>
  );
}
