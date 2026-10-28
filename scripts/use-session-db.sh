#!/bin/zsh
# Points the live app at Supabase's session pooler (port 5432). The transaction pooler (6543)
# deadlocks when the app runs several queries at once over one connection. Prints names only.
set -e
cd "$(dirname "$0")/.."
v="$(grep -m1 '^DATABASE_URL_SESSION=' .env.production.local | cut -d= -f2-)"
printf '%s' "$v" | vercel env add DATABASE_URL production --force >/dev/null 2>&1 && echo "✓ Vercel DATABASE_URL → session pooler"
vercel deploy --prod --yes 2>&1 | grep -E '"status"|Production URL' | head -2
