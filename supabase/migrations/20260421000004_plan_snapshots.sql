-- ── plan_snapshots ───────────────────────────────────────────────────────────
-- Versioned history of a plan. We snapshot just before destructive operations
-- (regenerate, revert) so the user can always go back. Snapshots store both
-- the plan row metadata AND the full activities array, plus a copy of the
-- plan_config at the time, so a revert fully restores every relevant thing.
--
-- Why one row with JSONB blobs rather than a mirror of plans+activities:
--   - Snapshots are read-only — we never edit them in place, we just restore
--     them as a whole. One row per snapshot is cheap and fast.
--   - Activities tables would grow unboundedly if we mirrored them; JSONB
--     keeps it one row per version.
--   - Restore is a one-shot DELETE-activities-then-INSERT operation from the
--     snapshot, no reconciliation needed.

create table if not exists public.plan_snapshots (
  id              text primary key,
  plan_id         text not null references public.plans(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  label           text,                    -- user-visible label, e.g. "Before regenerate"
  reason          text not null default 'pre-regenerate',
                                           -- pre-regenerate | pre-revert | manual
  plan_meta       jsonb not null,          -- { name, weeks, current_week, start_date, status, ... }
  activities      jsonb not null,          -- full activities array at snapshot time
  config_snapshot jsonb,                   -- plan_config row at snapshot time (optional)
  created_at      timestamptz not null default now()
);

create index if not exists plan_snapshots_plan_idx
  on public.plan_snapshots (plan_id, created_at desc);
create index if not exists plan_snapshots_user_idx
  on public.plan_snapshots (user_id, created_at desc);

alter table public.plan_snapshots enable row level security;

create policy "Users can read own snapshots"
  on public.plan_snapshots for select using (auth.uid() = user_id);
create policy "Users can insert own snapshots"
  on public.plan_snapshots for insert with check (auth.uid() = user_id);
create policy "Users can delete own snapshots"
  on public.plan_snapshots for delete using (auth.uid() = user_id);
-- No update policy — snapshots are immutable by design.
