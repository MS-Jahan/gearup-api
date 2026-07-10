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

GEAR_ID="$(pick_available_gear "$CUSTOMER_TOKEN")"
fail_if_empty "Available gear (stock > 0)" "$GEAR_ID"
save_state GEAR_ID "$GEAR_ID"
echo -e "${DIM}Selected gear with stock: ${GEAR_ID}${RESET}"

DATES="$(rental_date_range)"
START_DATE="${DATES%%|*}"
END_DATE="${DATES##*|}"

pause_step
use_token "CUSTOMER" "$CUSTOMER_TOKEN"
api_request POST "/api/rentals" \
  "{\"items\":[{\"gearItemId\":\"${GEAR_ID}\",\"quantity\":1}],\"startDate\":\"${START_DATE}\",\"endDate\":\"${END_DATE}\"}" \
  "$CUSTOMER_TOKEN" "CUSTOMER"

if ! api_ok; then
  echo -e "${RED}✗ Rental failed — cannot continue. Pick another gear or restore stock.${RESET}"
  exit 1
fi

RENTAL_ID="$(json_field "$LAST_RESPONSE" "['data']['id']")"
fail_if_empty "Rental order ID" "$RENTAL_ID"
save_state RENTAL_ID "$RENTAL_ID"

pause_step
use_token "CUSTOMER" "$CUSTOMER_TOKEN"
echo -e "${DIM}Paginated list for this customer only (page 1, limit 5).${RESET}"
api_request GET "/api/rentals?page=1&limit=5" "" "$CUSTOMER_TOKEN" "CUSTOMER"

pause_step
use_token "CUSTOMER" "$CUSTOMER_TOKEN"
api_request GET "/api/rentals/${RENTAL_ID}" "" "$CUSTOMER_TOKEN" "CUSTOMER"

echo -e "${GREEN}Customer flow complete.${RESET} RENTAL_ID=${RENTAL_ID}"
