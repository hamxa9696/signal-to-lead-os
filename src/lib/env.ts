// Typed access to environment configuration. Read lazily so modules stay import-safe.

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",

  // Google service account JSON (whole file contents, one line) — used for GA4 + Search Console.
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "",
  ga4PropertyId: process.env.GA4_PROPERTY_ID ?? "",
  gscSiteUrl: process.env.GSC_SITE_URL ?? "", // e.g. "sc-domain:renesistech.com" or "https://renesistech.com/"

  payloadUrl: (process.env.PAYLOAD_URL ?? "").replace(/\/$/, ""),
  payloadApiKey: process.env.PAYLOAD_API_KEY ?? "",
  payloadAuthCollection: process.env.PAYLOAD_AUTH_COLLECTION ?? "users",
  payloadPostsCollection: process.env.PAYLOAD_POSTS_COLLECTION ?? "posts",

  brevoApiKey: process.env.BREVO_API_KEY ?? "",
  makeWebhookUrl: process.env.MAKE_WEBHOOK_URL ?? "",
};

export function has(v: string): boolean {
  return typeof v === "string" && v.trim().length > 0;
}
