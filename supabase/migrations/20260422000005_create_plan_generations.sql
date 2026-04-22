-- ── plan_generations ─────────────────────────────────────────────────────────
-- One row per plan-generation job (including failed / cancelled ones).
-- This is the debug feed for the admin dashboard: "why didn't Rob's plan
-- finish?" The claude_usage_log table tells you how many tokens you spent,
-- but not which inputs produced the failure. This table owns that.
--
-- Writes: server only (service role) from server/src/lib/planGenLogger.js.
-- The runAsyncGeneration path in server/src/routes/ai.js inserts a row when
-- a job starts and updates the same row when it finishes. If the server
-- dies mid-generation, the row stays as status='running' with its progress
-- message — that alone is useful debug info.
--
-- Queries the admin UI runs:
--   1. recent failures:
--        select * from plan_generations
--        where status = 'failed' order by created_at desc limit 50;
--   2. all runs for one user:
--        select * from plan_generations
--        where user_id = :uid order by created_at desc;
--   3. "stuck" runs — started but never completed:
--        select * from plan_generations
--        where status = 'running' and created_at < now() - interval '5 min';

create table if not exists public.plan_generations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete set null,
  job_id            text,                                   -- in-memory planJobs key while the job runs
  plan_id           text,                                   -- references public.plans(id) on success — nullable, nullable FK to avoid cascade weirdness
  status            text not null default 'running'
                    check (status in ('running', 'completed', 'failed', 'cancelled')),
  progress          text,                                   -- last-known progress message ("Building your plan...")
  reason            text not null default 'generate'
                    check (reason in ('generate', 'regenerate', 'admin-regenerate', 'admin-rerun', 'quick-plan', 'other')),
  goal              jsonb,                                  -- the goal object supplied to startGenerationJob
  config            jsonb,                                  -- the config object supplied to startGenerationJob
  model             text,                                   -- Claude model used
  activities_count  integer,                                -- how many activities Claude returned (null until parsed)
  error             text,                                   -- human-readable failure reason (null on success)
  duration_ms       integer,                                -- total job wall-clock time
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists plan_generations_user_time_idx
  on public.plan_generations (user_id, created_at desc);

create index if not exists plan_generations_status_time_idx
  on public.plan_generations (status, created_at desc);

create index if not exists plan_generations_plan_id_idx
  on public.plan_generations (plan_id)
  where plan_id is not null;

-- RLS locked down — admin routes use the service-role key.
alter table public.plan_generations enable row level security;
-- No policies = no client access (default deny).

-- Keep updated_at fresh on any update so the admin list can sort by "latest
-- activity" instead of just creation time (useful when a slow job completes
-- minutes after it was kicked off).
create or replace function public.touch_plan_generations()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists plan_generations_touch on public.plan_generations;
create trigger plan_generations_touch
  before update on public.plan_generations
  for each row execute function public.touch_plan_generations();

comment on table public.plan_generations is
  'Per-job log of plan generation attempts. Used by the admin debug UI to inspect inputs/outputs of failed or stuck generations and rerun them.';
