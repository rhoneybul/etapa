-- Add target_elevation to goals (for race goal AI lookup)
alter table public.goals
  add column if not exists target_elevation numeric;

-- Update subscriptions to support one-time starter purchases:
--   id     → 'starter_<payment_intent_id>' for one-time payments
--   plan   → 'starter' for beginner program
--   status → 'paid' for completed one-time payments
-- stripe_customer_id can be null for one-time payments (guest checkout)
alter table public.subscriptions
  alter column stripe_customer_id drop not null;

comment on column public.subscriptions.plan is
  'monthly | annual | starter';
comment on column public.subscriptions.status is
  'trialing | active | canceled | past_due | incomplete | paid';
