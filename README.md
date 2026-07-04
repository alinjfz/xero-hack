# KISH

KISH stands for **Knowledge & Intelligent SME Hub**.

This starter project uses:

- Next.js 16
- TypeScript
- Tailwind CSS v4
- shadcn-style UI components
- Xero OAuth 2.0 with the official `xero-node` SDK

## What is already integrated

- Xero connect flow at `/api/xero/connect`
- OAuth callback handling at `/api/xero/callback`
- Token refresh using the stored refresh token
- Tenant selection using the first connected Xero tenant
- Summary endpoint at `/api/xero/summary`
- Dashboard UI that surfaces organisation, accounts, bank accounts, and invoice counts

## Environment variables

Use `.env.example` as the starting point:

```bash
XERO_CLIENT_ID=your_xero_client_id
XERO_CLIENT_SECRET=your_xero_client_secret
XERO_REDIRECT_URI=http://localhost:3000/api/xero/callback
XERO_SCOPES=offline_access accounting.settings.read accounting.invoices.read
```

## Notes

- The starter stores Xero tokens in secure httpOnly cookies for speed during prototyping.
- Before production, move token storage into a database tied to your app users.
- The current integration is read-first and meant to be a reliable platform for the next feature set.
