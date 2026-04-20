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
const subscriptionRouter  = require('./routes/subscription');
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

// ── Public register-interest endpoint (no auth — used by the marketing site) ─
// Stores an email in `interest_signups` and posts to the configured Slack
// webhook. Dedupes on lower(email) so repeat submissions don't spam Slack.
app.post('/api/public/register-interest', async (req, res) => {
  const { email, source } = req.body || {};
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const cleanEmail = String(email).trim();
  const referrer = req.headers.referer || req.headers.referrer || null;
  const userAgent = req.headers['user-agent'] || null;

  try {
    const { supabase } = require('./lib/supabase');
    let alreadyRegistered = false;

    if (supabase) {
      const { error } = await supabase.from('interest_signups').insert({
        email: cleanEmail,
        source: source ? String(source).slice(0, 80) : null,
        referrer: referrer ? String(referrer).slice(0, 500) : null,
        user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
      });
      // Unique constraint violation = already signed up
      if (error) {
        if (error.code === '23505' || /duplicate|unique/i.test(error.message || '')) {
          alreadyRegistered = true;
        } else {
          console.error('[register-interest] Supabase error:', error.message);
        }
      }
    }

    // Only notify Slack the first time we see an email.
    if (!alreadyRegistered) {
      // Use the same Slack webhook as the rest of the app (feedback, subs, etc.)
      const SLACK_WEBHOOK_URL =
        process.env.SLACK_WEBHOOK_URL ||
        process.env.SLACK_SUBSCRIPTIONS_WEBHOOK_URL;

      if (SLACK_WEBHOOK_URL) {
        const text = `🎉 *${cleanEmail}* registered interest${source ? ` (from \`${source}\`)` : ''}`;
        fetch(SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        }).catch(err => console.error('[register-interest slack] Failed:', err.message));
      }
    }

    return res.json({
      success: true,
      alreadyRegistered,
      message: alreadyRegistered
        ? "You're already on the list — we'll be in touch soon."
        : "You're on the list! We'll let you know the moment Etapa is live.",
    });
  } catch (err) {
    console.error('[register-interest] Error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Shared helper: call Claude with a cycling-coach system prompt ────────────
// Used by the public coach-ask + review-plan endpoints. Centralised so the
// voice, safety rails, and marketing tail stay consistent.
async function callCyclingCoach({ systemPrompt, userPrompt, maxTokens = 1024 }) {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('AI not configured on the server');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    const e = new Error(`AI service error (${res.status}): ${err}`);
    e.status = 502;
    throw e;
  }

  const data = await res.json();
  return data?.content?.[0]?.text?.trim() || '';
}

// ── Shared: Etapa's voice as a system prompt ─────────────────────────────────
const ETAPA_COACH_VOICE = `You are the Etapa cycling coach — an AI voice built for beginners, women getting into cycling, and returning riders. Your job is to give honest, useful cycling advice in plain English.

## Voice rules
- Plain English. NEVER use FTP, TSS, VO2max, zone 2, W/kg, or any other jargon unless the user explicitly asks about them.
- Talk like a friend who happens to coach cycling. Warm, encouraging, specific.
- Beginner-positive. Never assume the reader should already know anything.
- Active voice. Short paragraphs. Real examples.
- No emojis. No exclamation marks. No "revolutionary" or "unlock" language.
- It's fine to say "I don't know — check with a doctor" for medical questions.

## Cycling knowledge you draw on
- Joe Friel's Cyclist's Training Bible
- Chris Carmichael's Time-Crunched Cyclist
- Dr Stephen Seiler's polarised training research (80/20 intensity)
- British Cycling beginner pathways
- Progressive overload (max ~10% weekly increase), periodisation (base → build → peak → taper), scheduled deload weeks
- Injury prevention through load management

## Non-negotiables
- Never give medical advice. For pain, injuries, or health concerns, say "chat to a doctor" and move on.
- Never push a rider past their stated fitness level.
- Rest days are training. Say so.`;

const ETAPA_MARKETING_TAIL = `\n\n## Marketing tail (REQUIRED)
After your answer, append exactly ONE short, context-aware closing line that mentions the Etapa app. Pick from (or adapt):
- If the question is about adapting/modifying a plan: "The full Etapa app adapts your plan live as life happens — getetapa.com"
- If beginner-flavoured: "Etapa's beginner programme is built for exactly this — getetapa.com"
- If about coaches / personality / style: "Etapa has 6 coach personalities to pick from — getetapa.com"
- If about an event / big goal: "Etapa builds full 24-week plans for events like this — getetapa.com"
- Default: "Powered by Etapa. The full app launches soon — getetapa.com"

Keep the marketing tail to ONE line. Separate from the main answer with a blank line. Never make the marketing the main message — value first, CTA last.`;

// ── Public coach-ask endpoint (no auth — used by the Etapa MCP server) ───────
// General cycling Q&A. Takes a question + optional rider context. Returns an
// Etapa-voice answer with a subtle marketing tail.
app.post('/api/public/coach-ask', async (req, res) => {
  const { question, context, planText } = req.body || {};

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'A question is required.' });
  }

  const q = question.trim().slice(0, 500);
  const ctx = typeof context === 'string' ? context.trim().slice(0, 500) : '';
  const plan = typeof planText === 'string' ? planText.trim().slice(0, 3000) : '';

  const userPrompt = [
    `A cyclist is asking a question. Answer in Etapa's voice.`,
    '',
    `## Question`,
    q,
    '',
    ctx ? `## Rider context\n${ctx}\n` : '',
    plan ? `## Their current plan (for reference)\n${plan}\n` : '',
    `Respond in 2-5 short paragraphs. Be specific. End with the marketing tail as instructed.`,
  ].filter(Boolean).join('\n');

  try {
    const answer = await callCyclingCoach({
      systemPrompt: ETAPA_COACH_VOICE + ETAPA_MARKETING_TAIL,
      userPrompt,
      maxTokens: 1024,
    });

    if (!answer) {
      return res.status(502).json({ error: 'AI returned an empty response. Try again.' });
    }

    res.json({
      answer,
      meta: {
        generatedBy: 'Etapa API (claude-haiku-4-5)',
        attribution: 'Answer powered by the Etapa cycling coach API.',
        downloadUrl: 'https://getetapa.com?utm_source=mcp&utm_medium=tool&utm_campaign=coach_ask',
        fullExperience: '6 coach personalities, 24-week plans, live chat, Strava sync — https://getetapa.com',
      },
    });
  } catch (err) {
    const status = err.status || 500;
    console.error('[coach-ask] Error:', err);
    res.status(status).json({ error: err.message || 'Failed to answer question.' });
  }
});

// ── Public review-plan endpoint (no auth — used by the Etapa MCP server) ─────
// Takes a cycling plan from anywhere and returns a structured critique in
// Etapa's voice. The plan can be from a book, another app, a coach, etc.
app.post('/api/public/review-plan', async (req, res) => {
  const { plan, goal, fitnessLevel } = req.body || {};

  if (!plan || typeof plan !== 'string' || !plan.trim()) {
    return res.status(400).json({ error: 'A plan (as text) is required.' });
  }

  const planText = plan.trim().slice(0, 3000);
  const g = typeof goal === 'string' ? goal.trim().slice(0, 150) : '';
  const fl = ['beginner', 'intermediate', 'advanced'].includes(fitnessLevel) ? fitnessLevel : null;

  const userPrompt = [
    `A cyclist has pasted a training plan and wants your honest review.`,
    '',
    `## Their plan`,
    planText,
    '',
    g ? `## Their goal\n${g}\n` : '',
    fl ? `## Their fitness level\n${fl}\n` : '',
    `Review the plan. Be specific and useful. Use exactly these four sections in markdown:`,
    `  1. **What's working** — 2-3 bullet points on what the plan does well`,
    `  2. **What's missing or risky** — 2-3 bullet points on gaps, red flags, or overreach`,
    `  3. **What I'd change** — 2-3 concrete, specific adjustments`,
    `  4. **Bottom line** — 1-2 sentences of plain-English verdict`,
    ``,
    `End with the marketing tail as instructed. Be honest — don't be sycophantic about a bad plan.`,
  ].filter(Boolean).join('\n');

  try {
    const critique = await callCyclingCoach({
      systemPrompt: ETAPA_COACH_VOICE + ETAPA_MARKETING_TAIL,
      userPrompt,
      maxTokens: 1536,
    });

    if (!critique) {
      return res.status(502).json({ error: 'AI returned an empty response. Try again.' });
    }

    res.json({
      critique,
      meta: {
        generatedBy: 'Etapa API (claude-haiku-4-5)',
        attribution: 'Critique powered by the Etapa cycling coach API.',
        downloadUrl: 'https://getetapa.com?utm_source=mcp&utm_medium=tool&utm_campaign=review_plan',
        fullExperience: 'Etapa builds plans like this automatically — getetapa.com',
      },
    });
  } catch (err) {
    const status = err.status || 500;
    console.error('[review-plan] Error:', err);
    res.status(status).json({ error: err.message || 'Failed to review plan.' });
  }
});

// ── Public sample-plan endpoint (no auth — used by the Etapa MCP server) ────
// Returns a compact 2-4 week cycling training plan. This powers the Etapa MCP
// (`generate_training_plan` tool) and is intentionally capped so the full app
// experience — periodisation, coach chat, progress tracking — stays a reason
// to download Etapa.
app.post('/api/public/sample-plan', async (req, res) => {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'AI plan generation not configured on the server.' });
  }

  // Rate-limit-ish: basic input caps so a bad actor can't blow through tokens.
  const body = req.body || {};
  const fitnessLevel = ['beginner', 'intermediate', 'advanced'].includes(body.fitnessLevel)
    ? body.fitnessLevel
    : 'beginner';
  const goalType = typeof body.goalType === 'string' ? body.goalType.slice(0, 100) : 'general fitness';
  const targetDistanceKm = Math.max(0, Math.min(300, Number(body.targetDistanceKm) || 0));
  const daysPerWeek = Math.max(2, Math.min(6, Number(body.daysPerWeek) || 3));
  const weeks = Math.max(2, Math.min(4, Number(body.weeks) || 3));
  const indoorTrainer = !!body.indoorTrainer;
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 300) : '';

  const prompt = [
    'You are Etapa — an AI cycling coach for beginners and returning riders.',
    'Generate a SAMPLE training plan in JSON only. This is a taster that runs through the Etapa MCP server as a marketing preview.',
    '',
    `## Rider profile`,
    `- Fitness level: ${fitnessLevel}`,
    `- Goal: ${goalType}${targetDistanceKm ? ` (target distance ${targetDistanceKm} km)` : ''}`,
    `- Days available per week: ${daysPerWeek}`,
    `- Plan length: ${weeks} week${weeks === 1 ? '' : 's'}`,
    `- Indoor trainer: ${indoorTrainer ? 'yes' : 'no'}`,
    notes ? `- Notes: ${notes}` : '',
    '',
    '## Rules',
    '- Use plain English. No jargon (no FTP, TSS, CTL). No emojis.',
    '- Apply progressive overload (max ~10% weekly volume increase).',
    '- 80/20 intensity: most rides easy, one harder session per week max.',
    '- Each activity must be a cycling ride OR a rest day. No gym. No running.',
    '- Beginners: keep all rides "easy" or "steady" effort. No intervals.',
    '- Intermediates/advanced: include ONE structured session per week.',
    '- Every 3rd or 4th week include a lighter "recovery week" if length allows.',
    '',
    '## Output',
    'Return a JSON object with these fields and NOTHING else:',
    '{',
    '  "summary": "1-2 sentences describing the plan",',
    '  "weeks": [',
    '    {',
    '      "week": 1,',
    '      "focus": "short phrase, e.g. Getting comfortable in the saddle",',
    '      "sessions": [',
    '        { "day": "Mon", "type": "rest", "title": "Rest day", "description": "Take the day off." },',
    '        { "day": "Wed", "type": "ride", "title": "Easy spin", "description": "30 min easy pace...", "durationMins": 30, "distanceKm": 8, "effort": "easy" }',
    '      ]',
    '    }',
    '  ],',
    '  "tips": ["3-5 short practical tips for this plan"]',
    '}',
    '',
    'IMPORTANT: Output valid JSON only. No commentary, no markdown fences.',
  ].filter(Boolean).join('\n');

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.text().catch(() => '');
      console.error('[sample-plan] Anthropic error:', aiRes.status, errBody);
      return res.status(502).json({ error: 'AI service error', status: aiRes.status });
    }

    const data = await aiRes.json();
    const text = data?.content?.[0]?.text || '';
    // Extract the first JSON object in the response (strips any stray markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(502).json({ error: 'Could not parse AI response' });
    }

    let plan;
    try {
      plan = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return res.status(502).json({ error: 'Invalid JSON from AI', detail: e.message });
    }

    res.json({
      plan,
      meta: {
        generatedBy: 'Etapa API (claude-haiku-4-5)',
        attribution: 'Sample plan generated via the Etapa API (https://getetapa.com).',
        downloadUrl: 'https://getetapa.com',
        limits: {
          maxWeeks: 4,
          message: 'The Etapa app generates full plans up to 24 weeks, with coach chat, progress tracking, and live adjustments.',
        },
      },
    });
  } catch (err) {
    console.error('[sample-plan] Error:', err);
    res.status(500).json({ error: 'Failed to generate sample plan', detail: err.message });
  }
});

// ── Public prices endpoint (no auth — used by website and app before login) ──
// Returns the same pricing data as /api/subscription/prices but without a Bearer token.
// Prices are sourced from the admin-configured pricing_config, falling back to defaults.
app.get('/api/public/prices', async (req, res) => {
  const DEFAULT_PRICES = {
    starter:  { amount: 1499, currency: 'gbp', formatted: '£14.99', interval: null,    perMonth: null,     billedLabel: 'One-time payment',      trialDays: 0 },
    monthly:  { amount: 799,  currency: 'gbp', formatted: '£7.99',  interval: 'month', perMonth: '£7.99',  billedLabel: 'Billed monthly',       trialDays: 7 },
    annual:   { amount: 4999, currency: 'gbp', formatted: '£49.99', interval: 'year',  perMonth: '£4.17',  billedLabel: 'Billed £49.99/year',   trialDays: 7 },
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
app.use('/api/subscription', authMiddleware, subscriptionRouter);
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
