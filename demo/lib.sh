#!/usr/bin/env bash
# Shared helpers for GearUp API video demo scripts.

BASE_URL="${BASE_URL:-https://gearup-api.vercel.app}"
DEMO_STATE_FILE="${DEMO_STATE_FILE:-$(dirname "$0")/.demo-state.env}"

# Colors (disabled if not a tty)
if [[ -t 1 ]]; then
  BOLD='\033[1m'
  DIM='\033[2m'
  CYAN='\033[0;36m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  MAGENTA='\033[0;35m'
  RESET='\033[0m'
else
  BOLD='' DIM='' CYAN='' GREEN='' YELLOW='' BLUE='' MAGENTA='' RESET=''
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

pretty_json() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -m json.tool 2>/dev/null || cat
  elif command -v jq >/dev/null 2>&1; then
    jq . 2>/dev/null || cat
  else
    cat
  fi
}

save_state() {
  # usage: save_state KEY value
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
  # usage: load_state KEY  OR  source demo state
  if [[ -f "$DEMO_STATE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$DEMO_STATE_FILE"
  fi
}

# api_request METHOD PATH [JSON_BODY] [AUTH_TOKEN]
# Sets LAST_RESPONSE and LAST_HTTP_CODE
api_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local token="${4:-}"

  local url="${BASE_URL}${path}"
  local curl_args=(-sS -w "\n%{http_code}" -X "$method" "$url" -H "Content-Type: application/json")

  if [[ -n "$token" ]]; then
    curl_args+=(-H "Authorization: Bearer ${token}")
  fi

  if [[ -n "$body" ]]; then
    curl_args+=(-d "$body")
  fi

  step_title "${method} ${path}"

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
  [[ -n "$token" ]] && curl_show+=" -H 'Authorization: Bearer <token>'"
  [[ -n "$body" ]] && curl_show+=" -d '...'"
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
  echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d${field})" 2>/dev/null
}

reset_demo_state() {
  rm -f "$DEMO_STATE_FILE"
  echo "Demo state cleared."
}
