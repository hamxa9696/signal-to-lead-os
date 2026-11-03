# Kizashi (formerly Signal-to-Lead OS) — Spec

Status: **v0.9 · phases 1–6 plus stories, GEO, formats/calendar, forecast, signal index, top stories, Why/Copy/Save, Mark posted · deployed on Vercel + Supabase** · Owner: Renesis marketing · Last updated 2026-11-03

For the problem this solves and the product in plain terms, read [OVERVIEW.md](OVERVIEW.md) first. Sections 1–4f describe the original six phases; **§4g** covers everything built since.

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
| Daily, automatic | GitHub Actions | Collect signals (RSS, Search Console, GA4), score and sort them, group stories, propose breaking stories, forecast, sync Payload + Brevo |
| Daily, ~5 min | You | **Today**: approve/reject breaking stories, see what is due; pick any top story into the plan |
| Monday, automatic | Gemini | AI-search check, shortlist of ~5 articles + 1 lead magnet, content packages (hub + spokes), research |
| Monday, ~15 min | You | Approve / reject topics in the app |
| Tue–Thu | You + ChatGPT/Claude | Copy each **prompt pack** into ChatGPT/Claude, paste the draft back |
| Automatic | Gemini | AI review pass on each draft (pass → Ready, fail → revise) |
| Tue–Thu | You | Push Ready articles to Payload as drafts → publish; post the spokes; **Mark posted** in Kizashi |
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
| App | Next.js 16 + Tailwind | Vercel (Hobby); local dev on port 3003 |
| DB | Postgres — local Docker for dev, **Supabase free** for shared/prod | Raw SQL migrations; Supabase pauses after 7 idle days, daily jobs prevent it |
| Jobs | GitHub Actions cron | ~2,000 free min/month on private repos |
| AI | Gemini API free tier | Analysis, scoring, stories, research, review |
| AI search checks | Tavily free (1,000/month) | Optional: Perplexity, OpenAI, Gemini grounding |
| Drafting | ChatGPT / Claude subscriptions | Manual paste via prompt packs |
| CMS | Payload REST API | Drafts only |
| Email | Brevo free | ~300 emails/day |
| Glue | Make.com free | 1 scenario: form → Brevo (+ alert) |
| Social | Metricool | Scheduling + stats within free limits |

Hosting note: Vercel Hobby is non-commercial only. Moving to Vercel Pro or Cloudflare Pages is an open decision.

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

## 4e. Phase 6 details

`monthly-review` runs on the 2nd of each month (also via "Regenerate now") over the last 28 days:
- **Refresh:** average position 8–20 with ≥ 50 impressions. "Create rewrite task" makes an
  approved topic (`origin = refresh`) whose prompt pack contains the live article (fetched from
  Payload's public API and converted Lexical → Markdown) and its top queries. The rewrite is pasted
  into the live post in the Payload admin; the API user only creates drafts.
- **Expand:** the top 20% of pages by value (sessions + 30 × leads), ≥ 30 sessions, and queries they show up for
  at position > 10 with ≥ 20 impressions that no existing title covers. "Add to next week"
  creates a proposed topic. Pages already flagged for refresh are skipped.
- **Prune:** older than 90 days with ≤ 10 sessions and ≤ 50 impressions. These are merged, rewritten or noindexed in Payload.

## 4f. Hosting

- **Vercel** (Next.js) at https://signal-to-lead-os.vercel.app, behind **Supabase Auth**, limited to `ALLOWED_EMAILS`
  (same `@supabase/ssr` + `src/proxy.ts` pattern as Musubi CRM). Sign-in is email-only: an approved email gets a
  server-minted session, with no password or email round-trip (owner's choice, 2026-10-28). In production the app fails closed if auth isn't configured.
- **Supabase** Postgres (Tokyo) via the **session pooler** (`prepare: false`). The transaction pooler deadlocked the
  dashboard's parallel queries. Storage holds the PDFs. Migrations run with `scripts/migrate.mjs` against the session-pooler URL.
- PDFs render on Vercel with `@sparticuz/chromium` into `/tmp` and upload immediately.
- Scheduled jobs stay on GitHub Actions (daily / Monday / 2nd of month) against the same database.

## 4g. Since phase 6 (Oct 28 – Nov 3, 2026)

### Navigation
Today (`/`) · Trends (`/trends` + Signals, AI search, Signal index, Forecast) · Plan (`/topics` + Calendar) ·
Results (`/performance`, incl. GEO results and **Fix these**, which used to be the Monthly review) · Settings. Old URLs redirect (`next.config.ts`).

### Signals → stories
- `sort` puts each relevant signal into an owner-editable category / sub-category (`/categories`).
- `deepen` reads the full text of strong signals and extracts facts, numbers, implications and reader questions.
- `cluster` has Gemini group articles about the **same event** (not just the same topic) into `stories`. **Story strength 0–100**
  = relevance 35 + coverage 25 + momentum 15 + source weight 15 + evidence 10; each part carries a plain-English note (`src/lib/strength.ts`).
- Google News RSS searches for tracked phrases add coverage beyond the fixed feeds.

### Trends overview (`src/lib/trend-board.ts`)
One row per tracked theme (a niche keyword or a news search phrase), scored news 30 + Google 25 + AI 25 + gap 20, with a
deterministic recommendation and **Add to this week's plan**. Crawler-only phrases (PR TIMES, 提供開始, 資金調達…) are excluded.

### Top stories and story → topic (`src/lib/top-stories.ts`, migration 0028)
- **Top stories:** the strongest stories of the last 3 days in any field, at the top of Trends, as a card on Today, and on each Signals card.
- **Four uses:**

  | Use | Becomes | Note |
  |---|---|---|
  | Fast take | article, `fast_take` slot | 48h deadline |
  | Case study | article, evergreen | |
  | White paper | lead magnet, mini report | |
  | Checklist | lead magnet, checklist | |

- **★ recommended use** by kind of news: incident → fast take; regulation → checklist; survey → white paper; case study → case study; and so on.
- `createStoryTopic({story} | {signal}, use)`:
  - a lone article (not yet grouped) is planned as a single signal;
  - Gemini writes the title and outline, with a deterministic fallback;
  - the topic gets `story_id` and up to 5 linked signals;
  - then `planFormats` builds its content package.
- **"Planned"** means a topic with that `story_id`, or a fast take linked to the story's signals. A topic that only cites the story as
  background is labelled "Cited as background", and the story stays a candidate.
- **`breaking` job (daily, after `cluster`):**
  - proposes a topic in the story's best format for a story from the last 36h with strength ≥ 80, or ≥ 5 outlets at strength ≥ 70;
  - at most 1 a day and 2 a week; skips stories already planned or rejected;
  - shows on Today as a **Decide** task.
- The Monday shortlist's "already ran this week" check reads `job_runs`, so a breaking topic never blocks it. A forced rerun replaces only
  shortlist-proposed topics.

### Why this / Copy package / Save for later (`src/lib/story-why.ts`, migration 0029)
On every story and article (Trends top stories, Signals stories and articles):
- **Why this:** three deterministic sections:
  - *why it's relevant:* Gemini's reason, buyer problem, angle, service and readers, category;
  - *where it's trending:* outlets by tier, momentum (last 24h vs the 48h before), tracked keywords, matching Search Console queries,
    AI buyer questions it answers (2+ keyword hits) and who AI cites today;
  - *why it would perform:* strength notes, best format for its kind of news, hours left in the fast-take window (72h after the latest
    coverage), whether a page of ours already covers it.
- **Copy package:** title, sources with links, key facts, the three why sections and suggested formats, as plain text.
- **Save for later:** `stories.saved_at` / `signals.saved_at`; filter with Signals `?saved=1`, or "★ Saved (N)" on Trends.
- **Add to plan:** the four uses above, from any story or article.
- The older per-article panel is now called "How we found and sorted it" (source and categorisation).

### Content formats and calendar (migrations 0020–0022)
- **Hub and slot:** every topic has one **hub** on renesistech.jp, decided by its **slot**:

  | Slot | Hub |
  |---|---|
  | Evergreen | SEO article |
  | Fast take | short news-take article |
  | Lead magnet | lead magnet + landing page |
  | Rewrite | rewrite of an existing page |

- **Lead-magnet formats:** checklist, calculator, comparison, template, mini report, self-assessment, case collection.
- **Spokes** (Gemini picks them, within rules): X thread, LinkedIn carousel / article / post series, note.com, newsletter, YouTube (monthly).
  Channels can be switched on and off on `/audience`.
- **Scores:** each package is scored on Search, Reach and Lead (0–100), plus effort in hours.
- **Tracked links:** every spoke prompt includes `utm_campaign=kizashi-<topic>`. GA4 visits and leads per channel and format land in `channel_metrics_daily`.
- **Calendar** (`/topics/calendar`):
  - month, 2-week and agenda views; drag-and-drop to move items;
  - filters, a workload line, and a "Needs attention" panel (overdue, today, fast-take deadline under 36h);
  - an ICS feed (`/api/calendar/<token>`).
  Spokes are dated from the hub's date and their timing.

### Mark posted (migration 0030)
- **What can be marked:** the hub and every spoke. Each has **Mark posted**, with an optional link to the live post:
  - hub: `topics.posted_at` / `posted_url`;
  - spoke: `topic_spokes.posted_at` / `post_url`.
- **Effects of marking the hub:**
  - the topic becomes `done`, so it counts as live on Plan, Today and the weekly published count;
  - the hub shows as live on the calendar, dated on the posted day;
  - its spokes become "to post".
- **Undo** returns the topic to `in_progress` (if a draft exists) or `approved`.
- **Where:** the content package's hub row (topic page and Plan), the calendar details panel (spokes can be marked even before the hub is
  live), and Today's Write / Revise / Publish / Post tasks. A hub published through Payload shows "✓ Live on site" instead.
- **Code:** `markPosted` / `savePostLink` in `src/app/topics/spoke-actions.ts`; `PostedToggle` in `src/app/topics/posted-toggle.tsx`.

### GEO: visibility in AI search (`src/lib/geo/`, migrations 0023–0026)
- **Questions:** a weekly set of ~32 Japanese buyer questions in 4 topic clusters, ~70% carried over so trends compare.
- **Engines:** Tavily (free, 1,000 requests/month) is on by default. Perplexity, OpenAI and Gemini grounding switch on with their keys.
  The manual check (ask ChatGPT, Gemini and Copilot, then mark who they cite) is a weekly task.
- **Per answer:** citation prominence (primary / supporting / reference), sentiment, competitors named, and whether LinkedIn is a source.
- **Readiness:** deterministic checks of our best page per question, plus its Search Console position.
- **Measurement in three layers:**
  - leading indicators: AI-assistant visits, LinkedIn posting and engagement, new pages;
  - outcomes: citations, share of voice, rank, sentiment, judged on **4-week windows**;
  - diagnostics: the outcomes split by cluster, intent, engine, format and author.
- **Experts:** named Renesis authors; every piece is written in, and published under, one expert's name, with citability rules for LinkedIn.

### Research (`research` job)
Google News RSS (no key) plus our deep-read signals give numbered sources. Gemini summarises only from them and suggests keywords.
Gemini's own Search grounding is off unless `GEMINI_GROUNDING=on`.

### Trend forecast (`forecast` job, daily)
Share-of-voice statistics and early-warning sources forecast which terms will get more coverage in the next 7 days. Gemini only spots new
terms and dated upcoming events. Each forecast is stored and later scored against the real signals.

### Monthly signal index (`signal-index` job, 2nd of the month)
Original data on what moved in Japan's AI, blockchain, cloud, software and QA news, computed only from our own signals, with no AI-made
numbers. It creates a report topic with a data brief, because original research is what AI search cites most.

## 5. Data model (summary — see `supabase/migrations`)

Core: `services`, `icps`, `knowledge_docs`, `sources`, `signals`, `search_queries_daily`, `topics`,
`topic_signals`, `briefs`, `content_items`, `content_versions`, `publications`,
`metrics_daily`, `form_submissions`, `job_runs`.

Added since (§4g): `stories` (+ `signals.story_id`, `saved_at` on both), `categories` / `subcategories`,
`site_pages`, `topic_spokes` (per-channel planned date, posted_at, post_url, LinkedIn numbers),
`channel_metrics_daily`, forecasts, `geo_questions` / `geo_checks` and related GEO tables, experts,
signal-index tables, settings. `topics` gained `slot`, `format_plan`, `format_scores`, `deadline`,
`planned_date`, `research`, `keyword_plan`, `story_id`, `posted_at`, `posted_url`.

## 6. Phases

| # | Phase | Usable result |
|---|---|---|
| 1 ✅ | **Foundations** — repo, schema, connection health page, account setup guide | All accounts connected, health page green |
| 2 ✅ | Signals + weekly shortlist — RSS + GSC collectors, Gemini scoring, approve screen | A ranked topic list every Monday |
| 3 ✅ | Content workflow — prompt packs, draft intake, Gemini review, Payload draft push, social copy + UTMs | Articles flow from topic to Payload draft |
| 4 ✅ | Lead-magnet pipeline — landing template, Payload form, Make → Brevo delivery | Downloads deliver by email; contacts stored |
| 5 ✅ | Performance — GA4/GSC/forms daily pull, per-piece dashboard, scoring feedback | See traffic + form fills per piece |
| 6 ✅ | Monthly review — refresh / expand / prune recommendations | Monthly action list |
| 7 ✅ | Stories, categories, deep reads, research | News grouped into scored stories; topics researched with cited sources |
| 8 ✅ | Content formats + calendar | Hub + spokes per topic, tracked links, calendar with Mark posted |
| 9 ✅ | GEO (AI search), experts, forecast, signal index | AI citations tracked; monthly original data; next-week forecast |
| 10 ✅ | Today / Trends / Plan / Results, top stories, breaking stories, Why / Copy / Save | Any story can become a planned piece in one click, with its reasons |

## 7. Open questions
1. **Payload**: version (2 or 3), posts collection slug + fields, rich-text editor (Lexical?),
   Japanese localization setup, whether the form-builder plugin is installed.
   → Needed before phase 3. Markdown → Lexical conversion is the main technical risk.
2. Which Japanese domain/path is the target site (e.g. `renesistech.com/ja/` or a `.jp`)?
3. Native spot-check budget per month.
4. Brand assets for lead magnets (template, logo, colours).
