-- Feedback table — stores all user feedback with Linear issue references
create table if not exists public.feedback (
  id               text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  category         text not null,                          -- bug | feature | support | general
  message          text not null,
  app_version      text,
  device_info      text,
  linear_issue_id  text,                                   -- Linear issue UUID
  linear_issue_key text,                                   -- e.g. ETA-123
  linear_issue_url text,                                   -- full URL to the Linear issue
  created_at       timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "Users can read own feedback"
  on public.feedback for select using (auth.uid() = user_id);
create policy "Users can insert own feedback"
  on public.feedback for insert with check (auth.uid() = user_id);

-- Service role can read all (used by admin routes)
create index if not exists idx_feedback_user on public.feedback(user_id);
create index if not exists idx_feedback_created on public.feedback(created_at desc);
