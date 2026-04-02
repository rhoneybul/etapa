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

// ── Health check (no auth needed) ────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
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

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Etapa API running on http://localhost:${PORT}`);
});
