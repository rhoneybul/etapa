/**
 * Claude per-user daily cost cap — burn-rate circuit breaker.
 *
 * Before expensive Claude calls (plan edits, coach chat), check whether the
 * user is over their daily USD spend limit. If they are, reject with 429.
 *
 * Rationale:
 *   A single runaway conversation can cost $5-10 if a user chats with the
 *   coach for hours. Without a cap, a shoestring solo founder's monthly
 *   budget can be eaten by a single over-enthusiastic tester. With a cap,
 *   worst case is (cap × user_count) which is predictable.
 *
 * Design:
 *   - Reads the claude_cost_per_user_24h view (created in migration).
 *   - One small Supabase query per call — cheap (<30ms on a well-indexed table).
 *   - Cached in-memory for 60s per user so high-frequency endpoints
 *     (coach-chat) don't pound the DB on every message.
 *   - Fails OPEN on DB errors (we don't want the cost check itself to take
 *     down the app if Supabase is flaky).
 *   - Defaults: $2.00 / user / rolling 24h. Tunable per-feature.
 *
 * Usage:
 *   const { checkAndBlockIfOverCap } = require('../lib/claudeCostCap');
 *   if (await checkAndBlockIfOverCap(req, res, { feature: 'coach_chat' })) return;
 *   // ... proceed with Claude call
 */

const { supabase } = require('./supabase');

// Default daily cap in USD. Override per-feature or via env var.
const DEFAULT_DAILY_CAP_USD = parseFloat(process.env.CLAUDE_DAILY_CAP_USD || '2.00');

// In-memory cache of recent cost lookups to avoid pounding Supabase from
// the coach-chat endpoint. Keyed by userId. 60s TTL.
const costCache = new Map();
const CACHE_TTL_MS = 60_000;

function cacheGet(userId) {
  const entry = costCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    costCache.delete(userId);
    return null;
  }
  return entry.costUsd;
}

function cacheSet(userId, costUsd) {
  costCache.set(userId, { costUsd, at: Date.now() });
  // Cheap periodic cleanup — if the cache has grown beyond ~1000 entries,
  // drop the oldest half.
  if (costCache.size > 1000) {
    const sorted = [...costCache.entries()].sort((a, b) => a[1].at - b[1].at);
    for (let i = 0; i < 500; i++) costCache.delete(sorted[i][0]);
  }
}

/**
 * Invalidate the cache for a user — call this after logging a new Claude
 * call if you want subsequent cap checks to see the updated total immediately.
 * Optional: the 60s cache is tolerable for most purposes.
 */
function invalidateCache(userId) {
  if (userId) costCache.delete(userId);
}

/**
 * Query the rolling 24h cost for a given user. Returns 0 on any error
 * (fails open so transient DB issues don't break the app).
 */
async function getUserCost24h(userId) {
  if (!userId) return 0;

  const cached = cacheGet(userId);
  if (cached !== null) return cached;

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('claude_usage_log')
      .select('cost_usd')
      .eq('user_id', userId)
      .gte('created_at', since);

    if (error) {
      console.warn('[claudeCostCap] query failed, failing open:', error.message);
      return 0;
    }

    const total = (data || []).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
    cacheSet(userId, total);
    return total;
  } catch (err) {
    console.warn('[claudeCostCap] query threw, failing open:', err?.message);
    return 0;
  }
}

/**
 * Check if the user is over their daily cap. If so, send a 429 response and
 * return `true` to tell the caller to bail. Otherwise return `false` and let
 * the caller proceed.
 *
 * The returned 429 payload is shaped so clients can render a friendly
 * "you've hit your daily coach limit" message.
 */
async function checkAndBlockIfOverCap(req, res, { feature, capUsd = DEFAULT_DAILY_CAP_USD } = {}) {
  const userId = req.user?.id;
  // No user id → no cap check (public/anon endpoints shouldn't call this).
  if (!userId) return false;

  const spent = await getUserCost24h(userId);
  if (spent < capUsd) return false;

  console.warn(
    `[claudeCostCap] user=${userId} feature=${feature} spent=$${spent.toFixed(4)} cap=$${capUsd.toFixed(2)} — BLOCKED`
  );
  res.status(429).json({
    error: 'Daily AI limit reached',
    detail: 'You\'ve hit your daily AI usage limit. It resets in 24 hours.',
    cap_usd: capUsd,
    spent_usd: Math.round(spent * 100) / 100,
    feature,
  });
  return true;
}

module.exports = {
  checkAndBlockIfOverCap,
  getUserCost24h,
  invalidateCache,
  DEFAULT_DAILY_CAP_USD,
};
