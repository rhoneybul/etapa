const { Router } = require('express');
const { supabase } = require('../lib/supabase');

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // eslint-disable-next-line global-require
  return require('stripe')(key);
}

const PRICES = () => ({
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual: process.env.STRIPE_PRICE_ANNUAL,
});

// ── GET /api/stripe/subscription-status ──────────────────────────────────────
router.get('/subscription-status', async (req, res) => {
  // If Stripe is not configured, allow access (dev mode)
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.json({ active: true, status: 'dev' });
  }

  const userId = req.user.id;

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['trialing', 'active'])
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

// ── POST /api/stripe/create-checkout-session ─────────────────────────────────
router.post('/create-checkout-session', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const { plan, redirectBase } = req.body;
  const prices = PRICES();
  const priceId = prices[plan];
  if (!priceId) return res.status(400).json({ error: 'Invalid plan. Must be "monthly" or "annual".' });

  const userId = req.user.id;
  const userEmail = req.user.email;

  // Validate redirect base — must be the app scheme or an allowed/localhost origin
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const isValidRedirect = redirectBase && (
    redirectBase.startsWith('etapa://') ||
    redirectBase.startsWith('http://localhost') ||
    allowedOrigins.some(o => redirectBase.startsWith(o))
  );
  const base = isValidRedirect ? redirectBase : 'etapa://stripe';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 30,
        metadata: { userId, plan },
      },
      customer_email: userEmail,
      success_url: `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/cancel`,
      metadata: { userId, plan },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe checkout session error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ── POST /api/stripe/verify-session ──────────────────────────────────────────
// Called by the app after returning from successful Stripe Checkout
router.post('/verify-session', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const { sessionId } = req.body;
  const userId = req.user.id;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    // Ensure this session belongs to the authenticated user
    if (session.metadata?.userId !== userId) {
      return res.status(403).json({ error: 'Session does not belong to this user' });
    }

    const sub = session.subscription;
    if (!sub) return res.status(400).json({ error: 'No subscription found in session' });

    const plan = session.metadata?.plan || 'monthly';

    const { error } = await supabase.from('subscriptions').upsert({
      id: sub.id,
      user_id: userId,
      stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      plan,
      status: sub.status,
      trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (error) console.error('Supabase upsert error:', error);

    res.json({ ok: true, status: sub.status });
  } catch (err) {
    console.error('Stripe verify session error:', err);
    res.status(500).json({ error: 'Failed to verify session' });
  }
});

module.exports = router;

// ── Webhook handler (exported separately — needs raw body, no auth) ───────────
async function webhookHandler(req, res) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    return res.status(503).json({ error: 'Stripe webhook not configured' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) {
          console.warn('Stripe webhook: subscription missing userId metadata', sub.id);
          break;
        }

        const plan = sub.metadata?.plan || 'monthly';

        const { error } = await supabase.from('subscriptions').upsert({
          id: sub.id,
          user_id: userId,
          stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
          plan,
          status: sub.status,
          trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

        if (error) console.error('Supabase upsert error (webhook):', error);
        break;
      }

      default:
        // Unhandled event type — ignore
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
}

module.exports.webhookHandler = webhookHandler;
