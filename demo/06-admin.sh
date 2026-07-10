#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
load_state

section "FLOW 6 — Admin"

login_as "ADMIN" "admin@gearup.com" "Admin@12345" ADMIN_TOKEN

pause_step
use_token "ADMIN" "$ADMIN_TOKEN"
api_request GET "/api/admin/users" "" "$ADMIN_TOKEN" "ADMIN"

pause_step
use_token "ADMIN" "$ADMIN_TOKEN"
api_request GET "/api/admin/users?role=CUSTOMER" "" "$ADMIN_TOKEN" "ADMIN"
SUSPEND_USER_ID="$(json_field "$LAST_RESPONSE" "['data'][-1]['id']")"
SUSPENDED_EMAIL="$(json_field "$LAST_RESPONSE" "['data'][-1]['email']")"
save_state SUSPEND_USER_ID "$SUSPEND_USER_ID"
save_state SUSPENDED_EMAIL "$SUSPENDED_EMAIL"

pause_step
use_token "ADMIN" "$ADMIN_TOKEN"
api_request PATCH "/api/admin/users/${SUSPEND_USER_ID}" \
  '{"status":"SUSPENDED"}' "$ADMIN_TOKEN" "ADMIN"

echo -e "${BOLD}Now testing login as the suspended user (no token — expect failure):${RESET}"
echo -e "  Email: ${SUSPENDED_EMAIL}"
pause_step
api_request POST "/api/auth/login" \
  "{\"email\":\"${SUSPENDED_EMAIL}\",\"password\":\"Customer@123\"}"

role_banner "ADMIN"
use_token "ADMIN" "$ADMIN_TOKEN"

pause_step
api_request PATCH "/api/admin/users/${SUSPEND_USER_ID}" \
  '{"status":"ACTIVE"}' "$ADMIN_TOKEN" "ADMIN"

pause_step
api_request GET "/api/admin/gear" "" "$ADMIN_TOKEN" "ADMIN"

pause_step
api_request GET "/api/admin/rentals" "" "$ADMIN_TOKEN" "ADMIN"

DEMO_CAT_NAME="Demo Category $(date +%s)"
pause_step
api_request POST "/api/categories" \
  "{\"name\":\"${DEMO_CAT_NAME}\",\"description\":\"Temporary category for demo\"}" \
  "$ADMIN_TOKEN" "ADMIN"
DEMO_CAT_ID="$(json_field "$LAST_RESPONSE" "['data']['id']")"
fail_if_empty "Category ID" "$DEMO_CAT_ID"

pause_step
api_request PATCH "/api/categories/${DEMO_CAT_ID}" \
  '{"description":"Updated in admin demo"}' "$ADMIN_TOKEN" "ADMIN"

pause_step
api_request DELETE "/api/categories/${DEMO_CAT_ID}" "" "$ADMIN_TOKEN" "ADMIN"

echo -e "${GREEN}Admin flow complete.${RESET}"
