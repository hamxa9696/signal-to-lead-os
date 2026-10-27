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
reject) · **Signals** (collected news with Gemini's scoring).

## Layout

```
docs/                  spec + setup guide
supabase/migrations/   raw SQL schema (portable to Supabase)
scripts/migrate.mjs    migration runner
src/lib/               env · db · gemini · google (GA4/GSC) · payload · health checks
src/jobs/              collect-feeds · collect-gsc · analyze-signals · weekly-shortlist · CLI runner
src/app/               Next.js App Router — status, topics, signals + /api/health
.github/workflows/     daily + Monday schedule
```

## Status

**Phase 2 — signals + weekly shortlist** done. Next: phase 3 (prompt packs, draft intake, Gemini review, Payload drafts).
