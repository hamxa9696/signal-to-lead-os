// Typed access to environment configuration. Read lazily so modules stay import-safe.

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  // GEO (AI search) engines. Each one switches on when its key is set (Tavily has a free tier).
  tavilyApiKey: process.env.TAVILY_API_KEY ?? "",
  perplexityApiKey: process.env.PERPLEXITY_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiGeoModel: process.env.OPENAI_GEO_MODEL ?? "gpt-4.1-mini",
  geminiGrounding: process.env.GEMINI_GROUNDING ?? "", // "on" once billing gives the key a grounding allowance
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",

  // Google service account JSON (whole file contents, one line) — used for GA4 + Search Console.
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "",
  ga4PropertyId: process.env.GA4_PROPERTY_ID ?? "",
  gscSiteUrl: process.env.GSC_SITE_URL ?? "", // e.g. "sc-domain:renesistech.com" or "https://renesistech.com/"

  payloadUrl: (process.env.PAYLOAD_URL || "https://renesistech.jp").replace(/\/$/, ""),
  payloadApiKey: process.env.PAYLOAD_API_KEY ?? "",
  payloadAuthCollection: process.env.PAYLOAD_AUTH_COLLECTION ?? "users",
  payloadPostsCollection: process.env.PAYLOAD_POSTS_COLLECTION ?? "posts",
  payloadCategoryId: process.env.PAYLOAD_CATEGORY_ID ?? "", // category for new AI posts
  payloadResourcesCategoryId: process.env.PAYLOAD_RESOURCES_CATEGORY_ID ?? "", // 資料ダウンロード (landing pages)
  payloadPlaceholderImageId: process.env.PAYLOAD_PLACEHOLDER_IMAGE_ID ?? "", // featured image until an editor picks one

  brevoApiKey: process.env.BREVO_API_KEY ?? "",
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL ?? "", // verified sender, e.g. info@renesistech.jp
  brevoSenderName: process.env.BREVO_SENDER_NAME ?? "Renesis Tech",

  // Lead-magnet PDF hosting (public Supabase Storage bucket)
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  leadMagnetBaseUrl: process.env.LEAD_MAGNET_BASE_URL ?? "", // optional override for download links
  chromePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  makeWebhookUrl: process.env.MAKE_WEBHOOK_URL ?? "",
};

export function has(v: string): boolean {
  return typeof v === "string" && v.trim().length > 0;
}
