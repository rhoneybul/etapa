-- ──────────────────────────────────────────────────────────────────────────────
-- Robust first-signup Slack notifications.
--
-- The previous implementation depended on a rider tapping "Allow" on
-- iOS push permissions, because the only place we fired the "new
-- sign-up" Slack message was inside POST /api/notifications/register-token.
-- Riders who declined push (a meaningful slice — push acceptance is
-- ~50–70 % on iOS) silently never triggered a Slack ping.
--
-- Adding signup_slack_notified_at on user_preferences lets multiple
-- "first-touch" code paths idempotently call notifyNewUserOnce(userId,
-- email): the first one to reach the helper sets the timestamp, fires
-- Slack, and returns; subsequent paths see it's already set and noop.
-- Coverage: register-token (push opt-in), preferences POST (any settings
-- change), plans POST (anyone who actually generates a plan), and the
-- plan-generation completion path.
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.user_preferences
  add column if not exists signup_slack_notified_at timestamptz;

comment on column public.user_preferences.signup_slack_notified_at is
  'Set when the server has Slacked us about this user signing up. Once set, the notifyNewUserOnce helper noops for them. Decoupled from push-token registration so we capture riders who declined push permissions.';

create index if not exists user_preferences_signup_slack_notified_idx
  on public.user_preferences (signup_slack_notified_at)
  where signup_slack_notified_at is null;
