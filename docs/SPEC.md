# Renesis Signal-to-Lead OS — Spec

Status: **v0.2, phase 2 (signals + weekly shortlist)** · Owner: Renesis marketing · Last updated 2026-10-27

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
Landing page (Payload) → form (Payload form-builder) → submission stored in Payload →
Make.com scenario (webhook) → Brevo: add contact to list + send download email.
Daily job also pulls Payload submissions into `form_submissions` (no Make ops spent).
APPI: every form shows purpose of use and a consent checkbox; consent is stored.

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
- Performance 10: zero until phase 5 measures similar past content.

**Content rules in the prompt:** at least 3 evergreen buyer-intent topics a week, at most 2
news-driven ones, and at most 1 blockchain topic (the existing blog is almost all
blockchain, while the main business is AI). Lead-magnet formats rotate
(checklist → calculator → comparison → template → mini-report) without repeats within 4 weeks.

## 5. Data model (summary — see `supabase/migrations`)

`services`, `icps`, `knowledge_docs`, `sources`, `signals`, `search_queries_daily`, `topics`,
`topic_signals`, `briefs`, `content_items`, `content_versions`, `publications`,
`metrics_daily`, `form_submissions`, `job_runs`.

## 6. Phases

| # | Phase | Usable result |
|---|---|---|
| 1 ✅ | **Foundations** — repo, schema, connection health page, account setup guide | All accounts connected, health page green |
| 2 ✅ | Signals + weekly shortlist — RSS + GSC collectors, Gemini scoring, approve screen | A ranked topic list every Monday |
| 3 | Content workflow — prompt packs, draft intake, Gemini review, Payload draft push, social copy + UTMs | Articles flow from topic to Payload draft |
| 4 | Lead-magnet pipeline — landing template, Payload form, Make → Brevo delivery | Downloads deliver by email; contacts stored |
| 5 | Performance — GA4/GSC/forms daily pull, per-piece dashboard, scoring feedback | See traffic + form fills per piece |
| 6 | Monthly review — refresh / expand / prune recommendations | Monthly action list |

## 7. Open questions
1. **Payload**: version (2 or 3), posts collection slug + fields, rich-text editor (Lexical?),
   Japanese localization setup, whether the form-builder plugin is installed.
   → Needed before phase 3. Markdown → Lexical conversion is the main technical risk.
2. Which Japanese domain/path is the target site (e.g. `renesistech.com/ja/` or a `.jp`)?
3. Native spot-check budget per month.
4. Brand assets for lead magnets (template, logo, colours).
