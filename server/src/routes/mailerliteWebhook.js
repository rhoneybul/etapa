/**
 * MailerLite webhook receiver.
 *
 * When someone clicks {$unsubscribe} in a MailerLite-sent email, MailerLite
 * unsubscribes them on THEIR side. We also want to mirror that opt-out into
 * our `email_unsubscribes` table so that future sends from our own server
 * (or a different provider) don't re-email them.
 *
 * Configure in MailerLite:
 *   Integrations → Webhooks → Create webhook
 *   URL:    https://etapa-production.up.railway.app/api/public/mailerlite/webhook
 *   Events: subscriber.unsubscribed  (and optionally subscriber.bounced,
 *                                     subscriber.added_through_form for analytics)
 *
 * Auth:
 *   MailerLite uses a static token in the `X-MailerLite-Signature` header
 *   (configured when creating the webhook). We verify it with a constant-time
 *   comparison. Set MAILERLITE_WEBHOOK_SECRET in Railway env.
 *
 * Payload shape (abbreviated):
 *   {
 *     "events": [
 *       {
 *         "type": "subscriber.unsubscribed",
 *         "data": { "subscriber": { "email": "rob@example.com", ... } }
 *       }
 *     ]
 *   }
 */
const express = require('express');
const crypto = require('crypto');
const { supabase } = require('../lib/supabase');
const { recordUnsubscribe, normaliseEmail } = require('../lib/unsubscribe');

const router = express.Router();

// Constant-time secret compare so timing doesn't leak the token.
function verifySignature(req) {
  const secret = process.env.MAILERLITE_WEBHOOK_SECRET || '';
  if (!secret) {
    // Dev / unconfigured — fail closed in prod, allow in dev for manual testing.
    return process.env.NODE_ENV !== 'production';
  }
  const provided = req.headers['x-mailerlite-signature'] || '';
  if (!provided || provided.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  } catch {
    return false;
  }
}

// ── POST /api/public/mailerlite/webhook ─────────────────────────────────────
router.post('/mailerlite/webhook', express.json({ limit: '2mb' }), async (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  if (events.length === 0) {
    // MailerLite also sends a test ping with no events — acknowledge it.
    return res.status(200).json({ ok: true, processed: 0 });
  }

  let processed = 0;
  for (const evt of events) {
    try {
      const type = String(evt?.type || '');
      const email = normaliseEmail(evt?.data?.subscriber?.email || '');
      if (!email) continue;

      // Mirror all "please stop mailing this person" signals into our DB.
      if (
        type === 'subscriber.unsubscribed' ||
        type === 'subscriber.bounced' ||
        type === 'subscriber.marked_as_spam' ||
        type === 'subscriber.complained'
      ) {
        const source =
          type === 'subscriber.bounced' ? 'bounce' :
          type === 'subscriber.marked_as_spam' ? 'spam-complaint' :
          type === 'subscriber.complained' ? 'spam-complaint' :
          'mailerlite';

        await recordUnsubscribe(supabase, {
          email,
          source,
          reason: `MailerLite event: ${type}`,
          ip: null,
          userAgent: 'mailerlite-webhook',
        });
        processed++;
      }
    } catch (err) {
      // Log and keep going — one bad event shouldn't drop the batch
      console.error('[mailerlite-webhook] event failed:', err.message);
    }
  }

  res.status(200).json({ ok: true, processed });
});

module.exports = router;
