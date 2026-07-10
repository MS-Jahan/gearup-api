#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
load_state

section "FLOW 6 — Admin"

pause_step
api_request POST "/api/auth/login" \
  '{"email":"admin@gearup.com","password":"Admin@12345"}'
ADMIN_TOKEN="$(json_field "$LAST_RESPONSE" "['data']['token']")"
save_state ADMIN_TOKEN "$ADMIN_TOKEN"

pause_step
api_request GET "/api/admin/users" "" "$ADMIN_TOKEN"

pause_step
api_request GET "/api/admin/users?role=CUSTOMER" "" "$ADMIN_TOKEN"
SUSPEND_USER_ID="$(json_field "$LAST_RESPONSE" "['data'][-1]['id']")"
SUSPENDED_EMAIL="$(json_field "$LAST_RESPONSE" "['data'][-1]['email']")"
save_state SUSPEND_USER_ID "$SUSPEND_USER_ID"
save_state SUSPENDED_EMAIL "$SUSPENDED_EMAIL"

pause_step
api_request PATCH "/api/admin/users/${SUSPEND_USER_ID}" \
  '{"status":"SUSPENDED"}' "$ADMIN_TOKEN"

pause_step
step_title "POST /api/auth/login (suspended user — expect failure)"
api_request POST "/api/auth/login" \
  "{\"email\":\"${SUSPENDED_EMAIL}\",\"password\":\"Customer@123\"}"

pause_step
api_request PATCH "/api/admin/users/${SUSPEND_USER_ID}" \
  '{"status":"ACTIVE"}' "$ADMIN_TOKEN"

pause_step
api_request GET "/api/admin/gear" "" "$ADMIN_TOKEN"

pause_step
api_request GET "/api/admin/rentals" "" "$ADMIN_TOKEN"

pause_step
api_request POST "/api/categories" \
  '{"name":"Demo Category Video","description":"Temporary category for demo"}' \
  "$ADMIN_TOKEN"
DEMO_CAT_ID="$(json_field "$LAST_RESPONSE" "['data']['id']")"

pause_step
api_request PATCH "/api/categories/${DEMO_CAT_ID}" \
  '{"description":"Updated in admin demo"}' "$ADMIN_TOKEN"

pause_step
api_request DELETE "/api/categories/${DEMO_CAT_ID}" "" "$ADMIN_TOKEN"

echo -e "${GREEN}Admin flow complete.${RESET}"
