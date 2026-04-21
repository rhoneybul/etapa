-- ── claude_usage_log ────────────────────────────────────────────────────────
-- Per-call log of every Anthropic Claude API request the server makes on a
-- user's behalf. One row per API call.
--
-- Purpose:
--   - Per-user cost attribution: who's costing what, and are we subsidising
--     a long tail of whales who chat for hours with the coach?
--   - Per-feature cost breakdown: what's the rough split between plan
--     generation, plan edits, and coach chat? Where should we optimise?
--   - Abuse detection: flag accounts running up 20x the median cost.
--   - Rolling burn rate: "how much Claude spend this week" is a dashboard
--     we actually need before launch, not after.
--
-- Writes: server only (service-role key). This table is never written from
-- the client.
--
-- Indexes cover the two dominant query patterns:
--   1. "cost per user in the last N days"        → (user_id, created_at)
--   2. "cost per feature in the last N days"     → (feature, created_at)

create table if not exists public.claude_usage_log (
  id               bigserial primary key,
  user_id          uuid references auth.users(id) on delete set null,
  feature          text not null,         -- 'plan_gen' | 'plan_edit' | 'activity_edit' | 'coach_chat' | 'race_lookup' | 'other'
  model            text not null,         -- e.g. 'claude-sonnet-4-20250514' | 'claude-haiku-4-5-20251001'
  input_tokens     integer not null default 0,
  output_tokens    integer not null default 0,
  cache_read_tokens   integer not null default 0,  -- prompt caching reads (90% cheaper)
  cache_create_tokens integer not null default 0,  -- prompt caching writes (25% more expensive)
  cost_usd         numeric(10, 6) not null default 0,  -- computed server-side from token counts × model pricing
  duration_ms      integer,               -- round-trip latency (null if unknown)
  status           text not null,         -- 'ok' | 'api_error' | 'parse_error' | 'timeout'
  request_id       text,                  -- Anthropic's x-request-id header (for debugging a specific call)
  metadata         jsonb,                 -- feature-specific context (e.g. { weeks: 14, goalType: 'gran-fondo' })
  created_at       timestamptz not null default now()
);

create index if not exists claude_usage_log_user_time_idx
  on public.claude_usage_log (user_id, created_at desc);

create index if not exists claude_usage_log_feature_time_idx
  on public.claude_usage_log (feature, created_at desc);

create index if not exists claude_usage_log_created_at_idx
  on public.claude_usage_log (created_at desc);

-- Convenience view: 30-day rolling cost per user.
-- Query example:
--   select * from claude_cost_per_user_30d where total_cost_usd > 5 order by total_cost_usd desc;
create or replace view public.claude_cost_per_user_30d as
  select
    user_id,
    count(*)                                    as call_count,
    sum(input_tokens)                           as total_input_tokens,
    sum(output_tokens)                          as total_output_tokens,
    sum(cost_usd)                               as total_cost_usd,
    sum(case when feature = 'plan_gen'     then cost_usd else 0 end) as plan_gen_cost_usd,
    sum(case when feature = 'coach_chat'   then cost_usd else 0 end) as coach_chat_cost_usd,
    sum(case when feature = 'plan_edit'    then cost_usd else 0 end) as plan_edit_cost_usd,
    sum(case when feature = 'activity_edit' then cost_usd else 0 end) as activity_edit_cost_usd,
    min(created_at)                             as first_call_at,
    max(created_at)                             as last_call_at
  from public.claude_usage_log
  where created_at >= now() - interval '30 days'
    and user_id is not null
  group by user_id;

-- RLS: nobody can read the raw table from the client. Server-role only.
alter table public.claude_usage_log enable row level security;
-- No policies = no client access (default deny).

comment on table public.claude_usage_log is
  'Per-call log of Anthropic Claude API usage. Written server-side only. Used for cost attribution, abuse detection, and feature cost breakdown.';
