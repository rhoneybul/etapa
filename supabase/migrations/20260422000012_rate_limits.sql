-- ──────────────────────────────────────────────────────────────────────────
-- Rate limits: per-user caps on plan generation + coach messaging.
--
-- Two tables:
--   1. user_rate_limits       — per-user overrides (defaults come from env/remote)
--   2. coach_message_log      — every user-sent coach message, for rolling counts
--
-- Defaults (set in server code, overridable via env + app_config):
--   - 5 plans per rolling 7 days (includes regenerations)
--   - 25 coach messages per rolling 7 days
--
-- Per-user overrides are set by admins via the dashboard and take precedence.
-- NULL override = use the global default.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.user_rate_limits (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  weekly_plan_limit        integer,  -- null => use global default
  weekly_coach_msg_limit   integer,  -- null => use global default
  note                     text,     -- free text: why this user has custom limits
  updated_at               timestamptz not null default now(),
  created_at               timestamptz not null default now()
);

alter table public.user_rate_limits enable row level security;

-- No direct client access — only service-role backend reads/writes.
-- (Admins hit the backend with the service key; users never touch this table.)
create policy "Users can view own rate limits"
  on public.user_rate_limits for select using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────
-- coach_message_log — one row per user-sent message
--
-- We log individual sends here (rather than counting inside chat_sessions.messages
-- jsonb) so the rolling-7d query is a cheap index lookup instead of a flatten +
-- filter over every session.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.coach_message_log (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  session_id   text,                                    -- chat_sessions.id (loose FK — can be null for ad-hoc)
  week_num     integer,                                 -- optional scope
  created_at   timestamptz not null default now()
);

-- Rolling-7d counts always filter by user + created_at — covering index
create index if not exists coach_message_log_user_time_idx
  on public.coach_message_log (user_id, created_at desc);

alter table public.coach_message_log enable row level security;

-- Users can read their own log (so the client can show accurate counts without
-- going through the server). Insert is server-only via service role.
create policy "Users can view own coach message log"
  on public.coach_message_log for select using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────
-- Index for the plans-per-week count: the existing plans table lookup is by
-- user_id + created_at. Add an index if not already present.
-- ──────────────────────────────────────────────────────────────────────────

create index if not exists plans_user_created_idx
  on public.plans (user_id, created_at desc);

-- plan_generations table (if it exists from earlier migration) already tracks
-- every generation attempt including regenerations. We'll count from there for
-- accuracy.
create index if not exists plan_generations_user_created_idx
  on public.plan_generations (user_id, created_at desc);

-- ──────────────────────────────────────────────────────────────────────────
-- Convenience view: rolling-7d plan count + rolling-7d coach-message count.
-- Not strictly required (the lib does the count in JS) but handy for admins.
-- ──────────────────────────────────────────────────────────────────────────

create or replace view public.user_rate_limit_usage as
select
  u.id as user_id,
  coalesce(u.email, '') as email,
  (
    select count(*)
    from public.plan_generations pg
    where pg.user_id = u.id
      and pg.created_at > now() - interval '7 days'
  ) as plans_7d,
  (
    select count(*)
    from public.coach_message_log cml
    where cml.user_id = u.id
      and cml.created_at > now() - interval '7 days'
  ) as coach_msgs_7d,
  url.weekly_plan_limit as plan_limit_override,
  url.weekly_coach_msg_limit as coach_msg_limit_override
from auth.users u
left join public.user_rate_limits url on url.user_id = u.id;

comment on table public.user_rate_limits is
  'Per-user rate limit overrides. NULL fields fall back to global defaults set in server env (PLANS_PER_WEEK_DEFAULT, COACH_MSGS_PER_WEEK_DEFAULT).';
comment on table public.coach_message_log is
  'One row per user-sent coach chat message. Drives the weekly rate limit count.';
