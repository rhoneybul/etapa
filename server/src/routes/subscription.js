/**
 * Subscription routes — subscription status, free trial, and pricing.
 *
 * All payment processing is handled by Apple IAP via RevenueCat.
 * These endpoints manage the Supabase subscription records and display pricing.
 */
const { Router } = require('express');
const { supabase } = require('../lib/supabase');

const router = Router();

// ── Default prices (used when no pricing_config is set in the admin console) ──
const DEFAULT_PRICES = {
  monthly:  { amount: 799,  currency: 'gbp', formatted: '£7.99',  interval: 'month', billedLabel: 'Billed monthly' },
  annual:   { amount: 4999, currency: 'gbp', formatted: '£49.99', interval: 'year',  perMonth: '£4.17', billedLabel: 'Billed £49.99/year' },
  lifetime: { amount: 9999, currency: 'gbp', formatted: '£99.99', interval: null },
  starter:  { amount: 1499, currency: 'gbp', formatted: '£14.99', interval: null },
};

function buildPriceEntry(amount, currency, interval) {
  const sym = currency === 'usd' ? '$' : currency === 'gbp' ? '£' : currency === 'eur' ? '€' : currency.toUpperCase() + ' ';
  const formatted = `${sym}${(amount / 100).toFixed(2)}`;
  const entry = { amount, currency, formatted, interval };
  if (interval === 'year') {
    entry.perMonth = `${sym}${(amount / 100 / 12).toFixed(2)}`;
    entry.billedLabel = `Billed ${formatted}/year`;
  }
  if (interval === 'month') {
    entry.billedLabel = 'Billed monthly';
  }
  return entry;
}

// ── GET /api/subscription/prices ─────────────────────────────────────────────
// Returns prices from remote config (admin console), falling back to defaults.
router.get('/prices', async (req, res) => {
  try {
    const { data } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'pricing_config')
      .single();

    if (data?.value) {
      const cfg = data.value;
      const currency = cfg.currency || 'gbp';
      const results = {};

      if (cfg.monthly)  results.monthly  = buildPriceEntry(cfg.monthly,  currency, 'month');
      if (cfg.annual)   results.annual   = buildPriceEntry(cfg.annual,   currency, 'year');
      if (cfg.lifetime) results.lifetime = buildPriceEntry(cfg.lifetime, currency, null);
      if (cfg.starter)  results.starter  = buildPriceEntry(cfg.starter,  currency, null);

      return res.json(Object.keys(results).length ? results : DEFAULT_PRICES);
    }
  } catch { /* fall through */ }

  res.json(DEFAULT_PRICES);
});

// ── GET /api/subscription/status ─────────────────────────────────────────────
router.get('/status', async (req, res) => {
  const userId = req.user.id;

  // Check for active subscriptions (trialing/active) OR paid starter/lifetime purchases
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['trialing', 'active', 'paid'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return res.json({ active: false });
  }

  const now = new Date();
  const periodEnd = data.current_period_end ? new Date(data.current_period_end) : null;
  const active = periodEnd ? periodEnd > now : data.status === 'trialing';

  res.json({
    active,
    status: data.status,
    plan: data.plan,
    currentPeriodEnd: data.current_period_end,
    trialEnd: data.trial_end,
  });
});

// ── POST /api/subscription/start-trial ───────────────────────────────────────
// Start a 7-day free trial without requiring payment upfront.
// Creates a subscription record with status 'trialing' that expires in 7 days.
router.post('/start-trial', async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  try {
    // Check if user already has a subscription or has used a trial
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const now = new Date();
      const periodEnd = existing.current_period_end ? new Date(existing.current_period_end) : null;
      const isActive = periodEnd ? periodEnd > now : existing.status === 'trialing';

      if (isActive) {
        return res.json({ success: true, alreadyActive: true, message: 'You already have an active subscription.' });
      }

      // If they've had a trial before, don't allow another one
      if (existing.status === 'trialing' || existing.trial_end) {
        return res.status(400).json({ error: 'Free trial already used. Please subscribe to continue.' });
      }
    }

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);

    await supabase.from('subscriptions').upsert({
      user_id: userId,
      plan: 'monthly',
      status: 'trialing',
      trial_end: trialEnd.toISOString(),
      current_period_end: trialEnd.toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    res.json({ success: true, trialEnd: trialEnd.toISOString() });
  } catch (err) {
    console.error('[start-trial] Error:', err);
    res.status(500).json({ error: 'Failed to start trial' });
  }
});

module.exports = router;
