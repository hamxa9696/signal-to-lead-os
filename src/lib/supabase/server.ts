import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(auth.url, auth.publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => {
        try {
          all.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component: the proxy refreshes cookies instead
        }
      },
    },
  });
}
