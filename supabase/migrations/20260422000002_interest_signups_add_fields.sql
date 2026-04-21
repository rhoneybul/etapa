-- ── interest_signups — extended profile fields ─────────────────────────────
-- Beyond just an email, we now also capture a first name and cycling level at
-- register-interest time. These enable:
--   - Personalised launch emails ("Hey Sarah, Etapa is live!") instead of
--     generic blast.
--   - Segment-specific launch waves: beginners vs intermediate vs experienced
--     can be contacted with slightly different angles.
--   - Pre-launch sizing: do we have ~60 beginners or ~5? Affects positioning.
--
-- All new columns are nullable so existing rows (email-only) remain valid.

alter table public.interest_signups
  add column if not exists first_name     text,
  add column if not exists cycling_level  text;   -- 'new' | 'sometimes' | 'regular'

-- Index on cycling_level for fast segment counts (e.g. "how many beginners on
-- the list?"). Partial index — only indexes rows where the field is set, so
-- it stays small.
create index if not exists interest_signups_cycling_level_idx
  on public.interest_signups (cycling_level)
  where cycling_level is not null;

comment on column public.interest_signups.first_name is
  'Optional first name collected on register-interest form. Used for personalised launch emails.';
comment on column public.interest_signups.cycling_level is
  'Self-reported cycling experience at signup. One of: new | sometimes | regular. Used for audience segmentation.';
