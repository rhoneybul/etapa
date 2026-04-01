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
  starter: process.env.STRIPE_PRICE_STARTER,
});

// Starter plan = one-time payment, 3 months access
const STARTER_ACCESS_DAYS = 90;

// ── GET /api/stripe/subscription-status ──────────────────────────────────────
router.get('/subscription-status', async (req, res) => {
  // If Stripe is not configured, allow access (dev mode)
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.json({ active: true, status: 'dev' });
  }

  const userId = req.user.id;

  // Check for active subscriptions (trialing/active) OR paid starter purchases
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

// ── POST /api/stripe/create-checkout-session ─────────────────────────────────
router.post('/create-checkout-session', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const { plan, redirectBase } = req.body;
  const prices = PRICES();
  const priceId = prices[plan];
  if (!priceId) return res.status(400).json({ error: 'Invalid plan. Must be "monthly", "annual", or "starter".' });

  const userId = req.user.id;
  const userEmail = req.user.email;
  const isStarter = plan === 'starter';

  // Validate redirect base — must be the app scheme or an allowed/localhost origin
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const isValidRedirect = redirectBase && (
    redirectBase.startsWith('etapa://') ||
    redirectBase.startsWith('http://localhost') ||
    allowedOrigins.some(o => redirectBase.startsWith(o))
  );
  const base = isValidRedirect ? redirectBase : 'etapa://stripe';

  try {
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: userEmail,
      success_url: `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/cancel`,
      metadata: { userId, plan },
    };

    if (isStarter) {
      // One-time payment for starter (Get into Cycling)
      sessionConfig.mode = 'payment';
    } else {
      // Recurring subscription with trial
      sessionConfig.mode = 'subscription';
      sessionConfig.subscription_data = {
        trial_period_days: 30,
        metadata: { userId, plan },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe checkout session error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ── POST /api/stripe/create-portal-session ───────────────────────────────────
router.post('/create-portal-session', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const userId = req.user.id;

  const { data, error } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.stripe_customer_id) {
    return res.status(404).json({ error: 'No subscription found for this user' });
  }

  const returnUrl = req.body.returnUrl || 'etapa://settings';

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: returnUrl,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe portal session error:', err);
    res.status(500).json({ error: 'Failed to create billing portal session' });
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
      expand: ['subscription', 'payment_intent'],
    });

    // Ensure this session belongs to the authenticated user
    if (session.metadata?.userId !== userId) {
      return res.status(403).json({ error: 'Session does not belong to this user' });
    }

    const plan = session.metadata?.plan || 'monthly';
    const isStarter = plan === 'starter';

    if (isStarter) {
      // One-time payment — grant 3 months access
      const paymentIntent = session.payment_intent;
      const piId = typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id;
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

      const accessEnd = new Date();
      accessEnd.setDate(accessEnd.getDate() + STARTER_ACCESS_DAYS);

      const { error } = await supabase.from('subscriptions').upsert({
        id: `starter_${piId || sessionId}`,
        user_id: userId,
        stripe_customer_id: customerId || null,
        plan: 'starter',
        status: 'paid',
        trial_end: null,
        current_period_end: accessEnd.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (error) console.error('Supabase upsert error (starter):', error);

      res.json({ ok: true, status: 'paid', plan: 'starter', accessEnd: accessEnd.toISOString() });
    } else {
      // Subscription flow
      const sub = session.subscription;
      if (!sub) return res.status(400).json({ error: 'No subscription found in session' });

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
    }
  } catch (err) {
    console.error('Stripe verify session error:', err);
    res.status(500).json({ error: 'Failed to verify session' });
  }
});

// ── POST /api/stripe/upgrade-starter ────────────────────────────────────────
// Upgrades a starter user to annual: pro-rata refund of starter + 50% off annual
router.post('/upgrade-starter', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const userId = req.user.id;
  const userEmail = req.user.email;
  const { redirectBase } = req.body;

  try {
    // 1. Find the user's active starter subscription record
    const { data: starterRow, error: fetchErr } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('plan', 'starter')
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr || !starterRow) {
      return res.status(404).json({ error: 'No active starter plan found' });
    }

    // 2. Calculate pro-rata refund
    const now = new Date();
    const periodEnd = new Date(starterRow.current_period_end);
    const daysRemaining = Math.max(0, Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24)));
    const starterPriceCents = 5000; // $50.00
    const refundCents = Math.round((daysRemaining / STARTER_ACCESS_DAYS) * starterPriceCents);

    // 3. Issue pro-rata refund on the original payment intent
    const starterPaymentIntentId = starterRow.id.replace('starter_', '');
    if (refundCents > 0 && starterPaymentIntentId) {
      try {
        await stripe.refunds.create({
          payment_intent: starterPaymentIntentId,
          amount: refundCents,
          reason: 'requested_by_customer',
        });
      } catch (refundErr) {
        console.error('Starter refund error:', refundErr);
        // Continue — don't block upgrade if refund fails (could already be refunded)
      }
    }

    // 4. Create a 50%-off coupon for this upgrade (or reuse existing)
    let coupon;
    try {
      coupon = await stripe.coupons.retrieve('STARTER_UPGRADE_50');
    } catch {
      coupon = await stripe.coupons.create({
        id: 'STARTER_UPGRADE_50',
        percent_off: 50,
        duration: 'once',
        name: 'Starter Upgrade — 50% off first year',
      });
    }

    // 5. Create checkout session for annual plan with 50% off
    const prices = PRICES();
    const annualPriceId = prices.annual;
    if (!annualPriceId) {
      return res.status(500).json({ error: 'Annual price not configured' });
    }

    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const isValidRedirect = redirectBase && (
      redirectBase.startsWith('etapa://') ||
      redirectBase.startsWith('http://localhost') ||
      allowedOrigins.some(o => redirectBase.startsWith(o))
    );
    const base = isValidRedirect ? redirectBase : 'etapa://stripe';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: annualPriceId, quantity: 1 }],
      discounts: [{ coupon: coupon.id }],
      customer_email: userEmail,
      success_url: `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/cancel`,
      metadata: { userId, plan: 'annual', upgradedFromStarter: 'true' },
      subscription_data: {
        metadata: { userId, plan: 'annual' },
      },
    });

    // 6. Expire the starter record so they don't have dual access
    await supabase.from('subscriptions').update({
      status: 'upgraded',
      updated_at: new Date().toISOString(),
    }).eq('id', starterRow.id);

    res.json({
      url: session.url,
      sessionId: session.id,
      refundAmount: refundCents / 100,
      daysRemaining,
    });
  } catch (err) {
    console.error('Stripe upgrade-starter error:', err);
    res.status(500).json({ error: 'Failed to create upgrade session' });
  }
});

// ── POST /api/stripe/refund-starter ─────────────────────────────────────────
// Full refund if within 2 weeks of plan start date. Plan is deactivated.
const REFUND_WINDOW_DAYS = 14;

router.post('/refund-starter', async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const userId = req.user.id;
  const { planStartDate } = req.body; // ISO string — the plan's start date

  try {
    // 1. Find the user's starter subscription record
    const { data: starterRow, error: fetchErr } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('plan', 'starter')
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr || !starterRow) {
      return res.status(404).json({ error: 'No active starter plan found' });
    }

    // 2. Check refund window — within 14 days of plan start date
    const startDate = planStartDate ? new Date(planStartDate) : new Date(starterRow.created_at);
    const now = new Date();
    const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));

    if (daysSinceStart > REFUND_WINDOW_DAYS) {
      return res.status(400).json({
        error: 'Refund window has passed',
        daysSinceStart,
        maxDays: REFUND_WINDOW_DAYS,
      });
    }

    // 3. Issue full refund
    const starterPaymentIntentId = starterRow.id.replace('starter_', '');
    try {
      await stripe.refunds.create({
        payment_intent: starterPaymentIntentId,
        reason: 'requested_by_customer',
      });
    } catch (refundErr) {
      console.error('Starter full refund error:', refundErr);
      return res.status(500).json({ error: 'Refund failed. Please contact support.' });
    }

    // 4. Deactivate the starter record
    await supabase.from('subscriptions').update({
      status: 'refunded',
      updated_at: new Date().toISOString(),
    }).eq('id', starterRow.id);

    res.json({ ok: true, refundedAmount: 50, daysSinceStart });
  } catch (err) {
    console.error('Stripe refund-starter error:', err);
    res.status(500).json({ error: 'Failed to process refund' });
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

      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan;

        // Only handle one-time starter payments here — subscriptions are handled above
        if (!userId || plan !== 'starter') break;

        const piId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;
        const customerId = typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id;

        const accessEnd = new Date();
        accessEnd.setDate(accessEnd.getDate() + STARTER_ACCESS_DAYS);

        const { error } = await supabase.from('subscriptions').upsert({
          id: `starter_${piId || session.id}`,
          user_id: userId,
          stripe_customer_id: customerId || null,
          plan: 'starter',
          status: 'paid',
          trial_end: null,
          current_period_end: accessEnd.toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

        if (error) console.error('Supabase upsert error (webhook starter):', error);
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
