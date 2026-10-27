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

**Do §4 and §5 first.** Analytics and Search Console only start collecting data once they are
installed, so every day of delay is a day of missing history.

Use a company Google account (not personal) for §2–§5 so access survives staff changes.

---

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
The app creates **drafts only**, so it gets a dedicated, limited user.
1. In the Payload config, make sure the auth collection (usually `users`) has
   `auth: { useAPIKey: true }`.
2. Create a user `signal-to-lead@renesistech.com` with a role that can **create and update
   drafts in the blog/posts collection** and nothing else (no publish, no delete, no user admin).
3. On that user, **Enable API Key** → copy the key.
4. `.env`:
   ```
   PAYLOAD_URL=https://<payload admin host>        # without /admin or /api
   PAYLOAD_API_KEY=...
   PAYLOAD_AUTH_COLLECTION=users
   PAYLOAD_POSTS_COLLECTION=posts                 # the blog collection's slug
   ```
5. Please also answer these for phase 3:
   - Payload version (2.x or 3.x)?
   - Blog collection's fields (title, slug, content, excerpt, meta, category, author…)?
   - Rich-text editor: Lexical or Slate?
   - Is Japanese a **locale** in the same collection, or a separate site/collection?
   - Is `@payloadcms/plugin-form-builder` installed? (Needed for lead-magnet forms in phase 4.)

## §7 Brevo (sends lead-magnet emails)
1. Sign up at https://www.brevo.com (free plan, ~300 emails/day).
2. **Senders, Domains & Dedicated IPs → Domains → Add domain** → add the DNS records it shows
   (DKIM, DMARC). Without this, emails land in spam, especially with Japanese corporate
   mail filters.
3. **SMTP & API → API keys → Generate** → `.env`: `BREVO_API_KEY=...`

## §8 Make.com
1. Sign up at https://www.make.com (free plan). Nothing else yet. In phase 4 we create one
   scenario (form webhook → Brevo contact + download email + alert) and put its webhook URL in
   `MAKE_WEBHOOK_URL`.
