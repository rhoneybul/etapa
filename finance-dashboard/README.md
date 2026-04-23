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

### 4b. Expose the `finance` schema to PostgREST

By default Supabase's REST API only exposes the `public` schema. The dashboard reads + writes `finance.*` tables directly via the Supabase JS client, so that schema has to be on the exposed list.

**Dashboard → Project Settings → Data API → Exposed schemas.** Add `finance` to the comma-separated list (typically becomes `public, graphql_public, storage, finance`). Save. PostgREST auto-restarts.

Symptom if missed: importing the Excel fails with `Invalid schema: finance`, and home page database calls return empty.

### 4c. Make sure the grants migration ran

If you applied the schema migration but skip this one, you'll hit `permission denied for schema finance` on every write. Migration `20260423000003_finance_grants.sql` grants USAGE on the schema + CRUD on every table to the `authenticated` role (RLS still filters rows). `supabase db push` picks it up automatically — just make sure it ran.

To sanity-check from the Supabase SQL editor after push:

```sql
select has_schema_privilege('authenticated', 'finance', 'USAGE');
-- → true
select has_table_privilege('authenticated', 'finance.cost_items', 'SELECT');
-- → true
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

`vercel.json` in this directory pre-configures framework, build command, dev port, and security headers. What's left — Root Directory, env vars, domain — has to be set via the CLI (or once in the Vercel UI). Prefer the CLI: running `vercel` from inside `finance-dashboard/` makes this directory the project root automatically, so the monorepo gotcha disappears.

```bash
# One-off setup
cd finance-dashboard
npm install -g vercel       # if you don't already have it
vercel login                 # opens a browser
vercel link                  # creates the project. Answer: own scope, new project,
                             # name "etapa-finance", framework auto-detected.
                             # Don't override build/output/install — vercel.json handles those.

# Push env vars. Paste the value when prompted; pick "all environments" unless
# you want prod-only. These four are the minimum.
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add ALLOWED_EMAILS
vercel env add NEXT_PUBLIC_API_BASE_URL

# Ship
vercel --prod
```

Vercel prints a `*.vercel.app` URL on success. Finally, map `finance.getetapa.com`:

```bash
vercel domains add finance.getetapa.com etapa-finance
# Follow the DNS CNAME instructions Vercel prints.
```

Once DNS propagates (a few minutes), `https://finance.getetapa.com` serves the dashboard with an auto-issued SSL cert.

**After deploy**: make sure `https://finance.getetapa.com/auth/callback` is in the Supabase **Redirect URLs** allowlist (Authentication → URL Configuration). Without it, post-Google redirects will fail with an unauthorised URL error.

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
