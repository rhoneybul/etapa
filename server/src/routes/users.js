const { Router } = require('express');
const { supabase } = require('../lib/supabase');
const { applyPromotionalGrant, TIER_SPECS } = require('../lib/lifetimeGrant');
const rateLimits = require('../lib/rateLimits');
const router = Router();

// GET /api/user/limits — current rolling usage + the user's effective caps.
// The mobile client calls this to show "X of Y plans today" / "X of 25 messages
// this week" banners before the user starts an action. Cheap — 60s-cached.
router.get('/limits', async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorised' });
  try {
    const summary = await rateLimits.getUsageSummary(userId, req);
    res.json(summary);
  } catch (err) {
    console.error('[user/limits] failed:', err);
    res.status(500).json({ error: 'Failed to fetch limits' });
  }
});

/**
 * Does the user already have a lifetime subscription? Used to short-circuit
 * starter grants — lifetime strictly encapsulates starter, so issuing a
 * starter grant on top of lifetime would only demote the plan field on the
 * subscriptions row (subscription.js /status picks by tier now, but the
 * grant would still churn writes for no benefit).
 */
async function userHasLifetime(userId) {
  if (!userId) return false;
  const { data } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('plan', 'lifetime')
    .in('status', ['active', 'paid'])
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

/**
 * Pre-signup grant auto-redemption.
 *
 * Called on /me for every authenticated request. The vast majority of the
 * time there is no matching grant, the DB returns null, and we skip. When
 * a pending grant IS found, we apply the requested tier (lifetime OR starter)
 * via the shared promotional helper and mark the grant redeemed. Idempotent
 * — a double-call won't double-grant.
 *
 * When the user has multiple pending grants (edge case: admin issued both
 * tiers over time), we deliberately pick LIFETIME over starter so starter
 * never shadows the superior tier. Both grants are then marked redeemed so
 * the table is clean.
 */
async function redeemPreSignupGrantsForUser(user) {
  if (!user?.email) return { attempted: false };
  const email = user.email.toLowerCase().trim();

  try {
    // Pull ALL pending grants for this email so we can pick the best tier.
    // Partial unique index on (lower(email)) WHERE status='pending' keeps
    // this to one row in the happy path, but legacy data may have more.
    const { data: grants } = await supabase
      .from('pre_signup_grants')
      .select('id, email, entitlement, note')
      .eq('status', 'pending')
      .ilike('email', email);

    if (!grants || grants.length === 0) return { attempted: false };

    // Prefer lifetime over starter — lifetime encapsulates everything.
    const tierRank = (t) => (t === 'lifetime' ? 2 : t === 'starter' ? 1 : 0);
    const sortedGrants = grants.slice().sort((a, b) => tierRank(b.entitlement) - tierRank(a.entitlement));
    const grant = sortedGrants[0];
    const extraGrantIds = sortedGrants.slice(1).map((g) => g.id);

    // Resolve tier from the grant row. Fall back to lifetime for legacy
    // rows created before starter support — the column defaults to 'lifetime'
    // but explicit defensiveness is cheap.
    let tier = TIER_SPECS[grant.entitlement] ? grant.entitlement : 'lifetime';

    // Final guard: if the user ALREADY has lifetime access (e.g. purchased
    // directly, or the Grant Lifetime admin button was used before /me ran),
    // a starter grant is a no-op — skip apply and just mark redeemed.
    if (tier === 'starter' && await userHasLifetime(user.id)) {
      console.log(`[pre-signup] Skipping starter grant ${grant.id} — user ${user.id} already has lifetime.`);
      await supabase
        .from('pre_signup_grants')
        .update({
          status: 'redeemed',
          redeemed_at: new Date().toISOString(),
          redeemed_user_id: user.id,
        })
        .in('id', [grant.id, ...extraGrantIds]);
      return { attempted: true, ok: true, grantId: grant.id, tier, skippedReason: 'lifetime_already_active' };
    }

    // Lazy require avoids a circular dep between users.js and admin.js.
    const rcHelpers = require('./admin')._rcHelpers || {};
    const { grantRevenueCatPromotional, grantRevenueCatLifetime } = rcHelpers;

    const { ok, results } = await applyPromotionalGrant(user.id, {
      tier,
      grantRevenueCatPromo: grantRevenueCatPromotional,
      grantRevenueCatLifetime,  // legacy fallback
      entitlementId: 'pro',
      note: grant.note
        ? `Pre-signup grant redeemed: ${grant.note}`
        : `Pre-signup ${tier} redeemed on ${new Date().toISOString().split('T')[0]}`,
      actorId: null,
    });

    // Mark redeemed if the two DB-side writes succeeded (the grant should
    // flip even if RC is down — user already has access via subscription +
    // override, and admin can retry RC later). Sibling grants (the lower-
    // tier duplicates we deprioritised above) are also marked redeemed so
    // they don't get re-applied later.
    if (ok) {
      await supabase
        .from('pre_signup_grants')
        .update({
          status: 'redeemed',
          redeemed_at: new Date().toISOString(),
          redeemed_user_id: user.id,
        })
        .in('id', [grant.id, ...extraGrantIds]);
      console.log(`[pre-signup] Redeemed ${tier} grant ${grant.id} for user ${user.id} (${email})${extraGrantIds.length ? ` + cleared ${extraGrantIds.length} duplicate(s)` : ''}`);
    } else {
      console.warn(`[pre-signup] Grant ${grant.id} (${tier}) matched but apply failed:`, results);
    }

    return { attempted: true, ok, grantId: grant.id, tier, results };
  } catch (err) {
    console.error('[pre-signup] redeem error:', err);
    return { attempted: true, ok: false, error: err.message };
  }
}

// GET /api/users/me — return the authenticated user's profile.
// Also checks for pending pre-signup lifetime grants and auto-redeems them.
router.get('/me', async (req, res) => {
  // Redemption is best-effort: never block the /me response on it.
  redeemPreSignupGrantsForUser(req.user).catch((err) => {
    console.error('[users/me] pre-signup redeem threw:', err);
  });

  res.json({
    id:    req.user.id,
    email: req.user.email,
    name:  req.user.user_metadata?.full_name || req.user.user_metadata?.name || null,
  });
});

// DELETE /api/users/me — permanently delete the authenticated user's account and all data
router.delete('/me', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const email = req.user.email;

    // Delete all user data from every table (order matters for foreign keys)
    const tables = [
      'notifications',
      'push_tokens',
      'chat_sessions',
      'feedback',
      'activities',
      'plans',
      'plan_configs',
      'goals',
      'subscriptions',
      'user_preferences',
    ];

    const deletionResults = {};
    for (const table of tables) {
      const { error, count } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .eq('user_id', userId);
      deletionResults[table] = error ? `error: ${error.message}` : (count || 0);
    }

    // Delete the auth user from Supabase
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.error(`[users] Failed to delete auth user ${userId}:`, authDeleteError.message);
      return res.status(500).json({
        error: 'Data deleted but failed to remove auth user. Please contact support.',
        details: authDeleteError.message,
      });
    }

    console.log(`[users] Account deleted: ${userId} (${email})`, deletionResults);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
