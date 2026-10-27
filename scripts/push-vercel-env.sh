#!/bin/zsh
# Copies the app's production settings into the linked Vercel project (production environment).
# Reads values from .env (Gemini key) and .env.production.local (Supabase); prints names only, never values.
set -e
cd "$(dirname "$0")/.."

get() { grep -m1 "^$1=" "$2" | cut -d= -f2- | sed "s/^'//; s/'$//"; }

typeset -A V
V[DATABASE_URL]=$(get DATABASE_URL .env.production.local)
V[NEXT_PUBLIC_SUPABASE_URL]=$(get NEXT_PUBLIC_SUPABASE_URL .env.production.local)
V[NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY]=$(get NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY .env.production.local)
V[SUPABASE_URL]=$(get SUPABASE_URL .env.production.local)
V[SUPABASE_SERVICE_ROLE_KEY]=$(get SUPABASE_SERVICE_ROLE_KEY .env.production.local)
V[GEMINI_API_KEY]=$(get GEMINI_API_KEY .env)
V[GEMINI_MODEL]=gemini-3.5-flash
V[ALLOWED_EMAILS]=muhammadhamza9696@gmail.com,afrazahmad@renesistech.com
V[PAYLOAD_URL]=https://renesistech.jp
V[PAYLOAD_AUTH_COLLECTION]=users
V[PAYLOAD_POSTS_COLLECTION]=posts
V[BREVO_SENDER_NAME]="Renesis Tech"

for k in ${(k)V}; do
  if [[ -n "${V[$k]}" ]]; then
    printf '%s' "${V[$k]}" | vercel env add "$k" production --force >/dev/null 2>&1 && echo "✓ $k" || echo "✗ $k (failed)"
  else
    echo "· $k (no value, skipped)"
  fi
done
echo "Done. Vercel production settings:"
vercel env ls production 2>/dev/null | grep -E "^ +[A-Z_]+" | awk '{print "  " $1}'
