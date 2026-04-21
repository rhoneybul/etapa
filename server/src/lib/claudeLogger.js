/**
 * Claude API usage logger.
 *
 * Writes one row to public.claude_usage_log per Anthropic API call, with
 * token counts and computed USD cost. Use to answer:
 *   - "How much is user X costing us this month?"
 *   - "What's the split between plan_gen and coach_chat spend?"
 *   - "Who's running up an abusive tab?"
 *
 * This module is deliberately NON-blocking: logging failures must never
 * affect the user-visible API response. All DB writes are fire-and-forget.
 *
 * Usage (two patterns):
 *
 *   // Pattern A — wrap the call (preferred for new code):
 *   const data = await callClaudeAndLog({
 *     apiKey, userId, feature: 'coach_chat', metadata: { planId },
 *     body: { model, max_tokens, system, messages },
 *   });
 *
 *   // Pattern B — log after the fact (minimal-invasive for existing code):
 *   const response = await _fetch('https://api.anthropic.com/v1/messages', {...});
 *   const data = await response.json();
 *   logClaudeUsage({ userId, feature: 'plan_gen', model: body.model,
 *                    data, response, durationMs, metadata: {...} });
 */

const { supabase } = require('./supabase');

// ── Pricing ──────────────────────────────────────────────────────────────────
// USD per million tokens. Update when Anthropic changes prices.
// Source: https://docs.anthropic.com/en/docs/about-claude/models
const PRICING = {
  // Sonnet 4 (current default for plan generation & coach chat)
  'claude-sonnet-4-20250514':  { input: 3.00,  output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  // Haiku 4.5 (cheaper, used for lighter tasks)
  'claude-haiku-4-5-20251001': { input: 1.00,  output: 5.00,  cacheRead: 0.10, cacheWrite: 1.25 },
  // Generic fallback — used if we see a model we don't know about.
  // Errs on the conservative (overestimate) side so surprises cost less.
  _default:                    { input: 3.00,  output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
};

function pricingFor(model) {
  return PRICING[model] || PRICING._default;
}

/**
 * Compute USD cost from a Claude API response's `usage` object.
 * Handles prompt caching tokens if present.
 */
function computeCost(model, usage = {}) {
  const p = pricingFor(model);
  const input  = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheR = usage.cache_read_input_tokens   || 0;
  const cacheW = usage.cache_creation_input_tokens || 0;

  // Anthropic bills the base input_tokens excluding cache reads — so we
  // count cache reads separately at their discounted rate. The base
  // input_tokens already excludes cache-read tokens per their docs.
  const usd =
      (input  / 1_000_000) * p.input
    + (output / 1_000_000) * p.output
    + (cacheR / 1_000_000) * p.cacheRead
    + (cacheW / 1_000_000) * p.cacheWrite;

  // Round to 6 decimal places (matches DB column precision).
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/**
 * Fire-and-forget write to the claude_usage_log table.
 * Never throws — logging failures are logged to stderr and swallowed so
 * they can never affect the live request.
 *
 * @param {Object} args
 * @param {string|null} args.userId      Supabase user id (null for anon / system calls)
 * @param {string}      args.feature     'plan_gen' | 'plan_edit' | 'activity_edit' | 'coach_chat' | 'race_lookup' | 'other'
 * @param {string}      args.model       e.g. 'claude-sonnet-4-20250514'
 * @param {Object}      args.data        Parsed JSON response body from Anthropic (contains .usage)
 * @param {Response}   [args.response]   Original fetch Response object (used to read x-request-id header)
 * @param {number}     [args.durationMs] Round-trip latency in ms
 * @param {string}     [args.status]     'ok' | 'api_error' | 'parse_error' | 'timeout' (default: 'ok')
 * @param {Object}     [args.metadata]   Arbitrary feature-specific context (stored as jsonb)
 */
function logClaudeUsage({ userId, feature, model, data, response, durationMs, status = 'ok', metadata = null }) {
  try {
    const usage = data?.usage || {};
    const inputTokens  = usage.input_tokens  || 0;
    const outputTokens = usage.output_tokens || 0;
    const cacheRead    = usage.cache_read_input_tokens     || 0;
    const cacheCreate  = usage.cache_creation_input_tokens || 0;
    const costUsd      = computeCost(model, usage);
    const requestId    = response?.headers?.get?.('x-request-id') || null;

    // Console log — shows up in Railway logs, useful for tailing spend live.
    console.log(
      `[claude_usage] user=${userId || 'anon'} feature=${feature} model=${model} ` +
      `in=${inputTokens} out=${outputTokens} cacheR=${cacheRead} cacheW=${cacheCreate} ` +
      `cost=$${costUsd.toFixed(6)} dur=${durationMs || '?'}ms status=${status}`
    );

    // Fire-and-forget DB insert. Caller does not await this.
    supabase
      .from('claude_usage_log')
      .insert({
        user_id: userId || null,
        feature,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_tokens: cacheRead,
        cache_create_tokens: cacheCreate,
        cost_usd: costUsd,
        duration_ms: durationMs || null,
        status,
        request_id: requestId,
        metadata,
      })
      .then(({ error }) => {
        if (error) console.warn('[claude_usage] insert failed:', error.message);
      })
      .catch(err => console.warn('[claude_usage] insert threw:', err?.message));
  } catch (err) {
    // Never let a logging bug break a real request.
    console.warn('[claude_usage] log threw:', err?.message);
  }
}

/**
 * Convenience wrapper: make the Anthropic call and log it in one go.
 * Returns the parsed JSON body (same as `response.json()`).
 *
 * For existing routes where you don't want to refactor, use logClaudeUsage()
 * directly after your existing fetch. For new routes, prefer this wrapper.
 */
async function callClaudeAndLog({ apiKey, userId, feature, body, metadata = null }) {
  const _fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');
  const startedAt = Date.now();
  let response, data, status = 'ok';

  try {
    response = await _fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      status = 'api_error';
      const errText = await response.text().catch(() => '');
      const err = new Error(`Anthropic API ${response.status}: ${errText}`);
      err.status = response.status;
      // Log the failed call too — surprisingly useful for "why did my bill spike"
      // when it's actually retries on 529s etc.
      logClaudeUsage({
        userId, feature, model: body?.model || 'unknown',
        data: {}, response,
        durationMs: Date.now() - startedAt,
        status, metadata,
      });
      throw err;
    }

    data = await response.json();
    logClaudeUsage({
      userId, feature, model: body?.model,
      data, response,
      durationMs: Date.now() - startedAt,
      status, metadata,
    });
    return data;
  } catch (err) {
    if (status === 'ok') {
      // Unexpected error (e.g. parse failure) — log it.
      logClaudeUsage({
        userId, feature, model: body?.model || 'unknown',
        data: data || {}, response,
        durationMs: Date.now() - startedAt,
        status: 'parse_error', metadata,
      });
    }
    throw err;
  }
}

module.exports = { logClaudeUsage, callClaudeAndLog, computeCost };
