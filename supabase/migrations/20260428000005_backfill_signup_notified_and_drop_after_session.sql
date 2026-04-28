-- ──────────────────────────────────────────────────────────────────────────────
-- Cleanup migration:
--   1. Backfill `signup_slack_notified_at` for existing users so they don't
--      look like brand-new signups on their next preferences PUT.
--   2. Migrate every user from the retired `after_session` coach_checkin
--      cadence to `weekly`. The old per-session check-in path is being
--      retired in favour of the structured weekly check-in.
--   3. Default new users to `weekly` going forward (the column default is
--      already user-pref-controlled; this is mostly a documentation step).
--
-- Why this is a separate migration: 20260428000003 added the
-- signup_slack_notified_at column nullable with no backfill. Any user who
-- existed before that column shipped has a NULL value, which means the
-- conditional update inside notifyNewUserOnce flips it on their NEXT
-- preferences PUT (e.g. the very next app open) and fires a "new signup"
-- Slack ping for an existing rider. This migration backfills those rows to
-- their created_at (or NOW() if created_at is missing) so the conditional
-- update no longer matches.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Backfill signup notification timestamp for any user we've seen before.
update public.user_preferences
set signup_slack_notified_at = coalesce(signup_slack_notified_at, created_at, now())
where signup_slack_notified_at is null;

-- 2. Migrate retired 'after_session' users to 'weekly'. The new structured
--    weekly check-in covers the same surface area more usefully and we
--    don't want two parallel coach check-in mechanisms running.
update public.user_preferences
set coach_checkin = 'weekly',
    updated_at = now()
where coach_checkin = 'after_session';
