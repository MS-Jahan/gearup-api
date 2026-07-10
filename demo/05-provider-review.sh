#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
load_state

section "FLOW 5 — Provider complete order + review"

if [[ -z "${RENTAL_ID:-}" || -z "${PROVIDER_TOKEN:-}" || -z "${CUSTOMER_TOKEN:-}" ]]; then
  echo "Run previous flows first."
  exit 1
fi

ORDER_STATUS="$(curl -s "${BASE_URL}/api/rentals/${RENTAL_ID}" \
  -H "Authorization: Bearer ${CUSTOMER_TOKEN}" | python3 -c "
import sys, json
try:
    print(json.load(sys.stdin)['data']['status'])
except Exception:
    print('UNKNOWN')
" 2>/dev/null || echo "UNKNOWN")"

if [[ "$ORDER_STATUS" != "PAID" && "$ORDER_STATUS" != "PICKED_UP" && "$ORDER_STATUS" != "RETURNED" ]]; then
  echo -e "${YELLOW}Order is ${ORDER_STATUS}. Complete Stripe payment first (04-stripe-payment.sh).${RESET}"
fi

role_banner "PROVIDER"
use_token "PROVIDER" "$PROVIDER_TOKEN"

pause_step
api_request PATCH "/api/provider/orders/${RENTAL_ID}" \
  '{"status":"PICKED_UP"}' "$PROVIDER_TOKEN" "PROVIDER"

pause_step
api_request PATCH "/api/provider/orders/${RENTAL_ID}" \
  '{"status":"RETURNED"}' "$PROVIDER_TOKEN" "PROVIDER"

if [[ -z "${GEAR_ID:-}" ]]; then
  GEAR_ID="$(json_field "$LAST_RESPONSE" "['data']['items'][0]['gearItemId']")"
  save_state GEAR_ID "$GEAR_ID"
fi

role_banner "CUSTOMER"
use_token "CUSTOMER" "$CUSTOMER_TOKEN"

pause_step
api_request POST "/api/reviews" \
  "{\"rentalOrderId\":\"${RENTAL_ID}\",\"gearItemId\":\"${GEAR_ID}\",\"rating\":5,\"comment\":\"Great gear for the demo video!\"}" \
  "$CUSTOMER_TOKEN" "CUSTOMER"

pause_step
api_request GET "/api/reviews/gear/${GEAR_ID}"

echo -e "${GREEN}Provider + review flow complete.${RESET}"
