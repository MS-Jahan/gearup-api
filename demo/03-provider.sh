#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
load_state

section "FLOW 3 — Provider"

login_as "PROVIDER" "provider@gearup.com" "Provider@123" PROVIDER_TOKEN

pause_step
use_token "PROVIDER" "$PROVIDER_TOKEN"
api_request POST "/api/provider/gear" \
  "{\"name\":\"Demo Paddleboard\",\"brand\":\"AquaFlow\",\"description\":\"Inflatable paddleboard for video demo rental.\",\"categoryId\":\"${CATEGORY_ID:-}\",\"pricePerDay\":30,\"stock\":2}" \
  "$PROVIDER_TOKEN" "PROVIDER"
NEW_GEAR_ID="$(json_field "$LAST_RESPONSE" "['data']['id']")"
save_state NEW_GEAR_ID "$NEW_GEAR_ID"

pause_step
use_token "PROVIDER" "$PROVIDER_TOKEN"
api_request PUT "/api/provider/gear/${NEW_GEAR_ID}" \
  '{"pricePerDay":35,"stock":3}' "$PROVIDER_TOKEN" "PROVIDER"

pause_step
use_token "PROVIDER" "$PROVIDER_TOKEN"
api_request GET "/api/provider/orders" "" "$PROVIDER_TOKEN" "PROVIDER"

if [[ -z "${RENTAL_ID:-}" ]]; then
  echo "RENTAL_ID not set — run 02-customer.sh first"
  exit 1
fi

pause_step
use_token "PROVIDER" "$PROVIDER_TOKEN"
api_request PATCH "/api/provider/orders/${RENTAL_ID}" \
  '{"status":"CONFIRMED"}' "$PROVIDER_TOKEN" "PROVIDER"

echo -e "${GREEN}Provider flow complete.${RESET} Order ${RENTAL_ID} is CONFIRMED"
