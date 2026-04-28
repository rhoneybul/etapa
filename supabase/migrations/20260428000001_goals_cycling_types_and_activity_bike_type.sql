-- ──────────────────────────────────────────────────────────────────────────────
-- Multi-bike support
--
-- 1) goals.cycling_types — text[] of bike types the rider configured
--    (road, gravel, mtb, ebike, indoor). Drives plan-generation so the
--    coach can schedule sessions across the rider's bike menu, and lets
--    the activity-detail UI offer per-session bike overrides.
--
--    Back-compat: the existing scalar `cycling_type` column stays. We
--    keep writing it (derived: single → that key, multi → 'mixed') so
--    every reader keeps working unchanged.
--
-- 2) activities.bike_type — text, optional override on a single
--    session. Null = "use plan default / rider's choice". Set when the
--    plan generator tags a session with a specific bike, or when the
--    rider swaps a session's bike from the activity-detail screen.
--
-- Note: the table is `public.activities` (created in 20260330000001).
-- An earlier draft of this migration referenced `public.plan_activities`
-- — that's the wrong name and will fail with relation does not exist.
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.goals
  add column if not exists cycling_types text[];

comment on column public.goals.cycling_types is
  'Multi-select cycling types the rider configured at intake (e.g. {road,gravel}). When length=1 mirrors cycling_type; when length>1 cycling_type is set to ''mixed'' for legacy readers. Used by plan generation to schedule sessions across multiple bike types.';

alter table public.activities
  add column if not exists bike_type text;

comment on column public.activities.bike_type is
  'Per-session bike override. One of road | gravel | mtb | ebike | indoor, or null (= rider''s choice / matches plan default). Set by the plan generator or by the rider via the activity-detail screen. Nullable.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 3) activities.structure — JSONB warmup/main/cooldown breakdown
--
-- Was previously kept only in client-side AsyncStorage; the rest of the
-- server didn't see it. Persisting it server-side unlocks two things:
--  • The workout export endpoint can produce ZWO/MRC files for any
--    structured session (intervals, tempo, threshold) directly from the DB
--    without round-tripping back to the client.
--  • The "explain this session" action — when triggered — can write its
--    result back so subsequent visits skip the LLM call.
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.activities
  add column if not exists structure jsonb;

comment on column public.activities.structure is
  'Optional warmup/main/cooldown breakdown for structured sessions. Schema: { warmup: {durationMins, description, effort}, main: {type, reps, workMins, restMins, blockMins, description, intensity: {rpe, rpeCue, hrZone, hrPctOfMaxLow, hrPctOfMaxHigh, powerZone, powerPctOfFtpLow, powerPctOfFtpHigh}}, cooldown: {durationMins, description, effort} }. Used by the workout export endpoint and the activity-detail breakdown UI.';
