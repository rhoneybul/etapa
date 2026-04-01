/**
 * Admin routes — provides dashboard data across all users.
 * Auth: ADMIN_API_KEY for dashboard server-side calls, or Supabase JWT with is_admin flag.
 */
const { Router } = require('express');
const { supabase } = require('../lib/supabase');
const { authMiddleware } = require('../middleware/auth');

const router = Router();

/**
 * Check if a user has admin access via the public.admins table.
 */
async function isUserAdmin(userId) {
  const { data } = await supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
  return !!data;
}

/**
 * Admin auth middleware — accepts:
 * 1. ADMIN_API_KEY in Bearer token (for dashboard server-side routes)
 * 2. Supabase JWT where the user has is_admin: true in user_metadata
 */
async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  // Option 1: shared API key
  const apiKey = process.env.ADMIN_API_KEY;
  if (apiKey && authHeader === `Bearer ${apiKey}`) {
    return next();
  }

  // Option 2: Supabase JWT — run authMiddleware first to populate req.user
  authMiddleware(req, res, async () => {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const admin = await isUserAdmin(req.user.id);
    if (!admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

router.use(requireAdmin);

// ── GET /api/admin/check — check if an email has admin access ────────────────
// Used by the NextAuth signIn callback to verify admin status
router.get('/check', async (req, res) => {
  const email = req.query.email?.toLowerCase();
  if (!email) return res.json({ isAdmin: false });

  try {
    // Look up user by email to get their ID, then check admins table
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;

    const user = users.find(u => u.email?.toLowerCase() === email);
    if (!user) return res.json({ isAdmin: false });

    const { data } = await supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    return res.json({ isAdmin: !!data });
  } catch (err) {
    console.error('Admin check failed:', err);
    return res.json({ isAdmin: false });
  }
});

// ── POST /api/admin/grant — set is_admin: true on a user by email ────────────
router.post('/grant', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    // Find user by email
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;

    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ error: 'User not found in Supabase' });

    // Insert into admins table
    const { error: insertError } = await supabase.from('admins').upsert({ user_id: user.id });
    if (insertError) throw insertError;

    res.json({ success: true, userId: user.id, email: user.email, name: user.user_metadata?.full_name || user.user_metadata?.name || null });
  } catch (err) { next(err); }
});

// ── POST /api/admin/revoke — set is_admin: false on a user by email ──────────
router.post('/revoke', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;

    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ error: 'User not found in Supabase' });

    const { error: deleteError } = await supabase.from('admins').delete().eq('user_id', user.id);
    if (deleteError) throw deleteError;

    res.json({ success: true, email: user.email });
  } catch (err) { next(err); }
});

// ── GET /api/admin/admins — list all users with is_admin: true ───────────────
router.get('/admins', async (req, res, next) => {
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;

    const admins = users
      .filter(u => u.user_metadata?.is_admin === true)
      .map(u => ({
        id: u.id,
        email: u.email,
        name: u.user_metadata?.full_name || u.user_metadata?.name || null,
        grantedAt: u.updated_at, // approximate
      }));

    res.json(admins);
  } catch (err) { next(err); }
});

// ── GET /api/admin/users — all users from Supabase Auth ─────────────────────
router.get('/users', async (req, res, next) => {
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });
    if (error) throw error;

    const { data: subs } = await supabase
      .from('subscriptions')
      .select('user_id, plan, status, current_period_end, created_at')
      .order('created_at', { ascending: false });

    const subsByUser = {};
    for (const sub of (subs || [])) {
      if (!subsByUser[sub.user_id]) subsByUser[sub.user_id] = sub;
    }

    const result = users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.user_metadata?.full_name || u.user_metadata?.name || null,
      isAdmin: u.user_metadata?.is_admin === true,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      subscription: subsByUser[u.id] || null,
    }));

    res.json(result);
  } catch (err) { next(err); }
});

// ── GET /api/admin/plans — all plans across all users ────────────────────────
router.get('/plans', async (req, res, next) => {
  try {
    const { data: plans, error } = await supabase
      .from('plans')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const planIds = plans.map(p => p.id);
    let actCounts = {};
    if (planIds.length > 0) {
      const { data: acts } = await supabase
        .from('activities')
        .select('plan_id');
      if (acts) {
        for (const a of acts) {
          actCounts[a.plan_id] = (actCounts[a.plan_id] || 0) + 1;
        }
      }
    }

    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const usersById = {};
    for (const u of (users || [])) { usersById[u.id] = u; }

    const result = plans.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      weeks: p.weeks,
      startDate: p.start_date,
      createdAt: p.created_at,
      userId: p.user_id,
      userName: usersById[p.user_id]?.user_metadata?.full_name || usersById[p.user_id]?.email || 'Unknown',
      activityCount: actCounts[p.id] || 0,
    }));

    res.json(result);
  } catch (err) { next(err); }
});

// ── GET /api/admin/payments — all subscriptions / payments ───────────────────
router.get('/payments', async (req, res, next) => {
  try {
    const { data: subs, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const usersById = {};
    for (const u of (users || [])) { usersById[u.id] = u; }

    const result = (subs || []).map(s => ({
      id: s.id,
      userId: s.user_id,
      userName: usersById[s.user_id]?.user_metadata?.full_name || usersById[s.user_id]?.email || 'Unknown',
      stripeCustomerId: s.stripe_customer_id,
      plan: s.plan,
      status: s.status,
      trialEnd: s.trial_end,
      currentPeriodEnd: s.current_period_end,
      createdAt: s.created_at,
    }));

    res.json(result);
  } catch (err) { next(err); }
});

// ── GET /api/admin/tickets — support tickets from Linear ─────────────────────
router.get('/tickets', async (req, res, next) => {
  const LINEAR_API_KEY = process.env.LINEAR_API_KEY;
  const LINEAR_TEAM_ID = process.env.LINEAR_TEAM_ID;

  if (!LINEAR_API_KEY || !LINEAR_TEAM_ID) {
    return res.json([]);
  }

  try {
    const query = `
      query($teamId: String!) {
        team(id: $teamId) {
          issues(first: 50, orderBy: createdAt, filter: { title: { containsIgnoreCase: "support" } }) {
            nodes {
              id identifier title priority state { name } createdAt updatedAt
              labels { nodes { name } }
            }
          }
        }
      }
    `;

    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: LINEAR_API_KEY },
      body: JSON.stringify({ query, variables: { teamId: LINEAR_TEAM_ID } }),
    });

    const json = await response.json();
    const issues = json.data?.team?.issues?.nodes || [];

    const result = issues.map(i => ({
      id: i.id,
      linearId: i.identifier,
      title: i.title,
      priority: i.priority <= 1 ? 'urgent' : i.priority === 2 ? 'high' : i.priority === 3 ? 'medium' : 'low',
      status: i.state?.name?.toLowerCase().replace(/ /g, '_') || 'open',
      labels: i.labels?.nodes?.map(l => l.name) || [],
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));

    res.json(result);
  } catch (err) { next(err); }
});

// ── GET /api/admin/stats — quick overview numbers ────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const { count: planCount } = await supabase.from('plans').select('*', { count: 'exact', head: true });
    const { count: activityCount } = await supabase.from('activities').select('*', { count: 'exact', head: true });
    const { data: activeSubs } = await supabase
      .from('subscriptions')
      .select('id')
      .in('status', ['trialing', 'active', 'paid']);

    res.json({
      totalUsers: users?.length || 0,
      totalPlans: planCount || 0,
      totalActivities: activityCount || 0,
      activeSubscriptions: activeSubs?.length || 0,
    });
  } catch (err) { next(err); }
});

module.exports = router;
