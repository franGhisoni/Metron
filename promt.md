# Metron — Full Project Handoff Prompt

Sos un IQ 160 expert full-stack engineer continuando el desarrollo de **Metron**, una app de finanzas personales para Argentina (ARS/USD). La app está en producción en Railway. Tenés todo el contexto del proyecto acá — el usuario te va a decir en qué fase arrancás.

---

## Stack

- **Backend**: Node.js + TypeScript, Fastify v4, Prisma v5 + PostgreSQL, Redis (ioredis), pnpm. `"module": "ESNext"`, `"moduleResolution": "Bundler"` en tsconfig.
- **Frontend**: React + Vite PWA, TanStack Query v5, Tailwind CSS, Recharts, Zustand, axios, React Hook Form + Zod.
- **Deploy**: Railway. Backend en `metron-production.up.railway.app`. Frontend en `metron.ghisoni.com.ar`. Postgres + Redis como Railway plugins.
- **Dos proyectos pnpm independientes**: `/backend` y `/frontend` — sin workspace root, deployados como servicios separados en Railway.
- El frontend usa nginx que **reverse-proxea `/api` → backend** via variable `$BACKEND_URL` (envsubst en runtime). No hay `VITE_API_BASE_URL` de build-time.

## Dev local

- Postgres en puerto **5434** (5432 y 5433 ocupados por instalaciones locales de PG en Windows). `DATABASE_URL` usa `127.0.0.1:5434` (no `localhost` — Windows resuelve localhost a `::1` IPv6).
- Redis en 6379 (estándar).
- Backend: `cd backend && pnpm dev` → puerto 4000.
- Frontend: `cd frontend && pnpm dev` → puerto 5173 (Vite proxea `/api` a 4000).

## Railway env vars

**Backend**: `NODE_ENV=production`, `PORT=4000`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, `CORS_ORIGIN=https://metron.ghisoni.com.ar`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `REDIS_URL=${{Redis.REDIS_URL}}`, `RATE_FETCH_INTERVAL_MS=900000`, `DOLARAPI_BASE=https://dolarapi.com/v1/dolares`

**Frontend**: `BACKEND_URL=https://metron-production.up.railway.app` (runtime, usado por nginx envsubst)

---

## Schema Prisma (estado actual)

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

enum AccountType { checking savings cash credit_card investment crypto_wallet other }
enum TxType { income expense transfer }
enum TxStatus { paid pending scheduled }

model User {
  id                      String   @id @default(cuid())
  email                   String   @unique
  passwordHash            String
  phone                   String?
  currencyPref            String   @default("ARS")
  fiftyThirtyTwenty       Boolean  @default(false)
  liquidityAlertThreshold Decimal?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  accounts         Account[]
  transactions     Transaction[]
  categories       Category[]
  investments      Investment[]
  goals            SavingsGoal[]
  monthlySummaries MonthlySummary[]
  refreshTokens    RefreshToken[]
}

model RefreshToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model Account {
  id                  String      @id @default(cuid())
  userId              String
  name                String
  type                AccountType
  currency            String
  balance             Decimal     @default(0)
  closingDay          Int?
  dueDaysAfterClosing Int?
  creditLimit         Decimal?
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions Transaction[]
  @@index([userId])
}

model Transaction {
  id                 String    @id @default(cuid())
  userId             String
  accountId          String
  categoryId         String?
  linkedTransactionId String?  -- for CC payment pairs (transfer)
  type               TxType
  amountArs          Decimal
  amountUsd          Decimal
  exchangeRate       Decimal
  currency           String
  description        String?
  paymentMethod      String?
  transactionDate    DateTime
  dueDate            DateTime?
  status             TxStatus
  isRecurring        Boolean   @default(false)
  recurringRule      String?   -- "monthly" | "weekly" | "biweekly" | "yearly"
  recurringParentId  String?
  installmentTotal   Int?
  installmentCurrent Int?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  user              User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  account           Account       @relation(fields: [accountId], references: [id], onDelete: Restrict)
  category          Category?     @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  recurringParent   Transaction?  @relation("RecurringChildren", fields: [recurringParentId], references: [id], onDelete: SetNull)
  recurringChildren Transaction[] @relation("RecurringChildren")
  @@index([userId, transactionDate])
  @@index([accountId])
  @@index([categoryId])
  @@index([status])
  @@index([recurringParentId])
}

model Category {
  id       String  @id @default(cuid())
  userId   String
  name     String
  type     String  -- "income" | "expense"
  color    String
  icon     String  -- emoji
  parentId String?
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions Transaction[]
  @@index([userId])
}

model Investment {
  id                     String   @id @default(cuid())
  userId                 String
  symbol                 String
  name                   String
  assetType              String   -- crypto | stock | cedear | bond | plazo_fijo | fci | other
  quantity               Decimal
  purchasePriceUsd       Decimal
  purchasePriceArs       Decimal
  purchaseDate           DateTime
  exchangeRateAtPurchase Decimal
  notes                  String?
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model SavingsGoal {
  id            String    @id @default(cuid())
  userId        String
  name          String
  targetAmount  Decimal
  currency      String
  targetDate    DateTime?
  currentAmount Decimal   @default(0)
  status        String    @default("wishlist") -- wishlist | active | completed | paused
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model ExchangeRate {
  id        String   @id @default(cuid())
  date      DateTime
  rateType  String   -- blue | oficial | mep
  rate      Decimal
  source    String
  createdAt DateTime @default(now())
  @@unique([date, rateType])
  @@index([rateType, date])
}

model MonthlySummary {
  id          String   @id @default(cuid())
  userId      String
  year        Int
  month       Int
  aiInsight   String?
  healthScore Int?
  generatedAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, year, month])
}
```

---

## API Routes (estado actual)

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

GET    /api/accounts
POST   /api/accounts
PUT    /api/accounts/:id
DELETE /api/accounts/:id
GET    /api/accounts/:id/credit-card-status   -- cierre, vencimiento, totales ARS+USD del resumen

GET    /api/transactions
POST   /api/transactions
PUT    /api/transactions/:id
DELETE /api/transactions/:id
GET    /api/transactions/summary?month=&year=
GET    /api/transactions/cashflow-forecast?days=30

GET    /api/categories
POST   /api/categories
PUT    /api/categories/:id
DELETE /api/categories/:id

GET    /api/rates/current
GET    /api/rates/history?from=&to=

POST   /api/webhooks/whatsapp   -- stub, returns 200 OK
```

---

## Decisiones técnicas clave

- **Money**: siempre `Prisma.Decimal` / `decimal.js` — nunca JS floats. `amountArs`, `amountUsd`, `exchangeRate` en cada Transaction.
- **Auth**: refresh tokens hasheados en tabla `RefreshToken` (no stateless). Rotación en cada refresh. Reuse detection revoca todos los tokens del usuario. Plugin usa `jsonwebtoken` directo para ops de refresh (no `@fastify/jwt` namespace).
- **Credit card**: lógica de cierre en `src/modules/accounts/creditCard.ts`. Compra después del closing_day → próximo resumen.
- **Categorías default**: `src/modules/categories/defaults.ts` — 16 categorías auto-seeded al registrarse.
- **Exchange rates**: job registrado ANTES de `app.listen()` (Fastify no acepta `addHook` después de listen).
- **Docker backend**: `node_modules` se copia del stage `build` (no `deps`) para incluir el output de `prisma generate`.
- **Prisma Alpine**: `binaryTargets: ["native", "linux-musl-openssl-3.0.x"]`, `apk add openssl` en Dockerfile.

---

## Estado por fase

### ✅ Phase 1 — Foundation (COMPLETA, en producción)

1. Auth multi-usuario con JWT + refresh httpOnly cookie ✅
2. Accounts CRUD con todos los tipos ✅
3. Credit card: closing_day, due_days_after_closing, credit_limit, lógica de resumen actual/próximo ✅
4. Transaction CRUD con dual ARS/USD ✅
5. Categories CRUD (auto-seeded al registro) ✅
6. Exchange rates: dolarapi.com blue/oficial/MEP, Redis cache + historial DB ✅

**Frontend Phase 1**: Login, Register, Dashboard básico (net worth cards + tipo de cambio), Transaction list + quick-add, Accounts con CC widget, Settings placeholder ✅

### 🔧 Fixes pendientes (resolver ANTES de continuar con features)

Estos bugs están identificados y hay que arreglarlos:

**F1. Balance no se recalcula al editar/eliminar transacciones**
Al hacer PUT o DELETE en `/api/transactions/:id`, el balance de la cuenta no se ajusta. Hay un `// TODO` en las rutas. Hay que revertir el delta anterior y aplicar el nuevo.

**F2. Pago de tarjeta de crédito**
No existe un flujo de "pagar tarjeta". Hoy el usuario tendría que crear dos transacciones manualmente. Necesitamos:
- `POST /api/transactions/pay-credit-card` — crea un par de transacciones linkeadas: `expense` en cuenta origen + `transfer` en la CC, ambas con el mismo `linkedTransactionId`.
- UI: modal "Pagar tarjeta" en la página de cuentas.

**F3. Tarjetas con gastos en ARS y USD mezclados**
El widget de credit-card-status debe mostrar subtotales separados por moneda (no convertir todo). Una CC puede tener compras en ARS y en USD.

**F4. Transacciones recurrentes**
El schema ya tiene `isRecurring`, `recurringRule`, `recurringParentId`. Falta:
- Job diario que genera instancias del mes para transacciones recurrentes (idempotente por `recurringParentId` + fecha).
- `recurringRule`: `"monthly"` | `"weekly"` | `"biweekly"` | `"yearly"`.
- UI: toggle "Recurrente" + selector de frecuencia en el formulario de carga.
- Ícono en la lista para identificarlas.

**F5. Edit categorías en UI**
`PUT /api/categories/:id` ya existe en el backend. Falta UI en Settings: tabla con edición inline o modal (nombre, color hex, emoji, tipo).

### 🔲 Phase 2 — Dashboard & Analytics

7. **Toggle global ARS/USD** — Zustand store, persiste en localStorage, afecta todos los montos.
8. **Charts con Recharts**:
   - Barras: ingresos vs gastos últimos 12 meses (nuevo endpoint `GET /api/reports/monthly-series`)
   - Donut: gastos por categoría mes actual (usa `/api/transactions/summary`)
   - Línea: patrimonio neto últimos 12 meses (nuevo endpoint `GET /api/reports/net-worth-history`)
   - Lista: cashflow próximos 30 días (usa `/api/transactions/cashflow-forecast`)
9. **Liquidity alert banner** — si saldo proyectado en N días < `liquidityAlertThreshold` del usuario.
10. **CC debt widget en dashboard** — deuda corriente vs próximo resumen (ARS + USD separados).
11. **Promedio y varianza por categoría** — rolling 3 meses, indicador de variación en la lista de categorías.
12. **Página `/reports`** — selector de mes, comparativa vs mes anterior en ARS y USD.
13. **Settings funcional** — formulario real: `PATCH /api/users/me` (currencyPref, liquidityAlertThreshold, fiftyThirtyTwenty, phone).
14. **50/30/20 tracker** (opt-in) — el campo `fiftyThirtyTwenty` ya está en DB. Cuando está activo, mostrar breakdown needs/wants/savings vs actual en el dashboard.

### 🔲 Phase 3 — Proyecciones & Planning

15. **Proyecciones de gastos** — estimación del próximo mes por categoría basada en rolling 3 meses con varianza.
16. **Metas de ahorro / Wishlist** — `SavingsGoal` ya está en el schema. CRUD + progreso + monto mensual necesario + fecha estimada de completado.
17. **Simulador de cuotas vs contado** — dado un monto, comparar: pago contado (costo de oportunidad a tasa configurable), N cuotas con interés, ajustado por inflación ARS proyectada. Output: cuál es más barato y por cuánto.
18. **Health score financiero** (0–100) — mensual, factores: tasa de ahorro, estabilidad de gastos, uso de CC %, progreso de metas. `MonthlySummary` ya tiene `healthScore`.

### 🔲 Phase 4 — Inversiones

19. **Portfolio de inversiones** — `Investment` ya está en schema. CRUD completo. Tipos: crypto, stock, cedear, bond, plazo_fijo, fci, other.
20. **Precios en tiempo real**:
    - Crypto: CoinGecko free API.
    - Stocks/CEDEARs: Alpha Vantage free tier o Yahoo Finance unofficial.
    - Plazo fijo / FCI: entrada manual.
21. **Analytics de portfolio** — allocation pie, valor en el tiempo, performance vs benchmark (dólar blue), TIR por activo, retorno ajustado por inflación en ARS y USD.
22. **Comparador "¿Qué hubiera pasado si...?"** — dado una fecha pasada y un monto, comparar: dejarlo en ARS / convertir a USD / invertir en activo X. Mostrar resultado hoy.

### 🔲 Phase 5 — AI Insights

23. **Monthly AI insight** — en día configurable, generar resumen usando OpenAI (o Claude). Incluye: patrones de gasto, ahorro vs meta, gastos inusuales, una recomendación concreta. Se guarda en `MonthlySummary.aiInsight` — no regenera en cada load.
24. **Detección de anomalías** — si una categoría supera el 150% de su promedio de 3 meses, flaggear con explicación breve.
25. **WhatsApp integration** — stub en `POST /api/webhooks/whatsapp` ya existe (retorna 200 OK). Conectar via n8n en el futuro.

---

## Archivos clave

```
backend/
  src/
    config/env.ts                         -- validación Zod de env vars
    lib/decimal.ts                        -- helpers Decimal (toPrismaDecimal, toDecimal, ROUND_HALF_UP)
    lib/logger.ts                         -- Winston logger
    modules/
      auth/routes.ts + service.ts         -- login, register, refresh, logout
      accounts/routes.ts + creditCard.ts  -- CRUD + lógica CC
      transactions/routes.ts + service.ts -- CRUD + summary + cashflow
      categories/routes.ts + defaults.ts  -- CRUD + defaults canónicos
      rates/routes.ts + service.ts + job.ts -- dolarapi + Redis + job 15min
      webhooks/whatsapp.ts               -- stub
    plugins/
      auth.ts     -- @fastify/jwt (access) + jsonwebtoken (refresh)
      prisma.ts   -- PrismaClient decorator
      redis.ts    -- ioredis decorator
      errorHandler.ts
  prisma/
    schema.prisma
    migrations/   -- commiteadas (no en .gitignore)

frontend/
  src/
    lib/
      api.ts        -- axios instance, silent refresh interceptor
      auth.tsx      -- AuthContext, bootstrap refresh on load
    hooks/
      queries.ts    -- todos los TanStack Query hooks
    pages/
      Dashboard.tsx, Transactions.tsx, Accounts.tsx, Settings.tsx
    components/
      ui/           -- Button, Input, Modal, etc.
  nginx.conf        -- proxy /api → $BACKEND_URL, envsubst $PORT $BACKEND_URL
  Dockerfile        -- ARG VITE_API_BASE_URL (no usado), build + nginx runtime
```

---

## Reglas de código

- TypeScript strict mode en todo.
- Zod para validación de inputs en todos los endpoints.
- Nunca usar JS floats para dinero — siempre `Decimal`.
- Fastify plugins con `fastify-plugin` para que los decorators sean visibles en el scope padre.
- Los jobs (`startRateFetchJob`, `startRecurringJob`) se registran ANTES de `app.listen()`.
- Prisma migrations siempre commiteadas al repo.
- Al hacer PUT/DELETE de transacciones, siempre recalcular el balance de la cuenta afectada.
- Preferir claridad sobre cleverness. Agregar `// TODO: Phase N` donde corresponda.

---

**El usuario te va a decir en qué fase/fix arrancar. Pedí confirmación antes de cualquier decisión arquitectónica mayor.**
## Estado actualizado al retomar

### Fixes Phase 1
Los fixes F1-F5 ya quedaron implementados:

- F1 listo: rebalance de cuentas al editar/eliminar transacciones (`PUT/DELETE /api/transactions/:id`) incluyendo cambios de cuenta, tipo, moneda y status, y contemplando transferencias linkeadas de pago de tarjeta.
- F2 listo: pago de tarjeta implementado backend + UI.
- F3 listo: credit-card-status separado ARS/USD en backend + UI.
- F4 listo: recurrentes implementado con job + UI + indicador visual.
- F5 listo: edición de categorías en UI implementada.

### Frontend UX ya mejorada
En `/transactions` ya se hizo bastante trabajo extra:

- Quick add + Add normal como dos modos explícitos.
- Acción `Repetir` sobre movimientos viejos para recargar formulario.
- Filtros útiles en lista:
  - Este mes
  - Últimos
  - Todos
  - Tipo
  - Categoría
- Totales visibles arriba de la tabla según filtros activos.

### Phase 2 ya iniciada
Ya se implementó el punto 7 parcialmente/completamente en frontend:

- Toggle global ARS/USD con Zustand persistido en localStorage.
- Toggle visible en header desktop/mobile.
- Aplicado en:
  - Dashboard
  - Accounts
  - Transactions

Archivos agregados/tocados para esto:
- `frontend/src/lib/currency.ts`
- `frontend/src/components/Layout.tsx`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Accounts.tsx`
- `frontend/src/pages/Transactions.tsx`

### Validación ya corrida
Con acceso completo ya se verificó:

- `backend`: `pnpm typecheck` OK, `pnpm build` OK
- `frontend`: `pnpm typecheck` OK, `pnpm build` OK

### Recomendación de próximo paso
El siguiente paso recomendado es continuar Phase 2 con una de estas dos:
1. Charts + reports base
2. Settings funcionales (`PATCH /api/users/me`)

Si no se indica otra cosa, continuar por la opción 1: charts/reporting.
