# Unturn — Production Deployment & Operations Guide

This guide covers production deployment, environment configuration, database migrations, security controls, and operational monitoring for Unturn, the Shopify return-prevention application.

---

## 1. Application Architecture

- **Framework**: React Router v7 with Node.js runtime and Shopify App Bridge React 4.
- **Shopify API**: Shopify Admin API 2026-07 with GraphQL queries & webhooks.
- **Database**: Prisma ORM with SQLite (single-instance container) or PostgreSQL (multi-instance cluster).
- **AI Engine**: Groq Llama 3.3 70B / Google Gemini for product-specific return reasoning, with algorithmic statistical fallbacks.
- **Multi-Tenant Security**: Strict shop-level isolation (`shopId` composite foreign keys on all data models).

---

## 2. Environment Configuration

Copy `.env.example` to `.env` in your deployment environment and configure the production secrets:

```env
# Shopify App Credentials (from Shopify Partner Dashboard)
SHOPIFY_API_KEY=your_shopify_app_client_id
SHOPIFY_API_SECRET=your_shopify_app_client_secret
SCOPES=read_orders,read_products,read_returns,write_metaobject_definitions,write_metaobjects,write_products
SHOPIFY_APP_URL=https://your-production-app.domain.com

# Database Connection (SQLite default or PostgreSQL connection string)
DATABASE_URL="file:dev.sqlite"

# AI Provider API Key (Groq or Gemini)
GROQ_API_KEY=your_groq_api_key
# GEMINI_API_KEY=your_gemini_api_key

# Node Environment & Server Port
NODE_ENV=production
PORT=3000
```

> **Security Rule**: Never commit `.env` or production credentials to source control. `.env*` is ignored in `.gitignore` (except `.env.example`).

---

## 3. Database Migrations

Unturn uses Prisma migrations. When deploying new versions to production, apply migrations safely without resetting data:

```bash
# Apply pending migrations to production database
npx prisma migrate deploy

# Verify migration status
npx prisma migrate status
```

In automated Docker or PaaS startup scripts (e.g. Dockerfile / Procfile), run:

```json
"docker-start": "npm run setup && npm run start"
```
where `npm run setup` executes `prisma generate && prisma migrate deploy`.

---

## 4. Shopify Partner Dashboard Configuration

Before submitting or launching the app, verify the following in your **Shopify Partner Dashboard → Apps → Unturn**:

### A. App Setup & URLs
- **App URL**: `https://your-production-app.domain.com`
- **Allowed redirection URL(s)**:
  - `https://your-production-app.domain.com/auth/callback`
  - `https://your-production-app.domain.com/api/auth`

### B. Access Scopes
- `read_products`, `write_products`
- `read_orders`, `read_returns`
- `write_metaobjects`, `write_metaobject_definitions`

### C. Protected Customer Data (PCD)
- In **API access → Protected customer data**, submit a request for **Orders** data.
- **Purpose**: Return prevention analytics, root-cause identification, and intervention impact tracking.

### D. Webhooks & GDPR Compliance
Unturn handles all mandatory Shopify webhooks:
- `app/uninstalled` $\rightarrow$ `/webhooks/app/uninstalled` (deactivates store record, cleans session)
- `app/scopes_update` $\rightarrow$ `/webhooks/app/scopes_update` (updates store scopes)
- `customers/data_request` $\rightarrow$ `/webhooks/customers/data_request` (GDPR compliance)
- `customers/redact` $\rightarrow$ `/webhooks/customers/redact` (GDPR compliance)
- `shop/redact` $\rightarrow$ `/webhooks/shop/redact` (purges store data upon merchant deletion)

All webhook endpoints authenticate cryptographically using `authenticate.webhook(request)`.

---

## 5. Production Build & Launch

Run the production build:

```bash
# 1. Install production dependencies
npm ci

# 2. Compile client assets and server SSR bundle
npm run build

# 3. Start production server
npm run start
```

Health check / heartbeat is served through the root route `/` and authenticated endpoints respond with proper HTTP status codes.

---

## 6. Failure Modes & Resilience

1. **Shopify API Throttling & Network Retries**:
   - `executeGraphQLWithRetry` in `sync.server.ts` automatically retries throttled requests (HTTP 429 / `THROTTLED`) with exponential backoff.
2. **Missing `read_returns` Scope**:
   - If a store lacks `read_returns`, `sync.server.ts` falls back gracefully to order queries without crashing.
3. **AI Provider Outages**:
   - If Groq or Gemini is unreachable or rate-limited, `aiRecommendations.server.ts` and `recommendations.server.ts` immediately serve deterministic statistical fallbacks derived from the product's actual units sold and return reasons.
4. **Empty Stores & New Installations**:
   - Informative, styled empty states are rendered across Overview, Recommended Actions, Interventions, and Settings without throwing exceptions or rendering misleading zeros.

---

## 7. Merchant Workflow Checklist

| Step | Surface | Verification |
| --- | --- | --- |
| 1 | OAuth Installation | Store record created in SQLite with currency and timezone. |
| 2 | Historical Sync | Products and orders imported via GraphQL with cursor pagination. |
| 3 | Return Overview | 4 KPI cards, donut cause breakdown, and top returned products. |
| 4 | Products & Causes | Detail drawers open with return share, verbatim notes, and variants. |
| 5 | AI Recommendations | "Know why" modal explains return rate delta, verbatim comments, and suggested action. |
| 6 | Intervention Launch | "Take Action" snapshots baseline metrics (rate, units, cause share) and transfers to Interventions. |
| 7 | Impact Tracking | Before vs. After 4-metric grid, Return Rate Trajectory SVG chart, and cause shift analysis. |
| 8 | Settings Management | Verified connection status, sync retry, financial assumptions, and safe data purge. |
