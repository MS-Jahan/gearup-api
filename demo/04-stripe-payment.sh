#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
load_state

section "FLOW 4 — Stripe Checkout payment (hosted URL + webhook)"

if [[ -z "${RENTAL_ID:-}" || -z "${CUSTOMER_TOKEN:-}" ]]; then
  echo "Run 02-customer.sh and 03-provider.sh first."
  exit 1
fi

role_banner "CUSTOMER"
use_token "CUSTOMER" "$CUSTOMER_TOKEN"

pause_step
api_request POST "/api/payments/create" \
  "{\"rentalOrderId\":\"${RENTAL_ID}\"}" "$CUSTOMER_TOKEN" "CUSTOMER"

PAYMENT_ID="$(json_field "$LAST_RESPONSE" "['data']['payment']['id']")"
SESSION_ID="$(json_field "$LAST_RESPONSE" "['data']['sessionId']")"
CHECKOUT_URL="$(json_field "$LAST_RESPONSE" "['data']['url']")"

if ! api_ok; then
  echo -e "${RED}✗ Payment create failed${RESET}"
  exit 1
fi
fail_if_empty "Payment URL" "$CHECKOUT_URL"
save_state PAYMENT_ID "$PAYMENT_ID"
save_state SESSION_ID "$SESSION_ID"
save_state CHECKOUT_URL "$CHECKOUT_URL"

echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}Stripe Checkout URL (open in browser to pay):${RESET}"
echo ""
echo -e "${GREEN}${CHECKOUT_URL}${RESET}"
echo ""
echo "Test card: ${BOLD}4242 4242 4242 4242${RESET} · any future expiry · any CVC"
echo "After paying, Stripe webhook auto-confirms the order."
echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

cat > "$SCRIPT_DIR/.last-payment.txt" <<EOF
rentalOrderId=${RENTAL_ID}
sessionId=${SESSION_ID}
checkoutUrl=${CHECKOUT_URL}
createdAt=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

echo -e "${DIM}Saved to demo/.last-payment.txt${RESET}"
echo ""
echo -e "${YELLOW}Open the URL above, complete payment, then press SPACE to verify...${RESET}"
pause_step

pause_step
use_token "CUSTOMER" "$CUSTOMER_TOKEN"
api_request GET "/api/payments/${PAYMENT_ID}" "" "$CUSTOMER_TOKEN" "CUSTOMER"
PAY_STATUS="$(json_field "$LAST_RESPONSE" "['data']['status']")"

pause_step
use_token "CUSTOMER" "$CUSTOMER_TOKEN"
api_request GET "/api/rentals/${RENTAL_ID}" "" "$CUSTOMER_TOKEN" "CUSTOMER"
ORDER_STATUS="$(json_field "$LAST_RESPONSE" "['data']['status']")"

echo ""
if [[ "$PAY_STATUS" == "COMPLETED" && "$ORDER_STATUS" == "PAID" ]]; then
  echo -e "${GREEN}✓ Payment flow succeeded! Payment=COMPLETED, Order=PAID${RESET}"
else
  echo -e "${YELLOW}Payment status: ${PAY_STATUS} | Order status: ${ORDER_STATUS}${RESET}"
  echo "If still PENDING, wait a few seconds for webhook or run: ./04-stripe-payment-check.sh"
fi
