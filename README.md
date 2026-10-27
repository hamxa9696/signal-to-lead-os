# Signal-to-Lead OS

Renesis's automated content + inbound pipeline for the Japanese market, built on free tiers:
signals (Search Console, RSS) → Gemini topic scoring → prompt packs for ChatGPT/Claude →
AI review → Payload drafts → GA4/Search Console/form tracking → back into scoring.

- **What and why:** [docs/SPEC.md](docs/SPEC.md)
- **Accounts to create:** [docs/SETUP.md](docs/SETUP.md)

## Run locally

```bash
cp .env.example .env     # fill in values as you complete docs/SETUP.md
pnpm install
pnpm db:up               # Postgres 16 on localhost:5434 (needs Docker / Colima)
pnpm db:migrate
pnpm dev                 # http://localhost:3003

pnpm job daily           # collect feeds + Search Console, Gemini analysis
pnpm job weekly          # Monday shortlist (add --force to regenerate)
```

Pages: **Status** (connections, run buttons, job log) · **Topics** (weekly shortlist, approve /
reject) · **Topic workspace** (prompt pack → paste draft → checks + Gemini review → Payload draft) ·
**Signals** (collected news with Gemini's scoring) · **Knowledge** (fact sheet, style guide, banned
phrases, review checklist).

## Layout

```
docs/                  spec + setup guide
supabase/migrations/   raw SQL schema (portable to Supabase)
scripts/migrate.mjs    migration runner
src/lib/               env · db · gemini · google (GA4/GSC) · payload · health checks
src/lib/content/       prompt pack · draft parsing · checks · Gemini review · Markdown→Lexical · Payload publish
src/jobs/              collect-feeds · collect-gsc · analyze-signals · weekly-shortlist · CLI runner
src/app/               Next.js App Router — status, topics, signals + /api/health
.github/workflows/     daily + Monday schedule
```

## Status

**Phase 3 — content workflow** done. Payload pushes need the API user from docs/SETUP.md §6.
Next: phase 4 (lead-magnet files, landing pages, form → Brevo email delivery).
