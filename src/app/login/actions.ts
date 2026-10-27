"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAllowed } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function sendLink(_prev: string | null, form: FormData): Promise<string> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  // Same answer either way, so the page doesn't reveal who has access.
  const done = "If this email has access, a sign-in link is on its way. Check your inbox.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Enter a valid email address.";
  if (!isAllowed(email)) return done;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback` } });
  if (error) return `Could not send the link: ${error.message}`;
  return done;
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
