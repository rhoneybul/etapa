/**
 * App config — remote-first configuration endpoint.
 *
 * See REMOTE_FIRST_ARCHITECTURE.md for the full doctrine. Summary:
 *
 *  - Single GET /api/app-config returns the merged config payload the app needs
 *  - Public (no auth required) so the app can check maintenance + copy before login
 *  - If an auth token is present, per-user overrides from user_config_overrides
 *    are merged and returned under `userOverrides`
 *  - Flat legacy keys (maintenance_mode, min_app_version, pricing_config, etc.)
 *    are also returned so older clients keep working — we never remove a field
 *  - Cache-Control 60s + stale-while-revalidate so proxies / CDN help us
 *  - Client sends X-App-Version / X-App-Platform; we don't yet version-adapt but
 *    we log it so we can when needed.
 */
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { supabase } = require('../lib/supabase');
const { atLeast, parseVersion } = require('../lib/versionAdapt');

const router = express.Router();

// ── Lazy auth client (for verifying user JWTs without blocking anon) ────────
let _supabaseAnon = null;
function getAnonClient() {
  if (_supabaseAnon) return _supabaseAnon;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _supabaseAnon = createClient(url, key);
  return _supabaseAnon;
}

// ── Optional auth (don't block anonymous) ───────────────────────────────────
async function optionalAuth(req, _res, next) {
  try {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
      const token = auth.slice(7);
      const client = getAnonClient();
      if (client) {
        const { data } = await client.auth.getUser(token);
        if (data?.user) req.user = data.user;
      }
    }
  } catch { /* ignore — anonymous is fine */ }
  next();
}

// ── Build the structured payload ────────────────────────────────────────────
/**
 * Transforms the flat app_config rows into the structured payload the client
 * expects (features, copy, coaches, fitnessLevels, planDurations, etc.) while
 * ALSO preserving the legacy flat keys for older clients.
 */
function buildPayload(rows) {
  const flat = {};
  for (const row of rows) flat[row.key] = row.value;

  // Start from the legacy flat shape so nothing old breaks.
  const payload = { ...flat };

  // Structured sections — read from dedicated keys with sensible names.
  payload.version      = flat.config_version || 1;
  payload.features     = flat.features || {};
  payload.copy         = flat.copy || {};
  payload.coaches      = flat.coaches || null;
  payload.fitnessLevels = flat.fitness_levels || null;
  payload.planDurations = flat.plan_durations || null;
  payload.maintenance  = flat.maintenance_mode || { enabled: false };
  payload.minVersion   = flat.min_app_version || flat.min_version || {};
  payload.pricing      = flat.pricing_config   || {};
  payload.trial        = flat.trial_config     || {};
  payload.banner       = flat.banner           || { active: false };
  // workflows: server-driven screen overrides. See WORKFLOWS.md.
  payload.workflows    = flat.workflows        || { screens: {} };

  return payload;
}

// ── User-specific overrides ─────────────────────────────────────────────────
async function fetchUserOverrides(userId) {
  if (!userId) return null;
  try {
    const { data } = await supabase
      .from('user_config_overrides')
      .select('overrides')
      .eq('user_id', userId)
      .maybeSingle();
    return data?.overrides || null;
  } catch (err) {
    // Table might not exist yet — fail open.
    return null;
  }
}

// ── GET /api/app-config ─────────────────────────────────────────────────────
// Public by default; if a bearer token is present we also attach per-user
// overrides and set Cache-Control: private so CDNs don't share them.
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value');

    if (error) throw error;

    const payload = buildPayload(data || []);

    // Attach per-user overrides if authenticated.
    const userId = req.user?.id || null;
    if (userId) {
      const overrides = await fetchUserOverrides(userId);
      if (overrides) payload.userOverrides = overrides;
    }

    // ── Version adaptation hook ────────────────────────────────────────────
    // Future shape changes that can't be done additively should gate here,
    // keeping old clients on the legacy shape. See REMOTE_FIRST_CHECKLIST.md
    // §"Version adaptation". Current payload is fully backwards-compatible
    // so this block is a scaffold — add `if (!atLeast(appVersion, 'x.y.z'))`
    // branches when genuine shape changes land.
    const appVersion = req.headers['x-app-version'] || 'unknown';
    const platform   = req.headers['x-app-platform'] || 'unknown';
    const parsedVersion = parseVersion(appVersion);
    payload._clientVersion = appVersion; // echo back so clients can assert
    payload._payloadShape = 'v1';        // bump when intentional shape changes land

    // Example (commented out — kept as a reference for when it's needed):
    //   if (atLeast(appVersion, '1.5.0')) payload.coaches = groupedShape;
    //   else                              payload.coaches = flatLegacyShape;

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[app-config] ${platform} ${appVersion}` +
        `${parsedVersion ? ` (parsed ${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch})` : ' (unparsed)'}` +
        ` → ${userId ? 'auth' : 'anon'}`
      );
    }

    // Cache headers — short, stale-while-revalidate. Private if user-specific.
    if (userId) {
      res.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=300');
    } else {
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
    }

    res.json(payload);
  } catch (err) {
    console.error('[app-config] Get error:', err);
    // Return empty config on error — the app has bundled defaults.
    res.json({});
  }
});

module.exports = router;
