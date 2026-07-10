#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
load_state

section "FLOW 4 — Stripe payment (Payment Intent + webhook)"

if [[ -z "${RENTAL_ID:-}" || -z "${CUSTOMER_TOKEN:-}" ]]; then
  echo "Run 02-customer.sh and 03-provider.sh first."
  exit 1
fi

pause_step
api_request POST "/api/payments/create" \
  "{\"rentalOrderId\":\"${RENTAL_ID}\"}" "$CUSTOMER_TOKEN"

PAYMENT_ID="$(json_field "$LAST_RESPONSE" "['data']['payment']['id']")"
PAYMENT_INTENT_ID="$(json_field "$LAST_RESPONSE" "['data']['payment']['stripePaymentIntentId']")"
CLIENT_SECRET="$(json_field "$LAST_RESPONSE" "['data']['clientSecret']")"
save_state PAYMENT_ID "$PAYMENT_ID"
save_state PAYMENT_INTENT_ID "$PAYMENT_INTENT_ID"
save_state CLIENT_SECRET "$CLIENT_SECRET"

echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}IMPORTANT: This API does NOT return a payment URL.${RESET}"
echo ""
echo "It returns a Stripe ${BOLD}clientSecret${RESET} for Payment Intents."
echo "Stripe.js or the Stripe CLI is required to complete payment."
echo ""
echo -e "${CYAN}Payment Intent ID:${RESET} ${PAYMENT_INTENT_ID}"
echo -e "${CYAN}clientSecret:${RESET}      ${CLIENT_SECRET}"
echo ""
echo -e "${BOLD}Option A — Browser (recommended for video):${RESET}"
echo "  1. Open: file://${SCRIPT_DIR}/stripe-pay.html"
echo "  2. Paste your Stripe ${BOLD}publishable key${RESET} (pk_test_...)"
echo "  3. Paste the clientSecret above"
echo "  4. Pay with test card: 4242 4242 4242 4242"
echo "  5. Stripe webhook will auto-confirm on Vercel"
echo ""
echo -e "${BOLD}Option B — Stripe CLI:${RESET}"
echo "  stripe payment_intents confirm ${PAYMENT_INTENT_ID} --payment-method pm_card_visa"
echo ""
echo -e "${BOLD}Option C — Manual API fallback (no webhook):${RESET}"
echo "  POST /api/payments/confirm with paymentIntentId after paying"
echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# Write payment info file for the HTML page
cat > "$SCRIPT_DIR/.last-payment.txt" <<EOF
rentalOrderId=${RENTAL_ID}
paymentIntentId=${PAYMENT_INTENT_ID}
clientSecret=${CLIENT_SECRET}
createdAt=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

echo -e "${DIM}Saved to demo/.last-payment.txt${RESET}"
echo ""
echo -e "${YELLOW}Complete payment now, then press SPACE to check status...${RESET}"
pause_step

pause_step
api_request GET "/api/payments/${PAYMENT_ID}" "" "$CUSTOMER_TOKEN"
PAY_STATUS="$(json_field "$LAST_RESPONSE" "['data']['status']")"

pause_step
api_request GET "/api/rentals/${RENTAL_ID}" "" "$CUSTOMER_TOKEN"
ORDER_STATUS="$(json_field "$LAST_RESPONSE" "['data']['status']")"

echo ""
if [[ "$PAY_STATUS" == "COMPLETED" && "$ORDER_STATUS" == "PAID" ]]; then
  echo -e "${GREEN}✓ Webhook/payment flow succeeded! Payment=COMPLETED, Order=PAID${RESET}"
else
  echo -e "${YELLOW}Payment status: ${PAY_STATUS} | Order status: ${ORDER_STATUS}${RESET}"
  echo "If still PENDING, webhook may need a few seconds or STRIPE_WEBHOOK_SECRET on Vercel."
  echo "Retry: bash demo/04-stripe-payment-check.sh"
fi
