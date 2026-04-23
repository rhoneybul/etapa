# Etapa Finance Dashboard — Build Spec for Claude Code

> **Context for Claude Code**: You're building a live financial dashboard that replaces a static Excel model. The Excel model is attached at the end of this document as a reference for what numbers need to be computed and why. Read it in full before writing code. Build one phase at a time and verify each before moving on.

---

## 0. Keeping the model and dashboard accurate — the maintenance routine

**Before you build anything: the Excel model itself has a `Dashboard` tab with a live to-do list and a "Maintenance Schedule" section at the bottom. That's the operational rhythm for the founder. Your build should preserve all of it.**

The routine is:

**Every Monday (5 min)**
1. Update Tide balance in `Assumptions!B4`
2. Change status on anything done last week in the `To-Do` tab
3. Glance at Dashboard KPIs — if Runway is red, act same day

**First Monday of each month (15 min)**
1. Export Tide CSV → paste into `Tide Txns` sheet
2. Check `Watchlist` tab — anything started charging?
3. Update RevenueCat numbers on `SaaS Metrics` tab (once launched)
4. Review `Personal Subs` — cancel what's not used

**Quarterly (30 min)**
1. Review 12-month `Cash Forecast` — still viable?
2. Re-forecast revenue assumptions
3. Mark milestones hit/missed with dates
4. Check `Red Zones` — amber or red?

**After any big change**
- New recurring cost → add a row in `Assumptions` (rows 8-17)
- Cancelled a sub → zero its row, update the note
- Did a to-do → mark it Done on `To-Do` tab (the dashboard widget auto-refreshes)
- Got paid → CSV import catches it, no manual step

**Once the dashboard is live, these routines happen in the web UI instead**:
- Monday balance update → `/settings` page has one field
- Monthly CSV import → `/transactions` drag-and-drop
- To-do status changes → `/todos` page with inline edit
- Red Zone check → auto-visible on home page
- Everything else (RevenueCat, milestones) is auto-tracked

**This means the dashboard has specific "maintenance-friendly" requirements:**
- `/settings` page with one-click Tide balance update (big form, optimised for phone)
- `/transactions` with prominent "Upload Tide CSV" drop zone
- `/todos` with fast status-change UI (keyboard shortcuts, bulk updates)
- Dashboard home shows "What needs your attention" panel with open todos

---

## 1. High-level goal

A password-protected web dashboard that shows the founder (Rob) live financial health of his Ltd company (Etapa), auto-pulling from Stripe, RevenueCat, and Tide (manually uploaded CSVs), and tracking the growth milestones defined in the Excel model.

The dashboard replaces weekly manual spreadsheet updates. When someone pays, the numbers change automatically. When runway drops into amber/red, a visible warning triggers. When a milestone is hit, it auto-checks itself.

## 2. Non-negotiable design principles

1. **Read-heavy, low-write.** This is a reporting dashboard, not a CRUD app. Optimise queries.
2. **Cache aggressively.** Recompute financial aggregates on a cron, not per request. Dashboard should load in <500ms.
3. **Manual override escape hatches.** Every auto-calculated value has a manual override field. Reality disagrees with automation sometimes.
4. **Source of truth is the database**, not the Excel file. The Excel file seeds initial values only.
5. **Single-user MVP.** Don't build multi-tenant. Whitelist one Google email; done.
6. **Production-ready from day 1.** HTTPS, env vars, no secrets in code, proper error handling, typed end-to-end.

## 3. Tech stack (aligned to your existing setup)

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Existing Express app gains new `/api/finance/*` routes (don't create a second Node project)
- **Database**: Supabase Postgres (new schema: `finance`)
- **Auth**: Supabase Auth with Google OAuth + allowlist
- **Charts**: Recharts (already in React ecosystem, good for financial data)
- **Data fetching**: TanStack Query (React Query) with 60s stale time
- **CSV parsing**: Papa Parse (browser-side upload → JSON → API)
- **Deployment**: Vercel for the Next.js frontend; existing Railway for the Express backend
- **Scheduled jobs**: Supabase `pg_cron` or a simple Express route hit by GitHub Actions on a schedule

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Dashboard                        │
│  (Vercel — dashboard.etapa.app or admin.getetapa.com)       │
│                                                             │
│  Pages: /login, /, /cashflow, /subs, /milestones,           │
│         /transactions, /settings                            │
│                                                             │
│  Auth: Supabase Google OAuth + allowlist check              │
└──────────┬──────────────────────────────────┬───────────────┘
           │                                  │
           │ reads via Supabase client        │ writes via Express
           │ (RLS enforced)                   │ (admin-level ops)
           │                                  │
           ▼                                  ▼
┌─────────────────────────┐      ┌──────────────────────────┐
│  Supabase Postgres      │◄─────│  Express API             │
│                         │      │  (Railway, existing app) │
│  Schema: finance        │      │                          │
│  - cash_snapshots       │      │  New routes:             │
│  - transactions         │      │  POST /api/finance/*     │
│  - cost_items           │      │                          │
│  - revenue_events       │      │  Webhook handlers:       │
│  - milestones           │      │  POST /webhooks/stripe   │
│  - metric_history       │      │  POST /webhooks/revcat   │
│                         │      │                          │
│  Views:                 │      │  Cron jobs (hit by GHA): │
│  - v_monthly_burn       │      │  POST /jobs/daily-sync   │
│  - v_runway             │      │                          │
│  - v_mrr                │      └──────────────────────────┘
└─────────────────────────┘
           ▲
           │
           │ webhooks
           │
┌──────────┴──────────────────────────────────────────────────┐
│  External data sources                                      │
│  • Stripe (if you start using Stripe for web payments)      │
│  • RevenueCat (IAP events, MRR, subscribers)                │
│  • Tide (manual CSV upload — they don't have an API)        │
│  • Starling (manual CSV upload for business items leaked)   │
└─────────────────────────────────────────────────────────────┘
```

## 5. Database schema

Put everything in a dedicated `finance` schema so it doesn't clutter the app's main schema.

```sql
-- Enable the finance schema
CREATE SCHEMA IF NOT EXISTS finance;

-- ──────────────────────────────────────────────────────────
-- Cash position (snapshot of Tide balance over time)
-- ──────────────────────────────────────────────────────────
CREATE TABLE finance.cash_snapshots (
  id              BIGSERIAL PRIMARY KEY,
  snapshot_date   DATE NOT NULL,
  tide_balance    NUMERIC(12,2) NOT NULL,
  source          TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'csv_import'
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON finance.cash_snapshots(snapshot_date DESC);

-- ──────────────────────────────────────────────────────────
-- Transactions (from Tide CSV + webhook revenue events)
-- ──────────────────────────────────────────────────────────
CREATE TABLE finance.transactions (
  id              BIGSERIAL PRIMARY KEY,
  txn_date        TIMESTAMPTZ NOT NULL,
  external_id     TEXT UNIQUE,          -- Tide transaction ID or Stripe/RC id
  source          TEXT NOT NULL,        -- 'tide' | 'stripe' | 'revenuecat' | 'manual'
  description     TEXT NOT NULL,
  counterparty    TEXT,
  amount          NUMERIC(12,2) NOT NULL,  -- positive = money in, negative = out
  currency        TEXT DEFAULT 'GBP',
  category        TEXT,                 -- 'software' | 'revenue' | 'bank_fees' | 'insurance' | 'capital' | 'other'
  is_business     BOOLEAN DEFAULT TRUE,
  is_recurring    BOOLEAN DEFAULT FALSE,
  is_capital      BOOLEAN DEFAULT FALSE, -- founder top-up, not an expense
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  raw             JSONB                 -- keep the original row for debugging
);
CREATE INDEX ON finance.transactions(txn_date DESC);
CREATE INDEX ON finance.transactions(category);
CREATE INDEX ON finance.transactions(source);

-- ──────────────────────────────────────────────────────────
-- Recurring cost items (the monthly burn)
-- ──────────────────────────────────────────────────────────
CREATE TABLE finance.cost_items (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,        -- 'software' | 'legal' | 'accounting' | 'insurance' | 'other'
  monthly_amount  NUMERIC(10,2) NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  is_projected    BOOLEAN DEFAULT FALSE, -- contingency vs actual
  cadence         TEXT DEFAULT 'monthly', -- 'monthly' | 'annual' | 'usage'
  notes           TEXT,
  card_on_file    TEXT,                 -- 'tide' | 'starling' | 'unknown'
  next_review     DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
-- Revenue events (from RevenueCat/Stripe webhooks)
-- ──────────────────────────────────────────────────────────
CREATE TABLE finance.revenue_events (
  id              BIGSERIAL PRIMARY KEY,
  event_date      TIMESTAMPTZ NOT NULL,
  external_id     TEXT UNIQUE,
  source          TEXT NOT NULL,        -- 'revenuecat' | 'stripe'
  event_type      TEXT NOT NULL,        -- 'INITIAL_PURCHASE' | 'RENEWAL' | 'CANCELLATION' | 'REFUND' | 'TRIAL_STARTED' | 'TRIAL_CONVERTED'
  user_id         TEXT,                 -- anonymised user id
  product_id      TEXT,                 -- 'monthly' | 'annual' | 'lifetime' | 'starter'
  gross_amount    NUMERIC(10,2),        -- before Apple cut
  net_amount      NUMERIC(10,2),        -- after Apple cut
  currency        TEXT DEFAULT 'GBP',
  is_trial        BOOLEAN DEFAULT FALSE,
  raw             JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON finance.revenue_events(event_date DESC);
CREATE INDEX ON finance.revenue_events(event_type);

-- ──────────────────────────────────────────────────────────
-- Milestones (from the Excel Milestones sheet)
-- ──────────────────────────────────────────────────────────
CREATE TABLE finance.milestones (
  id              BIGSERIAL PRIMARY KEY,
  stage           INTEGER NOT NULL,     -- 0-5
  stage_name      TEXT NOT NULL,
  name            TEXT NOT NULL,
  target_text     TEXT NOT NULL,        -- "100 paying subs"
  target_value    NUMERIC,              -- 100 (numeric comparable)
  target_metric   TEXT,                 -- 'paying_users' | 'mrr' | 'retention_d30' | null for manual
  due_by          TEXT,                 -- "Month 3", "30 days"
  why_it_matters  TEXT,
  is_hit          BOOLEAN DEFAULT FALSE,
  hit_date        DATE,
  actual_value    TEXT,
  display_order   INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
-- Daily metric snapshots (for historical charts)
-- ──────────────────────────────────────────────────────────
CREATE TABLE finance.metric_history (
  id              BIGSERIAL PRIMARY KEY,
  snapshot_date   DATE NOT NULL,
  metric          TEXT NOT NULL,        -- 'mrr', 'paying_users', 'trial_users', 'cash_balance', 'monthly_burn'
  value           NUMERIC NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (snapshot_date, metric)
);
CREATE INDEX ON finance.metric_history(metric, snapshot_date DESC);

-- ──────────────────────────────────────────────────────────
-- Todos (operational task tracker; seeded from the To-Do sheet)
-- ──────────────────────────────────────────────────────────
CREATE TABLE finance.todos (
  id              BIGSERIAL PRIMARY KEY,
  priority        TEXT NOT NULL,        -- '🔴','🟠','🟡','🟢','🔵','🟣','⚫','⬛'
  category        TEXT NOT NULL,        -- 'this_week','time_sensitive','before_launch',
                                        -- 'this_month','recurring','after_launch','dormant','dashboard_build'
  title           TEXT NOT NULL,
  context         TEXT,
  status          TEXT NOT NULL DEFAULT 'todo',  -- 'todo'|'in_progress'|'done'|'resolved'|'recurring'|'later'|'dormant'|'skipped'
  done_date       DATE,
  notes           TEXT,
  display_order   INTEGER,
  trigger_metric  TEXT,                 -- e.g. 'runway_months' for auto-activation
  trigger_value   NUMERIC,              -- e.g. 9 (activate when runway drops below)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON finance.todos(status);
CREATE INDEX ON finance.todos(category);

-- ──────────────────────────────────────────────────────────
-- Assumptions (the yellow cells from the Excel model)
-- ──────────────────────────────────────────────────────────
CREATE TABLE finance.assumptions (
  key             TEXT PRIMARY KEY,
  value           NUMERIC NOT NULL,
  unit            TEXT,                 -- 'pct', 'gbp', 'months', 'count'
  description     TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed assumptions from the Excel model
INSERT INTO finance.assumptions (key, value, unit, description) VALUES
  ('apple_fee_y1',             0.30,  'pct',   'Standard Apple fee, year 1'),
  ('apple_fee_y2',             0.15,  'pct',   'Apple Small Business fee, year 2+'),
  ('variable_cost_per_user',   1.00,  'gbp',   'Monthly variable cost per active user'),
  ('refund_rate',              0.03,  'pct',   'Apple/Stripe refund reserve'),
  ('monthly_retention_months', 6,     'months','Avg active months for monthly subs'),
  ('annual_renewal_rate',      0.40,  'pct',   'Renewal rate for annual subs after year 1'),
  ('lifetime_active_months',   36,    'months','Avg active months for lifetime subs'),
  ('churn_monthly',            0.05,  'pct',   'Monthly churn assumption'),
  ('founder_salary_target',    500,   'gbp',   'Monthly founder draw target (for breakeven calc)');

-- ──────────────────────────────────────────────────────────
-- Views for the dashboard (materialized for speed)
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW finance.v_monthly_burn AS
SELECT
  COALESCE(SUM(CASE WHEN is_active AND NOT is_projected THEN monthly_amount ELSE 0 END), 0) AS actual_burn,
  COALESCE(SUM(CASE WHEN is_active THEN monthly_amount ELSE 0 END), 0) AS burn_inc_projected
FROM finance.cost_items;

CREATE OR REPLACE VIEW finance.v_latest_cash AS
SELECT tide_balance, snapshot_date, notes
FROM finance.cash_snapshots
ORDER BY snapshot_date DESC, id DESC
LIMIT 1;

CREATE OR REPLACE VIEW finance.v_runway AS
SELECT
  c.tide_balance,
  b.actual_burn,
  b.burn_inc_projected,
  CASE WHEN b.actual_burn > 0 THEN c.tide_balance / b.actual_burn ELSE NULL END AS runway_actual,
  CASE WHEN b.burn_inc_projected > 0 THEN c.tide_balance / b.burn_inc_projected ELSE NULL END AS runway_projected
FROM finance.v_latest_cash c
CROSS JOIN finance.v_monthly_burn b;

-- MRR from RevenueCat events in the last 30 days
CREATE OR REPLACE VIEW finance.v_mrr_30d AS
SELECT
  COALESCE(SUM(
    CASE
      WHEN event_type IN ('INITIAL_PURCHASE','RENEWAL') AND product_id = 'monthly' THEN net_amount
      WHEN event_type IN ('INITIAL_PURCHASE','RENEWAL') AND product_id = 'annual' THEN net_amount / 12
      ELSE 0
    END
  ), 0) AS mrr
FROM finance.revenue_events
WHERE event_date >= NOW() - INTERVAL '30 days';

-- Active paying users (anyone with a purchase in last 30d and no cancellation after)
CREATE OR REPLACE VIEW finance.v_active_subs AS
SELECT COUNT(DISTINCT user_id) AS active_paying
FROM finance.revenue_events
WHERE event_type IN ('INITIAL_PURCHASE','RENEWAL')
  AND event_date >= NOW() - INTERVAL '45 days'
  AND user_id NOT IN (
    SELECT DISTINCT user_id
    FROM finance.revenue_events
    WHERE event_type IN ('CANCELLATION','REFUND')
      AND event_date >= NOW() - INTERVAL '45 days'
  );

-- Row-Level Security (belt and braces — auth should also check at API layer)
ALTER TABLE finance.cash_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.revenue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.metric_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.assumptions ENABLE ROW LEVEL SECURITY;

-- Policy: only the authenticated allowlist user can read/write
CREATE POLICY admin_full_access ON finance.cash_snapshots
  FOR ALL USING (auth.jwt() ->> 'email' = current_setting('app.admin_email', true));
-- (repeat for each table)
```

## 6. Auth — Google OAuth with allowlist

Use Supabase Auth. Add Google as a provider in the Supabase dashboard, then:

```typescript
// middleware.ts (Next.js)
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim());

export async function middleware(request) {
  const res = NextResponse.next();
  const supabase = createServerClient(/* ... */);
  const { data: { user } } = await supabase.auth.getUser();
  
  const isLoginPage = request.nextUrl.pathname === '/login';
  const isAuthCallback = request.nextUrl.pathname.startsWith('/auth/callback');
  
  if (isAuthCallback) return res;
  
  if (!user) {
    return isLoginPage ? res : NextResponse.redirect(new URL('/login', request.url));
  }
  
  if (!ALLOWED_EMAILS.includes(user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?error=unauthorised', request.url));
  }
  
  if (isLoginPage) return NextResponse.redirect(new URL('/', request.url));
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

Set `ALLOWED_EMAILS=honeybulr@gmail.com` in Vercel env vars. That's it. Single-user with a guardrail.

## 7. API surface (Express routes to add)

All routes require `Authorization: Bearer <supabase-jwt>`. Verify the JWT on the Express side using the Supabase anon key or a shared secret.

```
GET  /api/finance/dashboard         → returns all top-line numbers in one call
GET  /api/finance/transactions      → paginated list
POST /api/finance/transactions      → add manual transaction
POST /api/finance/transactions/import → upload Tide CSV (multipart)
GET  /api/finance/cost-items        → list recurring costs
POST /api/finance/cost-items        → add new cost
PATCH /api/finance/cost-items/:id   → edit cost
POST /api/finance/cash-snapshot     → update Tide balance
GET  /api/finance/milestones        → list all milestones with hit status
PATCH /api/finance/milestones/:id   → mark milestone hit
GET  /api/finance/todos             → list todos (filter by status/category)
POST /api/finance/todos             → add new todo
PATCH /api/finance/todos/:id        → update todo (status, notes, etc.)
DELETE /api/finance/todos/:id       → delete todo
GET  /api/finance/metric-history    → for charts
GET  /api/finance/assumptions       → get all assumptions
PATCH /api/finance/assumptions/:key → update one assumption
POST /webhooks/revenuecat           → RevenueCat event webhook (no auth, verify signature)
POST /webhooks/stripe               → Stripe webhook (if you use Stripe)
POST /jobs/daily-snapshot           → cron endpoint, snapshots current metrics to metric_history
```

### Dashboard route response shape

```typescript
// GET /api/finance/dashboard
interface DashboardResponse {
  cash: {
    balance: number;
    lastUpdated: string; // ISO date
    daysStale: number;   // red flag if > 7
  };
  burn: {
    actual: number;
    inclProjected: number;
    breakdown: Array<{ name: string; amount: number; category: string; isProjected: boolean }>;
  };
  runway: {
    actualMonths: number;
    projectedMonths: number;
    zone: 'green' | 'amber' | 'red';  // >6, 3-6, <3
  };
  revenue: {
    mrr: number;
    mrrTrend30d: number; // % change
    activePayingUsers: number;
    trialUsers: number;
    trialConversion30d: number; // %
  };
  milestones: {
    currentStage: number;
    stageName: string;
    hitInStage: number;
    totalInStage: number;
    nextMilestone: { name: string; target: string } | null;
  };
  todos: {
    openCount: number;
    doneCount: number;
    topOpen: Array<{ id: number; priority: string; title: string; context: string; category: string }>; // top 10 by display_order
  };
  redZones: Array<{
    metric: string;
    current: number | string;
    threshold: number;
    status: 'green' | 'amber' | 'red';
  }>;
  lastSynced: {
    revenuecat: string | null;
    tide: string | null;
  };
}
```

## 8. RevenueCat webhook handler

RevenueCat is the critical integration — it gives you everything about subscribers in real time. Set up in the RevenueCat dashboard: project → webhooks → add URL → `https://your-express-app.railway.app/webhooks/revenuecat`.

```typescript
// Express route
app.post('/webhooks/revenuecat', express.json(), async (req, res) => {
  // Verify signature
  const signature = req.headers['authorization'];
  if (signature !== `Bearer ${process.env.REVENUECAT_WEBHOOK_SECRET}`) {
    return res.status(401).send('Unauthorized');
  }
  
  const event = req.body.event;
  
  const mapped = {
    external_id: event.id,
    event_date: new Date(event.event_timestamp_ms).toISOString(),
    source: 'revenuecat',
    event_type: event.type, // INITIAL_PURCHASE, RENEWAL, CANCELLATION, etc.
    user_id: event.app_user_id,
    product_id: mapProductId(event.product_id), // 'monthly' | 'annual' | etc.
    gross_amount: event.price,
    net_amount: event.price * (1 - appleFee(event)), // use current assumption
    currency: event.currency,
    is_trial: event.period_type === 'TRIAL',
    raw: event,
  };
  
  await supabase.from('finance.revenue_events').upsert(mapped, { onConflict: 'external_id' });
  res.status(200).send('OK');
});
```

RevenueCat events you care about:
- `INITIAL_PURCHASE` — new paying customer
- `RENEWAL` — they kept paying
- `CANCELLATION` — they cancelled (still active till period end)
- `EXPIRATION` — they've actually lapsed
- `REFUND` — Apple refunded them
- `SUBSCRIPTION_PAUSED` — iOS subscription pause feature

## 9. Tide CSV import

Tide doesn't have a public API, so this stays manual. Build a drag-drop uploader on `/transactions`:

```typescript
// Parse CSV client-side with Papa Parse
// Send parsed rows to POST /api/finance/transactions/import
// Server dedups on external_id (Tide gives each row a unique ID)
// Auto-categorise based on counterparty match (e.g., "ANTHROPIC" → software)
// Show a "review" step before committing so Rob can fix any miscategorisations
```

Categorisation rules (put in `api/finance/categoriser.ts`):

```typescript
const RULES: Array<[RegExp, Partial<Transaction>]> = [
  [/anthropic/i,        { category: 'software', is_recurring: true }],
  [/supabase/i,         { category: 'software', is_recurring: true }],
  [/railway/i,          { category: 'software', is_recurring: true }],
  [/perplexity/i,       { category: 'software', is_recurring: false }],
  [/cursor/i,           { category: 'software', is_recurring: false }],
  [/expo/i,             { category: 'software', is_recurring: true }],
  [/godaddy/i,          { category: 'software', is_recurring: true }],
  [/appscreens/i,       { category: 'software', is_recurring: true }],
  [/iconikai/i,         { category: 'software', is_recurring: false }],
  [/tide.*fee/i,        { category: 'bank_fees', is_recurring: true }],
  [/insurance/i,        { category: 'insurance', is_recurring: true }],
  [/from.*revolut/i,    { category: 'capital', is_capital: true }], // founder top-up
  [/top.?up/i,          { category: 'capital', is_capital: true }],
  [/card.?refund/i,     { category: 'refund' }],
];
```

## 10. Page structure & components

```
app/
├─ login/page.tsx                 — Google sign-in button
├─ layout.tsx                     — Sidebar nav, top bar with sync status
├─ page.tsx                       — Main dashboard
├─ cashflow/page.tsx              — Cash history chart + forecast
├─ subs/page.tsx                  — RevenueCat live data
├─ milestones/page.tsx            — Milestones tracker
├─ todos/page.tsx                 — Operational task tracker (replaces the To-Do sheet)
├─ transactions/page.tsx          — Transaction list + Tide CSV upload
├─ costs/page.tsx                 — Cost items editor
├─ settings/page.tsx              — Assumptions editor
└─ api/auth/callback/route.ts     — OAuth callback

components/
├─ KpiCard.tsx                    — Single metric tile with trend
├─ RunwayGauge.tsx                — Visual red/amber/green gauge
├─ CashFlowChart.tsx              — Recharts line chart
├─ MilestoneRow.tsx               — Checkable milestone with date
├─ TodoList.tsx                   — Grouped todos with status dropdown
├─ TodoSummary.tsx                — Dashboard widget showing top 10 open todos
├─ TransactionTable.tsx           — Sortable, filterable
├─ CsvUploader.tsx                — Drag-drop Tide CSV
└─ SyncStatusBanner.tsx           — Shows when data was last fetched

lib/
├─ supabase/client.ts             — Browser client
├─ supabase/server.ts             — Server component client
├─ api.ts                         — Typed wrapper around your Express endpoints
├─ finance/calculations.ts        — All the math (pure functions, easily tested)
└─ finance/types.ts               — Shared types
```

### Main dashboard layout (the `/` route)

```
┌────────────────────────────────────────────────────────────────┐
│  Etapa Finance    🟢 Synced 2min ago    rob@getetapa.com  [⚙]  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────┐ │
│  │   CASH      │ │  MRR        │ │  RUNWAY     │ │  PAYING  │ │
│  │  £4,490     │ │   £0        │ │  23.0 mo 🟢 │ │   0      │ │
│  │  ▲ 0.0%     │ │   ▲ 0.0%    │ │  15.3 inc.  │ │   ▲ 0    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └──────────┘ │
│                                                                │
│  ⚠  You're in Stage 0 — Launch Readiness.                     │
│     Next: App Store approval                                   │
│                                                                │
│  🔴 Active To-Dos (13 open, 7 done)                          │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  🔴 Switch Tide plan + insurance payment method   [⚙]  │   │
│  │  🔴 Update Tide balance after reimbursement      [⚙]   │   │
│  │  🟡 Publish Privacy Policy                       [⚙]   │   │
│  │  🟡 Register with ICO                            [⚙]   │   │
│  │  🟡 Apply: Apple Small Business Program          [⚙]   │   │
│  │  → See all todos                                        │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌─────────────────────────────┐ ┌────────────────────────┐   │
│  │  Cash Projection (12 mo)    │ │  Monthly Burn Breakdown│   │
│  │  [line chart]               │ │  [horizontal bar chart]│   │
│  └─────────────────────────────┘ └────────────────────────┘   │
│                                                                │
│  Recent activity                                               │
│  • 23 Apr · Anthropic · -£22.26 · Tide                        │
│  • 22 Apr · Revolut top-up · +£4,113 · Capital                │
│  • ...                                                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## 11. Build phases — each verifiable before moving on

### Phase 1: Plumbing (1 day)
- Create the Next.js project at `/dashboard` in the existing repo
- Add the `finance` schema migration
- Add Supabase client setup
- Set up Google OAuth with allowlist middleware
- Deploy to Vercel with env vars
- **Done when**: you can sign in with `honeybulr@gmail.com`, see an empty dashboard, and anyone else gets bounced.

### Phase 2: Seed the data (0.5 days)
- Write a seed script that reads the Excel model and populates:
  - `finance.assumptions` (from the Assumptions sheet yellow cells)
  - `finance.cost_items` (from Assumptions rows 8-17 actual, 31-44 projected)
  - `finance.milestones` (from the Milestones sheet)
  - `finance.todos` (from the To-Do sheet — ~44 items across 8 categories)
- Manually add the most recent Tide balance as a `cash_snapshot`
- **Done when**: running `npm run seed:finance` populates the DB with everything from the Excel file. Run `SELECT COUNT(*) FROM finance.todos WHERE status='todo'` — should match the open count in the Excel.

### Phase 3: Manual entry flows (1 day)
- Build `/costs` page — CRUD for `cost_items`
- Build `/settings` page — edit assumptions
- Build `/transactions` page — list + manual add
- Build the Tide CSV uploader with client-side parse and server-side dedup
- **Done when**: you can upload your Tide CSV and see all 27 transactions categorised; editing any cost item recomputes burn live.

### Phase 4: Dashboard read-side (1 day)
- Build `GET /api/finance/dashboard` that returns the full typed response
- Build the dashboard page with `<KpiCard>`, `<RunwayGauge>`, and `<CashFlowChart>` components
- Use TanStack Query with 60s stale time, refetch-on-focus
- **Done when**: the main dashboard shows identical numbers to the Excel model (£4,490 cash, £195 burn actual, 23.0 months runway).

### Phase 5: Live revenue integration (1 day)
- Build the RevenueCat webhook endpoint in Express
- Set up the RevenueCat webhook pointing at it
- Make a test purchase in TestFlight sandbox → verify it lands in `revenue_events`
- Wire MRR and active subs into the dashboard
- **Done when**: a sandbox purchase shows up on the dashboard within 10 seconds.

### Phase 6: Milestones, todos & red zones (1.5 days)
- Build `/milestones` page — the Excel Milestones sheet as live UI
- Build `/todos` page — full todo tracker grouped by category, with status dropdown, filters (open / done / recurring)
- Add `<TodoSummary>` component to the dashboard showing top 10 open items
- Auto-hit logic for milestones: if `metric_history.paying_users >= 100`, auto-mark "100 paying users" milestone as hit
- Auto-activation for todos: when `runway_months < trigger_value`, flip dormant todos → `todo` status (e.g., Start Up Loan activates below 9 months)
- Build red-zone banner component — red alert if runway <3 months
- Add "Current stage" calculation (highest stage where all milestones hit)
- **Done when**: milestones & todos both render, status edits persist, and dormant todos auto-activate when their trigger fires.

### Phase 7: Daily cron & historical charts (0.5 days)
- Add `POST /jobs/daily-snapshot` — writes today's key metrics to `metric_history`
- Set up GitHub Actions workflow hitting it daily at 02:00 UTC with a bearer token
- Build historical charts on `/cashflow` and `/subs` using `metric_history` data
- **Done when**: there's a daily cron running, and charts show multi-day history after a week.

### Phase 8: Polish (0.5 days)
- Empty states everywhere (what shows when no revenue yet?)
- Loading skeletons
- Error boundaries
- Mobile-responsive check
- **Done when**: you'd be happy to show this to a sceptical investor.

**Total: ~6.5 dev days.** Spread that over 2-3 calendar weeks around your other work.

## 12. Secrets needed (put in Vercel + Railway env vars)

```
# Vercel (frontend)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_BASE_URL=https://your-express.railway.app
ALLOWED_EMAILS=honeybulr@gmail.com
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...

# Railway (backend)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...   # service role, not anon, for admin writes
REVENUECAT_WEBHOOK_SECRET=...
STRIPE_WEBHOOK_SECRET=...       # if/when you add Stripe
CRON_SECRET=...                  # for /jobs/* endpoints
```

## 13. What NOT to build in v1

Resist scope creep. These are explicitly out of scope for v1 and should be future tickets:

- Multi-user support
- Mobile native app
- PDF export of reports
- Email/Slack alerts when red zone hit
- Bank account direct integrations (Tide / Starling Open Banking) — these are fiddly, stay manual
- Investor portal / sharing views
- Scenario modelling UI (the Excel model still does this; don't duplicate yet)
- Tax calculations (Corporation Tax, VAT) — the Excel model is better for annual planning

Add each as a GitHub issue so you remember them.

## 14. A note on the existing Excel model

The spreadsheet `Etapa_Financial_Model.xlsx` already encodes:
- All assumptions (rows in the Assumptions sheet → `finance.assumptions`)
- All cost items (rows in Assumptions rows 8-17 actual, 31-44 projected → `finance.cost_items`)
- All milestones (Milestones sheet → `finance.milestones`)
- Red zone thresholds (Red Zones sheet — hardcode these in the dashboard UI)
- Pricing tiers (Pricing sheet — these don't change; bake into UI constants)

**The Excel file is the specification for the finance logic.** When building, if a formula isn't obvious, open the spreadsheet and check how the math is done there. Don't reinvent.

The spreadsheet should continue to be used for:
- Quarterly strategic modelling (what-if scenarios)
- Investor conversations (easier to share a spreadsheet)
- Annual tax planning

The dashboard is for **daily/weekly ops**, not strategic planning.

## 15. Success criteria for v1

The dashboard is done when Rob can:

1. Sign in at a URL in under 5 seconds
2. See runway in one glance without scrolling
3. Upload a fresh Tide CSV and have it automatically categorise 90%+ of transactions
4. See MRR update live as TestFlight sandbox purchases happen
5. Click through each milestone stage and see what's done vs outstanding
6. Stop opening the Excel file for the weekly Monday check-in

That's it. If it's not saving him time each week compared to the spreadsheet, it hasn't worked.

## 16. Additional context: TODO items referenced throughout

The full operational to-do list lives in the `finance.todos` table, seeded from the `To-Do` sheet in the Excel model. It has ~44 items across these categories:

- `this_week` — 🔴 financial hygiene (most Done)
- `time_sensitive` — 🟠 deadlines
- `before_launch` — 🟡 legal, compliance, infra (Privacy Policy, ICO, SEIS AA, etc.)
- `this_month` — 🟢 business setup decisions
- `recurring` — 🔵 Monday/monthly/quarterly rhythm (never "done", just reminders)
- `after_launch` — 🟣 tracking retention, churn, variable cost
- `dormant` — ⚫ only activate if runway <9 months (Start Up Loan, angels, R&D claim)
- `dashboard_build` — ⬛ this project

**Do not hardcode todos in the UI.** Read from the table. The seed script takes the Excel source of truth and writes them on first run.

**Dormant todos with auto-activation**: seed these with `trigger_metric='runway_months', trigger_value=9, status='dormant'`. A daily job should flip them to `status='todo'` when the condition is met, and push a notification.

---

## Claude Code: how to start

1. Read the attached `Etapa_Financial_Model.xlsx` first. The finance logic is encoded there.
2. Create a new branch: `git checkout -b dashboard/initial`
3. Start with Phase 1. Don't skip ahead. Each phase has explicit "Done when" criteria — hit them before moving on.
4. Prefer small, mergeable PRs per phase over one giant one.
5. When in doubt, match the numbers in the Excel file. If they diverge, the Excel is right.
6. Test the RevenueCat webhook with the RevenueCat sandbox events feature before relying on real purchases.

Good luck. Ship it.
