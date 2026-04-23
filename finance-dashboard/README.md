# Etapa Finance Dashboard

Founder-facing finance dashboard. Replaces the Monday Excel check-in. Lives under `/finance-dashboard` in the Etapa monorepo; deploys independently to its own Vercel project at something like `finance.getetapa.com`.

This document covers the **one-time setup** to get a local dev environment + production deploy running. The product spec is in [`docs/budget-dashboard/ETAPA_DASHBOARD_SPEC.md`](../docs/budget-dashboard/ETAPA_DASHBOARD_SPEC.md).

## What Phase 1 delivers

- Next.js 15 (App Router) + TypeScript + Tailwind project skeleton
- Supabase browser + server clients
- Google OAuth with email allowlist (middleware + DB RLS, both gated on the same list)
- `finance` Postgres schema (`supabase/migrations/20260423000002_finance_schema.sql`)
- Landing page that detects whether the DB has been seeded + nudges the user to `/import`
- Stub `/import` page marking where Phase 2 takes over

## What Phase 1 explicitly does NOT deliver

- The Excel parser (Phase 2 ticket — drag-drop on `/import` that populates tables)
- KPI tiles, runway gauge, burn chart (Phase 4)
- RevenueCat webhook integration (Phase 5)
- Milestones, todos, red zones (Phase 6)
- Daily cron + historical charts (Phase 7)

## One-time setup

### 1. Create a Google OAuth app

In [Google Cloud Console](https://console.cloud.google.com/):

1. Create a new project (or reuse your existing one).
2. APIs & Services → Credentials → Create Credentials → OAuth client ID.
3. Application type: **Web application**.
4. Authorized redirect URIs: add the Supabase OAuth callback URL (Supabase will show it in the next step). Format is usually `https://<your-project-ref>.supabase.co/auth/v1/callback`.
5. Save the Client ID + Client Secret.

### 2. Enable Google OAuth in Supabase

In the Supabase dashboard for the Etapa project:

1. Authentication → Providers → Google → Enable.
2. Paste the Client ID + Client Secret from step 1.
3. Save.
4. Authentication → URL Configuration → add `http://localhost:3002/auth/callback` and `https://<your-vercel-deploy>/auth/callback` to **Redirect URLs**.

### 3. Apply the finance schema migration

```bash
# From the repo root:
supabase db push
```

This creates the `finance` schema and all its tables with RLS policies. It also creates the `finance.admin_allowlist` table that RLS reads to gate access.

### 4. Add yourself to the allowlist

Run this in the Supabase SQL editor (adjust the email):

```sql
insert into finance.admin_allowlist (email, notes)
values ('honeybulr@gmail.com', 'founder')
on conflict (email) do nothing;
```

### 5. Local dev

```bash
cd finance-dashboard
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ALLOWED_EMAILS
npm install
npm run dev
```

Open http://localhost:3002 → click Continue with Google → should land back on `/` with a nudge to `/import`.

### 6. Deploy to Vercel

1. `vercel link` inside `finance-dashboard/`.
2. Add the env vars from `.env.example` in the Vercel project settings.
3. `vercel --prod`.
4. Update the Supabase redirect URLs with the production callback.

## How the allowlist works

Two copies of the allowlist, kept in sync:

- `ALLOWED_EMAILS` env var → read by `src/middleware.ts` to reject unauthorised users fast.
- `finance.admin_allowlist` DB table → enforced by RLS on every finance table.

If middleware is ever bypassed (e.g. direct API calls with a stolen anon key), the DB still refuses to return rows. The env var is the fast rejection; the DB is correctness.

## Why Excel upload, not git-committed Excel

The spec originally had a seed script that read `docs/budget-dashboard/Etapa_Financial_Model.xlsx` from the repo. We don't do that. Reasons:

1. The Excel file is a live document the founder updates weekly — committing it creates merge conflicts every Monday.
2. It contains cash balances, director's loan figures, and personal financial data that don't belong in a git history.
3. The dashboard is the eventual source of truth — once seeded, the Excel is an offline archive. Letting it drift from the DB is fine; we only re-upload when we need to rebuild.

So the file is gitignored under `docs/budget-dashboard/*.xlsx`, and the `/import` page uploads it on demand.

## Architecture notes

```
finance-dashboard/ (Vercel)
├─ reads  → Supabase (RLS gated)
└─ writes → Express backend for non-trivial mutations
             (the existing Railway app, new /api/finance/* routes)
```

- Browser + server Supabase clients for reads (via RLS).
- Mutations that need admin-level ops (webhook ingest, cron snapshots) run on the Express backend with the service role key.
- Webhooks (RevenueCat, Stripe) go to the Express backend, never here — this Next.js app is purely the UI.
