#!/usr/bin/env bash
# check-env.sh — validates .env.local BEFORE running the loop.
# Usage: bash setup/check-env.sh
# Exits 0 = all real, 1 = placeholders/missing (prints exactly what to fix).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env.local missing. Copy .env.local.example → .env.local and fill values."
  exit 1
fi

is_placeholder() {
  case "$1" in
    *'<project>'*|'eyJ...'|'...'|''|*'YOUR_'*|*'<your-'*) return 0 ;;
    *) return 1 ;;
  esac
}

ok=1
while IFS='=' read -r k v; do
  [ -z "$k" ] && continue
  v="${v%%[[:space:]]*}"
  case "$k" in
    NEXT_PUBLIC_SUPABASE_URL)
      if is_placeholder "$v" || ! [[ "$v" =~ ^https://[a-z0-9]+\.supabase\.co$ ]]; then
        echo "❌ NEXT_PUBLIC_SUPABASE_URL — must be https://<project>.supabase.co (real project, no quotes)"
        ok=0
      else
        echo "✅ NEXT_PUBLIC_SUPABASE_URL"
      fi ;;
    NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|INNGEST_EVENT_KEY|INNGEST_SIGNING_KEY)
      if is_placeholder "$v" || [ ${#v} -lt 20 ]; then
        echo "❌ $k — placeholder or too short (need real key, no quotes)"
        ok=0
      else
        echo "✅ $k"
      fi ;;
  esac
done < "$ENV_FILE"

[ "$ok" = "1" ] && echo "✅ env OK — ready to run: bash run-build.sh" && exit 0
echo "❌ env NOT ready — fill the ❌ lines above, then re-run this check."
exit 1
