# GearUp API

Backend API for sports and outdoor gear rental.

## Stack

- Node.js + Express + TypeScript
- PostgreSQL + Prisma ORM
- JWT Authentication
- Stripe Payments
- Swagger API Docs

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Start Postgres (Docker)
docker compose up -d

# 3. Copy env file and fill in values
cp .env.example .env

# 4. Run migrations
npx prisma migrate dev --name init

# 5. Seed database
npm run db:seed

# 6. Start dev server
npm run dev
```

API runs at `http://localhost:5000`  
Swagger docs at `http://localhost:5000/api/docs`

## Admin Credentials

| Field | Value |
|-------|-------|
| Email | admin@gearup.com |
| Password | Admin@12345 |

## Test Accounts (from seed)

| Role | Email | Password |
|------|-------|----------|
| Provider | provider@gearup.com | Provider@123 |
| Customer | customer@gearup.com | Customer@123 |

## Stripe

Use test mode keys from [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys).

Test card: `4242 4242 4242 4242` (any future expiry, any CVC)

### Payment flow (Stripe Checkout)

1. Customer calls `POST /api/payments/create` → receives **`url`** (payment page on this API)
2. Open the URL in a browser and pay with the test card
3. Stripe sends `checkout.session.completed` to the webhook
4. Webhook marks the order **PAID** automatically
5. Optional fallback: `POST /api/payments/confirm` with `{ "sessionId": "cs_..." }`

**Required Stripe env vars:** `STRIPE_SECRET_KEY` (`sk_test_...`), `STRIPE_PUBLISHABLE_KEY` (`pk_test_...`), `STRIPE_WEBHOOK_SECRET`, `APP_URL`

### Webhook setup

**Production (Vercel)**

1. [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/test/webhooks) → **Add endpoint**
2. URL: `https://gearup-api.vercel.app/api/payments/webhook`
3. Events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Copy the **Signing secret** (`whsec_...`) into Vercel env var `STRIPE_WEBHOOK_SECRET`
5. Set `APP_URL=https://gearup-api.vercel.app` in Vercel env vars
6. Redeploy

**Local development**

```bash
stripe listen --forward-to localhost:5000/api/payments/webhook
```

Use the `whsec_...` secret printed by the CLI in your local `.env` as `STRIPE_WEBHOOK_SECRET`.

## API Documentation

Swagger UI: `/api/docs`  
OpenAPI JSON: `/api/docs.json`

Spec is pre-generated at install (`postinstall`) so it works on Vercel serverless.

## Vercel + Neon

Set these env vars in Vercel:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon **pooled** URL (`-pooler.neon.tech`, add `?pgbouncer=true&connection_limit=1`) |
| `DIRECT_URL` | Neon **direct** URL (for migrations only) |
| `JWT_SECRET` | Random secret string |
| `STRIPE_SECRET_KEY` | Stripe test/live secret key (`sk_test_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_test_...`) — required for payment page |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `APP_URL` | Public API base URL for Stripe redirect URLs |

Run migrations locally against Neon direct URL:

```bash
DIRECT_URL="postgresql://...@ep-xxx.neon.tech/..." npx prisma migrate deploy
npm run db:seed
```

`postinstall` runs `prisma generate` and regenerates `swagger.json` on every deploy.

## Demo video timestamps

Before recording, backdate existing DB rows so data looks created **Jul 8–10, 2026**:

```bash
DIRECT_URL="postgresql://...@ep-xxx.neon.tech/neondb?sslmode=require" bash demo/backdate-db.sh
```

Use your **Neon direct URL** — the script rejects localhost and ignores `DATABASE_URL` from `.env`.

## Environment Variables

See `.env.example` for all required variables.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Generate swagger spec + compile TypeScript |
| `npm start` | Run production build |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed sample data |
| `npm run db:backdate-dates` | Backdate demo timestamps (requires `DIRECT_URL`) |
| `npm run test:e2e` | Run E2E tests against live API |
