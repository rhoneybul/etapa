/**
 * One-shot signed URLs for workout export.
 *
 * The mobile client opens these URLs via Linking.openURL — that opens
 * the OS browser, which can't attach a Bearer header. Two earlier
 * options were on the table:
 *
 *   1. Allow the auth middleware to accept the user's Supabase access
 *      token as a query string. Works, but the token is long-lived
 *      (~ 1 hour) and broad-scoped, so leaking it in a URL is poor
 *      hygiene.
 *
 *   2. Mint a short-lived URL signed with a server secret, scoped to a
 *      single (user, plan, activity, format) tuple. The URL is opaque
 *      from the client's point of view and can't be reused for any
 *      other resource. ← we're doing this.
 *
 * The signature is HMAC-SHA256 over a canonical string. No new
 * dependencies — Node's crypto module is built-in.
 *
 *   payload  = `${userId}.${planId}.${activityId}.${format}.${exp}`
 *   sig      = base64url(HMAC-SHA256(EXPORT_SIGNING_SECRET, payload))
 *
 * exp is a unix-second integer; default TTL is 5 minutes which is
 * plenty for "tap export → browser opens → download starts".
 */

const crypto = require('crypto');

const DEFAULT_TTL_SECONDS = 5 * 60;

function getSecret() {
  const s = process.env.EXPORT_SIGNING_SECRET;
  if (!s || s.length < 16) {
    throw new Error('EXPORT_SIGNING_SECRET is not configured (set a 32+ char random string in env)');
  }
  return s;
}

function base64url(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function canonicalPayload({ userId, planId, activityId, format, exp }) {
  return [userId, planId, activityId, format, exp].join('.');
}

function computeSignature(payload) {
  const hmac = crypto.createHmac('sha256', getSecret());
  hmac.update(payload);
  return base64url(hmac.digest());
}

/**
 * Mint a signed export URL.
 *
 * @param {object} args
 * @param {string} args.baseUrl     — e.g. https://etapa-production.up.railway.app
 * @param {string} args.userId      — Supabase user id
 * @param {string} args.planId
 * @param {string} args.activityId
 * @param {string} args.format      — 'zwo' | 'mrc'
 * @param {number} [args.ttlSeconds] — default 300
 * @returns {{ url: string, expiresAt: string }}
 */
function signExportUrl({ baseUrl, userId, planId, activityId, format, ttlSeconds = DEFAULT_TTL_SECONDS }) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = canonicalPayload({ userId, planId, activityId, format, exp });
  const sig = computeSignature(payload);
  const u = new URL(`${baseUrl.replace(/\/$/, '')}/api/exports/workout`);
  u.searchParams.set('planId', planId);
  u.searchParams.set('activityId', activityId);
  u.searchParams.set('uid', userId);
  u.searchParams.set('format', format);
  u.searchParams.set('exp', String(exp));
  u.searchParams.set('sig', sig);
  return { url: u.toString(), expiresAt: new Date(exp * 1000).toISOString() };
}

/**
 * Validate a request's signature + freshness. Constant-time comparison.
 *
 * @returns {{ ok: true, userId, planId, activityId, format } | { ok: false, reason: string }}
 */
function verifyExportRequest(query) {
  const { uid, planId, activityId, format, exp, sig } = query || {};
  if (!uid || !planId || !activityId || !format || !exp || !sig) {
    return { ok: false, reason: 'missing_params' };
  }
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum <= 0) {
    return { ok: false, reason: 'bad_exp' };
  }
  if (expNum < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }
  if (!['zwo', 'mrc'].includes(String(format).toLowerCase())) {
    return { ok: false, reason: 'bad_format' };
  }
  const payload = canonicalPayload({ userId: uid, planId, activityId, format, exp });
  let expected;
  try { expected = computeSignature(payload); }
  catch (err) { return { ok: false, reason: 'no_secret' }; }
  // Buffers must be the same length for timingSafeEqual; bail out early
  // if not so we don't throw.
  if (expected.length !== String(sig).length) {
    return { ok: false, reason: 'bad_sig' };
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig));
  if (!crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_sig' };
  }
  return { ok: true, userId: uid, planId, activityId, format: String(format).toLowerCase() };
}

module.exports = {
  signExportUrl,
  verifyExportRequest,
  computeSignature,         // exported for tests
  canonicalPayload,         // exported for tests
  DEFAULT_TTL_SECONDS,
};
