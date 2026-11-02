#!/bin/zsh
# Saves the Tavily API key to .env.production.local (git-ignored) and copies it to Vercel + GitHub
# Actions. Copy the key in the Tavily dashboard first: the script reads it from the clipboard
# (or asks for it, hidden, if the clipboard doesn't hold one). Only key names are printed.
set -e
cd "$(dirname "$0")/.."
KEY="$(pbpaste 2>/dev/null | tr -d '[:space:]')"
if [[ "$KEY" != tvly-* ]]; then
  echo "No Tavily key on the clipboard. Paste it now and press Enter (it will not be shown):"
  read -rs KEY
  echo
  KEY="${KEY//[[:space:]]/}"
fi
if [[ "$KEY" != tvly-* ]]; then echo "✗ That doesn't look like a Tavily key (should start with tvly-). Copy it from app.tavily.com and run this again."; exit 1; fi
echo "✓ Found a Tavily key (tvly-…)"
touch .env.production.local
grep -v '^TAVILY_API_KEY=' .env.production.local > .env.production.local.tmp || true
mv .env.production.local.tmp .env.production.local
printf 'TAVILY_API_KEY=%s\n' "$KEY" >> .env.production.local
unset KEY
printf '' | pbcopy 2>/dev/null || true
echo "✓ Saved locally (git-ignored); clipboard cleared"
./scripts/push-ai-keys.sh
echo "Done. Tell Claude in the chat that the key is in."
