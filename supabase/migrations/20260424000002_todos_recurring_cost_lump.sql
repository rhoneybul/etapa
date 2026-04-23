-- ──────────────────────────────────────────────────────────────────────────
-- cost_items — lump-sum / "already paid" tracking
--   last_paid_date / last_paid_amount let the founder record an actual
--   one-off payment (e.g. GoDaddy £45.59 paid 1 Apr 2027). For annual
--   items whose monthly_amount is amortised (£3.80/mo), this shows
--   whether the real cash movement has happened — the chart + KPIs
--   keep using monthly_amount for runway maths, but the UI surfaces
--   "✓ Paid £X on DATE" so the user knows the cash is already out.
--
-- todos — recurring cadence
--   Before this migration every "recurring" todo (the Monday rituals,
--   first-of-month tasks, quarterly reviews) sat at status='recurring'
--   and never changed. Now:
--     cadence           → 'weekly' | 'monthly' | 'quarterly'
--     last_completed_at → when the user last ticked it off
--   The UI evaluates "done THIS period?" at render time:
--     weekly  → last_completed_at >= start of the current week (Mon 00:00)
--     monthly → last_completed_at >= 1st of the current month
--     quarterly → last_completed_at >= 1st of the current quarter
--   No cron needed; the reset is implicit in the comparison.
-- ──────────────────────────────────────────────────────────────────────────

alter table finance.cost_items
  add column if not exists last_paid_date   date,
  add column if not exists last_paid_amount numeric(10,2);

alter table finance.todos
  add column if not exists cadence           text
    check (cadence is null or cadence in ('daily','weekly','monthly','quarterly')),
  add column if not exists last_completed_at timestamptz;

-- Seed the cadence for todos we already imported from the Excel To-Do
-- sheet. The title text is a reliable cue: "Every Monday: ..." → weekly,
-- "1st Monday of month: ..." → monthly, "Quarterly: ..." → quarterly.
-- Everything else in category='recurring' defaults to weekly.
update finance.todos
   set cadence = case
     when title ilike 'quarterly%'              then 'quarterly'
     when title ilike '1st monday of month%'    then 'monthly'
     when title ilike '1st of month%'           then 'monthly'
     when title ilike 'every monday%'           then 'weekly'
     when title ilike 'weekly%'                 then 'weekly'
     else 'weekly'
   end
 where category = 'recurring' and cadence is null;

comment on column finance.cost_items.last_paid_date is
  'When the real cash payment last happened for this item (for annual lump sums especially). monthly_amount still drives runway maths; this column just lets the UI show "paid already".';
comment on column finance.todos.cadence is
  'How often a recurring todo resets. NULL for one-off todos. UI compares last_completed_at against the current period start to decide whether the todo is ticked this period.';
