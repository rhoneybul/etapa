/**
 * Coupon routes — validate and redeem access codes for Starter and Lifetime plans.
 *
 * Coupon config is stored in app_config under key "coupon_config":
 *   {
 *     starter:  { enabled: true, code: "STARTER2024" },
 *     lifetime: { enabled: true, code: "LIFETIME2024" }
 *   }
 *
 * Redemptions are recorded in the coupon_redemptions table.
 * Access is granted by upserting into the subscriptions table.
 *
 * Routes:
 *   POST /api/coupons/validate  — check if a code is valid (no side effects)
 *   POST /api/coupons/redeem    — redeem a code and grant access
 */
const { Router } = require('express');
const { supabase } = require('../lib/supabase');

const router = Router();

const LIFETIME_END = '2099-12-31T23:59:59.000Z';
const STARTER_ACCESS_DAYS = 90;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getCouponConfig() {
  const { data } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'coupon_config')
    .maybeSingle();
  return data?.value || {};
}

function matchCoupon(config, code) {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  for (const [plan, cfg] of Object.entries(config)) {
    if (cfg?.enabled && cfg?.code && cfg.code.toUpperCase() === upper) {
      return plan; // 'starter' or 'lifetime'
    }
  }
  return null;
}

// ── POST /api/coupons/validate ────────────────────────────────────────────────
// Check if a code is valid. No side effects — safe to call on keypress/blur.
router.post('/validate', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ valid: false, message: 'No code provided' });

  try {
    const config = await getCouponConfig();
    const plan = matchCoupon(config, code);

    if (!plan) {
      return res.json({ valid: false, message: 'Invalid or inactive coupon code' });
    }

    const planLabel = plan === 'lifetime' ? 'Lifetime access' : 'Starter access (3 months)';
    return res.json({ valid: true, plan, message: `Code valid — ${planLabel}` });
  } catch (err) {
    console.error('[coupons] Validate error:', err);
    res.status(500).json({ valid: false, message: 'Could not validate code' });
  }
});

// ── POST /api/coupons/redeem ──────────────────────────────────────────────────
// Redeem a code: grant subscription access and record the redemption.
router.post('/redeem', async (req, res) => {
  const { code } = req.body;
  const userId = req.user?.id;
  const userEmail = req.user?.email;

  if (!code) return res.status(400).json({ success: false, error: 'No code provided' });
  if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

  try {
    const config = await getCouponConfig();
    const plan = matchCoupon(config, code);

    if (!plan) {
      return res.status(400).json({ success: false, error: 'Invalid or inactive coupon code' });
    }

    // Check if this user has already redeemed a coupon for this plan
    const { data: existing } = await supabase
      .from('coupon_redemptions')
      .select('id')
      .eq('user_id', userId)
      .eq('plan', plan)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: `You have already redeemed a ${plan} coupon`,
      });
    }

    // Calculate access period
    const isLifetime = plan === 'lifetime';
    const accessEnd = isLifetime
      ? new Date(LIFETIME_END)
      : (() => { const d = new Date(); d.setDate(d.getDate() + STARTER_ACCESS_DAYS); return d; })();

    const subscriptionId = `coupon_${plan}_${userId}`;

    // Grant access in subscriptions table
    const { error: subError } = await supabase
      .from('subscriptions')
      .upsert({
        id: subscriptionId,
        user_id: userId,
        stripe_customer_id: null,
        plan,
        status: 'paid',
        trial_end: null,
        current_period_end: accessEnd.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (subError) {
      console.error('[coupons] Subscription upsert error:', subError);
      return res.status(500).json({ success: false, error: 'Failed to grant access' });
    }

    // Record redemption
    const { error: redemptionError } = await supabase
      .from('coupon_redemptions')
      .insert({
        user_id: userId,
        user_email: userEmail || null,
        coupon_code: code.trim().toUpperCase(),
        plan,
        redeemed_at: new Date().toISOString(),
      });

    if (redemptionError) {
      console.error('[coupons] Redemption record error:', redemptionError);
      // Don't fail — access is already granted
    }

    console.log(`[coupons] ${plan} redeemed by ${userEmail || userId}`);

    return res.json({
      success: true,
      plan,
      accessEnd: accessEnd.toISOString(),
    });
  } catch (err) {
    console.error('[coupons] Redeem error:', err);
    res.status(500).json({ success: false, error: 'Failed to redeem coupon' });
  }
});

// ── GET /api/coupons/redemptions — admin only ─────────────────────────────────
// Returns all coupon redemptions for the admin dashboard.
router.get('/redemptions', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('coupon_redemptions')
      .select('*')
      .order('redeemed_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[coupons] Redemptions fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch redemptions' });
  }
});

module.exports = router;
