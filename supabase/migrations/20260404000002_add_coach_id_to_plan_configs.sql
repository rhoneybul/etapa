-- Ensure plan_configs has all columns the app expects.
-- These may already exist if migration 20260331000001 was applied,
-- but "if not exists" makes this safe to run regardless.

alter table public.plan_configs
  add column if not exists sessions_per_week       integer,
  add column if not exists session_types            jsonb,
  add column if not exists cross_training_days_full jsonb,
  add column if not exists indoor_trainer           boolean default false,
  add column if not exists extra_notes              text,
  add column if not exists coach_id                 text;
