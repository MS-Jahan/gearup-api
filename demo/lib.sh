#!/usr/bin/env bash
# Shared helpers for GearUp API video demo scripts.

BASE_URL="${BASE_URL:-https://gearup-api.vercel.app}"
DEMO_STATE_FILE="${DEMO_STATE_FILE:-$(dirname "$0")/.demo-state.env}"
CURRENT_ROLE="${CURRENT_ROLE:-}"

# Colors (disabled if not a tty)
if [[ -t 1 ]]; then
  BOLD='\033[1m'
  DIM='\033[2m'
  CYAN='\033[0;36m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  MAGENTA='\033[0;35m'
  RED='\033[0;31m'
  RESET='\033[0m'
else
  BOLD='' DIM='' CYAN='' GREEN='' YELLOW='' BLUE='' MAGENTA='' RED='' RESET=''
fi

pause_step() {
  echo ""
  echo -e "${DIM}────────────────────────────────────────────────────────${RESET}"
  echo -e "${YELLOW}Press SPACE to run the next request...${RESET}"
  local key
  while IFS= read -r -n 1 -s key; do
    [[ "$key" == " " ]] && break
    [[ -z "$key" ]] && break
  done
  echo ""
}

section() {
  echo ""
  echo -e "${BOLD}${MAGENTA}════════════════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}${MAGENTA}  $1${RESET}"
  echo -e "${BOLD}${MAGENTA}════════════════════════════════════════════════════════${RESET}"
  echo ""
}

step_title() {
  echo -e "${BOLD}${CYAN}▶ $1${RESET}"
  echo ""
}

role_banner() {
  local role="$1"
  CURRENT_ROLE="$role"
  echo ""
  echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BLUE}║${RESET}  ${BOLD}Active role: ${role}${RESET}"
  echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${RESET}"
  echo ""
}

use_token() {
  local role="$1"
  local token="$2"
  CURRENT_ROLE="$role"
  echo -e "${BOLD}Using ${role} token for the next request(s):${RESET}"
  echo -e "${GREEN}${token}${RESET}"
  echo ""
}

login_as() {
  local role="$1"
  local email="$2"
  local password="$3"
  local token_var="$4"

  role_banner "$role"
  echo -e "${BOLD}Trying to log in:${RESET}"
  echo -e "  ${DIM}Email:${RESET}    ${email}"
  echo -e "  ${DIM}Password:${RESET} ${password}"
  echo ""

  pause_step
  api_request POST "/api/auth/login" \
    "{\"email\":\"${email}\",\"password\":\"${password}\"}"

  local token
  token="$(json_field "$LAST_RESPONSE" "['data']['token']")"
  local name
  name="$(json_field "$LAST_RESPONSE" "['data']['user']['name']")"

  if [[ -z "$token" || "$token" == "None" ]]; then
    echo -e "${RED}✗ Login failed — no token received${RESET}"
    return 1
  fi

  echo -e "${GREEN}✓ Login successful as ${role} (${name})${RESET}"
  echo -e "${BOLD}Got token:${RESET}"
  echo -e "${GREEN}${token}${RESET}"
  echo ""

  save_state "$token_var" "$token"
  save_state "CURRENT_ROLE" "$role"
  printf -v "$token_var" '%s' "$token"
}

strip_demo_dates() {
  python3 -c "
import json, sys

DATE_KEYS = {'createdAt', 'updatedAt', 'paidAt'}

def strip(value):
    if isinstance(value, list):
        return [strip(item) for item in value]
    if isinstance(value, dict):
        return {
            key: strip(val)
            for key, val in value.items()
            if key not in DATE_KEYS
        }
    return value

raw = sys.stdin.read()
if not raw.strip():
    sys.exit(0)
try:
    print(json.dumps(strip(json.loads(raw)), indent=2))
except json.JSONDecodeError:
    sys.stdout.write(raw)
" 2>/dev/null || cat
}

pretty_json() {
  strip_demo_dates
}

save_state() {
  local key="$1"
  local val="$2"
  touch "$DEMO_STATE_FILE"
  if grep -q "^${key}=" "$DEMO_STATE_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$DEMO_STATE_FILE"
  else
    echo "${key}=${val}" >> "$DEMO_STATE_FILE"
  fi
}

load_state() {
  if [[ -f "$DEMO_STATE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$DEMO_STATE_FILE"
    if [[ -n "${CURRENT_ROLE:-}" ]]; then
      echo -e "${DIM}Loaded state — last role: ${CURRENT_ROLE}${RESET}"
    fi
  fi
}

# api_request METHOD PATH [JSON_BODY] [AUTH_TOKEN] [ROLE_LABEL]
api_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local token="${4:-}"
  local role_label="${5:-${CURRENT_ROLE:-}}"

  local url="${BASE_URL}${path}"
  local curl_args=(-sS -w "\n%{http_code}" -X "$method" "$url" -H "Content-Type: application/json")

  if [[ -n "$token" ]]; then
    curl_args+=(-H "Authorization: Bearer ${token}")
  fi

  if [[ -n "$body" ]]; then
    curl_args+=(-d "$body")
  fi

  local auth_note="(no auth)"
  if [[ -n "$token" ]]; then
    if [[ -n "$role_label" ]]; then
      auth_note="(authenticated as ${role_label})"
    else
      auth_note="(authenticated)"
    fi
  fi

  step_title "${method} ${path} ${auth_note}"

  if [[ -n "$token" && -n "$role_label" ]]; then
    echo -e "${DIM}Auth:${RESET} Bearer token for ${BOLD}${role_label}${RESET}"
    echo -e "${DIM}Token:${RESET} ${token}"
    echo ""
  fi

  echo -e "${DIM}Request URL:${RESET} ${url}"
  if [[ -n "$body" ]]; then
    echo -e "${DIM}Request body:${RESET}"
    echo "$body" | pretty_json
  else
    echo -e "${DIM}Request body:${RESET} (none)"
  fi
  echo ""

  echo -e "${DIM}curl command:${RESET}"
  local curl_show="curl -X ${method} '${url}' -H 'Content-Type: application/json'"
  [[ -n "$token" ]] && curl_show+=" -H 'Authorization: Bearer ${token}'"
  [[ -n "$body" ]] && curl_show+=" -d '$(echo "$body" | tr -d '\n')'"
  echo "$curl_show"
  echo ""

  local raw
  raw="$(curl "${curl_args[@]}")"

  LAST_HTTP_CODE="$(echo "$raw" | tail -n1)"
  LAST_RESPONSE="$(echo "$raw" | sed '$d')"

  echo -e "${GREEN}HTTP ${LAST_HTTP_CODE}${RESET}"
  echo -e "${DIM}Response:${RESET}"
  echo "$LAST_RESPONSE" | pretty_json
  echo ""
}

json_field() {
  local json="$1"
  local field="$2"
  echo "$json" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    val = d${field}
    print('' if val is None else val)
except Exception:
    print('')
" 2>/dev/null || true
}

api_ok() {
  [[ "${LAST_HTTP_CODE:-0}" =~ ^2 ]]
}

pick_available_gear() {
  local token="${1:-}"
  local url="${BASE_URL}/api/gear?available=true&limit=30"
  local raw
  if [[ -n "$token" ]]; then
    raw="$(curl -sS "$url" -H "Authorization: Bearer ${token}")"
  else
    raw="$(curl -sS "$url")"
  fi
  echo "$raw" | python3 -c "
import sys, json
payload = json.load(sys.stdin)
data = payload.get('data', {})
items = data.get('items', data if isinstance(data, list) else [])
for item in items:
    stock = int(item.get('stock', 0) or 0)
    if stock > 0 and item.get('status') == 'AVAILABLE':
        print(item['id'])
        break
" 2>/dev/null || true
}

rental_date_range() {
  python3 -c "
from datetime import datetime, timedelta, timezone
start = datetime.now(timezone.utc).date() + timedelta(days=30)
end = start + timedelta(days=3)
print(f'{start.isoformat()}T00:00:00.000Z|{end.isoformat()}T00:00:00.000Z')
"
}

fail_if_empty() {
  local label="$1"
  local value="$2"
  if [[ -z "$value" || "$value" == "None" ]]; then
    echo -e "${RED}✗ ${label} missing — stopping this flow.${RESET}"
    exit 1
  fi
}

reset_demo_state() {
  rm -f "$DEMO_STATE_FILE"
  echo "Demo state cleared."
}
