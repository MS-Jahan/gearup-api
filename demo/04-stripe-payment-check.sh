#!/usr/bin/env bash
# Quick re-check after you complete Stripe payment (no setup steps).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
load_state

section "Stripe payment status check"

if [[ -z "${PAYMENT_ID:-}" || -z "${RENTAL_ID:-}" || -z "${CUSTOMER_TOKEN:-}" ]]; then
  echo "Missing state. Run 04-stripe-payment.sh first or source .demo-state.env"
  exit 1
fi

pause_step
api_request GET "/api/payments/${PAYMENT_ID}" "" "$CUSTOMER_TOKEN"

pause_step
api_request GET "/api/rentals/${RENTAL_ID}" "" "$CUSTOMER_TOKEN"
