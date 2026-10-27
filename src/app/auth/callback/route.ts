import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Magic-link landing: exchange the one-time code for a session cookie.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const dest = url.clone();
  dest.search = "";
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      dest.pathname = "/";
      return NextResponse.redirect(dest);
    }
  }
  dest.pathname = "/login";
  dest.search = "?error=link";
  return NextResponse.redirect(dest);
}
