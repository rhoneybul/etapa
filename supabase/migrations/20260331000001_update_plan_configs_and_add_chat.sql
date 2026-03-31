-- Etapa — update plan_configs to match client data model & add chat history
-- Run via: supabase db push  (or paste into Supabase SQL editor)

-- ── Update plan_configs with columns the client actually sends ──────────────
alter table public.plan_configs
  add column if not exists sessions_per_week integer,
  add column if not exists session_types     jsonb,
  add column if not exists cross_training_days_full jsonb,
  add column if not exists indoor_trainer    boolean default false,
  add column if not exists extra_notes       text;

-- ── Coach chat history ──────────────────────────────────────────────────────
create table if not exists public.chat_sessions (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  plan_id    text not null references public.plans(id) on delete cascade,
  week_num   integer,                                  -- null = full plan scope
  messages   jsonb not null default '[]'::jsonb,        -- [{role, content, ts}, ...]
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.chat_sessions enable row level security;

create policy "Users can read own chats"
  on public.chat_sessions for select using (auth.uid() = user_id);
create policy "Users can insert own chats"
  on public.chat_sessions for insert with check (auth.uid() = user_id);
create policy "Users can update own chats"
  on public.chat_sessions for update using (auth.uid() = user_id);
create policy "Users can delete own chats"
  on public.chat_sessions for delete using (auth.uid() = user_id);

create index if not exists idx_chat_sessions_user on public.chat_sessions(user_id);
create index if not exists idx_chat_sessions_plan on public.chat_sessions(plan_id);
create unique index if not exists idx_chat_sessions_plan_week
  on public.chat_sessions(user_id, plan_id, coalesce(week_num, -1));
