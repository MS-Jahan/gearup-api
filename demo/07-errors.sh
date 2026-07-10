#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
load_state

section "FLOW 7 — Error handling & validation"

pause_step
step_title "GET /api/auth/me (no token — expect 401)"
api_request GET "/api/auth/me"

pause_step
step_title "POST /api/auth/register (empty body — validation error)"
api_request POST "/api/auth/register" '{}'

pause_step
step_title "POST /api/auth/login (wrong password)"
api_request POST "/api/auth/login" \
  '{"email":"admin@gearup.com","password":"wrongpassword"}'

if [[ -z "${CUSTOMER_TOKEN:-}" ]]; then
  api_request POST "/api/auth/login" \
    '{"email":"customer@gearup.com","password":"Customer@123"}'
  CUSTOMER_TOKEN="$(json_field "$LAST_RESPONSE" "['data']['token']")"
fi

pause_step
step_title "GET /api/admin/users (customer token — expect 403)"
api_request GET "/api/admin/users" "" "$CUSTOMER_TOKEN"

pause_step
step_title "GET /api/gear/nonexistent-id-000 (expect 404)"
api_request GET "/api/gear/nonexistent-id-000"

pause_step
step_title "POST /api/rentals (invalid dates — validation/business error)"
api_request POST "/api/rentals" \
  '{"items":[{"gearItemId":"fake","quantity":1}],"startDate":"2020-01-01T00:00:00.000Z","endDate":"2020-01-02T00:00:00.000Z"}' \
  "$CUSTOMER_TOKEN"

echo -e "${GREEN}Error handling demo complete.${RESET}"
