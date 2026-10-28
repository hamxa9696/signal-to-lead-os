"use server";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { auth, isAllowed } from "@/lib/auth";
import { env, has } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

export type LoginState = { error?: string } | null;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Email-only sign-in (owner's choice): an approved email gets a session straight away, with no
 * password and no email round-trip. The server mints a one-time sign-in token with the Supabase
 * admin API and redeems it immediately, so the rest of the app sees a normal Supabase session.
 * Security rests entirely on ALLOWED_EMAILS: anyone who types an approved address gets in.
 */
export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  if (!isAllowed(email)) return { error: "This email isn't approved for this app." };
  if (!has(env.supabaseServiceRoleKey)) return { error: "Sign-in isn't configured on the server (SUPABASE_SERVICE_ROLE_KEY)." };

  const admin = createClient(auth.url, env.supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error && /not found|no user/i.test(link.error.message)) {
    // First sign-in for an approved email: create its user record (no password).
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) return { error: `Could not set up this account: ${created.error.message}` };
    link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  }
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) return { error: `Sign-in failed: ${link.error?.message ?? "no token"}` };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (error) return { error: `Sign-in failed: ${error.message}` };
  redirect("/performance");
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
