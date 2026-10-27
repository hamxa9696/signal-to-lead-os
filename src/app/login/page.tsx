import { LoginForm } from "./form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-4 py-20">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 mb-6 text-sm text-white/60">Renesis Signal-to-Lead OS. Access is limited to approved emails.</p>
      {error === "not_allowed" && <p className="mb-4 text-sm text-amber-300">That account doesn't have access.</p>}
      {error === "link" && <p className="mb-4 text-sm text-amber-300">The sign-in link was invalid or expired. Request a new one.</p>}
      <LoginForm />
    </main>
  );
}
