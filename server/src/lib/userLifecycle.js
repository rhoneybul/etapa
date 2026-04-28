/**
 * User lifecycle Slack hooks.
 *
 * Single source of truth for "this is a new user — say hi in Slack."
 * Designed to be safe to call from multiple unrelated code paths;
 * the first one that reaches `notifyNewUserOnce` for a given user
 * fires Slack and stamps user_preferences.signup_slack_notified_at,
 * subsequent calls noop.
 *
 * Why we need multi-path coverage: a rider's first server interaction
 * varies widely.
 *   • Push-permission opter-in  → register-token (existing path)
 *   • Push-permission decliner  → preferences POST (display name, units)
 *   • Power user                → plans POST (skips settings entirely)
 *   • Plan-gen failure          → plan-generation error handler
 * Calling `notifyNewUserOnce` from each of those paths means at most
 * ONE Slack ping fires regardless of which path is hit first.
 *
 * The function never throws — Slack failures are logged and swallowed
 * so they can't impact the live request that triggered them.
 */

const { supabase } = require('./supabase');
const { notify } = require('./slack');

/**
 * Idempotent "fire Slack signup notification once per user."
 *
 * @param {string} userId    — Supabase auth user id
 * @param {string} [email]   — pulled from req.user.email when available
 * @param {string} [source]  — short tag describing which code path
 *                             triggered the notification, e.g.
 *                             'push_token' | 'preferences' | 'plan'.
 *                             Surfaced in the Slack message so the team
 *                             can see how riders typically arrive.
 * @returns {Promise<{ notified: boolean, reason?: string }>}
 */
async function notifyNewUserOnce(userId, email, source) {
  if (!userId) return { notified: false, reason: 'no_user_id' };

  // ── Atomic check-and-set ────────────────────────────────────────────
  // The select-then-update pattern is racey across two concurrent
  // requests, so we use Postgres conditional update: set the timestamp
  // only when the column is currently NULL, and only proceed to fire
  // Slack if we actually flipped it. Two concurrent calls → one
  // updates a row, the other matches zero rows. Idempotent under
  // multi-instance deploys too.
  let resolvedEmail = email || null;
  if (!resolvedEmail) {
    try {
      const { data } = await supabase.auth.admin.getUserById(userId);
      resolvedEmail = data?.user?.email || null;
    } catch {}
  }

  // Ensure a row exists. Upsert so we never lose to a race where the
  // user has no preferences row yet. Don't touch signup_slack_notified_at
  // here — that's the conditional update below.
  try {
    await supabase
      .from('user_preferences')
      .upsert({ user_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  } catch (e) {
    console.warn('[lifecycle] preferences upsert failed:', e?.message);
  }

  // Conditional update — only flips the row when it hasn't been
  // notified yet. select() returns the rows that matched + were updated,
  // so an empty result means "another path beat us to it" → noop.
  const now = new Date().toISOString();
  const { data: updatedRows, error } = await supabase
    .from('user_preferences')
    .update({ signup_slack_notified_at: now })
    .eq('user_id', userId)
    .is('signup_slack_notified_at', null)
    .select('user_id');

  if (error) {
    console.error('[lifecycle] notifyNewUserOnce update error:', error.message);
    return { notified: false, reason: 'db_error' };
  }
  if (!updatedRows || updatedRows.length === 0) {
    return { notified: false, reason: 'already_notified' };
  }

  // We won the race. Fire Slack — never blocks the caller because
  // notify() never throws and logs its own errors.
  const text = [
    `*New sign-up* — ${resolvedEmail || `user ${userId.slice(0, 8)}…`}`,
    source ? `(via \`${source}\`)` : null,
  ].filter(Boolean).join(' ');
  notify(text, { channel: 'signups' }).catch(() => {});
  return { notified: true };
}

module.exports = { notifyNewUserOnce };
