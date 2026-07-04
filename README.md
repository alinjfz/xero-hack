# KISH

KISH stands for **Knowledge & Intelligent SME Hub**.

This starter project uses:

- Next.js 16
- TypeScript
- Tailwind CSS v4
- shadcn-style UI components
- Xero OAuth 2.0 with the official `xero-node` SDK
- Optional OpenRouter-powered finance briefs

## What is already integrated

- Xero connect flow at `/api/xero/connect`
- OAuth callback handling at `/api/xero/callback`
- Token refresh using the stored refresh token
- Tenant selection using the first connected Xero tenant
- Summary endpoint at `/api/xero/summary`
- Dashboard UI with receivables signals, watchlists, and agent-style next actions
- AI brief endpoint at `/api/ai/brief` using OpenRouter when configured

## Environment variables

Use `.env.example` as the starting point:

```bash
XERO_CLIENT_ID=your_xero_client_id
XERO_CLIENT_SECRET=your_xero_client_secret
XERO_REDIRECT_URI=http://localhost:3000/api/xero/callback
XERO_SCOPES=offline_access accounting.settings.read accounting.invoices.read
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=openai/gpt-5.2
OPENROUTER_SITE_URL=http://localhost:3000
```

## Notes

- The starter stores Xero tokens in secure httpOnly cookies for speed during prototyping.
- Before production, move token storage into a database tied to your app users.
- The current integration is deliberately read-first and focused on receivables and owner guidance.
- With the current Xero scopes, KISH uses organisation, accounts, and invoice data. Adding write workflows later will require broader scopes and a reconnect.
