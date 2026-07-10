#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
load_state

section "FLOW 2 — Customer"

login_as "CUSTOMER" "customer@gearup.com" "Customer@123" CUSTOMER_TOKEN

pause_step
use_token "CUSTOMER" "$CUSTOMER_TOKEN"
api_request GET "/api/auth/me" "" "$CUSTOMER_TOKEN" "CUSTOMER"

pause_step
use_token "CUSTOMER" "$CUSTOMER_TOKEN"
api_request GET "/api/profile" "" "$CUSTOMER_TOKEN" "CUSTOMER"

pause_step
use_token "CUSTOMER" "$CUSTOMER_TOKEN"
api_request PATCH "/api/profile" \
  '{"name":"Rahim Khan (Demo)"}' "$CUSTOMER_TOKEN" "CUSTOMER"

if [[ -z "${GEAR_ID:-}" ]]; then
  api_request GET "/api/gear?limit=1&available=true"
  GEAR_ID="$(json_field "$LAST_RESPONSE" "['data']['items'][0]['id']")"
  save_state GEAR_ID "$GEAR_ID"
fi

pause_step
use_token "CUSTOMER" "$CUSTOMER_TOKEN"
api_request POST "/api/rentals" \
  "{\"items\":[{\"gearItemId\":\"${GEAR_ID}\",\"quantity\":1}],\"startDate\":\"2026-11-01T00:00:00.000Z\",\"endDate\":\"2026-11-04T00:00:00.000Z\"}" \
  "$CUSTOMER_TOKEN" "CUSTOMER"
RENTAL_ID="$(json_field "$LAST_RESPONSE" "['data']['id']")"
save_state RENTAL_ID "$RENTAL_ID"

pause_step
use_token "CUSTOMER" "$CUSTOMER_TOKEN"
api_request GET "/api/rentals" "" "$CUSTOMER_TOKEN" "CUSTOMER"

pause_step
use_token "CUSTOMER" "$CUSTOMER_TOKEN"
api_request GET "/api/rentals/${RENTAL_ID}" "" "$CUSTOMER_TOKEN" "CUSTOMER"

echo -e "${GREEN}Customer flow complete.${RESET} RENTAL_ID=${RENTAL_ID}"
