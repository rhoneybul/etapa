const { Router } = require('express');
const { supabase } = require('../lib/supabase');
const { applyPromotionalGrant, TIER_SPECS } = require('../lib/lifetimeGrant');
const router = Router();

/**
 * Pre-signup grant auto-redemption.
 *
 * Called on /me for every authenticated request. The vast majority of the
 * time there is no matching grant, the DB returns null, and we skip. When
 * a pending grant IS found, we apply the requested tier (lifetime OR starter)
 * via the shared promotional helper and mark the grant redeemed. Idempotent
 * — a double-call won't double-grant.
 */
async function redeemPreSignupGrantsForUser(user) {
  if (!user?.email) return { attempted: false };
  const email = user.email.toLowerCase().trim();

  try {
    const { data: grant } = await supabase
      .from('pre_signup_grants')
      .select('id, email, entitlement, note')
      .eq('status', 'pending')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();

    if (!grant) return { attempted: false };

    // Resolve tier from the grant row. Fall back to lifetime for legacy
    // rows created before starter support — the column defaults to 'lifetime'
    // but explicit defensiveness is cheap.
    const tier = TIER_SPECS[grant.entitlement] ? grant.entitlement : 'lifetime';

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
    // override, and admin can retry RC later).
    if (ok) {
      await supabase
        .from('pre_signup_grants')
        .update({
          status: 'redeemed',
          redeemed_at: new Date().toISOString(),
          redeemed_user_id: user.id,
        })
        .eq('id', grant.id);
      console.log(`[pre-signup] Redeemed ${tier} grant ${grant.id} for user ${user.id} (${email})`);
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
