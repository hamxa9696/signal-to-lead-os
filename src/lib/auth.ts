// Who may use the app. Login is a Supabase magic link (no password), limited to ALLOWED_EMAILS.
export const auth = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  allowed: (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
};

export const authConfigured = () => Boolean(auth.url && auth.publishableKey);

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  // An entry starting with "@" allows a whole domain, e.g. "@renesistech.com".
  return auth.allowed.some((a) => (a.startsWith("@") ? e.endsWith(a) : e === a));
}

/** Paths reachable without a session. */
export const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/recover"];
