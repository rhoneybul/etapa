-- ──────────────────────────────────────────────────────────────────────────
-- Finance dashboard — charge dates, budgets, 12-month horizon
--
-- Two additions:
--
-- 1. cost_items.next_charge_date — complements the existing
--    next_month_override (amount + note). The dashboard was blindly
--    applying overrides to "next calendar month" which is wrong when a
--    founder knows a specific day. Flagging a date also lets us roll
--    overrides off the forward-looking burn calc automatically once
--    they've passed.
--
-- 2. finance.budgets — a new concept separate from cost_items. A cost item
--    is a committed recurring expense (Anthropic £115/mo is already
--    happening). A budget is an allocation cap for a *category* over a
--    period (Marketing £500/mo, legal £300/quarter). Budgets feed into the
--    12-month cash projection so runway maths account for *planned* spend
--    before transactions land.
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Charge date on overrides + projected/contingency items ────────────────
alter table finance.cost_items
  add column if not exists next_charge_date date;

comment on column finance.cost_items.next_charge_date is
  'When the next charge is expected. Used by the override path (pair with next_month_override + override_note) and by projected/contingency items that have a known timing. Nullable; charts and KPIs fall back to the standard monthly cadence when absent.';

-- 2. Budgets table ──────────────────────────────────────────────────────────
create table if not exists finance.budgets (
  id                  bigserial primary key,
  category            text not null,                  -- 'marketing' | 'legal' | 'finance' | 'software' | 'other'
  name                text not null,                  -- human label e.g. "Launch marketing"
  monthly_allowance   numeric(10,2) not null,         -- cap per month in GBP
  starts_on           date not null default current_date,
  ends_on             date,                           -- null = open-ended
  notes               text,
  is_active           boolean not null default true,
  display_order       integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists budgets_active_idx on finance.budgets (is_active) where is_active;
create index if not exists budgets_category_idx on finance.budgets (category);

comment on table finance.budgets is
  'Forward-looking spend allocations per category. Distinct from cost_items which are committed recurring expenses. The dashboard sums active budgets into the 12-month cash projection so runway accounts for planned marketing/legal spend even before a transaction hits.';

comment on column finance.budgets.monthly_allowance is
  'Monthly cap in GBP. For quarterly/annual allocations, divide by 3/12 and flag in notes.';

comment on column finance.budgets.ends_on is
  'Last date the budget applies. NULL = open-ended, applied for the full 12-month projection window.';

-- 3. Seed default budgets per the phased recommendation ────────────────────
-- These mirror the marketing + legal + finance allocations from the
-- financial model that was merged in earlier this month.
insert into finance.budgets (category, name, monthly_allowance, notes, display_order)
select 'marketing', 'Launch marketing', 500, 'Social ads + light influencer work. Ramps to £1000/mo once paid conversion > 2%.', 10
where not exists (select 1 from finance.budgets where name = 'Launch marketing');

insert into finance.budgets (category, name, monthly_allowance, notes, display_order)
select 'legal', 'Legal retainer', 100, '£300/quarter amortised. Covers ad-hoc reviews — ToS tweaks, IP queries.', 20
where not exists (select 1 from finance.budgets where name = 'Legal retainer');

insert into finance.budgets (category, name, monthly_allowance, notes, display_order)
select 'finance', 'Accounting & tax', 50, 'Confirmation statement + accounts filing amortised.', 30
where not exists (select 1 from finance.budgets where name = 'Accounting & tax');

-- 4. updated_at trigger so edits don't need client-side bookkeeping ────────
create or replace function finance.touch_budgets_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists budgets_updated_at on finance.budgets;
create trigger budgets_updated_at
  before update on finance.budgets
  for each row execute function finance.touch_budgets_updated_at();

-- 5. RLS — same allowlist-gated pattern as the other finance tables ───────
alter table finance.budgets enable row level security;

drop policy if exists "Admins read budgets" on finance.budgets;
create policy "Admins read budgets"
  on finance.budgets for select
  to authenticated
  using (finance.is_admin());

drop policy if exists "Admins write budgets" on finance.budgets;
create policy "Admins write budgets"
  on finance.budgets for all
  to authenticated
  using (finance.is_admin())
  with check (finance.is_admin());

grant select, insert, update, delete on finance.budgets to authenticated;
grant usage, select on sequence finance.budgets_id_seq to authenticated;
