# Metron — Personal Finance (ARS/USD)

Multi-user personal finance system for Argentina. Phase 1 foundation is in place:
auth, accounts (with credit-card statement logic), categories, transactions with dual
ARS/USD storage, and a 15-minute job that refreshes blue/oficial/MEP rates from
[dolarapi](https://dolarapi.com/). Frontend is a Vite PWA.

- `/backend` — Fastify + TypeScript + Prisma + Postgres + Redis
- `/frontend` — React + Vite + TanStack Query + Tailwind, installable as a PWA

The two projects are fully independent: no workspace root, no shared package.
Deploy each one separately (e.g. backend on Railway, frontend on Railway/Vercel/Cloudflare Pages).

## Prerequisites

- Node 20+
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- Docker Desktop (for local Postgres + Redis)

## Local development

From the repo root:

```bash
# 1. Start Postgres + Redis (+ backend if you want it containerized)
docker compose up -d postgres redis

# 2. Backend
cd backend
cp .env.example .env      # then edit secrets if you want
pnpm install
pnpm prisma:generate
pnpm prisma:migrate --name init
pnpm dev                  # http://localhost:4000
```

In another terminal:

```bash
cd frontend
cp .env.example .env
pnpm install
pnpm dev                  # http://localhost:5173
```

The Vite dev server proxies `/api/*` → `http://localhost:4000`, so you don't need to
set `VITE_API_BASE_URL` in dev.

### Quick manual smoke test

```bash
# Register
curl -i -X POST http://localhost:4000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"me@example.com","password":"supersecret","phone":"+5491100000000"}'

# Rates
curl http://localhost:4000/api/rates/current  # blue/oficial/mep
```

## Environment variables

### Backend (`backend/.env`)

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_ACCESS_SECRET` | HS256 secret for access tokens (15 min TTL) |
| `JWT_REFRESH_SECRET` | HS256 secret for refresh tokens (7 day TTL) |
| `COOKIE_SECRET` | Used to sign the `metron_rt` httpOnly cookie |
| `CORS_ORIGIN` | Comma-separated list of allowed origins |
| `RATE_FETCH_INTERVAL_MS` | How often to poll dolarapi (default 15 min) |
| `DOLARAPI_BASE` | Override only if the API moves |

**Rotate all three secrets in production.** Generate with `openssl rand -hex 48`.

### Frontend (`frontend/.env`)

| Variable | Description |
| --- | --- |
| `VITE_API_BASE_URL` | Empty in dev (uses proxy). Full URL in production (e.g. `https://api.metron.app`) |

## Architecture notes

### Money

All monetary values are stored as Prisma `Decimal` (Postgres `numeric`). Responses
serialize them as strings, and the frontend uses `decimal.js` for arithmetic. **Never
use JS floats for money.**

Every `Transaction` records `amountArs`, `amountUsd`, and the `exchangeRate` used at
entry time, so historical reports are stable even as rates move.

### Auth flow

- **Access token**: short-lived (15 min) JWT, returned in the JSON body, held in
  memory on the frontend, sent as `Authorization: Bearer …`.
- **Refresh token**: long-lived (7 d) JWT, sent as a signed httpOnly cookie scoped to
  `/api/auth`. Rotated on every `POST /api/auth/refresh`. Server-side refresh tokens
  are hashed (SHA-256) in the `RefreshToken` table and revoked on reuse.
- If the same refresh token is presented twice we treat it as a potential
  replay and revoke **all** of that user's refresh tokens.

### Credit card statements

Accounts of type `credit_card` require `closingDay`, `dueDaysAfterClosing`, and
`creditLimit`. `GET /api/accounts/:id/credit-card-status` returns:

- Previous / current / next close dates
- Current and next due dates
- Current-statement total and next-statement total (split by transaction date vs.
  closing day)
- Utilization (current total ÷ credit limit)

Rule: a purchase on or before the current close falls into the **current** statement;
after the close, it falls into the **next** statement.

### PWA

The frontend uses `vite-plugin-pwa` with Workbox. API `GET` responses are cached
`NetworkFirst` for 7 days so the app can show last-known data offline. Drop your icons
in `frontend/public/icons/` before shipping (see the README there).

## Deploying to Railway

Deploy the backend and frontend as two separate Railway services:

1. **Backend**
   - Source: `/backend`
   - Build: Railway auto-detects the Dockerfile; no overrides needed.
   - Start command: `node dist/server.js` (baked into the image)
   - Release command: `pnpm prisma migrate deploy`
   - Add a Postgres plugin (Railway sets `DATABASE_URL` automatically) and a Redis
     plugin (set `REDIS_URL`).
   - Set `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, `CORS_ORIGIN`
     (your frontend domain), and any other env vars.
2. **Frontend**
   - Source: `/frontend`
   - Build: Dockerfile (serves the built SPA from nginx).
   - Set `VITE_API_BASE_URL` to the backend's public URL.

Because the two services live at different origins, the refresh cookie must be
`SameSite=None; Secure` in production. That's already what the backend emits when
`NODE_ENV=production`; just make sure both domains are HTTPS and on the same apex
(e.g. `metron.app` + `api.metron.app`) for the cookie to flow. If they're on fully
separate domains, you'll need to either put them behind a reverse proxy that shares
the apex or switch to `SameSite=None` explicitly. Keep this in mind before going live.

## What's implemented (Phase 1)

- [x] Multi-user auth (register / login / refresh / logout / me)
- [x] Accounts CRUD incl. credit-card closing/due date logic
- [x] Transactions CRUD with dual ARS/USD storage
- [x] Categories CRUD (defaults seeded on registration)
- [x] Exchange rates: blue/oficial/MEP, 15 min Redis cache + history in DB
- [x] Monthly summary + 30-day cashflow forecast endpoints
- [x] WhatsApp webhook stub (`POST /api/webhooks/whatsapp`)
- [x] Frontend: auth, dashboard shell, transactions list + quick-add,
      accounts with credit-card widget, settings placeholder
- [x] PWA manifest + service worker (API `GET` caching)

## What's next

Phase 2 — dashboard charts (Recharts), cashflow intelligence, liquidity alerts,
50/30/20, monthly summary UI. Then investments, then AI insights. Do not start Phase 2
until Phase 1 is manually validated end-to-end.

The WhatsApp integration will land in Phase 5 via n8n → the existing
`POST /api/webhooks/whatsapp` stub.
