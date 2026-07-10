# GearUp API — Video Demo Scripts

Interactive Bash scripts for recording your assignment demo video without Postman.

## Quick start

```bash
cd demo
chmod +x *.sh
./run-all.sh
```

Or run flows individually:

```bash
./01-public.sh
./02-customer.sh
./03-provider.sh
./04-stripe-payment.sh    # pause here to pay in browser
./05-provider-review.sh
./06-admin.sh
./07-errors.sh
```

## Controls

- **SPACE** — run the next request (inside each flow)
- **ENTER** — start the next flow (in `run-all.sh` only)

Each step prints:
1. Action title (`POST /api/auth/login`, etc.)
2. Request URL and beautified JSON body
3. Equivalent curl command
4. HTTP status + full beautified response

State (`tokens`, `rentalId`, etc.) is saved to `.demo-state.env` between scripts.

## Stripe payment — important

**Your API does NOT return a payment URL.**

`POST /api/payments/create` returns:
- `clientSecret` — for Stripe.js
- `payment.stripePaymentIntentId` — e.g. `pi_...`

### How to test webhook

1. Run `./04-stripe-payment.sh` until payment is created
2. Open `demo/stripe-pay.html` in your browser
3. Paste your Stripe **publishable key** (`pk_test_...` from Stripe Dashboard)
4. Paste the **clientSecret** from the script output
5. Pay with test card `4242 4242 4242 4242`
6. Stripe calls `https://gearup-api.vercel.app/api/payments/webhook`
7. Press SPACE in the script → payment should be `COMPLETED`, order `PAID`

Re-check anytime:
```bash
./04-stripe-payment-check.sh
```

### Alternative: Stripe CLI

```bash
stripe payment_intents confirm pi_XXXXX --payment-method pm_card_visa
```

## Video recording tips

1. **Terminal** — run demo scripts (large font)
2. **Browser tab 1** — Swagger `/api/docs` for intro
3. **Browser tab 2** — `stripe-pay.html` for payment step
4. Skip Postman — assignment does not require it

## Environment

```bash
export BASE_URL=https://gearup-api.vercel.app   # default
```

## Files

| File | Purpose |
|------|---------|
| `lib.sh` | Shared helpers |
| `01-public.sh` | Health, categories, gear |
| `02-customer.sh` | Login, profile, create rental |
| `03-provider.sh` | Gear CRUD, confirm order |
| `04-stripe-payment.sh` | Create payment + wait for you to pay |
| `04-stripe-payment-check.sh` | Re-check payment status |
| `05-provider-review.sh` | PICKED_UP → RETURNED → review |
| `06-admin.sh` | Users, suspend, categories |
| `07-errors.sh` | 401, validation, 403, 404 |
| `run-all.sh` | Runs all flows in order |
| `stripe-pay.html` | Browser test payment page |
