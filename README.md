# KISH

KISH stands for **Knowledge & Intelligent SME Hub**.

This starter project uses:

- Next.js 16
- TypeScript
- Tailwind CSS v4
- shadcn-style UI components
- Xero OAuth 2.0 with the official `xero-node` SDK
- Optional OpenRouter-powered finance briefs
- Gamified `/world` experience with goals, streaks, and pixel scenes

## What is already integrated

- Xero connect flow at `/api/xero/connect`
- OAuth callback handling at `/api/xero/callback`
- Token refresh using the stored refresh token
- Tenant selection using the first connected Xero tenant
- Summary endpoint at `/api/xero/summary`
- World summary endpoint at `/api/world/summary`
- Dashboard UI with receivables signals, watchlists, and agent-style next actions
- AI brief endpoint at `/api/ai/brief` using OpenRouter when configured
- Contract intelligence with compliance alerts
- Gamified world at `/world` with rental house + small business scenes
- CLI to seed demo data into your Xero org

## Environment variables

Use `.env.example` as the starting point:

```bash
XERO_CLIENT_ID=your_xero_client_id
XERO_CLIENT_SECRET=your_xero_client_secret
XERO_REDIRECT_URI=http://localhost:3000/api/xero/callback
XERO_SCOPES=offline_access accounting.settings.read accounting.contacts accounting.contacts.read accounting.invoices accounting.invoices.read accounting.payments accounting.payments.read accounting.reports.banksummary.read
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=openai/gpt-5.2
OPENROUTER_SITE_URL=http://localhost:3000
XERO_REFRESH_TOKEN=
XERO_TENANT_ID=
```

After changing `XERO_SCOPES`, disconnect and reconnect Xero in the app so the new permissions apply.

## Gamified world (`/world`)

The main dashboard stays at `/` for receivables intelligence. Click **Enter your world** to open the Stardew-inspired pixel view:

- **Rental house** and **small business** scenes with clickable hotspots
- **Reginald** the robin mascot with dry-British tips
- **Goals** (revenue, zero overdue, cash buffer, rent on time, custom)
- **Streaks** when you resolve alerts or make goal progress
- Detail sheets that hide accounting jargon behind plain-English labels

Demo data is tagged with `[HOME]` and `[BIZ]` in invoice references and contact names.

## Seed demo data into Xero

1. Start the app and connect Xero at `http://localhost:3000`
2. Export CLI credentials: visit `http://localhost:3000/api/xero/export-token`
3. Add to `.env.local`:

```bash
XERO_REFRESH_TOKEN=<refreshToken from export endpoint>
XERO_TENANT_ID=<tenantId from export endpoint>
```

4. Seed (with reset):

```bash
npm run seed:xero -- --reset
```

This creates demo contacts (Alex Mercer, PrintCo, etc.) and invoices for the house and business worlds. Reset only voids KISH-tagged demo invoices.

Helper:

```bash
npm run xero:token
```

## Suggested demo flow

1. `npm run seed:xero -- --reset`
2. Open `/` and connect Xero if needed
3. Glance at AI brief and contract intelligence
4. Click **Enter your world**
5. Resolve an alert for a streak, pick a goal, click hotspots to explore finances

## Notes

- The starter stores Xero tokens in secure httpOnly cookies for speed during prototyping.
- Before production, move token storage into a database tied to your app users.
- The current integration is read-first on the dashboard; the seed CLI uses write scopes for demo data only.
- Cash buffer goals require `accounting.reports.banksummary.read` and a bank balance from Xero reports.
