-- Etapa training app — core tables
-- Run via: supabase db push  (or paste into Supabase SQL editor)

-- ── Goals ────────────────────────────────────────────────────────────────────
create table if not exists public.goals (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  cycling_type  text not null default 'road',        -- road | gravel | mtb | mixed
  goal_type     text not null default 'general',     -- distance | race | event | general
  target_distance numeric,
  target_date   text,
  event_name    text,
  route_name    text,
  created_at    timestamptz not null default now()
);

alter table public.goals enable row level security;

create policy "Users can read own goals"
  on public.goals for select using (auth.uid() = user_id);
create policy "Users can insert own goals"
  on public.goals for insert with check (auth.uid() = user_id);
create policy "Users can update own goals"
  on public.goals for update using (auth.uid() = user_id);
create policy "Users can delete own goals"
  on public.goals for delete using (auth.uid() = user_id);

-- ── Plans ────────────────────────────────────────────────────────────────────
create table if not exists public.plans (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  goal_id       text references public.goals(id) on delete set null,
  config_id     text,
  name          text,
  status        text not null default 'active',      -- active | completed | paused
  start_date    timestamptz not null,
  weeks         integer not null default 8,
  current_week  integer not null default 1,
  created_at    timestamptz not null default now()
);

alter table public.plans enable row level security;

create policy "Users can read own plans"
  on public.plans for select using (auth.uid() = user_id);
create policy "Users can insert own plans"
  on public.plans for insert with check (auth.uid() = user_id);
create policy "Users can update own plans"
  on public.plans for update using (auth.uid() = user_id);
create policy "Users can delete own plans"
  on public.plans for delete using (auth.uid() = user_id);

-- ── Activities ───────────────────────────────────────────────────────────────
create table if not exists public.activities (
  id               text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  plan_id          text not null references public.plans(id) on delete cascade,
  week             integer not null,
  day_of_week      integer,                          -- 0=Mon .. 6=Sun
  type             text not null default 'ride',     -- ride | strength | rest
  sub_type         text,                             -- outdoor | indoor | intervals | endurance | recovery | tempo
  title            text not null,
  description      text,
  notes            text,
  duration_mins    integer,
  distance_km      numeric,
  effort           text default 'moderate',          -- easy | moderate | hard | recovery | max
  completed        boolean not null default false,
  completed_at     timestamptz,
  strava_activity_id text,
  strava_data      jsonb,
  created_at       timestamptz not null default now()
);

alter table public.activities enable row level security;

create policy "Users can read own activities"
  on public.activities for select using (auth.uid() = user_id);
create policy "Users can insert own activities"
  on public.activities for insert with check (auth.uid() = user_id);
create policy "Users can update own activities"
  on public.activities for update using (auth.uid() = user_id);
create policy "Users can delete own activities"
  on public.activities for delete using (auth.uid() = user_id);

-- ── Plan Configs (optional, for regeneration) ────────────────────────────────
create table if not exists public.plan_configs (
  id               text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  goal_id          text references public.goals(id) on delete set null,
  days_per_week    integer not null default 3,
  weeks            integer not null default 8,
  training_types   text[] default '{"outdoor"}',
  session_counts   jsonb,
  day_assignments  jsonb,
  available_days   text[],
  fitness_level    text default 'beginner',
  created_at       timestamptz not null default now()
);

alter table public.plan_configs enable row level security;

create policy "Users can read own configs"
  on public.plan_configs for select using (auth.uid() = user_id);
create policy "Users can insert own configs"
  on public.plan_configs for insert with check (auth.uid() = user_id);
create policy "Users can update own configs"
  on public.plan_configs for update using (auth.uid() = user_id);
create policy "Users can delete own configs"
  on public.plan_configs for delete using (auth.uid() = user_id);

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_goals_user       on public.goals(user_id);
create index if not exists idx_plans_user       on public.plans(user_id);
create index if not exists idx_plans_goal       on public.plans(goal_id);
create index if not exists idx_activities_user  on public.activities(user_id);
create index if not exists idx_activities_plan  on public.activities(plan_id);
create index if not exists idx_activities_week  on public.activities(plan_id, week);
