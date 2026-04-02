-- Support messages — multi-turn conversation threads on feedback items.
-- Each feedback row is a "thread"; messages are individual turns from user or admin.
create table if not exists public.support_messages (
  id            text primary key,
  feedback_id   text not null references public.feedback(id) on delete cascade,
  sender_role   text not null check (sender_role in ('user', 'admin')),
  sender_id     uuid,                                          -- user_id of sender
  message       text not null,
  created_at    timestamptz default now()
);

alter table public.support_messages enable row level security;

-- Users can read messages on their own feedback threads
create policy "Users can read own thread messages"
  on public.support_messages for select
  using (
    exists (
      select 1 from public.feedback f
      where f.id = feedback_id and f.user_id = auth.uid()
    )
  );

-- Users can insert messages on their own feedback threads
create policy "Users can reply to own threads"
  on public.support_messages for insert
  with check (
    sender_role = 'user'
    and sender_id = auth.uid()
    and exists (
      select 1 from public.feedback f
      where f.id = feedback_id and f.user_id = auth.uid()
    )
  );

create index if not exists idx_support_messages_feedback on public.support_messages(feedback_id);
create index if not exists idx_support_messages_created on public.support_messages(created_at);

-- Add a status column to feedback for tracking thread state
alter table public.feedback add column if not exists status text default 'open' check (status in ('open', 'resolved', 'closed'));
