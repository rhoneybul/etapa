-- ──────────────────────────────────────────────────────────────────────────────
-- Weekly coach check-ins
--
-- Structured weekly conversation between rider and AI coach. Different
-- from the existing post-session check-ins (server/src/routes/coachCheckin.js)
-- which fire after each completed activity — these are a planned weekly
-- ritual where the rider answers a small set of questions and the coach
-- proposes plan adjustments for next week.
--
-- Tables:
--   coach_checkins        — one row per scheduled check-in instance
--   user_checkin_prefs    — schedule + opt-in stored per user
--
-- Existing tables touched:
--   activities            — accept type='physio' + physio_notes column
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists public.coach_checkins (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  plan_id         text references public.plans(id) on delete cascade,
  week_num        integer,
  -- Lifecycle. status transitions:
  --   pending → sent → responded
  --                  → dismissed
  --                  → expired (after N days unresponded)
  status          text not null default 'pending',
  scheduled_at    timestamptz not null,
  sent_at         timestamptz,
  responded_at    timestamptz,
  dismissed_at    timestamptz,
  expired_at      timestamptz,
  -- Reminder bookkeeping. reminder_count starts at 0 on send, increments
  -- each time the cron fires a follow-up push. in_app_popup_due flips
  -- true 48h after send if still unresponded — next app launch shows
  -- the popup.
  reminder_count  integer not null default 0,
  in_app_popup_due boolean not null default false,
  -- Free-form rider answers + AI suggestions stored as JSONB so the
  -- shape can evolve without schema migrations.
  responses       jsonb,
  suggestions     jsonb,
  -- Optional triggering event — 'scheduled' for cron-fired, 'manual'
  -- for admin-fired, 'physio_followup' for the physio loop.
  trigger         text not null default 'scheduled',
  created_at      timestamptz not null default now()
);

comment on table public.coach_checkins is
  'Structured weekly check-ins. One row per scheduled instance. responses + suggestions are jsonb so the questionnaire can evolve without schema changes.';

create index if not exists coach_checkins_user_idx
  on public.coach_checkins(user_id, scheduled_at desc);
create index if not exists coach_checkins_pending_idx
  on public.coach_checkins(status, scheduled_at)
  where status in ('pending', 'sent');

alter table public.coach_checkins enable row level security;

create policy "Users can read own check-ins"
  on public.coach_checkins for select using (auth.uid() = user_id);
create policy "Users can update own check-ins"
  on public.coach_checkins for update using (auth.uid() = user_id);

-- ── Per-user schedule prefs ───────────────────────────────────────────────────
-- Kept on a dedicated table rather than user_prefs because the cron
-- needs to query "everyone whose checkin time is now-ish" efficiently.
create table if not exists public.user_checkin_prefs (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  enabled         boolean not null default false,
  -- 0 = Sunday … 6 = Saturday (matches JS Date.getDay)
  day_of_week     smallint not null default 0,
  -- Local time the user wants the check-in (HH:MM, 24h, no timezone).
  -- Resolved against `timezone` to compute the next scheduled_at UTC.
  time_of_day     text not null default '18:00',
  timezone        text not null default 'UTC',
  updated_at      timestamptz not null default now()
);

comment on table public.user_checkin_prefs is
  'Weekly check-in schedule per user. Cron joins on day_of_week + time_of_day + timezone to find users due in the current run window.';

alter table public.user_checkin_prefs enable row level security;

create policy "Users can read own checkin prefs"
  on public.user_checkin_prefs for select using (auth.uid() = user_id);
create policy "Users can upsert own checkin prefs"
  on public.user_checkin_prefs for all using (auth.uid() = user_id);

-- ── Physio appointments on activities ────────────────────────────────────────
-- 'physio' is a new activity type. It carries a free-text physio_notes
-- field that the rider fills in after the appointment. The check-in AI
-- reads physio_notes when planning subsequent weeks.
alter table public.activities
  add column if not exists physio_notes text;

comment on column public.activities.physio_notes is
  'Rider-supplied notes from a physio appointment. Read by the weekly check-in AI when adjusting the plan post-physio. Nullable; only populated for activities with type=physio.';
