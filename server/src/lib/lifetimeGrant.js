/**
 * Lifetime grant — belt-and-braces application.
 *
 * The admin Grant Lifetime button AND the pre-signup auto-redeem flow both
 * need to apply lifetime access via three parallel writes:
 *
 *   1. RevenueCat promotional entitlement (duration: 'lifetime')
 *   2. user_config_overrides.entitlement = 'lifetime'  (app-side fallback)
 *   3. subscriptions row  (plan=lifetime, status=active, source=Promotional)
 *
 * Having three signals means the app unlocks immediately even if RC is slow,
 * the override is the gating check for feature-flagged features, and the
 * subscriptions row is what the admin dashboard + /api/subscription/status
 * read to decide "is this user paid?"
 *
 * Idempotent by design — safe to call multiple times for the same user.
 */

const { supabase } = require('./supabase');

async function applyLifetimeGrant(userId, {
  grantRevenueCatLifetime,
  entitlementId = 'pro',
  note = null,
  actorId = null,
  productId = 'etapa_lifetime_promotional',
} = {}) {
  if (!userId) {
    return {
      ok: false,
      error: 'userId is required',
      results: {},
    };
  }

  const results = {
    revenueCat:   { attempted: false, ok: false, detail: null },
    override:     { attempted: false, ok: false, detail: null },
    subscription: { attempted: false, ok: false, detail: null },
  };

  // 1. RevenueCat --------------------------------------------------------
  // Injected so this module doesn't pull in the full admin.js (avoids a
  // circular require). Callers pass grantRevenueCatLifetime from admin.js.
  if (typeof grantRevenueCatLifetime === 'function') {
    results.revenueCat.attempted = true;
    try {
      const rcResult = await grantRevenueCatLifetime(userId, { entitlementId });
      if (rcResult?.error) {
        results.revenueCat.ok = false;
        results.revenueCat.detail = rcResult;
      } else {
        results.revenueCat.ok = true;
        results.revenueCat.detail = { message: 'Promotional entitlement granted (lifetime)' };
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
    currentOverrides.entitlement = 'lifetime';
    const noteText = note || `Lifetime granted on ${new Date().toISOString().split('T')[0]}`;
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
      .eq('plan', 'lifetime')
      .limit(1);

    const subRow = {
      user_id:             userId,
      plan:                'lifetime',
      status:              'active',
      source:              'Promotional',
      store:               null,
      product_id:          productId,
      trial_end:           null,
      current_period_end:  null,
      updated_at:          new Date().toISOString(),
    };

    if (existingSubs && existingSubs.length > 0) {
      const { error } = await supabase
        .from('subscriptions')
        .update(subRow)
        .eq('id', existingSubs[0].id);
      results.subscription.ok = !error;
      results.subscription.detail = error
        ? error.message
        : { id: existingSubs[0].id, action: 'updated' };
    } else {
      const { data: inserted, error } = await supabase
        .from('subscriptions')
        .insert({ ...subRow, created_at: new Date().toISOString() })
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

module.exports = { applyLifetimeGrant };
