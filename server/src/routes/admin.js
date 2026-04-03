/**
 * Admin routes — provides dashboard data across all users.
 * Auth: ADMIN_API_KEY for dashboard server-side calls, or Supabase JWT with is_admin flag.
 */
const { Router } = require('express');
const { supabase } = require('../lib/supabase');
const { authMiddleware } = require('../middleware/auth');
const { sendPushToUser } = require('../lib/pushService');

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key);
}

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

// ── GET /api/admin/plans/:id — single plan with full activities ─────────────
router.get('/plans/:id', async (req, res, next) => {
  try {
    const planId = req.params.id;

    // Get the plan
    const { data: plan, error: planErr } = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .single();
    if (planErr || !plan) return res.status(404).json({ error: 'Plan not found' });

    // Get all activities for this plan
    const { data: activities, error: actErr } = await supabase
      .from('activities')
      .select('*')
      .eq('plan_id', planId)
      .order('week', { ascending: true })
      .order('day_of_week', { ascending: true });
    if (actErr) throw actErr;

    // Get plan config
    let config = null;
    if (plan.config_id) {
      const { data: cfg } = await supabase.from('plan_configs').select('*').eq('id', plan.config_id).single();
      config = cfg || null;
    }

    // Get goal
    let goal = null;
    if (plan.goal_id) {
      const { data: g } = await supabase.from('goals').select('*').eq('id', plan.goal_id).single();
      goal = g || null;
    }

    // Get user info
    let userName = 'Unknown';
    let userEmail = null;
    try {
      const { data: { user } } = await supabase.auth.admin.getUserById(plan.user_id);
      if (user) {
        userName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Unknown';
        userEmail = user.email;
      }
    } catch { /* ignore */ }

    res.json({
      id: plan.id,
      name: plan.name,
      status: plan.status,
      weeks: plan.weeks,
      startDate: plan.start_date,
      currentWeek: plan.current_week,
      createdAt: plan.created_at,
      userId: plan.user_id,
      userName,
      userEmail,
      goalId: plan.goal_id,
      configId: plan.config_id,
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
        planName: goal.plan_name,
      } : null,
      activities: (activities || []).map(a => ({
        id: a.id,
        week: a.week,
        dayOfWeek: a.day_of_week,
        type: a.type,
        subType: a.sub_type,
        title: a.title,
        description: a.description,
        notes: a.notes,
        durationMins: a.duration_mins,
        distanceKm: a.distance_km ? Number(a.distance_km) : null,
        effort: a.effort,
        completed: a.completed,
        completedAt: a.completed_at,
      })),
    });
  } catch (err) { next(err); }
});

// ── PUT /api/admin/plans/:id — update a plan and its activities (admin) ─────
router.put('/plans/:id', async (req, res, next) => {
  try {
    const planId = req.params.id;
    const body = req.body;

    // Verify plan exists
    const { data: existing, error: fetchErr } = await supabase
      .from('plans')
      .select('user_id')
      .eq('id', planId)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Plan not found' });

    const userId = existing.user_id;

    // Update plan metadata
    const planUpdates = {};
    if (body.name !== undefined) planUpdates.name = body.name;
    if (body.status !== undefined) planUpdates.status = body.status;
    if (body.weeks !== undefined) planUpdates.weeks = body.weeks;
    if (body.startDate !== undefined) planUpdates.start_date = body.startDate;
    if (body.currentWeek !== undefined) planUpdates.current_week = body.currentWeek;

    if (Object.keys(planUpdates).length > 0) {
      const { error: updateErr } = await supabase
        .from('plans')
        .update(planUpdates)
        .eq('id', planId);
      if (updateErr) throw updateErr;
    }

    // Replace activities if provided
    if (body.activities) {
      // Delete existing
      const { error: delErr } = await supabase
        .from('activities')
        .delete()
        .eq('plan_id', planId);
      if (delErr) throw delErr;

      // Insert new
      if (body.activities.length > 0) {
        const actRows = body.activities.map(a => ({
          id: a.id || `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          user_id: userId,
          plan_id: planId,
          week: a.week,
          day_of_week: a.dayOfWeek ?? null,
          type: a.type,
          sub_type: a.subType || null,
          title: a.title,
          description: a.description || null,
          notes: a.notes || null,
          duration_mins: a.durationMins || null,
          distance_km: a.distanceKm || null,
          effort: a.effort || 'moderate',
          completed: a.completed || false,
          completed_at: a.completedAt || null,
        }));
        const { error: insErr } = await supabase.from('activities').insert(actRows);
        if (insErr) throw insErr;
      }
    }

    res.json({ ok: true, id: planId });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/plans/:planId/activities/:activityId — edit single activity
router.patch('/plans/:planId/activities/:activityId', async (req, res, next) => {
  try {
    const { planId, activityId } = req.params;
    const b = req.body;

    const updates = {};
    if (b.title !== undefined)       updates.title = b.title;
    if (b.description !== undefined) updates.description = b.description;
    if (b.notes !== undefined)       updates.notes = b.notes;
    if (b.type !== undefined)        updates.type = b.type;
    if (b.subType !== undefined)     updates.sub_type = b.subType;
    if (b.week !== undefined)        updates.week = b.week;
    if (b.dayOfWeek !== undefined)   updates.day_of_week = b.dayOfWeek;
    if (b.durationMins !== undefined) updates.duration_mins = b.durationMins;
    if (b.distanceKm !== undefined)  updates.distance_km = b.distanceKm;
    if (b.effort !== undefined)      updates.effort = b.effort;
    if (b.completed !== undefined)   updates.completed = b.completed;
    if (b.completedAt !== undefined) updates.completed_at = b.completedAt;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { error } = await supabase
      .from('activities')
      .update(updates)
      .eq('id', activityId)
      .eq('plan_id', planId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── DELETE /api/admin/plans/:id — delete a plan and its activities (admin) ──
router.delete('/plans/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Delete activities first (in case there's no FK cascade)
    const { error: actErr } = await supabase
      .from('activities')
      .delete()
      .eq('plan_id', id);
    if (actErr) throw actErr;

    // Delete the plan itself
    const { error: planErr } = await supabase
      .from('plans')
      .delete()
      .eq('id', id);
    if (planErr) throw planErr;

    res.json({ success: true });
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

// ── GET /api/admin/feedback/:id/messages — list all messages in a thread ────
router.get('/feedback/:id/messages', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify feedback exists
    const { data: feedback, error: fbErr } = await supabase
      .from('feedback')
      .select('*')
      .eq('id', id)
      .single();
    if (fbErr || !feedback) return res.status(404).json({ error: 'Feedback not found' });

    // Get user info
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const usersById = {};
    for (const u of (users || [])) { usersById[u.id] = u; }

    // Get all messages for this thread
    const { data: messages, error: msgErr } = await supabase
      .from('support_messages')
      .select('*')
      .eq('feedback_id', id)
      .order('created_at', { ascending: true });

    if (msgErr) throw msgErr;

    const user = usersById[feedback.user_id];
    const result = {
      feedback: {
        id: feedback.id,
        userId: feedback.user_id,
        userName: user?.user_metadata?.full_name || user?.email || 'Unknown',
        userEmail: user?.email || null,
        category: feedback.category,
        message: feedback.message,
        status: feedback.status || 'open',
        createdAt: feedback.created_at,
      },
      messages: (messages || []).map(m => ({
        id: m.id,
        senderRole: m.sender_role,
        senderName: m.sender_role === 'user'
          ? (usersById[m.sender_id]?.user_metadata?.full_name || usersById[m.sender_id]?.email || 'User')
          : (usersById[m.sender_id]?.user_metadata?.full_name || 'Admin'),
        message: m.message,
        createdAt: m.created_at,
      })),
    };

    res.json(result);
  } catch (err) { next(err); }
});

// ── POST /api/admin/feedback/:id/messages — add a message to a thread ───────
router.post('/feedback/:id/messages', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Get feedback item
    const { data: feedback, error: fbErr } = await supabase
      .from('feedback')
      .select('*')
      .eq('id', id)
      .single();
    if (fbErr || !feedback) return res.status(404).json({ error: 'Feedback not found' });

    // Determine admin sender ID from auth header (JWT path)
    let adminId = null;
    if (req.user?.id) adminId = req.user.id;

    // Insert the message
    const msgId = `sm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { error: insertErr } = await supabase.from('support_messages').insert({
      id: msgId,
      feedback_id: id,
      sender_role: 'admin',
      sender_id: adminId,
      message: message.trim(),
    });
    if (insertErr) throw insertErr;

    // Also update the legacy admin_response field for backwards compatibility
    await supabase.from('feedback').update({
      admin_response: message.trim(),
      admin_responded_at: new Date().toISOString(),
      admin_responder_id: adminId,
    }).eq('id', id);

    // Send push notification to the user
    const categoryLabel = feedback.category.charAt(0).toUpperCase() + feedback.category.slice(1);
    await sendPushToUser(feedback.user_id, {
      title: `Re: Your ${categoryLabel} Feedback`,
      body: message.trim().slice(0, 200),
      type: 'support_reply',
      data: { feedbackId: id, category: feedback.category },
    });

    res.json({ ok: true, messageId: msgId });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/feedback/:id/status — update thread status ─────────────
router.patch('/feedback/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['open', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'status must be open, resolved, or closed' });
    }

    const { error } = await supabase
      .from('feedback')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
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

// ── GET /api/admin/payments/details — enriched payment data from Stripe ──────
router.get('/payments/details', async (req, res, next) => {
  try {
    const stripe = getStripe();

    // Get all subscriptions from DB
    const { data: subs, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Get users for name lookup
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const usersById = {};
    for (const u of (users || [])) { usersById[u.id] = u; }

    const result = [];

    for (const sub of (subs || [])) {
      const user = usersById[sub.user_id];
      const entry = {
        id: sub.id,
        userId: sub.user_id,
        userName: user?.user_metadata?.full_name || user?.email || 'Unknown',
        userEmail: user?.email || null,
        stripeCustomerId: sub.stripe_customer_id,
        plan: sub.plan,
        status: sub.status,
        trialEnd: sub.trial_end,
        currentPeriodEnd: sub.current_period_end,
        createdAt: sub.created_at,
        // Stripe-enriched fields
        totalPaid: 0,
        currency: 'usd',
        payments: [],
        upcomingInvoice: null,
      };

      // Fetch real payment data from Stripe if available
      if (stripe && sub.stripe_customer_id) {
        try {
          // Get all invoices for this customer
          const invoices = await stripe.invoices.list({
            customer: sub.stripe_customer_id,
            limit: 50,
          });

          entry.payments = invoices.data.map(inv => ({
            id: inv.id,
            amount: inv.amount_paid / 100,
            currency: inv.currency,
            status: inv.status,
            paid: inv.paid,
            created: inv.created ? new Date(inv.created * 1000).toISOString() : null,
            periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
            periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
            hostedUrl: inv.hosted_invoice_url,
            amountRefunded: (inv.charge && typeof inv.charge === 'object' ? inv.charge.amount_refunded : 0) / 100,
          }));

          entry.totalPaid = invoices.data
            .filter(inv => inv.paid)
            .reduce((sum, inv) => sum + inv.amount_paid, 0) / 100;

          entry.currency = invoices.data[0]?.currency || 'usd';

          // Get upcoming invoice (next scheduled payment)
          try {
            const upcoming = await stripe.invoices.retrieveUpcoming({
              customer: sub.stripe_customer_id,
            });
            entry.upcomingInvoice = {
              amount: upcoming.amount_due / 100,
              currency: upcoming.currency,
              dueDate: upcoming.next_payment_attempt
                ? new Date(upcoming.next_payment_attempt * 1000).toISOString()
                : null,
            };
          } catch {
            // No upcoming invoice (cancelled, one-time, etc.)
          }
        } catch (stripeErr) {
          console.error(`[admin] Stripe fetch error for ${sub.stripe_customer_id}:`, stripeErr.message);
        }
      }

      // For starter (one-time) payments without invoices, show as unknown amount
      if (sub.plan === 'starter' && entry.payments.length === 0 && sub.status === 'paid') {
        entry.totalPaid = null; // Actual amount unknown — may have been discounted
        entry.payments = [{
          id: sub.id,
          amount: null,
          currency: 'usd',
          status: 'paid',
          paid: true,
          created: sub.created_at,
          periodStart: sub.created_at,
          periodEnd: sub.current_period_end,
          hostedUrl: null,
          amountRefunded: 0,
        }];
      }

      result.push(entry);
    }

    res.json(result);
  } catch (err) { next(err); }
});

// ── POST /api/admin/refund — issue a refund for a subscription ──────────────
router.post('/refund', async (req, res, next) => {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

    const { subscriptionId, amountCents } = req.body;
    if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required' });
    if (!amountCents || amountCents <= 0) return res.status(400).json({ error: 'amountCents must be positive' });

    // Get subscription record
    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .single();

    if (subErr || !sub) return res.status(404).json({ error: 'Subscription not found' });

    if (!sub.stripe_customer_id) {
      return res.status(400).json({ error: 'No Stripe customer linked to this subscription' });
    }

    // For starter plans, refund the payment intent directly
    if (sub.plan === 'starter') {
      const piId = sub.id.replace('starter_', '');
      const refund = await stripe.refunds.create({
        payment_intent: piId,
        amount: amountCents,
        reason: 'requested_by_customer',
      });

      // Update subscription status
      await supabase.from('subscriptions').update({
        status: 'refunded',
        updated_at: new Date().toISOString(),
      }).eq('id', sub.id);

      return res.json({
        ok: true,
        refundId: refund.id,
        amount: refund.amount / 100,
        currency: refund.currency,
      });
    }

    // For recurring subscriptions, find the latest paid invoice and refund it
    const invoices = await stripe.invoices.list({
      customer: sub.stripe_customer_id,
      subscription: sub.id,
      status: 'paid',
      limit: 1,
    });

    if (!invoices.data.length) {
      return res.status(400).json({ error: 'No paid invoices found for this subscription' });
    }

    const latestInvoice = invoices.data[0];
    const chargeId = typeof latestInvoice.charge === 'string'
      ? latestInvoice.charge
      : latestInvoice.charge?.id;

    if (!chargeId) {
      return res.status(400).json({ error: 'No charge found on the latest invoice' });
    }

    const refund = await stripe.refunds.create({
      charge: chargeId,
      amount: amountCents,
      reason: 'requested_by_customer',
    });

    // Cancel the subscription after refund
    try {
      await stripe.subscriptions.cancel(sub.id);
      await supabase.from('subscriptions').update({
        status: 'refunded',
        updated_at: new Date().toISOString(),
      }).eq('id', sub.id);
    } catch (cancelErr) {
      console.error('[admin] Subscription cancel after refund failed:', cancelErr.message);
    }

    res.json({
      ok: true,
      refundId: refund.id,
      amount: refund.amount / 100,
      currency: refund.currency,
    });
  } catch (err) {
    console.error('[admin] Refund error:', err);
    if (err.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
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
