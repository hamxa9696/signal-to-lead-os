# Renesis Signal-to-Lead OS — Spec

Status: **v0.5, phase 5 (performance feedback)** · Owner: Renesis marketing · Last updated 2026-10-27

## 1. Goal

Drive traffic to the Renesis Japanese website through content, and turn that traffic into
email addresses, form fills and inquiries. Automate everything that free tiers allow.

Success metrics (in order):
1. Organic + referral **sessions** to the Japanese site
2. **Emails captured** (lead-magnet downloads, newsletter sign-ups)
3. **Form fills / inquiries**

Lead qualification is out of scope for now. We still record which page and campaign each
form fill came from, so quality can be judged later.

## 2. Weekly rhythm

| When | Who | What |
|---|---|---|
| Daily, automatic | GitHub Actions | Collect signals (RSS, Search Console), pull metrics (GA4, GSC, Payload forms) |
| Monday, automatic | Gemini | Score signals → shortlist of ~5 article topics + 1 lead-magnet concept |
| Monday, ~15 min | You | Approve / reject topics in the app |
| Tue–Thu | You + ChatGPT/Claude | Copy each **prompt pack** into ChatGPT/Claude, paste the draft back |
| Automatic | Gemini | AI review pass on each draft (pass → Ready, fail → revise) |
| Tue–Thu | You | Push Ready articles to Payload as drafts → publish; post social copy (Metricool / manual) |
| Monthly | App | Review page: pages ranking 8–20 to refresh, winners to expand, dead pages to cut |

Minimum output: **1 lead magnet per week**, 2–3 articles per week.

## 3. Pipeline

```
sources ─► signals ─► topics (scored, approved) ─► briefs + prompt packs
                                                        │  (ChatGPT / Claude, manual paste)
                                                        ▼
            metrics_daily ◄── publications ◄── content_items ◄── content_versions (+ AI review)
                  │
                  └──────────► feeds back into next week's topic scoring
form_submissions (Payload forms) ─► linked to page + UTM ─► dashboard
```

### 3.1 Signal collection (automated)
- **Google Search Console API** — queries, pages, clicks, impressions, position (daily, 3-day lag).
- **RSS feeds** — Japanese industry/tech news, PR TIMES categories, competitor blogs. Polite,
  stable and permitted; no scraping of pages that forbid it.
- **Competitor sitemaps** — new URLs/titles only (to spot topics competitors are covering).
- **Google autocomplete / Trends** — optional, unofficial endpoints; best-effort only.
- Configured in the `sources` table; adding a feed is a row, not code.

### 3.2 Gemini analysis (automated, free tier)
- Model: `gemini-3.5-flash` (configurable). Batched once per day / week to respect free limits.
- For each new signal: tag ICP + service, extract buyer problem, score.
- **Topic score** = search demand (GSC impressions / keyword evidence) + service fit + freshness
  + past performance of similar topics. Breakdown stored in `topics.score_breakdown`.
- Output: weekly shortlist (`topics.status = proposed`) with JA title, primary + secondary
  keywords, search intent, outline, CTA, and for lead magnets a **format** from the rotation:
  checklist · cost calculator · comparison sheet · template · mini-report.
- **Never send client or CRM personal data to Gemini free tier** (Google may use free-tier
  inputs to improve products).

### 3.3 Prompt packs (semi-automated)
For each approved topic the app builds a ready-to-paste prompt containing:
brief + keywords + outline · Renesis **fact sheet** (pricing ranges, process, team, anonymised
cases) · Japanese **style guide** (desu/masu, terminology, banned AI-sounding phrases) ·
output format (Markdown with frontmatter). Stored in `briefs.prompt_pack`.

### 3.4 Quality without a human reviewer
No native reviewer is assigned. Mitigations, in order of impact:
1. Fact sheet + style guide in every prompt (the `knowledge_docs` table).
2. **Cross-model review**: draft by Claude/ChatGPT, review by Gemini against a checklist
   (naturalness, keigo consistency, unsupported claims, filler/repetition, keyword coverage,
   banned phrases). Result stored in `content_versions.review`; fail → `needs_revision`.
3. Paid native spot-check (Coconala / Lancers) on the first 5–10 pieces, then ~1 in 5, and
   always the lead magnets. Corrections are folded back into the style guide.
4. No "AI humanizer" tools.

### 3.5 Publishing
- **Website = Payload CMS.** App pushes approved articles via the Payload REST API as
  **drafts** (`_status: draft`); a person clicks publish. Open questions in §7.
- **Social**: app generates post copy + UTM links per channel. Scheduling via Metricool where
  the free plan allows; Note.com is manual (no API).
- **UTM convention**: `utm_source` = linkedin | x | note | qiita | zenn | newsletter ·
  `utm_medium` = social | email | referral · `utm_campaign` = content slug ·
  `utm_content` = variant (optional).

### 3.6 Lead magnets → emails
renesistech.jp has no form plugin, and its only content collection is `posts`, so:
- **PDF:** the approved magnet Markdown is rendered to a branded A4 PDF by local Chrome
  (cover, content, CTA page; checklists get checkboxes) and uploaded to a public Supabase
  Storage bucket. URL = `<base>/<slug>.pdf`, so it can be derived from the slug.
- **Landing page:** a Payload post (draft) in the 資料ダウンロード category, built from the
  magnet's `landing_lead` / `landing_bullets` / `landing_for` frontmatter plus its section list.
- **Form:** `integrations/website/LeadMagnetForm.tsx`, rendered by the site under posts in
  that category. It POSTs JSON to a Make.com webhook (honeypot, consent, first-touch UTMs, GA4 `generate_lead`).
- **Make (3 ops/download):** filter → Brevo upsert contact (list + attributes) → Brevo
  transactional template (params: name, title, download_url; tag: slug). See `docs/MAKE.md`.
- **Back into the app:** the daily `sync-brevo` job reads the template's "request" events
  (one per download) plus contact attributes into `form_submissions`.
- APPI: the form shows purpose and a consent checkbox, `CONSENT_AT` is stored in Brevo, and the
  privacy policy must name Make and Brevo as processors.

### 3.7 Performance tracking (automated where APIs exist)
| Source | Method |
|---|---|
| GA4 | Data API (service account): sessions, users, engagement, key events per page + UTM |
| Search Console | API: clicks, impressions, CTR, position per page + query |
| Forms | Payload API → `form_submissions` |
| LinkedIn / X | Metricool analytics (plan limits) |
| Note.com | Manual monthly entry |

## 4. Stack (free tier)

| Part | Choice | Notes |
|---|---|---|
| App | Next.js 16 + Tailwind | Runs locally (port 3003) for now |
| DB | Postgres — local Docker for dev, **Supabase free** for shared/prod | Raw SQL migrations; Supabase pauses after 7 idle days, daily jobs prevent it |
| Jobs | GitHub Actions cron | ~2,000 free min/month on private repos |
| AI | Gemini API free tier | Analysis, scoring, review |
| Drafting | ChatGPT / Claude subscriptions | Manual paste via prompt packs |
| CMS | Payload REST API | Drafts only |
| Email | Brevo free | ~300 emails/day |
| Glue | Make.com free | 1 scenario: form → Brevo (+ alert) |
| Social | Metricool | Scheduling + stats within free limits |

Hosting note: Vercel Hobby is non-commercial only; if the UI needs hosting use Cloudflare Pages.

## 4b. Phase 2 details

**Jobs** (`pnpm job <name>`, also buttons on the Status page and scheduled in GitHub Actions):
| Job | What it does | Needs |
|---|---|---|
| `collect-feeds` | 8 Japanese IT/enterprise RSS feeds → `signals` (items ≤ 21 days old); renesistech.jp sitemap → `site_pages` | nothing |
| `collect-gsc` | Search Console date×page×query → `search_queries_daily` (90-day backfill, then a rolling 10-day refresh) | §3, §5 |
| `analyze` | Gemini scores new signals in batches of 40: relevance, service, buyer problem, angle. Below 0.35 → ignored | §2 |
| `shortlist` | Monday: 5 articles + 1 lead magnet from the strongest signals, Search Console queries at positions 3–40, minus existing content | §2 |
| `daily` / `weekly` | collect-feeds + collect-gsc + analyze / shortlist | |

**Topic score (0–100)** is computed in code, not by the model, so the ranking can be explained:
- Demand 40: Search Console impressions (28 days) for queries that overlap the keyword, log-scaled (1,000 impressions = full marks). With no Search Console data, Gemini's estimate is used, capped at 20.
- Fit 30: Gemini's 0–10 rating of how directly the topic leads to a Renesis service.
- Freshness 20: age of the newest linked news item; evergreen topics with no news get 10.
- Performance 10: how past pieces for the same service (and, for lead magnets, the same format) did versus the average piece; see 4d.

**Content rules in the prompt:** at least 3 evergreen buyer-intent topics a week, at most 2
news-driven ones, and at most 1 blockchain topic (the existing blog is almost all
blockchain, while the main business is AI). Lead-magnet formats rotate
(checklist → calculator → comparison → template → mini-report) without repeats within 4 weeks.

## 4c. Phase 3 details

Workspace per topic (`/topics/<id>`), four steps:
1. **Prompt pack:** deterministic template (no AI call) with the assignment, outline, internal
   links, background sources, output contract (YAML frontmatter + Markdown), the style guide,
   banned phrases and fact sheet. Lead magnets get a format-specific spec.
2. **Paste draft:** every paste becomes a new `content_versions` row (v1, v2, …).
3. **Review:** automatic checks (frontmatter, length, H2 count, CMS-safe Markdown, keyword in title
   and intro, banned phrases, unresolved `[要確認]`, Renesis link), plus a Gemini editor review
   that scores each checklist item 1–5 and lists issues with quotes and fixes.
   Passes when there are no blocking check failures, the overall score is ≥ 75, there are no high-severity
   issues, and every checklist item scores ≥ 3. Otherwise you get a revision prompt to paste back
   into the same chat. You can also accept a draft manually.
4. **Payload:** Markdown → Lexical (same node shapes as existing posts, title as H1), then POST/PATCH
   `/api/posts` with `status: draft`. Slug clashes and already-published posts are refused.
   The daily `sync-publications` job marks the item published once an editor publishes it.

Knowledge docs are editable at `/knowledge`.

## 4d. Phase 5 details

**Collection (daily):** `collect-ga4` stores, per day: page × (sessions, users, views, engaged sessions,
engagement time, key events), the same split by session source/medium, `generate_lead` events per page, and
site-wide totals (`page_path = '*'`, since adding up per-page sessions double-counts). It backfills
90 days, then refreshes the last 7 (GA4 is still processing those). Search Console is already
collected (phase 2).

**Per piece:** GA4 paths and Search Console URLs are normalised (origin, trailing slash and encoding
removed) and joined to `publications.page_path`. The Performance page lists our pieces, or all blog
pages, with sessions (and change), engaged %, leads (GA4 form fills + Brevo downloads), clicks, impressions and
impression-weighted position; positions 8–20 are highlighted as refresh candidates. Each live
piece's workspace shows its top queries and traffic sources. Periods end at the latest day with
data, not today, so reporting lag doesn't look like a drop.

**Feedback into scoring:**
- Pieces count once live for at least 7 days. Each is measured over its first 90 days as sessions/day and
  leads/day, so old and new pieces compare fairly.
- value = sessions/day + 30 × leads/day. A topic's performance points = 5 × (similar pieces' value ÷
  average piece's value), from 0 to 10. "Similar" = same service, and for lead magnets also the same format.
- At least 2 similar pieces are needed; otherwise the topic gets a neutral 5, with the reason stored in
  `score_breakdown.performance_note`.
- The shortlist prompt also gets a "what worked (last 28 days)" list of the best pages, so
  Gemini proposes more of what earns traffic and leads.

## 5. Data model (summary — see `supabase/migrations`)

`services`, `icps`, `knowledge_docs`, `sources`, `signals`, `search_queries_daily`, `topics`,
`topic_signals`, `briefs`, `content_items`, `content_versions`, `publications`,
`metrics_daily`, `form_submissions`, `job_runs`.

## 6. Phases

| # | Phase | Usable result |
|---|---|---|
| 1 ✅ | **Foundations** — repo, schema, connection health page, account setup guide | All accounts connected, health page green |
| 2 ✅ | Signals + weekly shortlist — RSS + GSC collectors, Gemini scoring, approve screen | A ranked topic list every Monday |
| 3 ✅ | Content workflow — prompt packs, draft intake, Gemini review, Payload draft push, social copy + UTMs | Articles flow from topic to Payload draft |
| 4 ✅ | Lead-magnet pipeline — landing template, Payload form, Make → Brevo delivery | Downloads deliver by email; contacts stored |
| 5 ✅ | Performance — GA4/GSC/forms daily pull, per-piece dashboard, scoring feedback | See traffic + form fills per piece |
| 6 | Monthly review — refresh / expand / prune recommendations | Monthly action list |

## 7. Open questions
1. **Payload**: version (2 or 3), posts collection slug + fields, rich-text editor (Lexical?),
   Japanese localization setup, whether the form-builder plugin is installed.
   → Needed before phase 3. Markdown → Lexical conversion is the main technical risk.
2. Which Japanese domain/path is the target site (e.g. `renesistech.com/ja/` or a `.jp`)?
3. Native spot-check budget per month.
4. Brand assets for lead magnets (template, logo, colours).
