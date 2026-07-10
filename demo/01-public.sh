#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

section "FLOW 1 — Public endpoints (no login)"

pause_step
api_request GET "/health"
save_state HEALTH_OK "$(json_field "$LAST_RESPONSE" "['success']")"

pause_step
api_request GET "/"
save_state ROOT_OK "$(json_field "$LAST_RESPONSE" "['success']")"

pause_step
api_request GET "/api/categories?page=1&limit=10"
CATEGORY_ID="$(json_field "$LAST_RESPONSE" "['data']['items'][0]['id']")"
CATEGORY_SLUG="$(json_field "$LAST_RESPONSE" "['data']['items'][0]['slug']")"
save_state CATEGORY_ID "$CATEGORY_ID"
save_state CATEGORY_SLUG "$CATEGORY_SLUG"

pause_step
api_request GET "/api/gear?available=true&limit=10"

pause_step
GEAR_ID="$(pick_available_gear)"
fail_if_empty "Available gear" "$GEAR_ID"
save_state GEAR_ID "$GEAR_ID"
echo -e "${DIM}Selected gear with stock: ${GEAR_ID}${RESET}"
api_request GET "/api/gear/${GEAR_ID}"

echo -e "${GREEN}Public flow complete.${RESET} GEAR_ID=${GEAR_ID}"
