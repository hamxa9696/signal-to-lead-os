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
**Signals** (collected news with Gemini's scoring) · **Performance** (traffic, search, leads per
piece; what the scoring learns) · **Monthly review** (refresh / expand /
prune) · **Delivery** (Brevo setup, Make test, downloads) · **Knowledge** (fact sheet, style guide, banned
phrases, review checklist).

## Layout

```
docs/                  spec + setup guide
supabase/migrations/   raw SQL schema (portable to Supabase)
scripts/migrate.mjs    migration runner
src/lib/               env · db · gemini · google (GA4/GSC) · payload · health checks
src/lib/content/       prompt pack · draft parsing · checks · Gemini review · Markdown→Lexical · Payload publish
src/lib/magnet/        PDF rendering (local Chrome) · Supabase Storage upload
src/lib/brevo.ts       list, attributes, delivery template, delivery events
src/lib/performance.ts per-piece + per-service performance, scoring feedback
integrations/website/  download form component for renesistech.jp
src/jobs/              collect-feeds · collect-gsc · analyze-signals · weekly-shortlist · CLI runner
src/app/               Next.js App Router — status, topics, signals + /api/health
.github/workflows/     daily + Monday schedule
```

## Status

**Phase 4 — lead-magnet delivery** done (PDF → public link → landing draft → form → Make → Brevo → sync).
Going live needs: Payload API user + 2 categories (§6), Brevo sender (§7), Make scenario (§8, docs/MAKE.md),
Supabase (§9), and the form component on the website (integrations/website).
**Phase 5 — performance feedback** done (GA4 + Search Console per piece → performance points in the weekly score).
**Phase 6 — monthly review** done. All six phases are built. Hosted on Vercel behind Supabase login.
