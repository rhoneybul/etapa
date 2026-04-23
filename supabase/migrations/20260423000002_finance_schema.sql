-- ──────────────────────────────────────────────────────────────────────────
-- Finance schema — powers the founder-facing finance dashboard.
--
-- Source of truth after this migration runs: the DB. Initial seed data comes
-- from an admin-uploaded Excel file parsed by the dashboard at /import, NOT
-- from a committed file in git. The Excel file stays local on the founder's
-- machine; see docs/budget-dashboard/README_MAINTENANCE.md for the rhythm.
--
-- Deviations from ETAPA_DASHBOARD_SPEC.md §5:
--   - Added `finance.imports` table: tracks every Excel upload so reruns are
--     idempotent and admins can see when + what was last imported.
--   - RLS policy simplified to an allowlist claim check; the spec pattern
--     used `current_setting('app.admin_email', ...)` which requires runtime
--     settings we don't have. Using `auth.jwt() ->> 'email'` against an
--     allowlist table keeps it schema-pure.
-- ──────────────────────────────────────────────────────────────────────────

create schema if not exists finance;

-- ──────────────────────────────────────────────────────────────────────────
-- Allowlist — who can see the finance dashboard at all.
-- Seeded by the server on startup from ALLOWED_EMAILS env var.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists finance.admin_allowlist (
  email        text primary key,
  added_at     timestamptz not null default now(),
  notes        text
);

-- Helper predicate: does the current JWT belong to an allowlisted email?
-- Inlined into each RLS policy so we don't fan out policy duplication.
create or replace function finance.is_admin() returns boolean
  language sql stable security definer
  as $$
    select exists (
      select 1 from finance.admin_allowlist
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
  $$;
comment on function finance.is_admin() is
  'True when the JWT email is in finance.admin_allowlist. Drives RLS across the finance schema.';

-- ──────────────────────────────────────────────────────────────────────────
-- Cash position — Tide balance over time.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists finance.cash_snapshots (
  id              bigserial primary key,
  snapshot_date   date not null,
  tide_balance    numeric(12,2) not null,
  source          text not null default 'manual',   -- 'manual' | 'csv_import' | 'excel_import'
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists cash_snapshots_date_idx on finance.cash_snapshots (snapshot_date desc);

-- ──────────────────────────────────────────────────────────────────────────
-- Transactions — Tide CSV + webhook revenue events.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists finance.transactions (
  id              bigserial primary key,
  txn_date        timestamptz not null,
  external_id     text unique,          -- Tide transaction id or Stripe/RC id
  source          text not null,        -- 'tide' | 'stripe' | 'revenuecat' | 'manual' | 'excel_import'
  description     text not null,
  counterparty    text,
  amount          numeric(12,2) not null,  -- positive = money in, negative = out
  currency        text not null default 'GBP',
  category        text,                 -- 'software' | 'revenue' | 'bank_fees' | 'insurance' | 'capital' | 'refund' | 'other'
  is_business     boolean not null default true,
  is_recurring    boolean not null default false,
  is_capital      boolean not null default false,   -- founder top-up, not an expense
  notes           text,
  raw             jsonb,                -- keep the original row for debugging
  created_at      timestamptz not null default now()
);
create index if not exists transactions_date_idx     on finance.transactions (txn_date desc);
create index if not exists transactions_category_idx on finance.transactions (category);
create index if not exists transactions_source_idx   on finance.transactions (source);

-- ──────────────────────────────────────────────────────────────────────────
-- Recurring cost items — the monthly burn.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists finance.cost_items (
  id              bigserial primary key,
  name            text not null,
  category        text not null,                   -- 'software' | 'legal' | 'accounting' | 'insurance' | 'other'
  monthly_amount  numeric(10,2) not null,
  is_active       boolean not null default true,
  is_projected    boolean not null default false,  -- contingency vs actual
  cadence         text not null default 'monthly', -- 'monthly' | 'annual' | 'usage'
  notes           text,
  card_on_file    text,                            -- 'tide' | 'starling' | 'unknown'
  next_review     date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────
-- Revenue events — from RevenueCat / Stripe webhooks.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists finance.revenue_events (
  id              bigserial primary key,
  event_date      timestamptz not null,
  external_id     text unique,
  source          text not null,        -- 'revenuecat' | 'stripe'
  event_type      text not null,        -- INITIAL_PURCHASE | RENEWAL | CANCELLATION | REFUND | TRIAL_STARTED | TRIAL_CONVERTED | EXPIRATION
  user_id         text,
  product_id      text,                 -- 'monthly' | 'annual' | 'lifetime' | 'starter'
  gross_amount    numeric(10,2),        -- before Apple cut
  net_amount      numeric(10,2),        -- after Apple cut
  currency        text not null default 'GBP',
  is_trial        boolean not null default false,
  raw             jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists revenue_events_date_idx on finance.revenue_events (event_date desc);
create index if not exists revenue_events_type_idx on finance.revenue_events (event_type);

-- ──────────────────────────────────────────────────────────────────────────
-- Milestones.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists finance.milestones (
  id              bigserial primary key,
  stage           integer not null,     -- 0-5
  stage_name      text not null,
  name            text not null,
  target_text     text not null,        -- "100 paying subs"
  target_value    numeric,              -- 100 (numeric comparable)
  target_metric   text,                 -- 'paying_users' | 'mrr' | 'retention_d30' | null for manual
  due_by          text,                 -- "Month 3"
  why_it_matters  text,
  is_hit          boolean not null default false,
  hit_date        date,
  actual_value    text,
  display_order   integer,
  created_at      timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────
-- Daily metric snapshots — drives historical charts.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists finance.metric_history (
  id              bigserial primary key,
  snapshot_date   date not null,
  metric          text not null,        -- 'mrr' | 'paying_users' | 'trial_users' | 'cash_balance' | 'monthly_burn'
  value           numeric not null,
  created_at      timestamptz not null default now(),
  unique (snapshot_date, metric)
);
create index if not exists metric_history_metric_date_idx on finance.metric_history (metric, snapshot_date desc);

-- ──────────────────────────────────────────────────────────────────────────
-- Todos — operational task tracker, seeded from the Excel To-Do sheet on upload.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists finance.todos (
  id              bigserial primary key,
  priority        text not null,                   -- emoji marker from Excel
  category        text not null,                   -- 'this_week' | 'time_sensitive' | 'before_launch' | 'this_month' | 'recurring' | 'after_launch' | 'dormant' | 'dashboard_build'
  title           text not null,
  context         text,
  status          text not null default 'todo',    -- 'todo' | 'in_progress' | 'done' | 'resolved' | 'recurring' | 'later' | 'dormant' | 'skipped'
  done_date       date,
  notes           text,
  display_order   integer,
  trigger_metric  text,                            -- e.g. 'runway_months'
  trigger_value   numeric,                         -- e.g. 9 (flip to 'todo' when runway < 9)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists todos_status_idx   on finance.todos (status);
create index if not exists todos_category_idx on finance.todos (category);

-- ──────────────────────────────────────────────────────────────────────────
-- Assumptions — the yellow Excel cells.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists finance.assumptions (
  key             text primary key,
  value           numeric not null,
  unit            text,                 -- 'pct' | 'gbp' | 'months' | 'count'
  description     text,
  updated_at      timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────
-- Imports — audit trail for every Excel upload.
-- Added by this migration (not in the original spec) so the upload flow is
-- idempotent and admins can see who last seeded.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists finance.imports (
  id              bigserial primary key,
  imported_by     text not null,        -- email of the user who uploaded
  filename        text,
  file_size       integer,
  sheet_counts    jsonb not null,       -- {cost_items: 13, todos: 44, milestones: 30, ...}
  status          text not null default 'applied',  -- 'applied' | 'reverted' | 'dry_run'
  notes           text,
  created_at      timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────
-- Views used by the dashboard.
-- ──────────────────────────────────────────────────────────────────────────

create or replace view finance.v_monthly_burn as
select
  coalesce(sum(case when is_active and not is_projected then monthly_amount else 0 end), 0) as actual_burn,
  coalesce(sum(case when is_active then monthly_amount else 0 end), 0) as burn_inc_projected
from finance.cost_items;

create or replace view finance.v_latest_cash as
select tide_balance, snapshot_date, notes
from finance.cash_snapshots
order by snapshot_date desc, id desc
limit 1;

create or replace view finance.v_runway as
select
  c.tide_balance,
  b.actual_burn,
  b.burn_inc_projected,
  case when b.actual_burn > 0        then c.tide_balance / b.actual_burn        else null end as runway_actual,
  case when b.burn_inc_projected > 0 then c.tide_balance / b.burn_inc_projected else null end as runway_projected
from finance.v_latest_cash c
cross join finance.v_monthly_burn b;

create or replace view finance.v_mrr_30d as
select
  coalesce(sum(
    case
      when event_type in ('INITIAL_PURCHASE','RENEWAL') and product_id = 'monthly' then net_amount
      when event_type in ('INITIAL_PURCHASE','RENEWAL') and product_id = 'annual'  then net_amount / 12
      else 0
    end
  ), 0) as mrr
from finance.revenue_events
where event_date >= now() - interval '30 days';

create or replace view finance.v_active_subs as
select count(distinct user_id) as active_paying
from finance.revenue_events
where event_type in ('INITIAL_PURCHASE','RENEWAL')
  and event_date >= now() - interval '45 days'
  and user_id not in (
    select distinct user_id
    from finance.revenue_events
    where event_type in ('CANCELLATION','REFUND')
      and event_date >= now() - interval '45 days'
  );

-- ──────────────────────────────────────────────────────────────────────────
-- Row-Level Security — only allowlisted emails can see any of this.
-- Service role bypasses RLS for server-side writes.
-- ──────────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'finance'
      and tablename  in (
        'admin_allowlist','cash_snapshots','transactions','cost_items',
        'revenue_events','milestones','metric_history','todos',
        'assumptions','imports'
      )
  loop
    execute format('alter table finance.%I enable row level security', t);

    -- Single policy per table: allowlisted admins get full access.
    if not exists (
      select 1 from pg_policies
      where schemaname = 'finance' and tablename = t and policyname = 'admin_full_access'
    ) then
      execute format(
        'create policy admin_full_access on finance.%I for all using (finance.is_admin()) with check (finance.is_admin())',
        t
      );
    end if;
  end loop;
end $$;

comment on schema finance is
  'Founder-facing finance dashboard. Tables seeded via /import upload of Etapa_Financial_Model.xlsx; webhook handlers + manual entry take over after that. RLS gated on finance.admin_allowlist membership.';
