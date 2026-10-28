import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Password-reset link landing: sign the user in, then open the "set a new password" page.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const dest = request.nextUrl.clone();
  dest.search = "";
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      dest.pathname = "/reset-password";
      return NextResponse.redirect(dest);
    }
  }
  dest.pathname = "/login";
  dest.search = "?error=link";
  return NextResponse.redirect(dest);
}
