-- Push notifications, remote config, admin feedback responses, and user preferences
-- Run via: supabase db push

-- ── Push Tokens ─────────────────────────────────────────────────────────────
-- Stores Expo push tokens for each user/device
create table if not exists public.push_tokens (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  token         text not null,                              -- Expo push token (ExponentPushToken[xxx])
  platform      text not null default 'ios',                -- ios | android
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

create policy "Users can read own push tokens"
  on public.push_tokens for select using (auth.uid() = user_id);
create policy "Users can insert own push tokens"
  on public.push_tokens for insert with check (auth.uid() = user_id);
create policy "Users can update own push tokens"
  on public.push_tokens for update using (auth.uid() = user_id);
create policy "Users can delete own push tokens"
  on public.push_tokens for delete using (auth.uid() = user_id);

create unique index if not exists idx_push_tokens_user_token on public.push_tokens(user_id, token);
create index if not exists idx_push_tokens_user on public.push_tokens(user_id);

-- ── Notifications ───────────────────────────────────────────────────────────
-- In-app notification log (push notifications, admin replies, coach check-ins)
create table if not exists public.notifications (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null,                              -- admin_reply | coach_checkin | system
  title         text not null,
  body          text not null,
  data          jsonb default '{}',                         -- extra payload (feedback_id, activity_id, etc.)
  read          boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "Users can read own notifications"
  on public.notifications for select using (auth.uid() = user_id);
create policy "Users can update own notifications"
  on public.notifications for update using (auth.uid() = user_id);

create index if not exists idx_notifications_user on public.notifications(user_id);
create index if not exists idx_notifications_user_unread on public.notifications(user_id) where read = false;

-- ── User Preferences ────────────────────────────────────────────────────────
-- Notification and coaching preferences per user
create table if not exists public.user_preferences (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  coach_checkin         text not null default 'after_session',  -- after_session | weekly | none
  push_enabled          boolean not null default true,
  updated_at            timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "Users can read own preferences"
  on public.user_preferences for select using (auth.uid() = user_id);
create policy "Users can insert own preferences"
  on public.user_preferences for insert with check (auth.uid() = user_id);
create policy "Users can update own preferences"
  on public.user_preferences for update using (auth.uid() = user_id);

-- ── App Config (Remote Config) ──────────────────────────────────────────────
-- Key-value store for remote app configuration (maintenance mode, feature flags)
create table if not exists public.app_config (
  key           text primary key,
  value         jsonb not null default '{}',
  updated_at    timestamptz not null default now()
);

-- No RLS — public read, admin write
alter table public.app_config enable row level security;
create policy "Anyone can read app config"
  on public.app_config for select using (true);

-- Seed default config values
insert into public.app_config (key, value) values
  ('maintenance_mode', '{"enabled": false, "title": "We''ll be right back", "message": "Sorry, our wheels are spinning — we will be back soon."}'),
  ('min_app_version', '{"ios": "0.1.0", "android": "0.1.0"}')
on conflict (key) do nothing;

-- ── Feedback Responses ──────────────────────────────────────────────────────
-- Add response columns to existing feedback table
alter table public.feedback add column if not exists admin_response text;
alter table public.feedback add column if not exists admin_responded_at timestamptz;
alter table public.feedback add column if not exists admin_responder_id uuid;
