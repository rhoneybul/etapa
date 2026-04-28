-- ──────────────────────────────────────────────────────────────────────────────
-- Cache for AI-generated activity tips.
--
-- The previous tips path was a deterministic JS template — fast and free
-- but the same six bullets every time, no awareness of plan-gen
-- structure, rider goal, or sub-type nuance. This column lets us cache
-- a per-activity Claude generation: produce once on first view, store
-- as JSONB, reuse on every subsequent open. Generation is delegated to
-- Haiku 4.5 (5x cheaper than Sonnet for this shape of task).
--
-- Schema mirrors the deterministic generator's output so the client can
-- swap between the two without a separate render path:
--   { category, icon, title, text }[]
--
-- Nullable; old activities just regenerate on next view. The endpoint
-- skips activities that have no `structure` or `durationMins` (same
-- gate as the workout export) to avoid wasted spend on unrenderable
-- sessions.
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.activities
  add column if not exists tips jsonb;

comment on column public.activities.tips is
  'Cached AI-generated ride tips for this session. Array of { category, icon, title, text }. Populated lazily on first view via POST /api/ai/explain-tips and reused on subsequent reads. Nullable.';
