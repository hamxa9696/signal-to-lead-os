# Account setup

Everything here is free. Do the steps in order; after each one, add the value to `.env` and
reload http://localhost:3003. The matching row turns green.

| § | Account | Who | Time | Needed for |
|---|---|---|---|---|
| 1 | Database | Already done locally | — | Everything |
| 2 | Gemini API key | You | 2 min | Phase 2 |
| 3 | Google Cloud service account | You | 10 min | Phases 2, 5 |
| 4 | Google Analytics 4 | You + website developer | 30 min | Phase 5 |
| 5 | Google Search Console | You (DNS access needed) | 15 min + wait | Phase 2 |
| 6 | Payload API user | Website developer | 20 min | Phase 3 |
| 7 | Brevo | You (DNS access needed) | 20 min | Phase 4 |
| 8 | Make.com | You | 5 min | Phase 4 |
| 9 | Supabase + GitHub secrets (scheduled jobs) | You | 15 min | Phase 2 automation |

**Do §4 and §5 first.** Analytics and Search Console only start collecting data once they are
installed, so every day of delay is a day of missing history.

Use a company Google account (not personal) for §2–§5 so access survives staff changes.

---

## Status (2026-10-28)
- §3 Service account: **done**, `stl-reader@signal-to-lead-os.iam.gserviceaccount.com` in Google Cloud project
  `signal-to-lead-os` (Analytics Data API + Search Console API enabled; key stored in Vercel, GitHub and local `.env*`).
- §4 GA4: **connected**, property `468932036` ("Japan | Renesis Tech"), stl-reader = Viewer. 90 days backfilled.
- §5 Search Console: **pending verification.** Property `https://renesistech.jp/` was added under
  muhammadhamza9696@gmail.com, but the Analytics method failed (the GA tag loads via JavaScript). The website
  developer adds this to the `<head>` of renesistech.jp:
  `<meta name="google-site-verification" content="xjHbWZ4sIH6zu-PbLqyPFWFH7Nf9HBOaSF0-HlXlia8" />`
  Then: Verify in Search Console → Settings → Users → add stl-reader (Restricted) → set `GSC_SITE_URL=https://renesistech.jp/`
  in `.env.production.local` and run `scripts/push-google-env.sh`.

## §1 Database
Local Postgres runs in Docker (`pnpm db:up && pnpm db:migrate`). When scheduled jobs start
(phase 2) we'll create a free Supabase project and point `DATABASE_URL` at it.

## §2 Gemini API key
1. Go to https://aistudio.google.com/apikey and sign in with the company Google account.
2. **Create API key** → choose or create a project → copy the key.
3. `.env`: `GEMINI_API_KEY=...`

## §3 Google Cloud service account (lets the app read GA4 + Search Console)
1. https://console.cloud.google.com → create a project, e.g. `renesis-signal-to-lead`
   (you can reuse the Gemini project).
2. **APIs & Services → Library**, enable both:
   - **Google Analytics Data API**
   - **Google Search Console API**
3. **IAM & Admin → Service Accounts → Create service account**, name `stl-reader`. No roles needed. Done.
4. Open it → **Keys → Add key → Create new key → JSON**. A file downloads.
5. Copy the service account's email (looks like `stl-reader@<project>.iam.gserviceaccount.com`). You need it in §4 and §5.
6. `.env`: put the whole JSON on one line in single quotes:
   ```
   GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account", ... }'
   ```
   Don't commit the file. Keep it in a password manager and delete the download.

## §4 Google Analytics 4
**You:**
1. https://analytics.google.com → **Admin → Create → Property**. Name `Renesis JA site`,
   time zone **Japan**, currency **JPY**.
2. **Data streams → Add stream → Web**, enter the site URL. Keep **Enhanced measurement**
   on. It tracks scrolls, outbound clicks, file downloads and form interactions automatically.
3. Copy the **Measurement ID** (`G-XXXXXXX`) and send it to the website developer.
4. **Admin → Property access management → +** → add the service account email from §3 as **Viewer**.
5. **Admin → Property details** → copy the numeric **Property ID** → `.env`: `GA4_PROPERTY_ID=...`

**Website developer (Payload frontend):**
1. Add the GA4 tag to every page. For a Next.js frontend, `@next/third-parties` →
   `<GoogleAnalytics gaId="G-XXXXXXX" />` in the root layout.
2. On every successful form submit, fire:
   ```js
   gtag('event', 'generate_lead', { form_kind: 'inquiry' | 'lead_magnet' | 'newsletter', content_slug: '<slug>' })
   ```
3. Keep `utm_*` query parameters on links. GA4 reads them automatically.

**You, afterwards:** **Admin → Events** → once `generate_lead` appears (up to 24h), toggle
**Mark as key event**.

> Cookie consent: Japan's APPI and the Telecommunications Business Act require disclosing
> the use of analytics cookies. Add a line to the privacy policy covering Google Analytics.

## §5 Google Search Console
1. https://search.google.com/search-console → **Add property → Domain** → enter `renesistech.com`
   (or the JA domain if it's separate).
2. Add the **TXT record** it shows to your DNS, then click **Verify**. DNS can take a few hours.
   A Domain property covers every subdomain and http/https, which URL-prefix properties don't.
3. **Sitemaps** → submit the site's sitemap URL (usually `/sitemap.xml`; ask the developer if Payload doesn't produce one).
4. **Settings → Users and permissions → Add user** → the service account email from §3 → **Restricted**.
5. `.env`: `GSC_SITE_URL=sc-domain:renesistech.com`

Search Console shows history for the domain going back up to 16 months once verified.

## §6 Payload API user (website developer)
What I could already confirm from the public API (renesistech.jp/api, 2026-10-27):
- Collections: `users`, `media`, `categories`, `posts`, `comments`. Blog = `posts`.
- Post fields: `title`, `slug`, `excerpt`, `featuredImage`, `category`, `content` (Lexical),
  `featured`, `status`, `publishedAt`, `seo { metaTitle, metaDescription, ogImage, noIndex }`.
- Anonymous visitors can only read posts with `status = published`, so a post created with
  `status: draft` stays private until someone publishes it.
- Only one category exists: **BlockChain**. Every post has a featured image.

Developer steps:
1. On the `users` collection, enable API keys: `auth: { useAPIKey: true }`.
2. Create a user `signal-to-lead@renesistech.com` whose role can **create and update `posts`
   with status `draft`**, and nothing else: no publishing, no deleting, no user admin.
3. On that user, **Enable API Key** → copy the key → `.env`: `PAYLOAD_API_KEY=...`
4. Create a category for AI content (e.g. `AI・DX`) → put its id in `PAYLOAD_CATEGORY_ID`.
5. Pick a generic Renesis image in Media to use until an editor sets a real one → its id in
   `PAYLOAD_PLACEHOLDER_IMAGE_ID`. Needed if `featuredImage` is a required field.
6. Create a second category **資料ダウンロード** (e.g. slug `resources`) for lead-magnet landing
   pages → its id in `PAYLOAD_RESOURCES_CATEGORY_ID`.
7. Add the download form to posts in that category: see `integrations/website/README.md`
   (one component, one `if` in the post template). There is no form plugin on the site, so the
   component posts straight to Make.com.

## §7 Brevo (sends lead-magnet emails)
1. Sign up at https://www.brevo.com (free plan, ~300 emails/day).
2. **Senders, Domains & Dedicated IPs → Domains → Add domain** → add the DNS records it shows
   (DKIM, DMARC). Without this, emails land in spam, especially with Japanese corporate
   mail filters.
3. **Senders** → add and verify the sender address (e.g. `info@renesistech.jp`) →
   `.env`: `BREVO_SENDER_EMAIL=...`
4. **SMTP & API → API keys → Generate** → `.env`: `BREVO_API_KEY=...`
5. In the app: **Delivery → Set up Brevo**. This creates the contact fields, the
   「資料ダウンロード (Signal-to-Lead)」 list and the Japanese delivery email template, and shows their ids.

## §8 Make.com
1. Sign up at https://www.make.com (free plan).
2. Build the scenario in `docs/MAKE.md` (webhook → filter → Brevo contact → Brevo delivery email).
3. Put the webhook URL in `.env` `MAKE_WEBHOOK_URL`, and give it to the website developer as
   `NEXT_PUBLIC_LEAD_FORM_WEBHOOK`.
4. **Delivery → Send test to Make** so Make learns the fields.

## §9 Supabase + GitHub secrets (turns on the daily schedule)
Until this is done, jobs only run when you press the buttons on the Status page (or
`pnpm job daily`) on your Mac. The schedule in `.github/workflows/jobs.yml` runs every
morning at 06:00 JST and builds the shortlist on Mondays at 06:30 JST. It exits early
until this step is done.

1. https://supabase.com → **New project** (free plan), region **Tokyo (ap-northeast-1)**,
   with a strong database password.
2. **Connect** → **Session pooler** → copy the connection string. Use the pooler, not the
   "Direct connection": GitHub's runners are IPv4-only and Supabase's direct host is IPv6.
3. Apply the schema from your Mac:
   ```bash
   DATABASE_URL='<pooler string>' node scripts/migrate.mjs
   ```
4. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**, add:
   `DATABASE_URL`, `GEMINI_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL`, `GA4_PROPERTY_ID`.
5. **Actions → pipeline-jobs → Run workflow → daily** to test it.
6. To make the app on your Mac show the same data, set `.env` `DATABASE_URL` to the same
   pooler string.

Supabase pauses free projects after 7 days without activity. The daily job keeps it awake.

**PDF hosting (lead magnets):** the same project hosts the PDFs in a public Storage bucket
(`lead-magnets`, created automatically on first upload).
- **Project Settings → API** → copy the **Project URL** → `.env` `SUPABASE_URL`, and the
  **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`. Keep it secret: it bypasses all permissions.
  Only this app on your Mac uses it.
- Download links look like `<SUPABASE_URL>/storage/v1/object/public/lead-magnets/<slug>.pdf`.
  Give that base (shown on the Delivery page) to the website developer as
  `NEXT_PUBLIC_LEAD_MAGNET_BASE_URL`.
