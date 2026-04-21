-- ── user_config_overrides ────────────────────────────────────────────────────
-- Per-user remote config overrides. Merged on top of the global app_config
-- payload by GET /api/app-config when the request is authenticated.
--
-- Typical use cases:
--   - Support ticket: "I paid but app says I'm not subscribed" → grant-pro
--   - Goodwill: "we broke your plan, have a free month" → grant-free-month
--   - Beta: "try the new coach" → unlock-coaches or enable-feature
--
-- See REMOTE_FIRST_ARCHITECTURE.md for the full philosophy.

create table if not exists public.user_config_overrides (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  overrides   jsonb not null default '{}'::jsonb,
  note        text,
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);

-- RLS: users can read their own override (app fetches it via app-config with
-- their JWT; the service-role key on the server bypasses RLS for admin writes).
alter table public.user_config_overrides enable row level security;

create policy "Users can read their own override"
  on public.user_config_overrides for select
  using (auth.uid() = user_id);

-- Admins write via the server (service-role key), not via this policy.

-- Index for fast admin-side lookups by updated_at (most recent edits first).
create index if not exists user_config_overrides_updated_at_idx
  on public.user_config_overrides (updated_at desc);

-- Trigger: keep updated_at fresh on any update.
create or replace function public.touch_user_config_overrides()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_config_overrides_touch on public.user_config_overrides;
create trigger user_config_overrides_touch
  before update on public.user_config_overrides
  for each row execute function public.touch_user_config_overrides();

-- ── Seed expected keys into app_config so they exist from day 1 ──────────────
-- These keys don't need values yet; the client falls back to bundled defaults.
-- Adding them explicitly makes the admin UI discover them.
insert into public.app_config (key, value) values
  ('config_version',  '1'::jsonb),
  ('features',        '{}'::jsonb),
  ('copy',            '{}'::jsonb),
  ('banner',          '{"active": false, "message": "", "cta": null}'::jsonb),
  ('coaches',         'null'::jsonb),
  ('fitness_levels',  'null'::jsonb),
  ('plan_durations',  'null'::jsonb)
on conflict (key) do nothing;
