-- ── interest_signups — capture what users want to see from Etapa ───────────
-- Optional free-text answer to "Is there anything you want to see from Etapa?"
-- on the coming-soon register-interest form. High-signal for shaping the first
-- month of post-launch roadmap — if half the waitlist asks for the same thing,
-- we build it first.
--
-- Capped to 1000 chars client + server side. Nullable so existing rows remain
-- valid.

alter table public.interest_signups
  add column if not exists wishlist text;

comment on column public.interest_signups.wishlist is
  'Optional free-text answer to "Is there anything you want to see from Etapa?" on the register-interest form. Used to shape post-launch roadmap.';
