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
| `STRIPE_SECRET_KEY` | Stripe test/live secret key |

Run migrations locally against Neon direct URL:

```bash
DIRECT_URL="postgresql://...@ep-xxx.neon.tech/..." npx prisma migrate deploy
npm run db:seed
```

`postinstall` runs `prisma generate` and regenerates `swagger.json` on every deploy.

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
