#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

section "GearUp API — Full video demo runner"
echo "Base URL: ${BASE_URL}"
echo ""
echo "Each request waits for SPACE before running."
echo "State is saved to demo/.demo-state.env between flows."
echo ""
echo "Suggested video order:"
echo "  1. Show Swagger in browser (https://gearup-api.vercel.app/api/docs)"
echo "  2. Run this script in terminal"
echo "  3. For Stripe: open demo/stripe-pay.html when flow 4 prompts you"
echo ""

read -r -p "Reset demo state and start fresh? [y/N] " ans
if [[ "${ans,,}" == "y" ]]; then
  reset_demo_state
fi

load_state

FLOWS=(
  "01-public.sh|Public endpoints"
  "02-customer.sh|Customer flow"
  "03-provider.sh|Provider flow"
  "04-stripe-payment.sh|Stripe payment"
  "05-provider-review.sh|Provider complete + review"
  "06-admin.sh|Admin flow"
  "07-errors.sh|Errors & validation"
)

for entry in "${FLOWS[@]}"; do
  script="${entry%%|*}"
  label="${entry##*|}"
  section "Starting: ${label}"
  echo -e "${DIM}Script: demo/${script}${RESET}"
  echo ""
  read -r -p "Press ENTER to start this flow (or Ctrl+C to stop)... " _
  bash "$SCRIPT_DIR/$script"
  load_state
done

section "All demo flows finished"
echo "Swagger docs: ${BASE_URL}/api/docs"
echo "GitHub: https://github.com/MS-Jahan/gearup-api"
