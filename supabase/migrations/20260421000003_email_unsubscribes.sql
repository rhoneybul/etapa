-- ── email_unsubscribes ───────────────────────────────────────────────────────
-- Single source of truth for marketing-email opt-outs. Keyed by lowercase
-- email so it covers both pre-launch interest_signups and authed users in
-- one lookup — no matter how someone ends up receiving marketing from us,
-- one `isOptedOut(email)` check is enough to exclude them.
--
-- Why one table, not columns on interest_signups / auth.users:
--   - An email can appear in multiple places (waitlist + app signup later).
--     Centralising the opt-out means we never miss it on one side.
--   - GDPR / CAN-SPAM require we honour unsubscribes across all mailing lists.
--   - New signup sources (Substack, blog, referral) won't need their own columns.
--
-- Access model:
--   - Writes happen via the server (service-role key) after token verification.
--   - No public RLS policies; the server is the gatekeeper.

create table if not exists public.email_unsubscribes (
  email            text primary key,   -- always lowercase, normalised server-side
  unsubscribed_at  timestamptz not null default now(),
  source           text,               -- 'link' | 'list-unsubscribe' | 'admin' | 'bounce'
  reason           text,               -- optional free-text (max 500 chars enforced server-side)
  user_agent       text,
  ip               text
);

create index if not exists email_unsubscribes_unsubscribed_at_idx
  on public.email_unsubscribes (unsubscribed_at desc);

alter table public.email_unsubscribes enable row level security;
-- No policies — service-role writes only.
