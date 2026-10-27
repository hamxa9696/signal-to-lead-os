import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { auth, authConfigured, isAllowed, PUBLIC_PATHS } from "@/lib/auth";

// Next.js 16 proxy (formerly middleware): refresh the Supabase session on every request
// and keep everything behind login. Same pattern as Musubi CRM's src/proxy.ts.
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!authConfigured()) {
    // Local development without Supabase Auth: open. In production, fail closed.
    if (process.env.VERCEL) return new NextResponse("Auth is not configured", { status: 503 });
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(auth.url, auth.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (all) => {
        all.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        all.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let email: string | null = null;
  try {
    const { data } = await supabase.auth.getClaims();
    email = (data?.claims?.email as string | undefined) ?? null;
  } catch {
    email = null;
  }

  if (isPublic) return response;
  if (!email || !isAllowed(email)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = email ? "?error=not_allowed" : "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
