import { ResetForm } from "./form";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="card w-full max-w-[400px] px-8 py-9">
        <h1 className="text-[22px] font-bold tracking-tight">Set a new password</h1>
        <p className="mt-1 mb-6 text-sm text-muted">You'll use it with your email to sign in from now on.</p>
        <ResetForm />
      </div>
    </main>
  );
}
