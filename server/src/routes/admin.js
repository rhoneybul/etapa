/**
 * Admin routes — provides dashboard data across all users.
 * Auth: ADMIN_API_KEY for dashboard server-side calls, or Supabase JWT with is_admin flag.
 */
const { Router } = require('express');
const { supabase } = require('../lib/supabase');
const { authMiddleware } = require('../middleware/auth');
const { sendPushToUser } = require('../lib/pushService');

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

// ── GET /api/admin/admins — list all users in the admins table ───────────────
router.get('/admins', async (req, res, next) => {
  try {
    const { data: adminRows, error: adminError } = await supabase.from('admins').select('user_id');
    if (adminError) throw adminError;

    if (!adminRows || adminRows.length === 0) return res.json([]);

    const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;

    const adminUserIds = new Set(adminRows.map(a => a.user_id));
    const admins = users
      .filter(u => adminUserIds.has(u.id))
      .map(u => ({
        id: u.id,
        email: u.email,
        name: u.user_metadata?.full_name || u.user_metadata?.name || null,
        grantedAt: u.updated_at, // approximate
      }));

    res.json(admins);
  } catch (err) { next(err); }
});

// ── GET /api/admin/users — all users with subs, plan count, and message counts
router.get('/users', async (req, res, next) => {
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });
    if (error) throw error;

    // Subscriptions (latest per user)
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('user_id, plan, status, current_period_end, created_at')
      .order('created_at', { ascending: false });

    const subsByUser = {};
    for (const sub of (subs || [])) {
      if (!subsByUser[sub.user_id]) subsByUser[sub.user_id] = sub;
    }

    // Plan count per user
    const { data: plans } = await supabase.from('plans').select('user_id, created_at');
    const planCountByUser = {};
    const firstPlanByUser = {};
    for (const p of (plans || [])) {
      planCountByUser[p.user_id] = (planCountByUser[p.user_id] || 0) + 1;
      if (!firstPlanByUser[p.user_id] || p.created_at < firstPlanByUser[p.user_id]) {
        firstPlanByUser[p.user_id] = p.created_at;
      }
    }

    // Message count per user from chat_sessions
    const { data: chats } = await supabase.from('chat_sessions').select('user_id, messages');
    const msgCountByUser = {};
    for (const c of (chats || [])) {
      const msgs = Array.isArray(c.messages) ? c.messages.filter(m => m.role === 'user') : [];
      msgCountByUser[c.user_id] = (msgCountByUser[c.user_id] || 0) + msgs.length;
    }

    // Feedback count per user
    const { data: feedback } = await supabase.from('feedback').select('user_id');
    const feedbackCountByUser = {};
    for (const f of (feedback || [])) {
      feedbackCountByUser[f.user_id] = (feedbackCountByUser[f.user_id] || 0) + 1;
    }

    const result = users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.user_metadata?.full_name || u.user_metadata?.name || null,
      isAdmin: u.user_metadata?.is_admin === true,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      subscription: subsByUser[u.id] || null,
      planCount: planCountByUser[u.id] || 0,
      firstPlanAt: firstPlanByUser[u.id] || null,
      messageCount: msgCountByUser[u.id] || 0,
      feedbackCount: feedbackCountByUser[u.id] || 0,
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

    // Fetch plan configs keyed by id
    const { data: configs } = await supabase.from('plan_configs').select('*');
    const configsById = {};
    for (const c of (configs || [])) { configsById[c.id] = c; }

    // Fetch goals keyed by id
    const { data: goals } = await supabase.from('goals').select('*');
    const goalsById = {};
    for (const g of (goals || [])) { goalsById[g.id] = g; }

    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const usersById = {};
    for (const u of (users || [])) { usersById[u.id] = u; }

    const result = plans.map(p => {
      const config = configsById[p.config_id] || null;
      const goal = goalsById[p.goal_id] || null;

      return {
        id: p.id,
        name: p.name,
        status: p.status,
        weeks: p.weeks,
        startDate: p.start_date,
        createdAt: p.created_at,
        userId: p.user_id,
        userName: usersById[p.user_id]?.user_metadata?.full_name || usersById[p.user_id]?.email || 'Unknown',
        activityCount: actCounts[p.id] || 0,
        config: config ? {
          daysPerWeek: config.days_per_week,
          sessionsPerWeek: config.sessions_per_week,
          fitnessLevel: config.fitness_level,
          indoorTrainer: config.indoor_trainer,
          coachId: config.coach_id,
          trainingTypes: config.training_types,
          extraNotes: config.extra_notes,
        } : null,
        goal: goal ? {
          cyclingType: goal.cycling_type,
          goalType: goal.goal_type,
          targetDistance: goal.target_distance,
          targetElevation: goal.target_elevation,
          targetTime: goal.target_time,
          targetDate: goal.target_date,
          eventName: goal.event_name,
        } : null,
      };
    });

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

// ── GET /api/admin/feedback — all feedback with user info and Linear links ───
router.get('/feedback', async (req, res, next) => {
  try {
    const { data: feedback, error } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const usersById = {};
    for (const u of (users || [])) { usersById[u.id] = u; }

    const result = (feedback || []).map(f => ({
      id: f.id,
      userId: f.user_id,
      userName: usersById[f.user_id]?.user_metadata?.full_name || usersById[f.user_id]?.email || 'Unknown',
      userEmail: usersById[f.user_id]?.email || null,
      category: f.category,
      message: f.message,
      appVersion: f.app_version,
      deviceInfo: f.device_info,
      linearIssueId: f.linear_issue_id,
      linearIssueKey: f.linear_issue_key,
      linearIssueUrl: f.linear_issue_url,
      adminResponse: f.admin_response || null,
      adminRespondedAt: f.admin_responded_at || null,
      createdAt: f.created_at,
    }));

    res.json(result);
  } catch (err) { next(err); }
});

// ── POST /api/admin/feedback/:id/respond — respond to feedback & notify user ─
router.post('/feedback/:id/respond', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Get the feedback item
    const { data: feedback, error: fetchError } = await supabase
      .from('feedback')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    // Update with admin response
    const { error: updateError } = await supabase
      .from('feedback')
      .update({
        admin_response: message.trim(),
        admin_responded_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Send push notification to the user
    const categoryLabel = feedback.category.charAt(0).toUpperCase() + feedback.category.slice(1);
    await sendPushToUser(feedback.user_id, {
      title: `Re: Your ${categoryLabel} Feedback`,
      body: message.trim().slice(0, 200),
      type: 'admin_reply',
      data: { feedbackId: id, category: feedback.category },
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── PUT /api/admin/app-config/:key — update a remote config value ───────────
router.put('/app-config/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'value is required' });
    }

    const { error } = await supabase
      .from('app_config')
      .upsert({
        key,
        value: typeof value === 'object' ? value : { value },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (error) throw error;
    res.json({ ok: true });
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

// ── DELETE /api/admin/users/:id — hard-delete a user and all their data ──────
router.delete('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'User ID is required' });

    // Verify the user exists
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(id);
    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete all user data from every table (order matters for foreign keys)
    const tables = [
      'notifications',
      'push_tokens',
      'chat_sessions',
      'feedback',
      'activities',
      'plans',
      'plan_configs',
      'goals',
      'subscriptions',
      'user_preferences',
      'admins',
    ];

    const deletionResults = {};
    for (const table of tables) {
      const { error, count } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .eq('user_id', id);
      deletionResults[table] = error ? `error: ${error.message}` : (count || 0);
    }

    // Finally, delete the auth user from Supabase
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id);
    if (authDeleteError) {
      return res.status(500).json({
        error: 'Data deleted but failed to remove auth user',
        details: authDeleteError.message,
        deletionResults,
      });
    }

    console.log(`[admin] Hard-deleted user ${id} (${user.email}):`, deletionResults);
    res.json({ ok: true, email: user.email, deletionResults });
  } catch (err) { next(err); }
});

module.exports = router;
