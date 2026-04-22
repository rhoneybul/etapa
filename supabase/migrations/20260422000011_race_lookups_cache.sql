-- ── race_lookups ─────────────────────────────────────────────────────────────
-- Caches the result of POST /api/ai/race-lookup so we only hit Claude once per
-- distinct race name. Race facts (distance, elevation, location) don't change
-- between requests — the same "London Marathon" looked up by 100 users should
-- cost us one Claude call total, not 100.
--
-- The cache is keyed on a normalised name (lowercased, whitespace-collapsed)
-- so "Tour de France", "tour de france", and "Tour de  France" all resolve to
-- the same row. `found` is persisted even for negative results so we don't
-- re-pay for the same unanswerable query.

create table if not exists public.race_lookups (
  id                uuid primary key default gen_random_uuid(),
  -- Normalised lookup key — lower(trim(name)) with whitespace collapsed.
  name_key          text not null unique,
  -- Original name the user typed (for admin inspection).
  original_name     text not null,
  -- Parsed JSON response from Claude (or a {found:false} placeholder).
  response          jsonb not null,
  -- True if Claude said it knew the race. False = don't bother re-asking.
  found             boolean not null,
  model             text,
  created_at        timestamptz not null default now(),
  -- Bumped on every cache hit so admins can see which races are popular.
  hit_count         integer not null default 0,
  last_hit_at       timestamptz
);

-- Fast lookup on the normalised key.
create index if not exists race_lookups_name_key_idx on public.race_lookups (name_key);

-- Server writes via service-role key. No RLS policies = no client access.
alter table public.race_lookups enable row level security;

comment on table public.race_lookups is
  'Cache of race / event lookups so we only pay Claude once per distinct race name. See server/src/routes/ai.js race-lookup endpoint.';
