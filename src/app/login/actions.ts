"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAllowed } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export type LoginState = { error?: string; info?: string } | null;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;

function read(form: FormData) {
  return {
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    password: String(form.get("password") ?? ""),
  };
}

/** Email + password sign-in. Only allowlisted emails get in. */
export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const { email, password } = read(form);
  if (!EMAIL.test(email) || !password) return { error: "Enter your email and password." };
  if (!isAllowed(email)) return { error: "Incorrect email or password." };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error: /confirm/i.test(error.message)
        ? "This account isn't confirmed yet. Check your inbox for the confirmation email."
        : "Incorrect email or password.",
    };
  }
  redirect("/performance");
}

/** First-time setup: an allowlisted email chooses its password. */
export async function createAccount(_prev: LoginState, form: FormData): Promise<LoginState> {
  const { email, password } = read(form);
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  if (!isAllowed(email)) return { error: "This email doesn't have access. Ask an admin to add it." };
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters for the password.` };
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords don't match." };

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const supabase = await supabaseServer();
  // The one-time confirmation email links back to /auth/callback, which signs the user in.
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/auth/callback` } });
  if (error) {
    return {
      error: /registered|exists/i.test(error.message)
        ? "An account already exists for this email. Sign in instead."
        : `Could not create the account: ${error.message}`,
    };
  }
  if (data.session) redirect("/performance");
  return { info: "Almost done: open the confirmation email we just sent and click the link. After that you only need your email and password." };
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
