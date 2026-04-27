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
const unsubscribeRouter   = require('./routes/unsubscribe');
const mailerliteWebhookRouter = require('./routes/mailerliteWebhook');
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
  const { email, source, demoSessionId, demoCtaVariant, firstName, cyclingLevel, wishlist } = req.body || {};
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const VALID_LEVELS = ['new', 'sometimes', 'regular'];

  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const cleanEmail = String(email).trim();
  const referrer = req.headers.referer || req.headers.referrer || null;
  const userAgent = req.headers['user-agent'] || null;
  const sessionIdForDemo = UUID_RE.test(demoSessionId || '') ? demoSessionId : null;

  // Normalise the optional profile fields. Names get trimmed and capped;
  // cycling level is validated against the allowed set or dropped entirely.
  const cleanFirstName = firstName && typeof firstName === 'string'
    ? firstName.trim().slice(0, 80) || null
    : null;
  const cleanCyclingLevel = VALID_LEVELS.includes(cyclingLevel) ? cyclingLevel : null;
  const cleanWishlist = wishlist && typeof wishlist === 'string'
    ? wishlist.trim().slice(0, 1000) || null
    : null;

  try {
    const { supabase } = require('./lib/supabase');
    let alreadyRegistered = false;

    if (supabase) {
      const { error } = await supabase.from('interest_signups').insert({
        email: cleanEmail,
        source: source ? String(source).slice(0, 80) : null,
        referrer: referrer ? String(referrer).slice(0, 500) : null,
        user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
        demo_session_id: sessionIdForDemo,
        first_name: cleanFirstName,
        cycling_level: cleanCyclingLevel,
        wishlist: cleanWishlist,
      });
      // Unique constraint violation = already signed up
      if (error) {
        if (error.code === '23505' || /duplicate|unique/i.test(error.message || '')) {
          alreadyRegistered = true;
        } else {
          console.error('[register-interest] Supabase error:', error.message);
        }
      }

      // If this signup came from the demo, also log a 'signup' event so we can
      // compute conversion rates per A/B variant.
      if (sessionIdForDemo) {
        await supabase.from('demo_interactions').insert({
          session_id:   sessionIdForDemo,
          event_type:   'signup',
          cta_variant:  ['A', 'B'].includes(demoCtaVariant) ? demoCtaVariant : null,
          referrer:     referrer ? String(referrer).slice(0, 500) : null,
          user_agent:   userAgent ? String(userAgent).slice(0, 500) : null,
        }).catch(err => console.error('[register-interest demo-event] Failed:', err.message));
      }
    }

    // Only notify Slack the first time we see an email.
    if (!alreadyRegistered) {
      // Use the same Slack webhook as the rest of the app (feedback, subs, etc.)
      const SLACK_WEBHOOK_URL =
        process.env.SLACK_WEBHOOK_URL ||
        process.env.SLACK_SUBSCRIPTIONS_WEBHOOK_URL;

      if (SLACK_WEBHOOK_URL) {
        const levelLabel = cleanCyclingLevel === 'new' ? 'new to cycling'
          : cleanCyclingLevel === 'sometimes' ? 'rides sometimes'
          : cleanCyclingLevel === 'regular' ? 'rides regularly'
          : null;
        const bits = [
          `*${cleanFirstName ? cleanFirstName + ' · ' : ''}${cleanEmail}*`,
          'registered interest',
          source ? `(from \`${source}\`)` : null,
          levelLabel ? `— ${levelLabel}` : null,
        ].filter(Boolean);
        // Wishlist (if they told us what they want to see) goes on its own
        // blockquoted line so it reads cleanly in Slack and doesn't bloat
        // the headline when it's empty.
        const headline = bits.join(' ');
        const text = cleanWishlist
          ? `${headline}\n> ${cleanWishlist.replace(/\n+/g, ' ')}`
          : headline;
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

// ── Rate limiter for the public MCP-backing endpoints ───────────────────────
// In-memory sliding window per IP. Two tiers:
//   - website demo  (X-Etapa-Source: website-demo)  → stricter: 10/hour
//   - everything else (real MCP clients, etc.)      → lenient: 60/hour
// Fine for a single Railway instance. If we ever horizontally scale, move to Redis.
const rateStore = new Map();
function rateLimit(req, res, next) {
  // Skip rate-limiting entirely if we can't identify a requester (shouldn't happen,
  // but keeps local/development smooth).
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
  const source = req.headers['x-etapa-source'] || 'generic';
  const isDemo = source === 'website-demo';
  const limit = isDemo ? 10 : 60;
  const windowMs = 60 * 60 * 1000; // 1 hour

  const key = `${isDemo ? 'demo' : 'generic'}:${ip}`;
  const now = Date.now();
  const hits = (rateStore.get(key) || []).filter(ts => now - ts < windowMs);

  if (hits.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: `Rate limited. Try again in ${Math.ceil(retryAfterSec / 60)} minutes.`,
      limit,
      windowSeconds: windowMs / 1000,
    });
  }

  hits.push(now);
  rateStore.set(key, hits);

  // Periodic cleanup to stop the map growing unbounded. 1% chance per request.
  if (Math.random() < 0.01) {
    for (const [k, v] of rateStore) {
      const filtered = v.filter(ts => now - ts < windowMs);
      if (filtered.length === 0) rateStore.delete(k);
      else rateStore.set(k, filtered);
    }
  }

  next();
}

// ── Shared helper: call Claude with a cycling-coach system prompt ────────────
// Used by the public coach-ask + review-plan endpoints. Centralised so the
// voice, safety rails, and marketing tail stay consistent.
// `feature` is passed through to claude_usage_log so we can break down cost
// per public endpoint (these are anonymous calls — userId will be null).
async function callCyclingCoach({ systemPrompt, userPrompt, maxTokens = 1024, feature = 'public_coach' }) {
  const { logClaudeUsage } = require('./lib/claudeLogger');
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('AI not configured on the server');

  const model = 'claude-haiku-4-5-20251001';
  const startedAt = Date.now();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    logClaudeUsage({
      userId: null, feature, model,
      data: {}, response: res, durationMs: Date.now() - startedAt,
      status: 'api_error', metadata: { public: true, http: res.status },
    });
    const err = await res.text().catch(() => '');
    const e = new Error(`AI service error (${res.status}): ${err}`);
    e.status = 502;
    throw e;
  }

  const data = await res.json();
  logClaudeUsage({
    userId: null, feature, model,
    data, response: res, durationMs: Date.now() - startedAt,
    metadata: { public: true },
  });
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
- If about coaches / personality / style: "Etapa has 7 coach personalities to pick from, each with their own nationality and languages — getetapa.com"
- If about an event / big goal: "Etapa builds full 24-week plans for events like this — getetapa.com"
- Default: "Powered by Etapa. The full app launches soon — getetapa.com"

Keep the marketing tail to ONE line. Separate from the main answer with a blank line. Never make the marketing the main message — value first, CTA last.`;

// ── Public demo-event endpoint (no auth — used by the website MCP demo) ─────
// Logs interactions with the interactive demo on getetapa.com. Helps us
// understand which prompts are popular, which A/B CTA variant converts, and
// how the demo funnels into register_interest signups.
//
// Events we accept (event_type):
//   - 'view'           — page loaded, demo section in viewport
//   - 'prompt_click'   — a starter prompt button was clicked
//   - 'response_ok'    — a tool call completed successfully
//   - 'response_error' — a tool call failed
//   - 'cta_click'      — the "Register Interest" CTA was clicked
//
// This endpoint is also rate-limited — it's cheap but still worth guarding.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_EVENTS = ['view', 'prompt_click', 'response_ok', 'response_error', 'cta_click'];

app.post('/api/public/demo-event', rateLimit, async (req, res) => {
  const { sessionId, eventType, promptKey, ctaVariant, errorMessage } = req.body || {};

  if (!sessionId || !UUID_RE.test(sessionId)) {
    return res.status(400).json({ error: 'Valid sessionId (UUID) is required.' });
  }
  if (!VALID_EVENTS.includes(eventType)) {
    return res.status(400).json({ error: `eventType must be one of: ${VALID_EVENTS.join(', ')}` });
  }

  const referrer = req.headers.referer || req.headers.referrer || null;
  const userAgent = req.headers['user-agent'] || null;

  try {
    const { supabase } = require('./lib/supabase');
    if (!supabase) {
      // Not configured — not a hard failure for analytics.
      return res.json({ success: true, logged: false });
    }

    await supabase.from('demo_interactions').insert({
      session_id:    sessionId,
      event_type:    eventType,
      prompt_key:    typeof promptKey === 'string' ? promptKey.slice(0, 80) : null,
      cta_variant:   ['A', 'B'].includes(ctaVariant) ? ctaVariant : null,
      referrer:      referrer ? String(referrer).slice(0, 500) : null,
      user_agent:    userAgent ? String(userAgent).slice(0, 500) : null,
      error_message: typeof errorMessage === 'string' ? errorMessage.slice(0, 500) : null,
    });

    return res.json({ success: true, logged: true });
  } catch (err) {
    // Never let analytics failures break the UX — log and succeed silently.
    console.error('[demo-event] Supabase error:', err.message);
    return res.json({ success: true, logged: false });
  }
});

// ── Public coach-ask endpoint (no auth — used by the Etapa MCP server) ───────
// General cycling Q&A. Takes a question + optional rider context. Returns an
// Etapa-voice answer with a subtle marketing tail.
app.post('/api/public/coach-ask', rateLimit, async (req, res) => {
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
      feature: 'public_coach_ask',
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
        fullExperience: '7 coach personalities (each with their own languages), 24-week plans, live chat, Strava sync — https://getetapa.com',
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
app.post('/api/public/review-plan', rateLimit, async (req, res) => {
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
      feature: 'public_review_plan',
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
app.post('/api/public/sample-plan', rateLimit, async (req, res) => {
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

  const { logClaudeUsage } = require('./lib/claudeLogger');
  const _claudeModel = 'claude-haiku-4-5-20251001';
  const _claudeStartedAt = Date.now();

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: _claudeModel,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.text().catch(() => '');
      console.error('[sample-plan] Anthropic error:', aiRes.status, errBody);
      logClaudeUsage({
        userId: null, feature: 'public_sample_plan', model: _claudeModel,
        data: {}, response: aiRes, durationMs: Date.now() - _claudeStartedAt,
        status: 'api_error', metadata: { public: true, http: aiRes.status },
      });
      return res.status(502).json({ error: 'AI service error', status: aiRes.status });
    }

    const data = await aiRes.json();
    logClaudeUsage({
      userId: null, feature: 'public_sample_plan', model: _claudeModel,
      data, response: aiRes, durationMs: Date.now() - _claudeStartedAt,
      metadata: { public: true },
    });
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
app.use('/api/public', unsubscribeRouter); // no auth — unsubscribe must work from email link
app.use('/api/public', mailerliteWebhookRouter); // no auth — signature-verified
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

  // Start the plan-generation reaper. On every boot (including deploys) it
  // sweeps `plan_generations` for rows stuck at status='running' past the
  // stale threshold and marks them failed so the app stops showing the
  // creeping progress bar forever. See server/src/lib/planGenReaper.js.
  const { startReaper } = require('./lib/planGenReaper');
  const { _planJobs, _coachChatJobs } = require('./routes/ai');
  startReaper({ planJobs: _planJobs });

  // Same treatment for async coach chat jobs — rows at pending/running past
  // the stale threshold (3 min) get flipped to failed so the client stops
  // polling. See server/src/lib/coachChatReaper.js.
  const { startCoachChatReaper } = require('./lib/coachChatReaper');
  startCoachChatReaper({ coachChatJobs: _coachChatJobs });
});
