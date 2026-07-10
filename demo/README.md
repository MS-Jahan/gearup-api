# GearUp API — Video Demo Scripts

Interactive Bash scripts for recording your assignment demo video.

## Quick start

```bash
cd demo
chmod +x *.sh
./run-all.sh
```

On Windows/WSL, if scripts fail with `bash\r: No such file or directory`, run once:

```bash
dos2unix demo/*.sh
```

Or clone with `git config core.autocrlf input` so shell scripts keep Unix line endings.

## Backdate DB before recording

Use your **Neon direct URL** (not the localhost values from `.env.example`):

```bash
DIRECT_URL="postgresql://...@ep-xxx.neon.tech/neondb?sslmode=require" bash demo/backdate-db.sh
```

The script ignores `DATABASE_URL` from `.env` so a local Docker URL cannot override Neon.
Uses plain Node — no tsx — so it works on WSL after `npm ci` in WSL.

## E2E tests

```bash
npm run test:e2e
# or against another host:
BASE_URL=https://gearup-api.vercel.app bash scripts/e2e-test.sh
```

## Stripe payment — hosted URL

`POST /api/payments/create` returns a **`url`** field:

```json
{
  "url": "https://gearup-api.vercel.app/api/payments/pay?session_id=cs_test_...",
  "sessionId": "cs_test_...",
  "payment": { "status": "PENDING" }
}
```

**Open that URL in your browser** and pay with `4242 4242 4242 4242`.  
The webhook auto-confirms; flow 4 verifies payment status after you pay.

## Controls

- **SPACE** — run the next request
- **ENTER** — start the next flow (in `run-all.sh`)

Each step shows:
- Active role (CUSTOMER / PROVIDER / ADMIN)
- Login attempts with email + password
- Token received after login
- Which token is used for each request
- Full curl command + beautified request/response JSON

## Scripts

| File | Flow |
|------|------|
| `01-public.sh` | Health, categories, gear |
| `02-customer.sh` | Customer login, profile, rental |
| `03-provider.sh` | Provider login, gear CRUD, confirm order |
| `04-stripe-payment.sh` | Create checkout URL → you pay → verify |
| `05-provider-review.sh` | PICKED_UP → RETURNED → review |
| `06-admin.sh` | Admin login, suspend user, categories |
| `07-errors.sh` | 401, validation, 403, 404 |
| `run-all.sh` | Runs all flows in order |
