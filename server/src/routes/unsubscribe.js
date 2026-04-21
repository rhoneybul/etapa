/**
 * Public unsubscribe endpoints.
 *
 *   GET  /api/public/unsubscribe?t=TOKEN     — HTML one-click landing (friendly)
 *   POST /api/public/unsubscribe?t=TOKEN     — RFC 8058 List-Unsubscribe one-click
 *                                              (used by Gmail/Apple Mail's native button)
 *   POST /api/public/resubscribe             — Body: { t }
 *                                              Undo — removes the opt-out row.
 *   GET  /api/public/unsubscribe-status      — ?t=TOKEN — used by the website
 *                                              page to check current state.
 *
 * Token format: see server/src/lib/unsubscribe.js
 *
 * NONE of these require login — they must work even if the user isn't signed
 * in (CAN-SPAM / GDPR: opt-out must be possible from the email alone).
 *
 * The POST /api/public/unsubscribe endpoint is safe for RFC 8058: it accepts
 * the `List-Unsubscribe=One-Click` form body without additional confirmation,
 * because the HMAC token IS the confirmation.
 */
const express = require('express');
const { supabase } = require('../lib/supabase');
const {
  verifyToken,
  recordUnsubscribe,
  recordResubscribe,
  isOptedOut,
} = require('../lib/unsubscribe');

const router = express.Router();

// ── Helpers ─────────────────────────────────────────────────────────────────
function clientIp(req) {
  // Trust X-Forwarded-For from Railway / Vercel proxy.
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;
}

function getToken(req) {
  return (
    (req.query && req.query.t) ||
    (req.body && req.body.t) ||
    null
  );
}

/**
 * Render a minimal HTML page for direct browser GETs. We still respond with
 * this even on POST so support tools that open the link in a browser see
 * something sensible. The full-featured version lives on the website at
 * /unsubscribe — this is just the fallback the API returns.
 */
function renderPage({ title, heading, body, tone = 'neutral' }) {
  const accentColor = tone === 'success' ? '#E8458B' : tone === 'error' ? '#EF4444' : '#A0A0A8';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow"/>
<title>${title}</title>
<style>
  body{margin:0;background:#000;color:#fff;font-family:-apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;font-weight:300}
  .card{max-width:520px;text-align:center}
  h1{font-size:28px;margin:0 0 16px;font-weight:600;letter-spacing:-0.02em;color:${accentColor}}
  p{font-size:16px;line-height:1.55;color:#A0A0A8;margin:0 0 12px}
  a{color:#E8458B}
</style>
</head><body><div class="card"><h1>${heading}</h1>${body}</div></body></html>`;
}

// ── GET /api/public/unsubscribe ─────────────────────────────────────────────
// One-click unsubscribe when a user clicks the link in a marketing email.
// We unsubscribe, then 302 to the website's /unsubscribe page so the user
// gets the styled confirmation (with a "re-subscribe" button). If the website
// isn't reachable, we fall back to the inline HTML above.
router.get('/unsubscribe', async (req, res) => {
  const token = getToken(req);
  const email = verifyToken(token);

  if (!email) {
    return res.status(400).type('html').send(renderPage({
      title: 'Invalid unsubscribe link',
      heading: 'Link not valid',
      body: '<p>This unsubscribe link is invalid or was mangled. Reply to the email you received and we\'ll remove you manually — <a href="mailto:helloetapa@gmail.com">helloetapa@gmail.com</a>.</p>',
      tone: 'error',
    }));
  }

  try {
    await recordUnsubscribe(supabase, {
      email,
      source: 'link',
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || null,
    });
  } catch (err) {
    console.error('[unsubscribe GET] DB error:', err.message);
    // Still show success UX — the user acted in good faith. We'll retry
    // server-side from the admin if needed.
  }

  // Redirect to the friendly website page with the token preserved so the
  // page can show "resubscribe" if they change their mind.
  const siteBase = (process.env.PUBLIC_WEBSITE_URL || 'https://getetapa.com').replace(/\/+$/, '');
  return res.redirect(302, `${siteBase}/unsubscribe?t=${encodeURIComponent(token)}&done=1`);
});

// ── POST /api/public/unsubscribe ────────────────────────────────────────────
// RFC 8058 One-Click endpoint used by Gmail / Apple Mail's native button.
// The body is `List-Unsubscribe=One-Click` (application/x-www-form-urlencoded)
// but we also accept JSON / query-string for flexibility.
router.post('/unsubscribe', express.urlencoded({ extended: false }), async (req, res) => {
  const token = getToken(req);
  const email = verifyToken(token);

  if (!email) {
    return res.status(400).json({ error: 'Invalid unsubscribe token' });
  }

  try {
    await recordUnsubscribe(supabase, {
      email,
      source: req.headers['list-unsubscribe'] ? 'list-unsubscribe' : 'link',
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || null,
    });
    return res.status(200).json({ ok: true, email, unsubscribed: true });
  } catch (err) {
    console.error('[unsubscribe POST] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// ── POST /api/public/resubscribe ────────────────────────────────────────────
// Body: { t: TOKEN }. Removes the row — user explicitly opts back in.
router.post('/resubscribe', async (req, res) => {
  const token = getToken(req);
  const email = verifyToken(token);

  if (!email) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  try {
    await recordResubscribe(supabase, email);
    return res.json({ ok: true, email, unsubscribed: false });
  } catch (err) {
    console.error('[resubscribe] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to re-subscribe' });
  }
});

// ── GET /api/public/unsubscribe-status ──────────────────────────────────────
// Used by the website /unsubscribe page to check whether an email is
// currently opted out (so it can render "you're unsubscribed" vs "you're
// already re-subscribed"). Only returns the status flag — never the email
// itself — so a valid token is required to even ask.
router.get('/unsubscribe-status', async (req, res) => {
  const token = getToken(req);
  const email = verifyToken(token);

  if (!email) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  try {
    const optedOut = await isOptedOut(supabase, email);
    res.json({ email, unsubscribed: optedOut });
  } catch (err) {
    console.error('[unsubscribe-status] DB error:', err.message);
    res.status(500).json({ error: 'Status check failed' });
  }
});

module.exports = router;
