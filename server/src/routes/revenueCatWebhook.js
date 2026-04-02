/**
 * RevenueCat webhook handler — syncs IAP purchases to Supabase.
 *
 * RevenueCat sends events for new purchases, renewals, cancellations, etc.
 * We map these to subscription records in the same `subscriptions` table used by Stripe.
 *
 * Setup:
 *   1. In RevenueCat dashboard → Integrations → Webhooks
 *   2. URL: https://your-server.com/api/revenuecat/webhook
 *   3. Authorization header: Bearer <REVENUECAT_WEBHOOK_SECRET>
 */
const { supabase } = require('../lib/supabase');

const WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET;

// Lifetime = access until 2099 (same as Stripe lifetime handling)
const LIFETIME_END = '2099-12-31T23:59:59.000Z';

/**
 * Map RevenueCat event types to subscription status.
 */
function mapStatus(eventType) {
  switch (eventType) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'NON_RENEWING_PURCHASE':
      return 'active';
    case 'CANCELLATION':
      return 'canceled';
    case 'EXPIRATION':
      return 'expired';
    case 'BILLING_ISSUE':
      return 'past_due';
    case 'PRODUCT_CHANGE':
      return 'active';
    default:
      return null; // Ignore unknown events
  }
}

/**
 * Identify the plan from the product ID.
 */
function identifyPlan(productId) {
  if (!productId) return 'unknown';
  const id = productId.toLowerCase();
  if (id.includes('lifetime')) return 'lifetime';
  if (id.includes('annual') || id.includes('yearly')) return 'annual';
  if (id.includes('monthly')) return 'monthly';
  if (id.includes('starter')) return 'starter';
  return 'unknown';
}

/**
 * RevenueCat webhook handler.
 * Receives JSON body with event data and syncs to Supabase.
 */
async function revenueCatWebhookHandler(req, res) {
  // ── Auth check ──────────────────────────────────────────────────────────────
  if (WEBHOOK_SECRET) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (token !== WEBHOOK_SECRET) {
      console.warn('[RevenueCat webhook] Invalid authorization');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const { event } = req.body || {};
  if (!event) {
    return res.status(400).json({ error: 'Missing event data' });
  }

  const {
    type: eventType,
    app_user_id: appUserId,
    product_id: productId,
    expiration_at_ms: expirationAtMs,
    purchased_at_ms: purchasedAtMs,
    store,
    transaction_id: transactionId,
    original_transaction_id: originalTransactionId,
  } = event;

  console.log(`[RevenueCat webhook] ${eventType} for user ${appUserId}, product ${productId}`);

  const status = mapStatus(eventType);
  if (!status) {
    // Event type we don't need to handle
    return res.json({ received: true, ignored: true });
  }

  const plan = identifyPlan(productId);
  const isLifetime = plan === 'lifetime';

  // Build the subscription record
  const subscriptionId = `rc_${originalTransactionId || transactionId || appUserId}_${productId}`;

  let periodEnd;
  if (isLifetime) {
    periodEnd = LIFETIME_END;
  } else if (expirationAtMs) {
    periodEnd = new Date(expirationAtMs).toISOString();
  } else {
    periodEnd = null;
  }

  const record = {
    id: subscriptionId,
    user_id: appUserId,
    stripe_customer_id: null, // RevenueCat manages this separately
    plan,
    status: isLifetime ? 'paid' : status,
    trial_end: null,
    current_period_end: periodEnd,
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase
      .from('subscriptions')
      .upsert(record, { onConflict: 'id' });

    if (error) {
      console.error('[RevenueCat webhook] Supabase upsert error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    console.log(`[RevenueCat webhook] Synced: ${eventType} → ${plan} (${status}) for ${appUserId}`);
    res.json({ received: true });
  } catch (err) {
    console.error('[RevenueCat webhook] Handler error:', err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
}

module.exports = { revenueCatWebhookHandler };
