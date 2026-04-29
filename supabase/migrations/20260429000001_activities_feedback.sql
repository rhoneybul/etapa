-- ──────────────────────────────────────────────────────────────────────────────
-- Post-ride structured feedback on activities.
--
-- Captured by the ActivityFeedbackSheet bottom sheet that opens whenever a
-- rider marks a session complete. Three structured signals + an optional
-- note:
--
--   {
--     "effort": "way_too_easy" | "easy" | "just_right" | "hard" | "way_too_hard",
--     "rpe":    2 | 4 | 6 | 8 | 10,
--     "feel":   "strong" | "ok" | "off",
--     "note":   "legs felt heavy on the climbs",
--     "recordedAt": "2026-04-29T18:55:23Z"
--   }
--
-- Why this column:
--   The weekly check-in used to ask the rider days after the fact how each
--   session went. Riders forgot specifics. By capturing at completion time,
--   we get hot, accurate signal — and pipe it into the
--   coach_checkins suggestions builder under `activityFeedback` so next
--   week's plan adjustments are grounded in real post-session data.
--
-- Nullable; old activities just don't have it. JSONB so the shape can
-- evolve without further migrations.
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.activities
  add column if not exists feedback jsonb;

comment on column public.activities.feedback is
  'Post-ride structured feedback. { effort, rpe, feel, note, recordedAt }. Recorded by ActivityFeedbackSheet at the moment the rider marks a session complete. Read back into the weekly check-in prompt as `activityFeedback` so the coach has hot data on how each ride felt.';
