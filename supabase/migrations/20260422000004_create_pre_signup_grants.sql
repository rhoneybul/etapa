-- ── pre_signup_grants ────────────────────────────────────────────────────────
-- Lifetime (or pro) access grants that an admin issues BEFORE the recipient
-- has a Supabase account. When the recipient signs up with the matching email,
-- the server redeems the grant and applies the entitlement via the same
-- belt-and-braces flow used by the live Grant Lifetime button:
--   1. RevenueCat promotional entitlement (duration=lifetime)
--   2. user_config_overrides.entitlement = 'lifetime'
--   3. subscriptions row (plan=lifetime, status=active, source=Promotional)
--
-- Use cases:
--   - Early access for friends / beta group
--   - Comp'd lifetime as a thank-you / contest prize
--   - Bulk grants for a launch cohort
--
-- Grants are one-shot: status flips to 'redeemed' on first successful apply,
-- and redeemed_user_id is populated so CS can trace any lifetime back to the
-- pre-signup grant that produced it.

create table if not exists public.pre_signup_grants (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  entitlement        text not null default 'lifetime',
  note               text,
  granted_by         uuid references auth.users(id),
  granted_at         timestamptz not null default now(),
  -- status transitions: pending → redeemed | revoked
  status             text not null default 'pending'
                     check (status in ('pending', 'redeemed', 'revoked')),
  redeemed_at        timestamptz,
  redeemed_user_id   uuid references auth.users(id) on delete set null
);

-- Case-insensitive uniqueness on the pending email so the admin UI can't
-- create two competing grants for the same address. Redeemed / revoked rows
-- are kept as an audit trail and are excluded from this partial unique index.
create unique index if not exists pre_signup_grants_pending_email_unique
  on public.pre_signup_grants (lower(email))
  where status = 'pending';

-- Fast lookup on email during signup.
create index if not exists pre_signup_grants_email_idx
  on public.pre_signup_grants (lower(email));

create index if not exists pre_signup_grants_status_idx
  on public.pre_signup_grants (status);

-- RLS: locked down. All reads + writes go through the server's service-role
-- key. Regular users should never see this table.
alter table public.pre_signup_grants enable row level security;

-- (no policies = no access except service_role)
