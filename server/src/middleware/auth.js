const { createClient } = require('@supabase/supabase-js');

// Lazy-init so missing env vars don't crash the process at load time
let _supabaseAnon = null;
function getSupabase() {
  if (!_supabaseAnon) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      console.warn('SUPABASE_URL or SUPABASE_ANON_KEY not set — auth will reject all requests');
      return null;
    }
    _supabaseAnon = createClient(url, key);
  }
  return _supabaseAnon;
}

async function authMiddleware(req, res, next) {
  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ error: 'Auth service not configured' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  next();
}

module.exports = { authMiddleware };
