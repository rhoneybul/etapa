-- ──────────────────────────────────────────────────────────────────────────────
-- plan_configs: add longest_ride_km
--
-- Captured by the PlanPicker intake flow (guided onboarding). Stored so that
-- admin regeneration and future "review my plan" features can read back the
-- athlete's self-reported longest ride and pass it to the plan generator as
-- the Week-1 long-ride anchor. Optional — null when the user came from the
-- legacy three-card empty-state flow.
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.plan_configs
  add column if not exists longest_ride_km integer;

comment on column public.plan_configs.longest_ride_km is
  'Athlete''s longest ride in km over the last 6 months, self-reported via the PlanPicker intake flow. Nullable. Used by the plan generator prompt to anchor Week-1 long-ride distance.';
