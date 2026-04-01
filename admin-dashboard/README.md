# Admin Dashboard

A simple internal admin UI built with Next.js 14, Tailwind CSS, and NextAuth (Google OAuth).

## Features

- **Users** — view all users with their subscription plan and status
- **Plans** — see plans created by users with project counts
- **Payments** — track payments with status and revenue totals
- **Tickets** — support tickets synced from Linear
- **Admins** — grant/revoke dashboard access to team members

## Quick Start

```bash
cd admin-dashboard
npm install
cp .env.example .env.local
# Fill in your Google OAuth credentials and secret
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `NEXTAUTH_URL` | `http://localhost:3000` locally, your Vercel URL in prod |
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` to generate |

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Import in [Vercel](https://vercel.com/new)
3. Set the 4 environment variables above in Vercel project settings
4. Set `NEXTAUTH_URL` to your Vercel deployment URL
5. In Google Cloud Console, add your Vercel URL to the OAuth redirect URIs:
   `https://your-app.vercel.app/api/auth/callback/google`

## Swapping in Real Data

The seed data lives in `src/lib/seed-data.ts`. To connect to real services:

1. Replace the API route handlers in `src/app/api/*/route.ts` with calls to your actual databases/services (Stripe, Linear API, your user DB, etc.)
2. The admin allow-list in `src/lib/seed-data.ts` should move to a database table
3. The types in `src/types/index.ts` can be adjusted to match your real schemas
