/**
 * App config routes — remote configuration (maintenance mode, feature flags).
 * Public read (no auth required for GET), admin write.
 */
const express = require('express');
const { supabase } = require('../lib/supabase');
const router = express.Router();

// ── GET /api/app-config ─────────────────────────────────────────────────────
// Returns all config key-value pairs. No auth required so the app can check
// maintenance mode before the user logs in.
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value');

    if (error) throw error;

    // Transform array into object keyed by config key
    const config = {};
    for (const row of (data || [])) {
      config[row.key] = row.value;
    }

    res.json(config);
  } catch (err) {
    console.error('[app-config] Get error:', err);
    // Return empty config on error — app should proceed normally
    res.json({});
  }
});

module.exports = router;
