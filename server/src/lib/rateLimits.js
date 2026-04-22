/**
 * Rate limits — per-user caps on plan generation + coach messaging.
 *
 * Two rolling 7-day windows (both share the same window, different caps):
 *   - plansPerWeek     : includes initial + regenerations.
 *   - coachMsgsPerWeek : user-sent coach messages only.
 *
 * Defaults come from env (PLANS_PER_WEEK_DEFAULT, COACH_MSGS_PER_WEEK_DEFAULT).
 * Per-user overrides come from the user_rate_limits table, set by admins.
 *
 * Design mirrors claudeCostCap.js:
 *   - One Supabase query per check, 60s in-memory cache per user.
 *   - Fails OPEN on DB errors — limit enforcement isn't worth an outage.
 *   - Returns a 429 with a shaped payload the client can render cleanly.
 *
 * Usage (route):
 *   const rl = require('../lib/rateLimits');
 *   if (await rl.checkAndBlockPlan(req, res)) return;
 *   // ... proceed with plan generation
 *
 *   if (await rl.checkAndBlockCoachMessage(req, res)) return;
 *   await rl.logCoachMessage(req.user.id, sessionId, weekNum);
 *   // ... proceed with coach chat
 */

const { supabase } = require('./supabase');

// ── Defaults (env-overridable, then admin-overridable via app_config) ─────
// Resolution order for the global default for each limit:
//   1. app_config row `limits.plansPerWeek` / `limits.coachMsgsPerWeek`
//      (admin dashboard can edit without a redeploy)
//   2. Env var PLANS_PER_WEEK_DEFAULT / COACH_MSGS_PER_WEEK_DEFAULT
//   3. Hard-coded fallback (5 / 25)
// Back-compat: old env name PLANS_PER_DAY_DEFAULT still honoured so an
// existing Railway deploy keeps working while the rename propagates.
const PLANS_PER_WEEK_DEFAULT = parseInt(
  process.env.PLANS_PER_WEEK_DEFAULT || process.env.PLANS_PER_DAY_DEFAULT || '5',
  10,
);
const COACH_MSGS_PER_WEEK_DEFAULT = parseInt(process.env.COACH_MSGS_PER_WEEK_DEFAULT || '25', 10);

// ── Global-default cache (5 min) ──────────────────────────────────────────
// The app_config values are hit on every request that runs a limit check.
// Cache them for 5 minutes so we don't run a Supabase query per check.
let globalDefaultsCache = null;
let globalDefaultsCachedAt = 0;
const GLOBAL_DEFAULTS_TTL_MS = 5 * 60_000;

async function getGlobalDefaults() {
  if (globalDefaultsCache && Date.now() - globalDefaultsCachedAt < GLOBAL_DEFAULTS_TTL_MS) {
    return globalDefaultsCache;
  }
  let plansPerWeek = PLANS_PER_WEEK_DEFAULT;
  let coachMsgsPerWeek = COACH_MSGS_PER_WEEK_DEFAULT;
  try {
    // Read both the new and legacy keys. New key wins if both are present.
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', ['limits.plansPerWeek', 'limits.plansPerDay', 'limits.coachMsgsPerWeek']);
    if (!error && Array.isArray(data)) {
      let sawNewKey = false;
      for (const row of data) {
        const n = parseInt(row.value, 10);
        if (!Number.isFinite(n) || n < 0) continue;
        if (row.key === 'limits.plansPerWeek') { plansPerWeek = n; sawNewKey = true; }
        if (row.key === 'limits.plansPerDay' && !sawNewKey) plansPerWeek = n;
        if (row.key === 'limits.coachMsgsPerWeek') coachMsgsPerWeek = n;
      }
    }
  } catch (err) {
    // Swallow — fall back to env defaults. Fails open.
    console.warn('[rateLimits] global defaults lookup failed, using env:', err?.message);
  }
  globalDefaultsCache = { plansPerWeek, coachMsgsPerWeek };
  globalDefaultsCachedAt = Date.now();
  return globalDefaultsCache;
}

function invalidateGlobalDefaultsCache() {
  globalDefaultsCache = null;
  globalDefaultsCachedAt = 0;
}

// ── Whitelist — same semantics as claudeCostCap ───────────────────────────
// Comma-separated list of user ids or emails exempt from all limits.
//   RATE_LIMIT_WHITELIST=founder@etapa.app,test-account@etapa.app
const WHITELIST_RAW = process.env.RATE_LIMIT_WHITELIST || '';
const WHITELIST_SET = new Set(
  WHITELIST_RAW.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
);

function isUserWhitelisted(req) {
  if (WHITELIST_SET.size === 0) return false;
  const u = req?.user;
  if (!u) return false;
  const candidates = [u.id, u.email].filter(Boolean).map(v => String(v).toLowerCase());
  return candidates.some(v => WHITELIST_SET.has(v));
}

// ── In-memory cache (60s TTL) ─────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL_MS = 60_000;

function cacheKey(kind, userId) { return `${kind}:${userId}`; }
function cacheGet(kind, userId) {
  const entry = cache.get(cacheKey(kind, userId));
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(cacheKey(kind, userId));
    return null;
  }
  return entry.value;
}
function cacheSet(kind, userId, value) {
  cache.set(cacheKey(kind, userId), { value, at: Date.now() });
  if (cache.size > 2000) {
    const sorted = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
    for (let i = 0; i < 1000; i++) cache.delete(sorted[i][0]);
  }
}
function invalidate(kind, userId) {
  cache.delete(cacheKey(kind, userId));
}

// ── Overrides ─────────────────────────────────────────────────────────────
async function getUserOverrides(userId) {
  if (!userId) return null;
  const cached = cacheGet('override', userId);
  if (cached !== null) return cached;
  try {
    const { data, error } = await supabase
      .from('user_rate_limits')
      .select('weekly_plan_limit, weekly_coach_msg_limit')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[rateLimits] override lookup failed, using defaults:', error.message);
      cacheSet('override', userId, {});
      return {};
    }
    const out = data || {};
    cacheSet('override', userId, out);
    return out;
  } catch (err) {
    console.warn('[rateLimits] override lookup threw:', err?.message);
    return {};
  }
}

async function getEffectiveLimits(userId) {
  const [overrides, globals] = await Promise.all([
    getUserOverrides(userId),
    getGlobalDefaults(),
  ]);
  return {
    plansPerWeek:     overrides?.weekly_plan_limit ?? globals.plansPerWeek,
    coachMsgsPerWeek: overrides?.weekly_coach_msg_limit ?? globals.coachMsgsPerWeek,
  };
}

// ── Counters ──────────────────────────────────────────────────────────────
/**
 * Count plan generations (including regenerations) in the last rolling 7 days.
 * Reads from plan_generations table which logs every attempt.
 */
async function getPlanCount7d(userId) {
  if (!userId) return 0;
  const cached = cacheGet('plans', userId);
  if (cached !== null) return cached;
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('plan_generations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', since);
    if (error) {
      console.warn('[rateLimits] plan count failed, failing open:', error.message);
      return 0;
    }
    const n = count || 0;
    cacheSet('plans', userId, n);
    return n;
  } catch (err) {
    console.warn('[rateLimits] plan count threw:', err?.message);
    return 0;
  }
}

/**
 * Count coach messages (user-sent) in the last rolling 7 days.
 */
async function getCoachMsgCount7d(userId) {
  if (!userId) return 0;
  const cached = cacheGet('coach', userId);
  if (cached !== null) return cached;
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('coach_message_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', since);
    if (error) {
      console.warn('[rateLimits] coach msg count failed, failing open:', error.message);
      return 0;
    }
    const n = count || 0;
    cacheSet('coach', userId, n);
    return n;
  } catch (err) {
    console.warn('[rateLimits] coach msg count threw:', err?.message);
    return 0;
  }
}

// ── Check + block helpers ─────────────────────────────────────────────────
/**
 * Check weekly plan generation limit. If blocked, send a 429 and return true.
 */
async function checkAndBlockPlan(req, res) {
  const userId = req.user?.id;
  if (!userId) return false;
  if (isUserWhitelisted(req)) return false;

  const [used, limits] = await Promise.all([
    getPlanCount7d(userId),
    getEffectiveLimits(userId),
  ]);
  const limit = limits.plansPerWeek;

  if (used < limit) return false;

  console.warn(
    `[rateLimits] user=${userId} PLAN LIMIT HIT: used=${used} limit=${limit}`
  );
  res.status(429).json({
    error: 'Weekly plan limit reached',
    detail: `You've used ${used} of ${limit} plan generations in the last 7 days. The count resets as individual plans age out. Contact support if you need more.`,
    kind: 'plans_per_week',
    used,
    limit,
    resets_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  return true;
}

/**
 * Check weekly coach-message limit. If blocked, send a 429 and return true.
 */
async function checkAndBlockCoachMessage(req, res) {
  const userId = req.user?.id;
  if (!userId) return false;
  if (isUserWhitelisted(req)) return false;

  const [used, limits] = await Promise.all([
    getCoachMsgCount7d(userId),
    getEffectiveLimits(userId),
  ]);
  const limit = limits.coachMsgsPerWeek;

  if (used < limit) return false;

  console.warn(
    `[rateLimits] user=${userId} COACH MSG LIMIT HIT: used=${used} limit=${limit}`
  );
  res.status(429).json({
    error: 'Weekly coach message limit reached',
    detail: `You've sent ${used} of ${limit} coach messages in the last 7 days. The count resets as individual messages age out.`,
    kind: 'coach_msgs_per_week',
    used,
    limit,
    resets_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  return true;
}

/**
 * Log a coach message send. Call AFTER the coach-chat endpoint has accepted
 * the request (so failed sends don't count against the user).
 */
async function logCoachMessage(userId, sessionId, weekNum) {
  if (!userId) return;
  try {
    const { error } = await supabase
      .from('coach_message_log')
      .insert({
        user_id: userId,
        session_id: sessionId || null,
        week_num: weekNum ?? null,
      });
    if (error) console.warn('[rateLimits] coach message log insert failed:', error.message);
    // Invalidate cache so next check reflects this send
    invalidate('coach', userId);
  } catch (err) {
    console.warn('[rateLimits] coach message log threw:', err?.message);
  }
}

/**
 * Invalidate plan cache — call after a plan generation completes.
 */
function invalidatePlanCache(userId) {
  invalidate('plans', userId);
}

/**
 * Get the current usage summary for a user, for the client to display.
 */
async function getUsageSummary(userId, req) {
  const whitelisted = req ? isUserWhitelisted(req) : false;
  const [plansUsed, coachUsed, limits] = await Promise.all([
    getPlanCount7d(userId),
    getCoachMsgCount7d(userId),
    getEffectiveLimits(userId),
  ]);
  return {
    plans: {
      used: plansUsed,
      limit: limits.plansPerWeek,
      remaining: Math.max(0, limits.plansPerWeek - plansUsed),
      resets_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      unlimited: whitelisted,
    },
    coach_messages: {
      used: coachUsed,
      limit: limits.coachMsgsPerWeek,
      remaining: Math.max(0, limits.coachMsgsPerWeek - coachUsed),
      resets_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      unlimited: whitelisted,
    },
  };
}

module.exports = {
  // Defaults (env fallbacks, exported for admin diagnostics)
  PLANS_PER_WEEK_DEFAULT,
  COACH_MSGS_PER_WEEK_DEFAULT,
  getGlobalDefaults,
  invalidateGlobalDefaultsCache,

  // Overrides
  getUserOverrides,
  getEffectiveLimits,

  // Counters
  getPlanCount7d,
  getCoachMsgCount7d,

  // Middleware-style checks
  checkAndBlockPlan,
  checkAndBlockCoachMessage,

  // Post-action logging
  logCoachMessage,
  invalidatePlanCache,

  // Client-facing summary
  getUsageSummary,

  // Whitelist
  isUserWhitelisted,
};
