-- ── user_rate_limits: rename daily_plan_limit → weekly_plan_limit ─────────
--
-- Context: migration 20260422000012_rate_limits.sql created the
-- user_rate_limits table with a `weekly_plan_limit` column. However, a
-- production database ended up with a `daily_plan_limit` column instead —
-- most likely because an in-flight iteration of the feature shipped briefly
-- with the daily naming before being renamed to "weekly" in the source file.
-- Fresh databases are correct; the single prod DB that was caught mid-iteration
-- is the one that needs this rename.
--
-- The server code (server/src/lib/rateLimits.js) and the admin dashboard
-- both query `weekly_plan_limit` — the error users saw before this ran was
-- `column user_rate_limits.weekly_plan_limit does not exist`.
--
-- Fully idempotent:
--   - On a DB that already has `weekly_plan_limit` (fresh): no-op.
--   - On a DB that has `daily_plan_limit` (drift): rename in place, data
--     preserved.
--   - On a DB that has neither (partial apply earlier): add the column.

do $$ begin
  -- Case 1: old column present, new column absent → rename.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'user_rate_limits'
      and column_name  = 'daily_plan_limit'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'user_rate_limits'
      and column_name  = 'weekly_plan_limit'
  ) then
    alter table public.user_rate_limits
      rename column daily_plan_limit to weekly_plan_limit;
  end if;
end $$;

-- Case 2 (belt-and-braces): if the column is still missing — e.g. the
-- original migration was applied partially and neither column exists — add
-- it so the code has something to query. `IF NOT EXISTS` keeps this a no-op
-- for DBs where the column is already present.
alter table public.user_rate_limits
  add column if not exists weekly_plan_limit integer;
