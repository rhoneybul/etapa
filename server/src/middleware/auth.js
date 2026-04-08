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
  // Allow TEST_API_KEY for plan generation endpoints only (e.g. automated test suites)
  const testKey = process.env.TEST_API_KEY;
  if (testKey) {
    const authHeader = req.headers.authorization;
    if (authHeader === `Bearer ${testKey}`) {
      const isTestRoute = req.path.startsWith('/generate-plan-async') || req.path.startsWith('/plan-job/') || req.path.startsWith('/edit-plan') || req.path.startsWith('/edit-activity');
      if (isTestRoute) {
        req.user = { id: 'test-runner', email: 'test@etapa.app' };
        return next();
      }
    }
  }

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
