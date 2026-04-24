-- ── coach_chat_jobs ──────────────────────────────────────────────────────────
-- One row per coach-chat Claude call (pending / running / completed / failed
-- / cancelled). Mirrors plan_generations so we can poll status from the
-- client, survive server restarts, and reap orphaned rows.
--
-- Rationale:
--   Historically the client held the Claude call open for up to 120s. If the
--   user navigated away, the response was lost. Now the server owns the call
--   end-to-end; the client kicks off a job, polls for status (or listens on
--   SSE), and gets a push notification when the reply lands.
--
-- Writes: server only (service role) from server/src/routes/ai.js and the
-- reaper in server/src/lib/coachChatReaper.js.
--
-- Admin queries:
--   1. recent failures:
--        select * from coach_chat_jobs
--        where status = 'failed' order by created_at desc limit 50;
--   2. stuck runs — started but never completed:
--        select * from coach_chat_jobs
--        where status = 'running' and created_at < now() - interval '3 min';

create table if not exists public.coach_chat_jobs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete cascade,
  job_id             text not null unique,                -- client-visible job id, also the in-memory key
  plan_id            text,                                -- plan this chat is scoped to
  week_num           integer,                             -- null = full-plan scope
  status             text not null default 'pending'
                     check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  -- Prompt snapshot so we can rerun or debug later without needing to reconstruct state:
  messages           jsonb,                               -- the message history sent to Claude
  context            jsonb,                               -- plan + goal context used to build the system prompt
  coach_id           text,
  -- Result:
  reply              text,                                -- Claude's text reply (populated incrementally if streaming)
  updated_activities jsonb,                               -- parsed plan_update block, if any
  blocked            boolean default false,               -- topic guard or safety block
  blocked_message    text,                                -- original user message if blocked
  -- Bookkeeping:
  error              text,
  duration_ms        integer,
  model              text,
  created_at         timestamptz not null default now(),
  started_at         timestamptz,                         -- when the Claude call actually kicked off
  completed_at       timestamptz,
  updated_at         timestamptz not null default now()
);

create index if not exists coach_chat_jobs_user_time_idx
  on public.coach_chat_jobs (user_id, created_at desc);

create index if not exists coach_chat_jobs_status_time_idx
  on public.coach_chat_jobs (status, created_at desc);

-- Needed by the chat screen when it wants to rehydrate pending jobs for a
-- given (plan, week) on mount — "were we waiting on anything?".
create index if not exists coach_chat_jobs_scope_idx
  on public.coach_chat_jobs (user_id, plan_id, week_num, created_at desc);

-- RLS locked down — client hits signed endpoints, admin uses service-role.
alter table public.coach_chat_jobs enable row level security;
-- No policies = default deny.

create or replace function public.touch_coach_chat_jobs()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coach_chat_jobs_touch on public.coach_chat_jobs;
create trigger coach_chat_jobs_touch
  before update on public.coach_chat_jobs
  for each row execute function public.touch_coach_chat_jobs();

comment on table public.coach_chat_jobs is
  'Per-job log of coach chat Claude calls. Enables async polling, SSE streaming, push on completion, and reaper-driven recovery from stuck jobs.';
