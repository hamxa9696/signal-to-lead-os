#!/bin/zsh
# Copies the Google service-account key + GA4 property (and Search Console site, once verified)
# from .env.production.local into Vercel (production) and GitHub Actions. Prints names only.
set -e
cd "$(dirname "$0")/.."

get() { grep -m1 "^$1=" .env.production.local | cut -d= -f2- | sed "s/^'//; s/'$//"; }

for k in GOOGLE_SERVICE_ACCOUNT_JSON GA4_PROPERTY_ID GSC_SITE_URL; do
  v="$(get $k)"
  if [[ -z "$v" ]]; then echo "· $k (not set yet, skipped)"; continue; fi
  printf '%s' "$v" | vercel env add "$k" production --force >/dev/null 2>&1 && echo "✓ Vercel  $k" || echo "✗ Vercel  $k"
  printf '%s' "$v" | gh secret set "$k" >/dev/null 2>&1 && echo "✓ GitHub  $k" || echo "✗ GitHub  $k"
done
