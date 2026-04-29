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
 * Two layers of "is this user actually new?" guarding:
 *   1. The DB column `signup_slack_notified_at` (conditional UPDATE
 *      where IS NULL) handles intra-user idempotency — once we've
 *      pinged for a user, we never ping again for them.
 *   2. The auth.users.created_at check handles INTER-user
 *      contamination — if a returning rider's prefs row predates the
 *      column being added (or is missing entirely for any reason),
 *      they'd otherwise look NEW to layer 1 and trip a false Slack
 *      ping on app open. Layer 2 hard-rejects anyone whose auth
 *      record is older than the recent-signup window so the only
 *      Slack pings that fire are for genuine new accounts.
 *
 * The function never throws — Slack failures are logged and swallowed
 * so they can't impact the live request that triggered them.
 */

const { supabase } = require('./supabase');
const { notify } = require('./slack');

// Window during which a user is considered "new" enough to fire a
// signup ping. Set to 24h: gives us comfortable headroom for someone
// who creates an account, closes the app, opens it again the next
// morning, and only then hits one of our notify-bearing endpoints.
// Anyone older than this is treated as a returning user, period.
const SIGNUP_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

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

  // ── Layer 2 input: pull auth.users.created_at + email in one shot ───
  // We hit auth.admin.getUserById once and reuse both fields. If we
  // can't read the auth record at all, we treat the user as NOT new —
  // safer to drop a real signup ping on the floor than spam #signups
  // with returning users every time supabase has a hiccup.
  let resolvedEmail = email || null;
  let userCreatedAt = null;
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    resolvedEmail = resolvedEmail || data?.user?.email || null;
    userCreatedAt = data?.user?.created_at || null;
  } catch {}

  const isRecentlyCreated = userCreatedAt
    ? (Date.now() - new Date(userCreatedAt).getTime()) < SIGNUP_RECENT_WINDOW_MS
    : false;

  // ── Ensure a prefs row exists. ─────────────────────────────────────
  // Upsert so we never lose to a race where the user has no
  // preferences row yet. We don't touch signup_slack_notified_at here —
  // that's the conditional update below. For users whose auth record
  // is OLD (returning users with no prefs row), we eagerly stamp the
  // column on the upsert so the conditional update on subsequent calls
  // matches zero rows and short-circuits — saves a needless Slack-side
  // dedupe pass for every future request from that user.
  try {
    const upsertPayload = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };
    if (!isRecentlyCreated) {
      // Lazy backfill: stamp old users right now so we don't keep
      // passing through the conditional-update path for them.
      upsertPayload.signup_slack_notified_at = new Date().toISOString();
    }
    await supabase
      .from('user_preferences')
      .upsert(upsertPayload, { onConflict: 'user_id', ignoreDuplicates: false });
  } catch (e) {
    console.warn('[lifecycle] preferences upsert failed:', e?.message);
  }

  // ── Layer 2 short-circuit: hard reject returning users. ────────────
  // Even if their prefs row somehow has signup_slack_notified_at = NULL
  // (column predates them, row was deleted, RLS oddity, etc.), the
  // auth record's age is the source of truth on "is this person new".
  // Returning users get the upsert above (which stamped the column for
  // them) but no Slack ping.
  if (!isRecentlyCreated) {
    return { notified: false, reason: 'returning_user' };
  }

  // ── Layer 1: atomic conditional update. ────────────────────────────
  // The select-then-update pattern is racey across two concurrent
  // requests, so we use Postgres conditional update: set the timestamp
  // only when the column is currently NULL, and only proceed to fire
  // Slack if we actually flipped it. Two concurrent calls → one updates
  // a row, the other matches zero rows. Idempotent under multi-instance
  // deploys too.
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

  // ── We won the race AND the user is genuinely new. Fire Slack. ─────
  // notify() never throws and logs its own errors so the live request
  // that triggered this is never blocked by Slack.
  const text = [
    `*New sign-up* — ${resolvedEmail || `user ${userId.slice(0, 8)}…`}`,
    source ? `(via \`${source}\`)` : null,
  ].filter(Boolean).join(' ');
  notify(text, { channel: 'signups' }).catch(() => {});
  return { notified: true };
}

module.exports = { notifyNewUserOnce };
