require('dotenv').config();

// Sentry must be initialised before anything else
const Sentry = require('@sentry/node');
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.2,
    environment: process.env.NODE_ENV || 'development',
  });
}

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const usersRouter        = require('./routes/users');
const goalsRouter        = require('./routes/goals');
const plansRouter        = require('./routes/plans');
const planConfigsRouter  = require('./routes/planConfigs');
const chatSessionsRouter = require('./routes/chatSessions');
const aiRouter           = require('./routes/ai');
const feedbackRouter      = require('./routes/feedback');
const supportRouter       = require('./routes/support');
const notificationsRouter = require('./routes/notifications');
const preferencesRouter   = require('./routes/preferences');
const appConfigRouter     = require('./routes/appConfig');
const coachCheckinRouter  = require('./routes/coachCheckin');
const stripeRouter        = require('./routes/stripe');
const { webhookHandler }  = require('./routes/stripe');
const { revenueCatWebhookHandler } = require('./routes/revenueCatWebhook');
const adminRouter         = require('./routes/admin');
const stravaRouter        = require('./routes/strava');
const couponsRouter       = require('./routes/coupons');

const { authMiddleware } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS;
app.use(cors({ origin: !allowedOrigins || allowedOrigins === '*' ? '*' : allowedOrigins.split(',') }));
Sentry.setupExpressErrorHandler(app);

// Stripe webhook must receive raw body — mount BEFORE express.json()
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), webhookHandler);

// RevenueCat webhook — receives JSON, no auth middleware (uses its own Bearer token)
app.post('/api/revenuecat/webhook', express.json(), revenueCatWebhookHandler);

app.use(express.json());

// Serve static pages (account deletion form, etc.)
app.use(express.static(path.join(__dirname, '../../public')));

// ── Health check (no auth needed) ────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── Public routes (no auth) ──────────────────────────────────────────────────
// Account deletion request — must be public (user may not be able to log in)
app.post('/api/account-deletion', async (req, res) => {
  const { email, reason, additionalInfo } = req.body;
  if (!email?.trim()) {
    return res.status(400).json({ error: 'Email address is required' });
  }

  try {
    // 1. Persist to feedback table as a deletion request
    const { supabase } = require('./lib/supabase');
    const feedbackId = `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await supabase.from('feedback').insert({
      id: feedbackId,
      user_id: null,
      category: 'support',
      message: `[ACCOUNT DELETION REQUEST]\n\nEmail: ${email.trim()}\nReason: ${reason || 'Not provided'}\nAdditional info: ${additionalInfo || 'None'}`,
      status: 'open',
    }).catch(() => {});

    // 2. Create a Linear issue so it shows up in the support queue
    const LINEAR_API_KEY = process.env.LINEAR_API_KEY || '';
    const LINEAR_TEAM_ID = process.env.LINEAR_TEAM_ID || '';
    const LINEAR_SUPPORT_LABEL_ID = process.env.LINEAR_SUPPORT_LABEL_ID || null;

    if (LINEAR_API_KEY && LINEAR_TEAM_ID) {
      const mutation = `
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) { success issue { id identifier url } }
        }
      `;
      const description = [
        '## Account Deletion Request',
        '',
        `**Email:** ${email.trim()}`,
        `**Reason:** ${reason || 'Not provided'}`,
        `**Additional info:** ${additionalInfo || 'None'}`,
        '',
        '---',
        '',
        `Submitted: ${new Date().toISOString()}`,
        '',
        '> Please verify the account exists, delete all user data, and confirm deletion to the user via email.',
      ].join('\n');

      await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: LINEAR_API_KEY },
        body: JSON.stringify({
          query: mutation,
          variables: {
            input: {
              teamId: LINEAR_TEAM_ID,
              title: `[Account Deletion] ${email.trim()}`,
              description,
              priority: 2,
              ...(LINEAR_SUPPORT_LABEL_ID ? { labelIds: [LINEAR_SUPPORT_LABEL_ID] } : {}),
            },
          },
        }),
      }).catch(err => console.error('[account-deletion] Linear error:', err.message));
    }

    res.json({ success: true, message: 'Your account deletion request has been submitted. We will process it within 30 days and confirm via email.' });
  } catch (err) {
    console.error('[account-deletion] Error:', err);
    res.status(500).json({ error: 'Failed to submit request. Please email support directly.' });
  }
});

// ── Public prices endpoint (no auth — used by website and app before login) ──
// Returns the same pricing data as /api/stripe/prices but without a Bearer token.
// Prices are sourced from the admin-configured pricing_config, falling back to defaults.
app.get('/api/public/prices', async (req, res) => {
  const DEFAULT_PRICES = {
    monthly:  { amount: 999,  currency: 'gbp', formatted: '£9.99',  interval: 'month', perMonth: '£9.99',  billedLabel: 'Billed monthly',       trialDays: 7 },
    annual:   { amount: 7999, currency: 'gbp', formatted: '£79.99', interval: 'year',  perMonth: '£6.67',  billedLabel: 'Billed £79.99/year',   trialDays: 7 },
    lifetime: { amount: 9999, currency: 'gbp', formatted: '£99.99', interval: null,    perMonth: null,     billedLabel: 'One-time payment',      trialDays: 0 },
  };

  try {
    const { supabase } = require('./lib/supabase');
    const { data } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'pricing_config')
      .single();

    if (data?.value) {
      const cfg = data.value;
      const currency = cfg.currency || 'gbp';
      const sym = currency === 'usd' ? '$' : currency === 'gbp' ? '£' : currency === 'eur' ? '€' : currency.toUpperCase() + ' ';
      const fmt = (pence) => `${sym}${(pence / 100).toFixed(2)}`;
      const results = {};

      if (cfg.monthly)  results.monthly  = { amount: cfg.monthly,  currency, formatted: fmt(cfg.monthly),  interval: 'month', perMonth: fmt(cfg.monthly),          billedLabel: 'Billed monthly',                           trialDays: 7 };
      if (cfg.annual)   results.annual   = { amount: cfg.annual,   currency, formatted: fmt(cfg.annual),   interval: 'year',  perMonth: fmt(cfg.annual / 12),       billedLabel: `Billed ${fmt(cfg.annual)}/year`,           trialDays: 7 };
      if (cfg.lifetime) results.lifetime = { amount: cfg.lifetime, currency, formatted: fmt(cfg.lifetime), interval: null,    perMonth: null,                        billedLabel: 'One-time payment',                         trialDays: 0 };

      res.set('Cache-Control', 'public, max-age=1800');
      return res.json(Object.keys(results).length ? results : DEFAULT_PRICES);
    }
  } catch { /* fall through */ }

  res.set('Cache-Control', 'public, max-age=1800');
  res.json(DEFAULT_PRICES);
});

// ── Protected routes ──────────────────────────────────────────────────────────
app.use('/api/users', authMiddleware, usersRouter);
app.use('/api/goals', authMiddleware, goalsRouter);
app.use('/api/plans', authMiddleware, plansRouter);
app.use('/api/plan-configs', authMiddleware, planConfigsRouter);
app.use('/api/chat-sessions', authMiddleware, chatSessionsRouter);
app.use('/api/ai', authMiddleware, aiRouter);
app.use('/api/stripe', authMiddleware, stripeRouter);
app.use('/api/feedback', authMiddleware, feedbackRouter);
app.use('/api/support', authMiddleware, supportRouter);
app.use('/api/notifications', authMiddleware, notificationsRouter);
app.use('/api/preferences', authMiddleware, preferencesRouter);
app.use('/api/app-config', appConfigRouter); // no auth — app checks before login
app.use('/api/coach-checkin', coachCheckinRouter); // auth via CRON_SECRET or ADMIN_API_KEY
app.use('/api/admin', adminRouter); // admin router has its own auth (API key or Supabase JWT)
app.use('/api/coupons', authMiddleware, couponsRouter);
app.use('/api/strava', stravaRouter); // no auth — Strava redirects browser here directly

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// Export the app for testing (Supertest) — only listen when run directly
module.exports = { app };

app.listen(PORT, () => {
  console.log(`Etapa API running on http://localhost:${PORT}`);
});
