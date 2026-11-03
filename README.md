# Kizashi (兆し)

Renesis Tech's content-to-leads system for the Japanese market. Kizashi watches Japanese news, Google
searches and AI assistants, decides what is worth writing about and why, plans each piece as a website
hub plus social spokes, prepares the writing prompts and reviews the drafts, then measures which pieces
brought visitors, emails and inquiries to **renesistech.jp**, and feeds that back into next week's plan.

**The problem:** Japanese B2B buyers research vendors on news sites, Google and AI assistants before
they contact anyone. Renesis had almost no Japanese content that answered their questions, no way to
capture emails, no time to follow fast-moving news, no native Japanese editor, and no way to tell what
worked.

**The solution:** an automated loop (listen → decide → plan → write → publish & post → measure) on
free tiers, where machines collect, score, research and check, and a person decides, writes with
ready-made prompts and clicks publish.

- **The problem and how Kizashi solves it:** [docs/OVERVIEW.md](docs/OVERVIEW.md)
- **How each part works:** [docs/SPEC.md](docs/SPEC.md)
- **Accounts and keys to set up:** [docs/SETUP.md](docs/SETUP.md) · Make scenario: [docs/MAKE.md](docs/MAKE.md)

Live: https://signal-to-lead-os.vercel.app (sign-in limited to `ALLOWED_EMAILS`).

## Pages

| Page | What it is for |
|---|---|
| **Today** (`/`) | Top stories now, this week's plan at a glance, recent results, and only the tasks that need you, each with **Mark posted** where it applies |
| **Trends** (`/trends`) | Top stories from the last 3 days, each with Copy package, Save for later, Add to plan and **Why this**; tracked themes through 4 lenses (news, Google, AI questions, forecast) |
| · Signals (`/trends/signals`) | Every story and article with its strength, Why this, Copy, Save and Add to plan; `?saved=1` shows saved items |
| · AI search (`/trends/ai-search`) | This week's buyer questions, who AI assistants cite, our pages' readiness, the manual AI check |
| · Signal index (`/trends/signal-index`) | Monthly original-data report on Japanese tech news |
| · Forecast (`/trends/forecast`) | Terms likely to rise next week, and how past forecasts did |
| **Plan** (`/topics`) | The weekly topics: approve or reject, content package (hub + spokes), prompts, Mark posted |
| · Topic workspace (`/topics/<id>`) | Research → prompt pack → paste draft → checks and Gemini review → Payload draft → results |
| · Calendar (`/topics/calendar`) | Month, 2-week and agenda views, drag-and-drop, details panel with prompts and Mark posted, ICS feed |
| **Results** (`/performance`) | Traffic, leads, Search Console and AI-search results per piece and channel; **Fix these** (refresh / expand / prune) |
| **Settings** | Audience & experts, categories, sources, knowledge (fact sheet, style guide, banned phrases), status and job log |

## Run locally

```bash
cp .env.example .env     # fill in values as you complete docs/SETUP.md
pnpm install
pnpm db:up               # Postgres 16 on localhost:5434 (Docker / Colima)
pnpm db:migrate
pnpm dev                 # http://localhost:3003
```

Jobs run with `pnpm job <name>`, from the Status page, or on GitHub Actions (`gh workflow run jobs.yml -f job=<name>`):

| Group | When | Jobs |
|---|---|---|
| `daily` | 06:00 JST | collect-feeds · collect-gsc · collect-ga4 · analyze · sort · deepen · cluster (stories) · breaking · forecast · sync-publications · sync-brevo |
| `weekly` | Monday 06:30 JST | geo (AI-search check) · shortlist · formats (hub + spokes) · research · monthly-review ("Fix these") |
| `monthly` | 2nd, 08:00 JST | monthly-review · signal-index |

Add `--force` to regenerate a weekly or monthly result.

Migrations are plain SQL in `supabase/migrations/` and run with `pnpm db:migrate`. For production,
run the same script with the session-pooler URL from `.env.production.local`.

## Layout

```
docs/                  overview (problem + solution), spec, setup guide, Make scenario
supabase/migrations/   raw SQL schema, 0001–0030
scripts/               migration runner, env / secret push helpers
src/lib/               env · db · gemini · google (GA4/GSC) · payload · brevo · health
  top-stories.ts       top stories, story → topic (fast take / case study / white paper / checklist)
  story-why.ts         "Why this" and the copyable package for any story or article
  strength.ts          story strength 0–100 with explanations
  trend-board.ts       Trends overview (themes × news / Google / AI / forecast)
  formats.ts …         slots, hubs, lead-magnet formats, channels; format-plan, calendar, schedule
  geo/                 AI-search questions, engine checks, readiness, citation analysis, measurement
  content/             prompt pack, draft parsing, checks, Gemini review, Markdown↔Lexical, Payload publish
  magnet/              PDF rendering, Supabase Storage upload
  performance.ts       per-piece and per-service results, scoring feedback
src/jobs/              every scheduled job + registry + CLI runner
src/app/               Next.js App Router pages and server actions
integrations/website/  lead-magnet download form for renesistech.jp
.github/workflows/     jobs.yml: daily, Monday, monthly + manual runs
```

## Status (2026-11-03)

Built and deployed: all six original phases, plus stories and story strength, the Trends overview, AI-search
(GEO) tracking, content packages and the calendar, trend forecast, monthly signal index, top stories
with one-click planning, breaking-story proposals, Why this / Copy / Save on every story and article, and Mark posted.

Still waiting on setup outside the app (see [docs/SETUP.md](docs/SETUP.md)):
- Search Console verification meta tag on renesistech.jp;
- Payload API user and 2 categories;
- Brevo sender;
- Make scenario;
- the download form on the website.
