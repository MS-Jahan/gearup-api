#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -z "${DIRECT_URL:-}" ]]; then
  if [[ -f "$ROOT_DIR/.env" ]]; then
    # shellcheck disable=SC1090
    source "$ROOT_DIR/.env"
  fi
fi

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
