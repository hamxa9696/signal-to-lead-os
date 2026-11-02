#!/bin/zsh
# Copies AI-search engine keys from .env.production.local into Vercel (production) and GitHub
# Actions. Add any of these lines to .env.production.local first, then run this. Prints names only.
#   TAVILY_API_KEY=...        (free tier)
#   PERPLEXITY_API_KEY=...
#   OPENAI_API_KEY=...
#   GEMINI_GROUNDING=on       (after enabling billing on the Gemini key)
set -e
cd "$(dirname "$0")/.."
get() { grep -m1 "^$1=" .env.production.local | cut -d= -f2- | sed "s/^'//; s/'$//"; }
for k in TAVILY_API_KEY PERPLEXITY_API_KEY OPENAI_API_KEY GEMINI_GROUNDING; do
  v="$(get $k)"
  if [[ -z "$v" ]]; then echo "· $k (not set, skipped)"; continue; fi
  printf '%s' "$v" | vercel env add "$k" production --force >/dev/null 2>&1 && echo "✓ Vercel  $k" || echo "✗ Vercel  $k"
  printf '%s' "$v" | gh secret set "$k" >/dev/null 2>&1 && echo "✓ GitHub  $k" || echo "✗ GitHub  $k"
done
echo "Redeploy so the app sees new keys: vercel deploy --prod --yes"
