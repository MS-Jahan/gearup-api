#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

load_env_file() {
  local env_file="$1"
  [[ -f "$env_file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local val="${BASH_REMATCH[2]}"
      if [[ "$val" == \"*\" && "$val" == *\" ]]; then
        val="${val:1:${#val}-2}"
      elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
        val="${val:1:${#val}-2}"
      fi
      export "$key=$val"
    fi
  done < "$env_file"
}

if [[ -z "${DIRECT_URL:-}" ]]; then
  load_env_file "$ROOT_DIR/.env"
fi

DIRECT_URL="${DIRECT_URL//$'\r'/}"

if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "DIRECT_URL is not set."
  echo ""
  echo "Run with your Neon direct connection string:"
  echo '  DIRECT_URL="postgresql://..." bash demo/backdate-db.sh'
  exit 1
fi

echo "Backdating demo timestamps in the database (Jul 8–10, 2026)..."
cd "$ROOT_DIR"
DIRECT_URL="$DIRECT_URL" npm run db:backdate-dates
