# Admin Dashboard

A simple internal admin UI built with Next.js 14, Tailwind CSS, and NextAuth (Google OAuth).
Connects to the Etapa Express API server to display real user, plan, subscription, and ticket data.

## Features

- **Users** — all registered users with their subscription plan and status
- **Plans** — training plans created by users with activity counts
- **Payments** — Stripe subscriptions and payment status
- **Tickets** — support tickets fetched from Linear
- **Admins** — grant/revoke dashboard access to team members

## Quick Start

```bash
cd admin-dashboard
npm install
cp .env.example .env.local
# Fill in values (see below)
npm run dev
```

Make sure the Etapa Express server is running on the same `ETAPA_API_URL` with matching `ADMIN_API_KEY`.

## Environment Variables

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | From Google Cloud Console (Web application OAuth client) |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` to generate |
| `ETAPA_API_URL` | URL of the Etapa Express server (e.g. `http://localhost:3001` or your Railway URL) |
| `ADMIN_API_KEY` | Shared secret — must match `ADMIN_API_KEY` in the Etapa server env |

**Note:** `NEXTAUTH_URL` is auto-detected on Vercel. Only set it locally (`http://localhost:3000`) or if using a custom domain.

## Deploy to Vercel

1. Import `rhoneybul/etapa` in [Vercel](https://vercel.com/new) and set **Root Directory** to `admin-dashboard`
2. Set the 5 environment variables above in Vercel project settings
3. In Google Cloud Console, add your Vercel URL to the OAuth redirect URIs:
   `https://your-app.vercel.app/api/auth/callback/google`
4. In your Etapa server (Railway), set `ADMIN_API_KEY` to the same value and add the Vercel URL to `ALLOWED_ORIGINS`

## Server-Side Setup

The Etapa Express server needs these env vars for admin endpoints:

```
ADMIN_EMAILS=robert.honeybul@sylvera.io
ADMIN_API_KEY=<same shared secret as the dashboard>
```

The admin routes are at `/api/admin/*` and are protected by the API key.
