import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Password-reset landing: sign the user in, then open the "set a new password" page.
// Accepts either the email link's `code` (PKCE) or a one-time `token_hash` (admin-generated link).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const dest = request.nextUrl.clone();
  dest.search = "";

  const supabase = await supabaseServer();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash) {
    ok = !(await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash })).error;
  }

  dest.pathname = ok ? "/reset-password" : "/login";
  if (!ok) dest.search = "?error=link";
  return NextResponse.redirect(dest);
}
