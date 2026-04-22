/**
 * Promotional grant — belt-and-braces application.
 *
 * The admin Grant button AND the pre-signup auto-redeem flow both need to
 * apply a promotional tier via three parallel writes:
 *
 *   1. RevenueCat promotional entitlement (duration: 'lifetime' or 'three_month')
 *   2. user_config_overrides.entitlement  (app-side fallback for immediate unlock)
 *   3. subscriptions row  (plan=<tier>, status=active, store=PROMOTIONAL)
 *
 * Having three signals means the app unlocks immediately even if RC is slow,
 * the override is the gating check for feature-flagged features, and the
 * subscriptions row is what the admin dashboard + /api/subscription/status
 * read to decide "is this user paid?"
 *
 * Idempotent by design — safe to call multiple times for the same user.
 *
 * Tiers supported:
 *   - 'lifetime' — permanent access. Override stays forever, sub row has
 *     current_period_end=null (subscription.js treats null + plan='lifetime'
 *     as active).
 *   - 'starter'  — 3 months access. Override is written but the sub row
 *     also has current_period_end set, so subscription.js will naturally
 *     report inactive once 3 months pass. RC is granted with
 *     duration='three_month' so the entitlement expires on its side too.
 */

const { supabase } = require('./supabase');

// Per-tier plumbing — keeps the branching local instead of scattered.
const TIER_SPECS = {
  lifetime: {
    plan: 'lifetime',
    overrideEntitlement: 'lifetime',
    rcDuration: 'lifetime',
    productId: 'etapa_lifetime_promotional',
    noteLabel: 'Lifetime',
    // null = never expires. subscription.js treats oneOffPlans without a
    // current_period_end as permanently active.
    periodMonths: null,
  },
  starter: {
    plan: 'starter',
    // 'pro' is the app's generic "paid user" entitlement. We write it here
    // so the app unlocks immediately; the sub row's current_period_end then
    // governs whether the unlock should still be honoured in ~90 days.
    overrideEntitlement: 'pro',
    rcDuration: 'three_month',
    productId: 'etapa_starter_promotional',
    noteLabel: 'Starter (3 months)',
    periodMonths: 3,
  },
};

function tierSpec(tier) {
  const spec = TIER_SPECS[tier];
  if (!spec) throw new Error(`Unknown promotional tier: ${tier}. Valid: ${Object.keys(TIER_SPECS).join(', ')}`);
  return spec;
}

function computePeriodEnd(periodMonths) {
  if (!periodMonths) return null;
  const d = new Date();
  d.setMonth(d.getMonth() + periodMonths);
  return d.toISOString();
}

/**
 * Apply a promotional tier (lifetime or starter) to an existing user.
 *
 * @param {string} userId
 * @param {Object} opts
 * @param {'lifetime'|'starter'} [opts.tier='lifetime']  Which tier to apply.
 * @param {Function} [opts.grantRevenueCatPromo]  RC grant helper (injected
 *   by admin.js). Signature: (userId, { entitlementId, duration }) => result.
 * @param {Function} [opts.grantRevenueCatLifetime]  Legacy RC helper — used
 *   as a fallback when the caller hasn't been updated. Ignores duration.
 * @param {string} [opts.entitlementId='pro']  RC entitlement identifier.
 * @param {string} [opts.note]  Free-text annotation (surfaces in overrides + admin UI).
 * @param {string|null} [opts.actorId]  Who's doing the grant (audit trail).
 * @param {string} [opts.productId]  Override the default product_id written
 *   to the subscription row. Defaults per tier.
 */
async function applyPromotionalGrant(userId, {
  tier = 'lifetime',
  grantRevenueCatPromo = null,
  grantRevenueCatLifetime = null,  // legacy alias
  entitlementId = 'pro',
  note = null,
  actorId = null,
  productId = null,
} = {}) {
  if (!userId) {
    return { ok: false, error: 'userId is required', results: {} };
  }

  let spec;
  try {
    spec = tierSpec(tier);
  } catch (err) {
    return { ok: false, error: err.message, results: {} };
  }

  const resolvedProductId = productId || spec.productId;
  const periodEnd = computePeriodEnd(spec.periodMonths);

  const results = {
    tier,
    revenueCat:   { attempted: false, ok: false, detail: null },
    override:     { attempted: false, ok: false, detail: null },
    subscription: { attempted: false, ok: false, detail: null },
  };

  // 1. RevenueCat --------------------------------------------------------
  // Prefer the duration-aware helper when injected; fall back to the legacy
  // lifetime-only helper for backward compat with older callers.
  const rcFn = typeof grantRevenueCatPromo === 'function'
    ? grantRevenueCatPromo
    : (typeof grantRevenueCatLifetime === 'function' && spec.rcDuration === 'lifetime'
      ? grantRevenueCatLifetime
      : null);
  if (rcFn) {
    results.revenueCat.attempted = true;
    try {
      const rcResult = await rcFn(userId, { entitlementId, duration: spec.rcDuration });
      if (rcResult?.error) {
        results.revenueCat.ok = false;
        results.revenueCat.detail = rcResult;
      } else {
        results.revenueCat.ok = true;
        results.revenueCat.detail = { message: `Promotional entitlement granted (${spec.rcDuration})` };
      }
    } catch (err) {
      results.revenueCat.detail = { error: 'throw', message: err.message };
    }
  }

  // 2. user_config_overrides ---------------------------------------------
  results.override.attempted = true;
  try {
    const { data: existing } = await supabase
      .from('user_config_overrides')
      .select('overrides')
      .eq('user_id', userId)
      .maybeSingle();
    const currentOverrides = existing?.overrides ? { ...existing.overrides } : {};
    currentOverrides.entitlement = spec.overrideEntitlement;
    // For starter (time-limited) grants, stash the expiry in the overrides
    // blob so a future cleanup job can clear the entitlement cleanly without
    // inspecting the subscription row.
    if (periodEnd) currentOverrides.entitlementExpiresAt = periodEnd;
    else delete currentOverrides.entitlementExpiresAt;

    const noteText = note || `${spec.noteLabel} granted on ${new Date().toISOString().split('T')[0]}`;
    const { error } = await supabase
      .from('user_config_overrides')
      .upsert({
        user_id:    userId,
        overrides:  currentOverrides,
        note:       noteText,
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    results.override.ok = !error;
    results.override.detail = error?.message || null;
  } catch (err) {
    results.override.detail = err.message;
  }

  // 3. subscriptions row --------------------------------------------------
  results.subscription.attempted = true;
  try {
    const { data: existingSubs } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('plan', spec.plan)
      .limit(1);

    // NOTE: `source` is a COMPUTED field in the admin UI derived from `store`.
    // The actual DB column is `store`, not `source`. STORE_LABEL.PROMOTIONAL
    // renders as "Promotional" in the dashboard. Mirrors what the RevenueCat
    // webhook writes for real promotional subscriptions.
    const subRow = {
      user_id:             userId,
      plan:                spec.plan,
      status:              'active',
      store:               'PROMOTIONAL',
      product_id:          resolvedProductId,
      // stripe_customer_id is NOT NULL in the legacy schema; use a synthetic
      // value for promotional grants so the insert doesn't bounce.
      stripe_customer_id:  `promo_${userId}`,
      trial_end:           null,
      // periodEnd is null for lifetime (never expires) and +3 months for
      // starter. subscription.js's /status endpoint honours this.
      current_period_end:  periodEnd,
      updated_at:          new Date().toISOString(),
    };

    if (existingSubs && existingSubs.length > 0) {
      // Only update the fields we actually care about so we don't overwrite
      // stripe_customer_id on a pre-existing row.
      const updateFields = { ...subRow };
      delete updateFields.stripe_customer_id;
      const { error } = await supabase
        .from('subscriptions')
        .update(updateFields)
        .eq('id', existingSubs[0].id);
      results.subscription.ok = !error;
      results.subscription.detail = error
        ? error.message
        : { id: existingSubs[0].id, action: 'updated' };
    } else {
      // Primary key is `id` (text) in the subscriptions table — generate one.
      const newId = `promo_${userId}_${Date.now().toString(36)}`;
      const { data: inserted, error } = await supabase
        .from('subscriptions')
        .insert({
          id: newId,
          ...subRow,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .maybeSingle();
      results.subscription.ok = !error;
      results.subscription.detail = error
        ? error.message
        : { id: inserted?.id, action: 'inserted' };
    }
  } catch (err) {
    results.subscription.detail = err.message;
  }

  // Success contract: override + subscription must both write, because those
  // are what the app + admin dashboard read. RC missing is degraded-but-ok.
  const ok = results.override.ok && results.subscription.ok;
  return { ok, results };
}

/**
 * Backwards-compatible alias for legacy callers that only know about the
 * lifetime tier. New code should prefer applyPromotionalGrant directly.
 */
async function applyLifetimeGrant(userId, opts = {}) {
  return applyPromotionalGrant(userId, { ...opts, tier: 'lifetime' });
}

module.exports = { applyPromotionalGrant, applyLifetimeGrant, TIER_SPECS };
