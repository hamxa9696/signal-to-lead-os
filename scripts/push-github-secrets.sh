#!/bin/zsh
# Sets the GitHub Actions secrets the scheduled jobs need (.github/workflows/jobs.yml).
# Reads values from .env.production.local and .env; prints names only, never values.
set -e
cd "$(dirname "$0")/.."

get() { grep -m1 "^$1=" "$2" | cut -d= -f2- | sed "s/^'//; s/'$//"; }

# Jobs run for minutes, so they use the session pooler (5432) rather than the transaction pooler.
get DATABASE_URL_SESSION .env.production.local | gh secret set DATABASE_URL && echo "✓ DATABASE_URL"
get GEMINI_API_KEY .env | gh secret set GEMINI_API_KEY && echo "✓ GEMINI_API_KEY"

echo "Done. Repository secrets:"
gh secret list | awk '{print "  " $1}'
