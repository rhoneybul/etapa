const { createClient } = require('@supabase/supabase-js');

// Lazy-init so the server can start and serve /health even without DB config
let _supabase = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.warn(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — DB routes will return 503.\n' +
        'Set these env vars in Railway or run: cp server/.env.example server/.env'
      );
      return null;
    }
    _supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabase;
}

// Backwards-compatible: existing code does `const { supabase } = require('./lib/supabase')`
// This getter lets it work — returns null if not configured rather than crashing.
module.exports = {
  get supabase() { return getSupabase(); },
};
