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
// Returns the BEST active subscription the user holds, not just the most
// recent one. Lifetime strictly encapsulates every other tier — so if a user
// somehow ends up with both a lifetime row and a starter row (common cause:
// an admin issued both grants, or the user was granted starter after already
// having lifetime), we MUST surface lifetime or the app will trap them in
// starter-only UX (UpgradePrompt, locked screens) despite having paid for
// everything.
//
// Precedence (best → worst): lifetime > annual > monthly > starter.
// Within a tier we prefer the row with the furthest-out current_period_end,
// otherwise the newest created_at as a tiebreak.
router.get('/status', async (req, res) => {
  const userId = req.user.id;

  // Pull every candidate subscription row — we need to rank them, not just
  // take the latest. Filter down to statuses that could plausibly be active.
  const { data: rows, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['trialing', 'active', 'paid'])
    .order('created_at', { ascending: false });

  if (error || !rows || rows.length === 0) {
    return res.json({ active: false });
  }

  const now = new Date();
  const oneOffPlans = new Set(['lifetime', 'starter']);

  // Decide whether a given row is genuinely active right now.
  const isRowActive = (row) => {
    const periodEnd = row.current_period_end ? new Date(row.current_period_end) : null;
    if (periodEnd) return periodEnd > now;
    if (row.status === 'trialing') return true;
    return oneOffPlans.has(row.plan) && ['active', 'paid'].includes(row.status);
  };

  // Higher score = better tier. Lifetime wins over everything else.
  const tierScore = (plan) => {
    switch (plan) {
      case 'lifetime': return 100;
      case 'annual':   return 80;
      case 'monthly':  return 60;
      case 'starter':  return 40;
      default:         return 10;  // unknown future plan
    }
  };

  // Rank every active row, pick the best one.
  const activeRows = rows.filter(isRowActive);
  if (activeRows.length === 0) {
    return res.json({ active: false });
  }

  activeRows.sort((a, b) => {
    const tierDiff = tierScore(b.plan) - tierScore(a.plan);
    if (tierDiff !== 0) return tierDiff;
    // Same tier — prefer furthest-out period_end, then newest created_at.
    const ae = a.current_period_end ? new Date(a.current_period_end).getTime() : Infinity;
    const be = b.current_period_end ? new Date(b.current_period_end).getTime() : Infinity;
    if (ae !== be) return be - ae;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  const best = activeRows[0];
  res.json({
    active: true,
    status: best.status,
    plan: best.plan,
    currentPeriodEnd: best.current_period_end,
    trialEnd: best.trial_end,
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
