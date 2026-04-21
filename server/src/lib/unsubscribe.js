/**
 * Unsubscribe token helpers — sign an email as an HMAC token so it can be
 * embedded in marketing email links. No DB lookup required to verify.
 *
 * Why HMAC rather than a random token persisted in the DB:
 *   - The token is stateless; we can generate it for any email at any time
 *     without storing millions of rows
 *   - It's forgery-proof — an attacker can't unsubscribe somebody else
 *     unless they know the UNSUBSCRIBE_SECRET
 *   - It never expires, which is what the law requires. If we rotate the
 *     secret we invalidate all outstanding tokens; rotate when compromised.
 *
 * Env:
 *   UNSUBSCRIBE_SECRET  — server-only random secret (>= 32 bytes)
 *   PUBLIC_WEBSITE_URL  — e.g. https://getetapa.com (for link generation)
 *
 * Token format:  base64url(lowercase email)  "."  base64url(HMAC-SHA256)
 * Example:      cm9iQGV4YW1wbGUuY29t.rD3mWz...
 */

const crypto = require('crypto');

function getSecret() {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret || secret.length < 16) {
    // Fail loudly in production, but don't crash dev when someone hasn't set it.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('UNSUBSCRIBE_SECRET must be set in production (>= 32 bytes)');
    }
    return 'dev-only-unsubscribe-secret-change-in-prod';
  }
  return secret;
}

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(str) {
  const padded = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

/**
 * Sign an email address. Returns a string safe to embed in a URL.
 */
function signEmail(email) {
  const e = normaliseEmail(email);
  if (!e) throw new Error('email required');
  const emailB64 = b64url(e);
  const mac = crypto.createHmac('sha256', getSecret()).update(e).digest();
  const macB64 = b64url(mac);
  return `${emailB64}.${macB64}`;
}

/**
 * Verify a token. Returns the email if valid, null if not. Constant-time
 * comparison so we don't leak signature details via timing.
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  let email;
  try {
    email = b64urlDecode(parts[0]).toString('utf8');
  } catch { return null; }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  const provided = b64urlDecode(parts[1]);
  const expected = crypto.createHmac('sha256', getSecret())
    .update(normaliseEmail(email))
    .digest();

  if (provided.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(provided, expected)) return null;

  return normaliseEmail(email);
}

/**
 * Build the user-facing unsubscribe URL for a given email.
 * Example: https://getetapa.com/unsubscribe?t=cm9iQGV4YW1wbGUuY29t.rD3mWz...
 */
function unsubscribeUrl(email) {
  const base = (process.env.PUBLIC_WEBSITE_URL || 'https://getetapa.com').replace(/\/+$/, '');
  return `${base}/unsubscribe?t=${encodeURIComponent(signEmail(email))}`;
}

/**
 * Build the one-click RFC 8058 unsubscribe URL (hits the server directly,
 * no JS required — used by Gmail / Apple Mail's native unsubscribe button).
 *
 * Also returns a mailto variant as required by the List-Unsubscribe header.
 */
function listUnsubscribeHeaders(email) {
  const apiBase = (process.env.PUBLIC_API_URL || 'https://etapa-production.up.railway.app').replace(/\/+$/, '');
  const token = signEmail(email);
  return {
    'List-Unsubscribe':
      `<${apiBase}/api/public/unsubscribe?t=${encodeURIComponent(token)}>, ` +
      `<mailto:unsubscribe+${encodeURIComponent(token)}@etapa.app>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/**
 * Check whether an email is currently opted out of marketing.
 * Safe to call from any send path; returns false on DB error (fail-open is
 * wrong for this — we want to fail-closed, i.e. treat errors as "opted out"
 * to avoid sending to someone who might already have unsubscribed).
 */
async function isOptedOut(supabase, email) {
  const e = normaliseEmail(email);
  if (!e) return true;
  try {
    const { data, error } = await supabase
      .from('email_unsubscribes')
      .select('email')
      .eq('email', e)
      .maybeSingle();
    if (error) {
      console.error('[unsubscribe] isOptedOut lookup failed:', error.message);
      return true; // fail-closed: don't send
    }
    return !!data;
  } catch (err) {
    console.error('[unsubscribe] isOptedOut threw:', err.message);
    return true;
  }
}

/**
 * Record an unsubscribe. Idempotent — existing entries are preserved
 * (we never downgrade an older opt-out timestamp).
 */
async function recordUnsubscribe(supabase, { email, source, reason, ip, userAgent }) {
  const e = normaliseEmail(email);
  if (!e) throw new Error('email required');
  const { error } = await supabase
    .from('email_unsubscribes')
    .upsert({
      email: e,
      source: source || 'link',
      reason: reason ? String(reason).slice(0, 500) : null,
      user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
      ip: ip ? String(ip).slice(0, 64) : null,
    }, { onConflict: 'email', ignoreDuplicates: false });
  if (error) throw error;
}

/**
 * Undo an unsubscribe — removes the row. The signed token is used to
 * authenticate the request, so the same link that unsubscribed them can
 * also re-subscribe them.
 */
async function recordResubscribe(supabase, email) {
  const e = normaliseEmail(email);
  if (!e) throw new Error('email required');
  const { error } = await supabase
    .from('email_unsubscribes')
    .delete()
    .eq('email', e);
  if (error) throw error;
}

module.exports = {
  signEmail,
  verifyToken,
  unsubscribeUrl,
  listUnsubscribeHeaders,
  isOptedOut,
  recordUnsubscribe,
  recordResubscribe,
  normaliseEmail,
};
