/**
 * Centralised Slack notification helper.
 *
 * Replaces the dozen-or-so `notifySlack` functions that have grown
 * separately in stripe.js / revenueCatWebhook.js / feedback.js /
 * notifications.js / index.js. They all did roughly the same thing
 * with subtle differences in webhook env-var, error logging, and (in
 * one case) silent success on missing config. This module unifies
 * the surface and adds the things every call site SHOULD have:
 *
 *   • Channel-aware routing — separate Slack webhooks for signups,
 *     plans, subscriptions, and feedback. Any unset channel falls
 *     back to the default (SLACK_WEBHOOK_URL). Lets you split
 *     channels per audience without changing call-site code.
 *
 *   • Retry on 5xx + on transient network errors — Slack's webhook
 *     occasionally returns 503 under load. One retry after 1.5s
 *     catches most of those.
 *
 *   • In-memory dedupe — same payload on the same channel within 5
 *     minutes is silently dropped. Stops accidental double-fires
 *     (e.g. retry that briefly looks like a failure but actually
 *     succeeded; a webhook firing twice during a redeploy).
 *
 *   • Never-throws — Slack failures must not affect user-visible
 *     responses. Errors go to console.error, that's it.
 *
 *   • Diagnostic logging — every call logs whether it succeeded,
 *     was deduped, retried, or fell through unconfigured. Makes the
 *     "why didn't I get a Slack ping?" debug loop short.
 *
 * Channels (env vars, in priority order per channel):
 *   signups        → SLACK_SIGNUPS_WEBHOOK_URL → SLACK_WEBHOOK_URL
 *   plans          → SLACK_PLANS_WEBHOOK_URL   → SLACK_WEBHOOK_URL
 *   subscriptions  → SLACK_SUBSCRIPTIONS_WEBHOOK_URL → SLACK_WEBHOOK_URL
 *   feedback       → SLACK_FEEDBACK_WEBHOOK_URL → SLACK_WEBHOOK_URL
 *   default        → SLACK_WEBHOOK_URL
 */

// Resolved on every call so tests can stub globalThis.fetch after the
// module is loaded. In production the global fetch (Node 18+) is the
// only path; node-fetch is the fallback for older runtimes.
function getFetch() {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch;
  const f = require('node-fetch'); return f.default || f;
}

// ── Channel resolution ─────────────────────────────────────────────────────
function webhookFor(channel) {
  const fallback = process.env.SLACK_WEBHOOK_URL || null;
  switch (channel) {
    case 'signups':       return process.env.SLACK_SIGNUPS_WEBHOOK_URL       || fallback;
    case 'plans':         return process.env.SLACK_PLANS_WEBHOOK_URL         || fallback;
    case 'subscriptions': return process.env.SLACK_SUBSCRIPTIONS_WEBHOOK_URL || fallback;
    case 'feedback':      return process.env.SLACK_FEEDBACK_WEBHOOK_URL      || fallback;
    default:              return fallback;
  }
}

// ── In-memory dedupe ───────────────────────────────────────────────────────
// Map<key, expiresAtMs>. key = `${channel}|${sha-ish-of-text}`. Old entries
// pruned lazily on each notify call. 1000-entry cap keeps memory bounded.
const _seen = new Map();
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const DEDUPE_MAX_ENTRIES = 1000;

function dedupeKey(channel, text) {
  // Cheap content fingerprint — first 200 chars + length. Not
  // cryptographic, just enough to catch identical payloads. Two
  // genuinely different events with the same opening 200 chars are
  // vanishingly rare in our channels.
  return `${channel}|${String(text).slice(0, 200)}|${String(text).length}`;
}
function pruneSeen() {
  if (_seen.size < DEDUPE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, exp] of _seen) {
    if (exp < now) _seen.delete(k);
    if (_seen.size < DEDUPE_MAX_ENTRIES * 0.8) break;
  }
}
function isDuplicate(channel, text) {
  const k = dedupeKey(channel, text);
  const exp = _seen.get(k);
  if (exp && exp > Date.now()) return true;
  _seen.set(k, Date.now() + DEDUPE_WINDOW_MS);
  pruneSeen();
  return false;
}

// ── Public API ─────────────────────────────────────────────────────────────
// Sleep helper for the retry path.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Send a Slack message.
 *
 * @param {string} text     — the message body. Slack mrkdwn supported.
 * @param {object} [opts]
 * @param {string} [opts.channel]  — 'signups' | 'plans' | 'subscriptions' | 'feedback' | undefined (default)
 * @param {Array}  [opts.blocks]   — optional Slack blocks payload.
 * @returns {Promise<{ sent: boolean, reason?: string, retried?: boolean }>}
 */
async function notify(text, opts = {}) {
  const channel = opts.channel || 'default';
  const url = webhookFor(channel);
  if (!url) {
    console.warn(`[slack] no webhook configured for channel="${channel}" — skipping (text="${String(text).slice(0, 80)}…")`);
    return { sent: false, reason: 'no_webhook' };
  }
  if (isDuplicate(channel, text)) {
    console.log(`[slack] dedupe hit on channel="${channel}" — skipping`);
    return { sent: false, reason: 'duplicate' };
  }

  const body = JSON.stringify(opts.blocks ? { text, blocks: opts.blocks } : { text });
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await getFetch()(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) {
        if (attempt === 2) console.log(`[slack] ok on retry (channel="${channel}")`);
        return { sent: true, retried: attempt === 2 };
      }
      // 4xx — don't retry, the payload is likely malformed.
      if (res.status >= 400 && res.status < 500) {
        const txt = await res.text().catch(() => '');
        console.error(`[slack] ${res.status} on channel="${channel}": ${txt.slice(0, 200)}`);
        return { sent: false, reason: `http_${res.status}` };
      }
      // 5xx — retry once.
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (attempt === 1) await sleep(1500);
  }
  console.error(`[slack] failed after retry on channel="${channel}":`, lastErr?.message || lastErr);
  return { sent: false, reason: 'failed', error: lastErr?.message };
}

module.exports = {
  notify,
  // Exported for tests + introspection
  webhookFor,
  isDuplicate,
  _seen,
};
