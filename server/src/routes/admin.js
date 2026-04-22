/**
 * Admin routes — provides dashboard data across all users.
 * Auth: ADMIN_API_KEY for dashboard server-side calls, or Supabase JWT with is_admin flag.
 */
const { Router } = require('express');
const { supabase } = require('../lib/supabase');
const { authMiddleware } = require('../middleware/auth');
const { sendPushToUser } = require('../lib/pushService');
const { applyLifetimeGrant, applyPromotionalGrant } = require('../lib/lifetimeGrant');

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

// ── RevenueCat helpers ───────────────────────────────────────────────────────
//
// RC's v1 `/subscribers/{id}` endpoint requires a SECRET key for server reads.
// RC returns 403 code 7243 ("Secret API keys should not be used in your app")
// when any of the following is true:
//   - the request looks like it's coming from a mobile SDK (X-Platform header
//     was sent alongside a secret key — RC treats that combo as app-context)
//   - the API key itself is a PUBLIC SDK key (appl_XXX / goog_XXX) being sent
//     to an endpoint that wants a secret key
//   - the key is a mis-scoped secret (e.g. deleted / from the wrong project)
//
// Public SDK keys start with `appl_`, `goog_`, `stripe_`, or `amazon_`.
// Secret API keys start with `sk_`.
function classifyRevenueCatKey(apiKey) {
  if (!apiKey) return { kind: 'missing' };
  const trimmed = apiKey.trim();
  if (/^(appl|goog|amazon|stripe)_/i.test(trimmed)) {
    return { kind: 'public_sdk', prefix: trimmed.split('_')[0] };
  }
  if (/^sk_/i.test(trimmed)) return { kind: 'secret', prefix: 'sk' };
  return { kind: 'unknown', prefix: trimmed.slice(0, 4) };
}

// Shared headers for server-side RC calls. We explicitly identify as a server
// (User-Agent) and omit X-Platform — RC's "Secret API keys should not be used
// in your app" error triggers when X-Platform + secret-key are sent together.
function revenueCatServerHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Etapa-Admin-Dashboard/1.0 (+https://etapa-production.up.railway.app)',
  };
}

// Uses the RC v1 Subscribers endpoint to fetch authoritative transaction data
// for a given app_user_id (= Supabase user ID).
async function fetchRevenueCatSubscriber(appUserId) {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!apiKey) return { error: 'missing_api_key' };
  if (!appUserId) return { error: 'missing_user_id' };

  // Reject obviously-wrong keys up front with a clear error. This catches the
  // most common misconfiguration: a public SDK key pasted into the secret-key
  // env var (e.g. Railway), which always produces the confusing 7243 error.
  const keyInfo = classifyRevenueCatKey(apiKey);
  if (keyInfo.kind === 'public_sdk') {
    return {
      error: 'wrong_key_type',
      hint: `REVENUECAT_SECRET_API_KEY looks like a PUBLIC SDK key (starts with "${keyInfo.prefix}_"). Server calls need a secret key (starts with "sk_"). Get it from RevenueCat dashboard → Project Settings → API keys → v1 secret key.`,
    };
  }
  if (keyInfo.kind === 'unknown') {
    return {
      error: 'wrong_key_type',
      hint: `REVENUECAT_SECRET_API_KEY prefix "${keyInfo.prefix}" is not a recognised RC key format. Expected "sk_...". Double-check Railway env.`,
    };
  }

  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      { headers: revenueCatServerHeaders(apiKey) }
    );

    if (res.status === 404) return { notFound: true };
    if (!res.ok) {
      const text = await res.text();
      let hint = null;
      if (res.status === 401) {
        hint = 'RevenueCat rejected the key as unauthorised. The key may have been rotated/revoked. Regenerate a v1 secret key and update REVENUECAT_SECRET_API_KEY on Railway.';
      } else if (res.status === 403 && /7243|Secret API keys/i.test(text)) {
        hint = 'RC returned the 7243 warning even after we dropped X-Platform. Most likely cause: REVENUECAT_SECRET_API_KEY on Railway is set to a PUBLIC SDK key (appl_/goog_) rather than an "sk_" secret key. Check Railway → Variables.';
      }
      return { error: 'http_error', status: res.status, body: text, hint };
    }

    const json = await res.json();
    return { subscriber: json.subscriber || null };
  } catch (err) {
    return { error: 'fetch_failed', message: err.message };
  }
}

// ── RevenueCat — grant non-consumable entitlement ────────────────────────────
// Uses the Subscriber Attributes + grant entitlement API:
//   POST /v1/subscribers/{app_user_id}/entitlements/{entitlement_identifier}/promotional
// Grants a promotional (non-paying) entitlement for a given duration. The
// duration strings RevenueCat accepts include 'daily', 'three_day', 'weekly',
// 'monthly', 'two_month', 'three_month', 'six_month', 'yearly', 'lifetime'.
// If the user doesn't yet exist in RC, this will also create them as an
// anonymous subscriber, which is fine.
async function grantRevenueCatPromotional(appUserId, { entitlementId = 'pro', duration = 'lifetime' } = {}) {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!apiKey) return { error: 'missing_api_key' };
  if (!appUserId) return { error: 'missing_user_id' };

  const keyInfo = classifyRevenueCatKey(apiKey);
  if (keyInfo.kind !== 'secret') {
    return {
      error: 'wrong_key_type',
      hint: `REVENUECAT_SECRET_API_KEY must be an "sk_..." secret key for server grants; saw "${keyInfo.prefix || 'empty'}".`,
    };
  }

  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}/entitlements/${encodeURIComponent(entitlementId)}/promotional`,
      {
        method: 'POST',
        headers: revenueCatServerHeaders(apiKey),
        body: JSON.stringify({ duration }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return { error: 'http_error', status: res.status, body: text };
    }

    const json = await res.json();
    return { ok: true, subscriber: json.subscriber || null };
  } catch (err) {
    return { error: 'fetch_failed', message: err.message };
  }
}

// Backwards-compatible alias for existing callers that only know about the
// lifetime duration (Grant Lifetime button, pre-signup redeemer pre-refactor).
async function grantRevenueCatLifetime(appUserId, { entitlementId = 'pro' } = {}) {
  return grantRevenueCatPromotional(appUserId, { entitlementId, duration: 'lifetime' });
}

// ── RevenueCat — revoke a promotional entitlement ────────────────────────────
async function revokeRevenueCatPromotional(appUserId, { entitlementId = 'pro' } = {}) {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!apiKey) return { error: 'missing_api_key' };
  if (!appUserId) return { error: 'missing_user_id' };

  const keyInfo = classifyRevenueCatKey(apiKey);
  if (keyInfo.kind !== 'secret') {
    return {
      error: 'wrong_key_type',
      hint: `REVENUECAT_SECRET_API_KEY must be an "sk_..." secret key for server revokes; saw "${keyInfo.prefix || 'empty'}".`,
    };
  }

  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}/entitlements/${encodeURIComponent(entitlementId)}/revoke_promotionals`,
      {
        method: 'POST',
        headers: revenueCatServerHeaders(apiKey),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return { error: 'http_error', status: res.status, body: text };
    }

    return { ok: true };
  } catch (err) {
    return { error: 'fetch_failed', message: err.message };
  }
}

// ── GET /api/admin/check — check if an email has admin access ────────────────
// Public endpoint (no admin auth required) — used by the dashboard login flow
// to verify a user is an admin before granting access.
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

// All routes below require admin auth
router.use(requireAdmin);

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

// ── GET /api/admin/users — all users with subs, plan count, message counts, and trial status
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

    // Plan count per user + check for beginner plans
    const { data: plans } = await supabase.from('plans').select('user_id, created_at, name');
    const planCountByUser = {};
    const firstPlanByUser = {};
    const hasBeginnerByUser = {};
    for (const p of (plans || [])) {
      planCountByUser[p.user_id] = (planCountByUser[p.user_id] || 0) + 1;
      if (!firstPlanByUser[p.user_id] || p.created_at < firstPlanByUser[p.user_id]) {
        firstPlanByUser[p.user_id] = p.created_at;
      }
      if (p.name && p.name.startsWith('Get into Cycling')) {
        hasBeginnerByUser[p.user_id] = true;
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

    // Trial config from app_config (fall back to 7 days if not set)
    const { data: trialRow } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'trial_config')
      .maybeSingle();
    const trialDays = trialRow?.value?.days ?? 7;

    const now = Date.now();

    const result = users.map(u => {
      const sub = subsByUser[u.id] || null;
      const isSubscribed = sub && ['active', 'trialing', 'paid'].includes(sub.status);
      const firstPlanAt = firstPlanByUser[u.id] || null;

      // Compute trial status for unsubscribed users who have a plan
      let trial = null;
      if (firstPlanAt) {
        const trialStartMs = new Date(firstPlanAt).getTime();
        const trialEndMs = trialStartMs + trialDays * 24 * 60 * 60 * 1000;
        const msLeft = trialEndMs - now;
        const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
        trial = {
          startedAt: firstPlanAt,
          daysTotal: trialDays,
          daysLeft: Math.max(0, daysLeft),
          ended: daysLeft <= 0,
          isSubscribed: !!isSubscribed,
        };
      }

      return {
        id: u.id,
        email: u.email,
        name: u.user_metadata?.full_name || u.user_metadata?.name || null,
        isAdmin: u.user_metadata?.is_admin === true,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
        subscription: sub,
        planCount: planCountByUser[u.id] || 0,
        firstPlanAt,
        hasBeginner: !!hasBeginnerByUser[u.id],
        messageCount: msgCountByUser[u.id] || 0,
        feedbackCount: feedbackCountByUser[u.id] || 0,
        trial,
      };
    });

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

// ── GET /api/admin/plan-jobs/:jobId — poll a plan-gen job as admin ───────────
// Mirrors /api/ai/plan-job/:jobId but bypasses the owner-only check so admins
// can watch regeneration jobs they kicked off on behalf of another user.
router.get('/plan-jobs/:jobId', (req, res) => {
  // Lazy-import the in-memory job map from ai.js to avoid a circular require
  // at module load. This helper is exported alongside startGenerationJob.
  const { getPlanJob } = require('./ai');
  const job = getPlanJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    activitiesCount: job.activities.length,
    plan: job.plan,
    error: job.error,
    forUserId: job.userId || null,
  });
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

// ── POST /api/admin/plans/:id/regenerate — kick off a regeneration on behalf
// of the user. CS-scope use case: "my plan is too hard" / "the AI clearly got
// this wrong, please redo it". Fetches the plan's goal + config, applies any
// body overrides (typically fitnessLevel, weeks, or daysPerWeek tweaks),
// takes a pre-regenerate snapshot, then calls the existing startGenerationJob
// with replacePlanId so the same plan row is reused. Returns jobId the client
// can poll via /api/ai/plan-job/:jobId.
//
// Body:
//   {
//     goalOverrides?:   { fitnessLevel?, targetDistance?, targetDate?, ... },
//     configOverrides?: { fitnessLevel?, daysPerWeek?, weeks?, ... },
//     reason?:          string (for audit)
//   }
router.post('/plans/:id/regenerate', async (req, res, next) => {
  try {
    const planId = req.params.id;
    const { goalOverrides = {}, configOverrides = {}, reason = null } = req.body || {};

    // 1. Fetch plan + goal + config
    const { data: plan, error: planErr } = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle();
    if (planErr) throw planErr;
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const userId = plan.user_id;

    let goal = null;
    if (plan.goal_id) {
      const { data: g } = await supabase.from('goals').select('*').eq('id', plan.goal_id).maybeSingle();
      goal = g || null;
    }
    let config = null;
    if (plan.config_id) {
      const { data: c } = await supabase.from('plan_configs').select('*').eq('id', plan.config_id).maybeSingle();
      config = c || null;
    }

    if (!goal || !config) {
      return res.status(400).json({
        error: 'Plan is missing goal or config — cannot regenerate without original inputs.',
      });
    }

    // 2. Rebuild the client-shape goal + config objects the generator expects,
    //    then apply any admin-supplied overrides on top.
    const clientGoal = {
      id: goal.id,
      cyclingType: goal.cycling_type,
      goalType: goal.goal_type,
      targetDistance: goal.target_distance,
      targetElevation: goal.target_elevation,
      targetTime: goal.target_time,
      targetDate: goal.target_date,
      eventName: goal.event_name,
      planName: goal.plan_name,
      ...goalOverrides,
    };
    const clientConfig = {
      id: config.id,
      daysPerWeek: config.days_per_week,
      weeks: config.weeks || plan.weeks,
      fitnessLevel: config.fitness_level,
      indoorTrainer: config.indoor_trainer,
      coachId: config.coach_id,
      trainingTypes: config.training_types || ['outdoor'],
      sessionCounts: config.session_counts || {},
      availableDays: config.available_days || [],
      longRideDay: config.long_ride_day || null,
      startDate: plan.start_date,
      extraNotes: config.extra_notes,
      ...configOverrides,
    };

    // 3. Snapshot current activities so the admin can roll back if the new
    //    plan is worse. Uses the same snapshot table as self-serve regen.
    let snapshotId = null;
    try {
      const { data: existingActs } = await supabase
        .from('activities')
        .select('*')
        .eq('plan_id', planId);
      const snap = {
        id: `snp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        user_id: userId,
        plan_id: planId,
        reason: reason ? `admin-regenerate: ${reason}` : 'admin-regenerate',
        label: 'Before admin regenerate',
        payload: {
          plan: {
            id: plan.id,
            name: plan.name,
            weeks: plan.weeks,
            startDate: plan.start_date,
            currentWeek: plan.current_week,
          },
          goal: clientGoal,
          config: clientConfig,
          activities: existingActs || [],
        },
        created_at: new Date().toISOString(),
        created_by: req.user?.id || null,
      };
      const { data: insSnap, error: snapErr } = await supabase
        .from('plan_snapshots')
        .insert(snap)
        .select('id')
        .maybeSingle();
      if (!snapErr && insSnap) snapshotId = insSnap.id;
    } catch (snapErrRoot) {
      // Snapshot failure is non-fatal — warn and continue so the admin isn't
      // blocked if the snapshots table hasn't been migrated yet.
      console.warn('[admin/regenerate-plan] snapshot failed, continuing:', snapErrRoot?.message);
    }

    // 4. Kick off the async job. startGenerationJob handles the Claude call,
    //    speed normalisation, one-off ride injection, and activity persistence.
    const { startGenerationJob } = require('./ai');
    const jobId = await startGenerationJob({
      userId,
      goal: clientGoal,
      config: clientConfig,
      replacePlanId: planId,
      reason: 'regenerate',
    });

    res.json({
      ok: true,
      jobId,
      snapshotId,
      planId,
      userId,
      pollUrl: `/api/ai/plan-job/${jobId}`,
    });
  } catch (err) {
    console.error('[admin/regenerate-plan] error:', err);
    next(err);
  }
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

    // Fetch attachments + sign URLs so admin can render thumbnails inline.
    const { data: attachmentRows } = await supabase
      .from('feedback_attachments')
      .select('*')
      .eq('feedback_id', id);

    const signed = [];
    for (const a of (attachmentRows || [])) {
      const { data: urlData } = await supabase.storage
        .from('feedback-attachments')
        .createSignedUrl(a.storage_path, 3600);
      signed.push({
        id: a.id,
        messageId: a.message_id,
        mimeType: a.mime_type,
        sizeBytes: a.size_bytes,
        width: a.width,
        height: a.height,
        url: urlData?.signedUrl || null,
      });
    }
    const feedbackAttachments = signed.filter(a => !a.messageId);
    const messageAttachments = {};
    for (const a of signed) {
      if (a.messageId) {
        (messageAttachments[a.messageId] = messageAttachments[a.messageId] || []).push(a);
      }
    }

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
        attachments: feedbackAttachments,
      },
      messages: (messages || []).map(m => ({
        id: m.id,
        senderRole: m.sender_role,
        senderName: m.sender_role === 'user'
          ? (usersById[m.sender_id]?.user_metadata?.full_name || usersById[m.sender_id]?.email || 'User')
          : (usersById[m.sender_id]?.user_metadata?.full_name || 'Admin'),
        message: m.message,
        createdAt: m.created_at,
        attachments: messageAttachments[m.id] || [],
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

// ── User config overrides (support ticket lever) ─────────────────────────────
// These let admin grant a free month / unlock coaches / flip a feature FOR
// a specific user, without changing anything globally or shipping a build.
// See REMOTE_FIRST_ARCHITECTURE.md.
//
// Shape of `overrides` jsonb is freeform but typical keys:
//   { "features": { "aiCoachChat": { "enabled": true } },
//     "coachesUnlocked": ["elena", "lars"],
//     "entitlement": "pro" | "lifetime",
//     "trial": { "days": 30 },
//     "banner": { "active": true, "message": "...", "cta": null },
//     "forceOnboarding": true }

// GET /api/admin/user-overrides?email=foo@bar.com
// Looks up a user by email and returns their current override record.
router.get('/user-overrides', async (req, res, next) => {
  try {
    const { email, userId } = req.query;
    if (!email && !userId) {
      return res.status(400).json({ error: 'email or userId is required' });
    }

    let resolvedUserId = userId;
    if (!resolvedUserId) {
      // Look up the auth user by email.
      const { data: lookup, error: lookupErr } = await supabase
        .auth.admin.listUsers({ page: 1, perPage: 200 });
      if (lookupErr) throw lookupErr;
      const match = (lookup?.users || []).find(u => (u.email || '').toLowerCase() === String(email).toLowerCase());
      if (!match) return res.status(404).json({ error: 'User not found for that email' });
      resolvedUserId = match.id;
    }

    const { data, error } = await supabase
      .from('user_config_overrides')
      .select('user_id, overrides, note, updated_by, updated_at')
      .eq('user_id', resolvedUserId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;

    res.json({
      userId: resolvedUserId,
      overrides: data?.overrides || {},
      note: data?.note || null,
      updatedBy: data?.updated_by || null,
      updatedAt: data?.updated_at || null,
    });
  } catch (err) { next(err); }
});

// PUT /api/admin/user-overrides/:userId
// Body: { overrides: {...}, note?: '...' }
// Writes (upserts) the override row. Whole-object replace, not merge — keep
// the payload explicit so the admin UI shows what's live.
router.put('/user-overrides/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { overrides, note } = req.body;

    if (overrides && typeof overrides !== 'object') {
      return res.status(400).json({ error: 'overrides must be a JSON object' });
    }

    const row = {
      user_id: userId,
      overrides: overrides || {},
      note: note || null,
      updated_by: req.user?.id || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('user_config_overrides')
      .upsert(row, { onConflict: 'user_id' });

    if (error) throw error;
    res.json({ ok: true, userId });
  } catch (err) { next(err); }
});

// DELETE /api/admin/user-overrides/:userId — reset a user to defaults.
router.delete('/user-overrides/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { error } = await supabase
      .from('user_config_overrides')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Rate limit overrides (per-user) ─────────────────────────────────────────
// Typed overrides for the two usage caps. NULL => use the global default from
// env (PLANS_PER_WEEK_DEFAULT, COACH_MSGS_PER_WEEK_DEFAULT).

// GET /api/admin/users/:id/rate-limits
// Returns: { weeklyPlanLimit, weeklyCoachMsgLimit, note, updatedAt,
//            defaults: { plansPerWeek, coachMsgsPerWeek },
//            usage: { plans7d, coachMsgs7d } }
router.get('/users/:id/rate-limits', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const rateLimits = require('../lib/rateLimits');

    const [overrideRes, usageView, globals] = await Promise.all([
      supabase
        .from('user_rate_limits')
        .select('weekly_plan_limit, weekly_coach_msg_limit, note, updated_at')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('user_rate_limit_usage')
        .select('plans_7d, coach_msgs_7d')
        .eq('user_id', userId)
        .maybeSingle(),
      rateLimits.getGlobalDefaults(),
    ]);
    if (overrideRes.error && overrideRes.error.code !== 'PGRST116') throw overrideRes.error;

    res.json({
      weeklyPlanLimit: overrideRes.data?.weekly_plan_limit ?? null,
      weeklyCoachMsgLimit: overrideRes.data?.weekly_coach_msg_limit ?? null,
      note: overrideRes.data?.note || null,
      updatedAt: overrideRes.data?.updated_at || null,
      defaults: {
        plansPerWeek: globals.plansPerWeek,
        coachMsgsPerWeek: globals.coachMsgsPerWeek,
      },
      usage: {
        plans7d: usageView.data?.plans_7d || 0,
        coachMsgs7d: usageView.data?.coach_msgs_7d || 0,
      },
    });
  } catch (err) { next(err); }
});

// ── Global rate-limit defaults (admin-editable) ─────────────────────────────

// GET /api/admin/rate-limit-defaults
// Returns the current global limits. Reads from app_config with env fallback.
router.get('/rate-limit-defaults', async (req, res, next) => {
  try {
    const rateLimits = require('../lib/rateLimits');
    const globals = await rateLimits.getGlobalDefaults();
    res.json({
      plansPerWeek: globals.plansPerWeek,
      coachMsgsPerWeek: globals.coachMsgsPerWeek,
      envFallback: {
        plansPerWeek: rateLimits.PLANS_PER_WEEK_DEFAULT,
        coachMsgsPerWeek: rateLimits.COACH_MSGS_PER_WEEK_DEFAULT,
      },
    });
  } catch (err) { next(err); }
});

// PUT /api/admin/rate-limit-defaults
// Body: { plansPerWeek?: number, coachMsgsPerWeek?: number }
// Writes to app_config rows `limits.plansPerWeek` and `limits.coachMsgsPerWeek`.
// Invalidates the 5min in-memory cache so the next limit check picks up the
// change immediately.
router.put('/rate-limit-defaults', async (req, res, next) => {
  try {
    const rateLimits = require('../lib/rateLimits');
    const { plansPerWeek, coachMsgsPerWeek } = req.body || {};

    const validate = (v, name) => {
      if (v === null || v === undefined) return null;
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n < 0 || n > 10000) {
        const err = new Error(`${name} must be a non-negative integer`);
        err.status = 400;
        throw err;
      }
      return n;
    };
    const toWrite = [];
    const p = validate(plansPerWeek, 'plansPerWeek');
    if (p !== null) toWrite.push({ key: 'limits.plansPerWeek', value: String(p) });
    const c = validate(coachMsgsPerWeek, 'coachMsgsPerWeek');
    if (c !== null) toWrite.push({ key: 'limits.coachMsgsPerWeek', value: String(c) });

    if (toWrite.length === 0) {
      return res.status(400).json({ error: 'No values provided' });
    }

    // Upsert both rows.
    const { error } = await supabase
      .from('app_config')
      .upsert(toWrite, { onConflict: 'key' });
    if (error) throw error;

    rateLimits.invalidateGlobalDefaultsCache();
    const globals = await rateLimits.getGlobalDefaults();
    res.json({ ok: true, plansPerWeek: globals.plansPerWeek, coachMsgsPerWeek: globals.coachMsgsPerWeek });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// PUT /api/admin/users/:id/rate-limits
// Body: { weeklyPlanLimit?: number|null, weeklyCoachMsgLimit?: number|null, note?: string }
// Pass null to clear an override (fall back to global default).
router.put('/users/:id/rate-limits', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { weeklyPlanLimit, weeklyCoachMsgLimit, note } = req.body || {};

    // Validate: must be null or a positive integer.
    const validate = (v, name) => {
      if (v === null || v === undefined) return null;
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n < 0 || n > 10000) {
        const err = new Error(`${name} must be a non-negative integer or null`);
        err.status = 400;
        throw err;
      }
      return n;
    };
    const row = {
      user_id: userId,
      weekly_plan_limit: validate(weeklyPlanLimit, 'weeklyPlanLimit'),
      weekly_coach_msg_limit: validate(weeklyCoachMsgLimit, 'weeklyCoachMsgLimit'),
      note: note || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('user_rate_limits')
      .upsert(row, { onConflict: 'user_id' });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/admin/users/:id/rate-limits — reset to global defaults.
router.delete('/users/:id/rate-limits', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { error } = await supabase
      .from('user_rate_limits')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/admin/user-overrides/:userId/quick/:action
// Preset one-tap support actions. Each mutates the existing overrides doc
// with a well-known patch so the admin UI can stay stupid and mobile-friendly.
//
// Actions:
//   grant-free-month           — trial.days = 30
//   grant-lifetime             — entitlement = 'lifetime'
//   grant-pro                  — entitlement = 'pro'
//   unlock-coaches             — coachesUnlocked = all coach ids
//   reset-entitlement          — removes entitlement field
//   force-onboarding           — forceOnboarding = true
//   enable-feature/:flag       — features[flag].enabled = true
//   disable-feature/:flag      — features[flag].enabled = false
router.post('/user-overrides/:userId/quick/:action', async (req, res, next) => {
  try {
    const { userId, action } = req.params;
    const flag = req.body?.flag || req.query?.flag || null;

    // Fetch current overrides
    const { data: current } = await supabase
      .from('user_config_overrides')
      .select('overrides')
      .eq('user_id', userId)
      .maybeSingle();

    const overrides = current?.overrides ? { ...current.overrides } : {};

    switch (action) {
      case 'grant-free-month':
        overrides.trial = { ...(overrides.trial || {}), days: 30 };
        break;
      case 'grant-lifetime':
        overrides.entitlement = 'lifetime';
        break;
      case 'grant-pro':
        overrides.entitlement = 'pro';
        break;
      case 'unlock-coaches':
        overrides.coachesUnlocked = ['clara', 'lars', 'sophie', 'matteo', 'elena', 'tom'];
        break;
      case 'reset-entitlement':
        delete overrides.entitlement;
        break;
      case 'force-onboarding':
        overrides.forceOnboarding = true;
        break;
      case 'enable-feature':
        if (!flag) return res.status(400).json({ error: 'flag is required' });
        overrides.features = { ...(overrides.features || {}), [flag]: { enabled: true } };
        break;
      case 'disable-feature':
        if (!flag) return res.status(400).json({ error: 'flag is required' });
        overrides.features = { ...(overrides.features || {}), [flag]: { enabled: false } };
        break;
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    const { error } = await supabase
      .from('user_config_overrides')
      .upsert({
        user_id: userId,
        overrides,
        updated_by: req.user?.id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) throw error;
    res.json({ ok: true, overrides });
  } catch (err) { next(err); }
});

// ── GET /api/admin/demo-stats — MCP demo interaction analytics ──────────────
// Aggregates the demo_interactions table into something useful:
//   - total events (last 7 / 30 days)
//   - prompt popularity (click counts by prompt_key)
//   - A/B variant performance (views / cta_clicks / signups per variant)
//   - funnel conversion rate
router.get('/demo-stats', async (req, res, next) => {
  try {
    const { data: events, error } = await supabase
      .from('demo_interactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) throw error;

    const all = events || [];
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    const within = (ms) => all.filter(e => now - new Date(e.created_at).getTime() < ms);
    const last24h = within(DAY);
    const last7d  = within(7 * DAY);
    const last30d = within(30 * DAY);

    const count = (arr, type) => arr.filter(e => e.event_type === type).length;
    const uniq = (arr, key) => new Set(arr.map(e => e[key]).filter(Boolean)).size;

    // Prompt popularity (from prompt_click events)
    const promptClicks = {};
    for (const e of all) {
      if (e.event_type === 'prompt_click' && e.prompt_key) {
        promptClicks[e.prompt_key] = (promptClicks[e.prompt_key] || 0) + 1;
      }
    }
    const promptPopularity = Object.entries(promptClicks)
      .sort((a, b) => b[1] - a[1])
      .map(([prompt, clicks]) => ({ prompt, clicks }));

    // A/B variant performance
    const byVariant = { A: { views: 0, clicks: 0, responses: 0, ctaClicks: 0, signups: 0 },
                       B: { views: 0, clicks: 0, responses: 0, ctaClicks: 0, signups: 0 } };
    for (const e of all) {
      const v = e.cta_variant;
      if (v !== 'A' && v !== 'B') continue;
      if (e.event_type === 'view')           byVariant[v].views += 1;
      if (e.event_type === 'prompt_click')   byVariant[v].clicks += 1;
      if (e.event_type === 'response_ok')    byVariant[v].responses += 1;
      if (e.event_type === 'cta_click')      byVariant[v].ctaClicks += 1;
      if (e.event_type === 'signup')         byVariant[v].signups += 1;
    }

    // Conversion rates (signups / views)
    ['A', 'B'].forEach(v => {
      const s = byVariant[v];
      s.conversionRate = s.views > 0 ? (s.signups / s.views * 100).toFixed(2) + '%' : '—';
      s.engagementRate = s.views > 0 ? (s.clicks / s.views * 100).toFixed(2) + '%' : '—';
    });

    res.json({
      summary: {
        totalEvents:    all.length,
        uniqueSessions: uniq(all, 'session_id'),
        viewsAllTime:   count(all, 'view'),
        promptClicksAllTime: count(all, 'prompt_click'),
        responsesAllTime:    count(all, 'response_ok'),
        ctaClicksAllTime:    count(all, 'cta_click'),
        signupsAllTime:      count(all, 'signup'),
      },
      last24h: {
        events: last24h.length,
        uniqueSessions: uniq(last24h, 'session_id'),
        views: count(last24h, 'view'),
        promptClicks: count(last24h, 'prompt_click'),
        signups: count(last24h, 'signup'),
      },
      last7d: {
        events: last7d.length,
        uniqueSessions: uniq(last7d, 'session_id'),
        views: count(last7d, 'view'),
        promptClicks: count(last7d, 'prompt_click'),
        signups: count(last7d, 'signup'),
      },
      last30d: {
        events: last30d.length,
        uniqueSessions: uniq(last30d, 'session_id'),
        views: count(last30d, 'view'),
        promptClicks: count(last30d, 'prompt_click'),
        signups: count(last30d, 'signup'),
      },
      promptPopularity,
      variants: byVariant,
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/signups — pre-launch interest signups ────────────────────
// Also annotates each row with its current marketing opt-out status so we can
// exclude unsubscribed emails from any future marketing send.
router.get('/signups', async (req, res, next) => {
  try {
    const [signupsRes, unsubsRes] = await Promise.all([
      supabase.from('interest_signups').select('*').order('created_at', { ascending: false }),
      supabase.from('email_unsubscribes').select('email, unsubscribed_at, source'),
    ]);
    if (signupsRes.error) throw signupsRes.error;
    if (unsubsRes.error && unsubsRes.error.code !== 'PGRST116') {
      console.warn('[admin/signups] unsubscribes lookup failed:', unsubsRes.error.message);
    }

    // Build a map so per-row lookup is O(1).
    const unsubByEmail = new Map();
    for (const u of (unsubsRes.data || [])) {
      unsubByEmail.set(String(u.email).toLowerCase(), u);
    }

    res.json((signupsRes.data || []).map(row => {
      const unsub = unsubByEmail.get(String(row.email).toLowerCase()) || null;
      return {
        id: row.id,
        email: row.email,
        source: row.source,
        referrer: row.referrer,
        userAgent: row.user_agent,
        createdAt: row.created_at,
        unsubscribedAt: unsub?.unsubscribed_at || null,
        unsubscribeSource: unsub?.source || null,
      };
    }));
  } catch (err) { next(err); }
});

// ── DELETE /api/admin/signups/:id — remove a pre-launch interest signup ─────
router.delete('/signups/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'id is required' });
    const { error } = await supabase.from('interest_signups').delete().eq('id', id);
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

// ── GET /api/admin/payments/details — subscription data from Supabase ────────
// Payment details are managed by Apple/Google via RevenueCat.
router.get('/payments/details', async (req, res, next) => {
  try {
    const { data: subs, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const usersById = {};
    for (const u of (users || [])) { usersById[u.id] = u; }

    // Check for coupon redemptions to determine source
    const { data: redemptions } = await supabase.from('coupon_redemptions').select('user_id');
    const couponUsers = new Set((redemptions || []).map(r => r.user_id));

    // Map RevenueCat `store` values → friendly labels used by the dashboard.
    // The admin UI (payments/page.tsx) has colour styles keyed on these names.
    const STORE_LABEL = {
      APP_STORE: 'Apple IAP',
      MAC_APP_STORE: 'Apple IAP',
      PLAY_STORE: 'Google Play',
      STRIPE: 'Stripe',
      PROMOTIONAL: 'Promotional',
      AMAZON: 'Amazon',
    };

    const result = (subs || []).map(sub => {
      const user = usersById[sub.user_id];

      // Determine source — prefer the explicit store column populated by
      // the RevenueCat webhook, fall back to heuristics for legacy rows.
      let source;
      if (couponUsers.has(sub.user_id)) {
        source = 'Coupon';
      } else if (sub.status === 'trialing') {
        source = 'Free Trial';
      } else if (sub.store && STORE_LABEL[sub.store]) {
        source = STORE_LABEL[sub.store];
      } else if (sub.store) {
        source = sub.store; // unknown but persisted — show raw so admins can debug
      } else if (sub.stripe_customer_id) {
        source = 'Stripe';
      } else {
        // Legacy row without store metadata — assume Apple IAP (historical default).
        source = 'Apple IAP';
      }

      return {
        id: sub.id,
        userId: sub.user_id,
        userName: user?.user_metadata?.full_name || user?.email || 'Unknown',
        userEmail: user?.email || null,
        plan: sub.plan,
        status: sub.status,
        source,
        store: sub.store || null,
        productId: sub.product_id || null,
        trialEnd: sub.trial_end,
        currentPeriodEnd: sub.current_period_end,
        createdAt: sub.created_at,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// ── POST /api/admin/refund — mark a subscription as refunded ─────────────────
// Refunds for Apple IAP are handled by Apple directly (user requests via Apple Support).
// This endpoint updates the local subscription status only.
router.post('/refund', async (req, res, next) => {
  try {
    const { subscriptionId } = req.body;
    if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required' });

    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .single();

    if (subErr || !sub) return res.status(404).json({ error: 'Subscription not found' });

    await supabase.from('subscriptions').update({
      status: 'refunded',
      updated_at: new Date().toISOString(),
    }).eq('id', sub.id);

    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] Refund error:', err);
    next(err);
  }
});

// ── DELETE /api/admin/subscriptions/:id — delete a subscription record ───────
router.delete('/subscriptions/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Subscription ID is required' });

    const { error: deleteErr } = await supabase
      .from('subscriptions')
      .delete()
      .eq('id', id);

    if (deleteErr) throw deleteErr;

    console.log(`[admin] Deleted subscription ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] Delete subscription error:', err);
    next(err);
  }
});

// ── GET /api/admin/users/:id/revenuecat — authoritative RC transaction data ──
// Returns normalised transactions + the raw subscriber object for one user.
// Transactions = non_subscription one-offs (e.g. lifetime purchases) + current
// period snapshots of every subscription product (purchase_date, expires_date,
// store_transaction_id, is_sandbox, refunded_at, billing_issues_detected_at).
router.get('/users/:id/revenuecat', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'User ID is required' });

    const result = await fetchRevenueCatSubscriber(id);

    if (result.error === 'missing_api_key') {
      return res.status(503).json({
        error: 'RevenueCat API key not configured',
        hint: 'Set REVENUECAT_SECRET_API_KEY in the server env.',
      });
    }
    if (result.error) {
      return res.status(502).json({ error: 'RevenueCat fetch failed', detail: result });
    }
    if (result.notFound) {
      return res.json({
        found: false,
        firstSeen: null,
        lastSeen: null,
        originalAppUserId: null,
        originalPurchaseDate: null,
        managementUrl: null,
        transactions: [],
        raw: null,
      });
    }

    const sub = result.subscriber || {};
    const transactions = [];

    // Non-subscription purchases (one-offs like lifetime consumables) ---------
    for (const [productId, items] of Object.entries(sub.non_subscriptions || {})) {
      for (const item of items || []) {
        transactions.push({
          kind: 'one_time',
          productId,
          transactionId: item.id || null,
          store: item.store || null,
          isSandbox: !!item.is_sandbox,
          purchaseDate: item.purchase_date || null,
          expiresDate: null,
          periodType: null,
          refundedAt: null,
          billingIssueAt: null,
          unsubscribeDetectedAt: null,
          ownershipType: null,
        });
      }
    }

    // Subscriptions — current-period snapshot per product ---------------------
    for (const [productId, s] of Object.entries(sub.subscriptions || {})) {
      transactions.push({
        kind: 'subscription',
        productId,
        transactionId: s.store_transaction_id || null,
        store: s.store || null,
        isSandbox: !!s.is_sandbox,
        purchaseDate: s.purchase_date || null,
        originalPurchaseDate: s.original_purchase_date || null,
        expiresDate: s.expires_date || null,
        periodType: s.period_type || null,
        refundedAt: s.refunded_at || null,
        billingIssueAt: s.billing_issues_detected_at || null,
        unsubscribeDetectedAt: s.unsubscribe_detected_at || null,
        ownershipType: s.ownership_type || null,
      });
    }

    // Sort newest purchase first
    transactions.sort((a, b) => {
      const ad = a.purchaseDate ? new Date(a.purchaseDate).getTime() : 0;
      const bd = b.purchaseDate ? new Date(b.purchaseDate).getTime() : 0;
      return bd - ad;
    });

    res.json({
      found: true,
      firstSeen: sub.first_seen || null,
      lastSeen: sub.last_seen || null,
      originalAppUserId: sub.original_app_user_id || null,
      originalPurchaseDate: sub.original_purchase_date || null,
      managementUrl: sub.management_url || null,
      transactions,
      raw: sub,
    });
  } catch (err) { next(err); }
});

// ── POST /api/admin/users/:id/grant-lifetime — belt-and-braces lifetime access
// Called from the admin dashboard's user detail page. Runs THREE writes so the
// entitlement is reflected everywhere a CS rep, a client device, or the
// RevenueCat dashboard might look:
//
//   1. RevenueCat — promotional entitlement with duration "lifetime" so the
//      user's client SDK sees the entitlement on next purchaserInfo fetch
//   2. user_config_overrides.entitlement = 'lifetime' — app-side fallback
//      that works even if RC is slow or the user is offline
//   3. subscriptions table — inserts/updates a row with plan=lifetime,
//      status=active, source=Promotional, so it appears in the Subscriptions
//      section of the admin dashboard immediately
//
// Idempotent: safe to call repeatedly; each write is an upsert or already
// handled by RC (calling grant promotional twice is a no-op in RC).
//
// Body:
//   { note?: string, entitlement?: string }   (entitlement defaults to 'pro')
router.post('/users/:id/grant-lifetime', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'User ID is required' });

    const entitlementId = req.body?.entitlement || 'pro';
    const note = req.body?.note || `Lifetime granted via admin on ${new Date().toISOString().split('T')[0]}`;

    // Sanity: make sure the user exists in Supabase before touching RC.
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(id);
    if (userError) throw userError;
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { ok, results } = await applyLifetimeGrant(id, {
      grantRevenueCatLifetime,
      entitlementId,
      note,
      actorId: req.user?.id || null,
    });

    const anyFail = !results.revenueCat.ok || !ok;
    res.status(ok ? 200 : 502).json({
      ok,
      warnings: anyFail ? ['One or more writes failed — see results.'] : [],
      userId: id,
      email: user.email,
      results,
    });
  } catch (err) {
    console.error('[admin/grant-lifetime] unexpected error:', err);
    next(err);
  }
});

// ── POST /api/admin/users/:id/revoke-lifetime — undo the grant ───────────────
router.post('/users/:id/revoke-lifetime', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'User ID is required' });
    const entitlementId = req.body?.entitlement || 'pro';

    const results = {
      revenueCat: { attempted: true, ok: false },
      override: { attempted: true, ok: false },
      subscription: { attempted: true, ok: false },
    };

    const rcResult = await revokeRevenueCatPromotional(id, { entitlementId });
    results.revenueCat.ok = !rcResult.error;
    results.revenueCat.detail = rcResult;

    const { data: existing } = await supabase
      .from('user_config_overrides')
      .select('overrides')
      .eq('user_id', id)
      .maybeSingle();
    if (existing?.overrides) {
      const next = { ...existing.overrides };
      delete next.entitlement;
      const { error } = await supabase
        .from('user_config_overrides')
        .upsert({
          user_id: id,
          overrides: next,
          updated_by: req.user?.id || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      results.override.ok = !error;
      results.override.detail = error?.message || null;
    } else {
      results.override.ok = true;
      results.override.detail = 'no-override-row';
    }

    const { error: subError } = await supabase
      .from('subscriptions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('user_id', id)
      .eq('plan', 'lifetime');
    results.subscription.ok = !subError;
    results.subscription.detail = subError?.message || null;

    res.json({ ok: results.override.ok && results.subscription.ok, userId: id, results });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Pre-signup lifetime grants
// ─────────────────────────────────────────────────────────────────────────────
//
// Admins can issue lifetime access to an email BEFORE the user signs up.
// When the user signs up with that email, the redeemPreSignupGrantsForUser
// helper (called from server/src/routes/users.js) auto-applies lifetime via
// the same applyLifetimeGrant flow used by the Grant Lifetime button.
//
// See supabase/migrations/20260422000004_create_pre_signup_grants.sql.

// Normalise + validate an email. Returns { ok, email } or { ok: false, reason }.
function normaliseEmail(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'not-a-string' };
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return { ok: false, reason: 'empty' };
  // Deliberately lenient — RFC-strict regex creates more bugs than it prevents.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, reason: 'bad-format' };
  }
  return { ok: true, email: trimmed };
}

// ── GET /api/admin/pre-signup-grants — list all grants ───────────────────────
router.get('/pre-signup-grants', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('pre_signup_grants')
      .select('*')
      .order('granted_at', { ascending: false });
    if (error) throw error;

    // Enrich redeemed rows with the actual user email + name so the admin UI
    // can link through to the user detail page.
    const redeemedIds = (data || [])
      .map(r => r.redeemed_user_id)
      .filter(Boolean);
    const userLookup = {};
    if (redeemedIds.length > 0) {
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      for (const u of (users || [])) {
        if (redeemedIds.includes(u.id)) {
          userLookup[u.id] = {
            id: u.id,
            email: u.email,
            name: u.user_metadata?.full_name || u.user_metadata?.name || null,
          };
        }
      }
    }

    res.json({
      grants: (data || []).map(g => ({
        id: g.id,
        email: g.email,
        entitlement: g.entitlement,
        note: g.note,
        status: g.status,
        grantedAt: g.granted_at,
        grantedBy: g.granted_by,
        redeemedAt: g.redeemed_at,
        redeemedUser: g.redeemed_user_id ? (userLookup[g.redeemed_user_id] || { id: g.redeemed_user_id }) : null,
      })),
    });
  } catch (err) { next(err); }
});

// ── POST /api/admin/pre-signup-grants — create one or many ───────────────────
// Body accepts either:
//   { email, entitlement?, note? }
// or:
//   { emails: ['a@b.com', 'c@d.com'], entitlement?, note? }
// or:
//   { bulkText: 'a@b.com\nc@d.com\n', entitlement?, note? }
//
// Any existing PENDING grant for the same email is left as-is (so repeated
// submissions are safe). If the email already belongs to a Supabase user,
// the response flags it so the admin can use the regular Grant Lifetime
// button instead.
router.post('/pre-signup-grants', async (req, res, next) => {
  try {
    const { email, emails, bulkText, entitlement = 'lifetime', note = null } = req.body || {};

    // Validate tier. 'lifetime' = permanent; 'starter' = 3 months.
    // Anything else is rejected so typos don't silently produce non-redeemable
    // grants.
    const ALLOWED_TIERS = new Set(['lifetime', 'starter']);
    if (!ALLOWED_TIERS.has(entitlement)) {
      return res.status(400).json({
        error: `Unsupported entitlement "${entitlement}". Must be one of: ${Array.from(ALLOWED_TIERS).join(', ')}.`,
      });
    }

    // Collect candidate emails from whichever field was used.
    const raw = [];
    if (typeof email === 'string' && email.trim()) raw.push(email);
    if (Array.isArray(emails)) raw.push(...emails);
    if (typeof bulkText === 'string') {
      for (const line of bulkText.split(/[\n,;]+/)) {
        if (line.trim()) raw.push(line);
      }
    }
    if (raw.length === 0) {
      return res.status(400).json({ error: 'No emails provided.' });
    }

    // Normalise + dedup (case-insensitive).
    const seen = new Set();
    const candidates = [];
    const invalid = [];
    for (const r of raw) {
      const n = normaliseEmail(r);
      if (!n.ok) { invalid.push({ input: r, reason: n.reason }); continue; }
      if (seen.has(n.email)) continue;
      seen.add(n.email);
      candidates.push(n.email);
    }

    if (candidates.length === 0) {
      return res.status(400).json({ error: 'No valid emails in input.', invalid });
    }

    // Check which of those already have Supabase accounts — the admin should
    // use the regular lifetime flow for those rather than a pre-signup grant.
    const { data: { users: allUsers } } = await supabase
      .auth.admin.listUsers({ perPage: 1000 });
    const existingEmails = new Set(
      (allUsers || [])
        .map(u => (u.email || '').toLowerCase())
        .filter(Boolean)
    );

    // Pull any existing grants (pending OR redeemed) for these emails. We use
    // the pending set to short-circuit duplicate creations, and the redeemed
    // set to stop starter grants being issued to someone who already has
    // lifetime (which strictly encapsulates starter).
    const { data: existingGrants } = await supabase
      .from('pre_signup_grants')
      .select('id, email, entitlement, status')
      .in('email', candidates)
      .in('status', ['pending', 'redeemed']);
    const alreadyPending = new Set(
      (existingGrants || []).filter(g => g.status === 'pending').map(g => g.email.toLowerCase())
    );
    // An email has "effective lifetime" if any pending or redeemed grant at
    // that address is the lifetime tier.
    const hasLifetimeGrant = new Set(
      (existingGrants || [])
        .filter(g => g.entitlement === 'lifetime')
        .map(g => g.email.toLowerCase())
    );

    const toInsert = [];
    const skipped = [];
    for (const e of candidates) {
      if (existingEmails.has(e)) {
        skipped.push({ email: e, reason: 'user-exists', hint: 'Use the regular Grant Lifetime button on their profile.' });
        continue;
      }
      if (alreadyPending.has(e)) {
        skipped.push({ email: e, reason: 'already-pending' });
        continue;
      }
      // Lifetime encapsulates starter — issuing a starter grant on top of
      // an existing lifetime grant (pending or already redeemed) would
      // either churn writes or trap the user in starter-only UX. Skip it.
      if (entitlement === 'starter' && hasLifetimeGrant.has(e)) {
        skipped.push({
          email: e,
          reason: 'already-has-lifetime-grant',
          hint: 'Lifetime already covers everything Starter does — no action needed.',
        });
        continue;
      }
      toInsert.push({
        email: e,
        entitlement,
        note,
        granted_by: req.user?.id || null,
      });
    }

    let inserted = [];
    if (toInsert.length > 0) {
      const { data, error } = await supabase
        .from('pre_signup_grants')
        .insert(toInsert)
        .select('id, email, entitlement, note, status, granted_at');
      if (error) throw error;
      inserted = data || [];
    }

    res.json({
      ok: true,
      summary: {
        requested: raw.length,
        valid: candidates.length,
        invalid: invalid.length,
        created: inserted.length,
        skipped: skipped.length,
      },
      inserted,
      skipped,
      invalid,
    });
  } catch (err) {
    console.error('[admin/pre-signup-grants] create error:', err);
    next(err);
  }
});

// ── DELETE /api/admin/pre-signup-grants/:id — revoke a pending grant ─────────
router.delete('/pre-signup-grants/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'id is required' });

    // Only pending grants are deletable; redeemed ones are audit trail.
    const { data: existing } = await supabase
      .from('pre_signup_grants')
      .select('status')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Grant not found' });
    if (existing.status !== 'pending') {
      return res.status(400).json({
        error: `Cannot revoke a grant with status "${existing.status}". Already-redeemed grants are kept as an audit trail — use revoke-lifetime on the user instead.`,
      });
    }

    const { error } = await supabase
      .from('pre_signup_grants')
      .update({ status: 'revoked' })
      .eq('id', id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Plan generation debug — list, inspect, rerun
// ─────────────────────────────────────────────────────────────────────────────
//
// Source-of-truth: public.plan_generations (see migration
// 20260422000005_create_plan_generations.sql). The runAsyncGeneration path
// writes a row when a job starts and updates it on success / failure /
// cancel. This UI surface is the "why didn't Rob's plan finish?" answer.

// GET /api/admin/plan-generations?status=failed&userId=...&since=24h&limit=100
router.get('/plan-generations', async (req, res, next) => {
  try {
    const { status, userId, email, limit = '100', sinceHours } = req.query;
    const max = Math.min(Number(limit) || 100, 500);

    let resolvedUserId = userId || null;
    if (!resolvedUserId && email) {
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const u = (users || []).find(x => (x.email || '').toLowerCase() === String(email).toLowerCase());
      if (u) resolvedUserId = u.id;
      else return res.json({ generations: [], userSummary: null });
    }

    let query = supabase
      .from('plan_generations')
      .select('id, user_id, job_id, plan_id, status, progress, reason, model, activities_count, error, duration_ms, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(max);

    if (status) query = query.eq('status', status);
    if (resolvedUserId) query = query.eq('user_id', resolvedUserId);
    if (sinceHours) {
      const since = new Date(Date.now() - Number(sinceHours) * 3600 * 1000).toISOString();
      query = query.gte('created_at', since);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Attach user email + name so the list is readable without a per-row lookup.
    const uniqUserIds = Array.from(new Set((data || []).map(r => r.user_id).filter(Boolean)));
    const userLookup = {};
    if (uniqUserIds.length > 0) {
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      for (const u of (users || [])) {
        if (uniqUserIds.includes(u.id)) {
          userLookup[u.id] = {
            id: u.id,
            email: u.email,
            name: u.user_metadata?.full_name || u.user_metadata?.name || null,
          };
        }
      }
    }

    res.json({
      generations: (data || []).map(r => ({
        ...r,
        user: r.user_id ? (userLookup[r.user_id] || { id: r.user_id }) : null,
      })),
    });
  } catch (err) { next(err); }
});

// GET /api/admin/plan-generations/:id — full detail including goal + config
router.get('/plan-generations/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('plan_generations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });

    // User lookup for display
    let user = null;
    if (data.user_id) {
      const { data: { user: u } } = await supabase.auth.admin.getUserById(data.user_id);
      if (u) {
        user = {
          id: u.id,
          email: u.email,
          name: u.user_metadata?.full_name || u.user_metadata?.name || null,
        };
      }
    }

    // Usage log rows for this job (tokens + cost + request_id)
    let usage = [];
    if (data.job_id || data.user_id) {
      const { data: logs } = await supabase
        .from('claude_usage_log')
        .select('id, feature, model, input_tokens, output_tokens, cost_usd, duration_ms, status, request_id, created_at')
        .eq('feature', 'plan_gen')
        .eq('user_id', data.user_id || '00000000-0000-0000-0000-000000000000')
        .gte('created_at', new Date(new Date(data.created_at).getTime() - 60_000).toISOString())
        .lte('created_at', new Date(new Date(data.updated_at).getTime() + 60_000).toISOString())
        .order('created_at', { ascending: true });
      usage = logs || [];
    }

    res.json({ generation: data, user, usage });
  } catch (err) { next(err); }
});

// POST /api/admin/plan-generations/:id/cancel — mark a running generation cancelled
// Admin-side cancel: the user-facing DELETE /api/ai/plan-job/:jobId endpoint
// rejects any caller whose user_id doesn't match the job. Admins debugging a
// stuck job need a separate path that bypasses the ownership check. This:
//   1. Marks the in-memory planJob as 'cancelled' so runAsyncGeneration bails
//      at its next cancel checkpoint (API call, post-processor, retry, save).
//   2. Deletes any plan rows that already got saved before the checkpoint.
//   3. Flips the plan_generations row to status='cancelled' so the debug UI
//      + admin dashboard stat cards reflect reality.
router.post('/plan-generations/:id/cancel', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: row, error } = await supabase
      .from('plan_generations')
      .select('id, job_id, status, plan_id, created_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return res.status(404).json({ error: 'Not found' });

    // If the row is already terminal, don't re-flip — return the current state
    // so the UI can surface it cleanly.
    if (['completed', 'failed', 'cancelled'].includes(row.status)) {
      return res.json({ ok: true, alreadyTerminal: true, status: row.status });
    }

    // 1. In-memory job cancellation. The job may have aged out of planJobs
    // (process restart, expiry); that's fine — we still flip the DB row.
    let inMemoryCancelled = false;
    if (row.job_id) {
      const { getPlanJob } = require('./ai');
      const job = getPlanJob(row.job_id);
      if (job) {
        job.status = 'cancelled';
        job.progress = 'Cancelled by admin';
        inMemoryCancelled = true;
      }
    }

    // 2. Delete the plan + its activities if runAsyncGeneration already wrote
    // them (completes-before-cancel race). Best-effort — failures just log.
    if (row.plan_id) {
      supabase.from('activities').delete().eq('plan_id', row.plan_id).then(() =>
        supabase.from('plans').delete().eq('id', row.plan_id)
      ).catch((e) => console.warn('[admin/plan-generations/cancel] plan cleanup failed:', e?.message));
    }

    // 3. Persist the cancelled status so the debug UI stops reporting running.
    const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : null;
    await supabase
      .from('plan_generations')
      .update({
        status: 'cancelled',
        progress: 'Cancelled by admin',
        error: req.body?.reason ? `Cancelled by admin: ${req.body.reason}` : 'Cancelled by admin',
        duration_ms: createdAtMs ? Date.now() - createdAtMs : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    res.json({ ok: true, inMemoryCancelled, jobId: row.job_id || null });
  } catch (err) {
    console.error('[admin/plan-generations/cancel] error:', err);
    next(err);
  }
});

// POST /api/admin/plan-generations/:id/rerun — kick off a new job with stored inputs
router.post('/plan-generations/:id/rerun', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: row, error } = await supabase
      .from('plan_generations')
      .select('user_id, goal, config, plan_id')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!row.goal || !row.config) {
      return res.status(400).json({ error: 'Stored row is missing goal or config — cannot rerun.' });
    }

    // Rerun against the SAME user the generation originally belonged to.
    // Attach replacePlanId if the original produced a plan, so the rerun
    // overwrites that plan in place (admin can use this to "fix" a dodgy
    // plan without creating a second row on the user).
    const { startGenerationJob } = require('./ai');
    const jobId = await startGenerationJob({
      userId: row.user_id,
      goal: row.goal,
      config: row.config,
      replacePlanId: row.plan_id || null,
      reason: 'admin-rerun',
    });

    res.json({ ok: true, jobId, userId: row.user_id, replacedPlanId: row.plan_id || null });
  } catch (err) {
    console.error('[admin/plan-generations/rerun] error:', err);
    next(err);
  }
});

// ── GET /api/admin/users/:id — full detail for a single user ─────────────────
// Returns profile + all subscriptions + plans + feedback + support tickets
// (filtered by user email) for the user detail page in the admin dashboard.
router.get('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'User ID is required' });

    // ── Profile ────────────────────────────────────────────────────────────────
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(id);
    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.user_metadata?.name || null,
      isAdmin: user.user_metadata?.is_admin === true,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      emailConfirmedAt: user.email_confirmed_at || null,
      provider: user.app_metadata?.provider || null,
      providers: user.app_metadata?.providers || [],
    };

    // ── Subscriptions — ALL rows, not just latest ─────────────────────────────
    const STORE_LABEL = {
      APP_STORE: 'Apple IAP',
      MAC_APP_STORE: 'Apple IAP',
      PLAY_STORE: 'Google Play',
      STRIPE: 'Stripe',
      PROMOTIONAL: 'Promotional',
      AMAZON: 'Amazon',
    };

    const { data: subsRows } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', id)
      .order('created_at', { ascending: false });

    const { data: redemptions } = await supabase
      .from('coupon_redemptions')
      .select('*')
      .eq('user_id', id)
      .order('redeemed_at', { ascending: false });

    const hasCoupon = (redemptions || []).length > 0;

    const subscriptions = (subsRows || []).map(sub => {
      let source;
      if (hasCoupon) source = 'Coupon';
      else if (sub.status === 'trialing') source = 'Free Trial';
      else if (sub.store && STORE_LABEL[sub.store]) source = STORE_LABEL[sub.store];
      else if (sub.store) source = sub.store;
      else if (sub.stripe_customer_id) source = 'Stripe';
      else source = 'Apple IAP';

      return {
        id: sub.id,
        plan: sub.plan,
        status: sub.status,
        source,
        store: sub.store || null,
        productId: sub.product_id || null,
        trialEnd: sub.trial_end,
        currentPeriodEnd: sub.current_period_end,
        createdAt: sub.created_at,
        updatedAt: sub.updated_at,
      };
    });

    // ── Plans + activity counts ────────────────────────────────────────────────
    const { data: plansRows } = await supabase
      .from('plans')
      .select('*')
      .eq('user_id', id)
      .order('created_at', { ascending: false });

    let activityCountsByPlan = {};
    const planIds = (plansRows || []).map(p => p.id);
    if (planIds.length > 0) {
      const { data: acts } = await supabase
        .from('activities')
        .select('plan_id')
        .in('plan_id', planIds);
      for (const a of (acts || [])) {
        activityCountsByPlan[a.plan_id] = (activityCountsByPlan[a.plan_id] || 0) + 1;
      }
    }

    const plans = (plansRows || []).map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      weeks: p.weeks,
      startDate: p.start_date,
      createdAt: p.created_at,
      activityCount: activityCountsByPlan[p.id] || 0,
    }));

    // ── Feedback threads ───────────────────────────────────────────────────────
    const { data: feedbackRows } = await supabase
      .from('feedback')
      .select('*')
      .eq('user_id', id)
      .order('created_at', { ascending: false });

    const feedback = (feedbackRows || []).map(f => ({
      id: f.id,
      category: f.category,
      message: f.message,
      appVersion: f.app_version,
      linearIssueKey: f.linear_issue_key,
      linearIssueUrl: f.linear_issue_url,
      adminResponse: f.admin_response || null,
      adminRespondedAt: f.admin_responded_at || null,
      createdAt: f.created_at,
    }));

    // ── Support tickets (Linear) — best-effort match by email in title/desc ────
    const LINEAR_API_KEY = process.env.LINEAR_API_KEY;
    const LINEAR_TEAM_ID = process.env.LINEAR_TEAM_ID;
    let tickets = [];
    if (LINEAR_API_KEY && LINEAR_TEAM_ID && user.email) {
      try {
        const query = `
          query($teamId: String!, $email: String!) {
            team(id: $teamId) {
              issues(first: 20, orderBy: createdAt, filter: {
                or: [
                  { title: { containsIgnoreCase: $email } },
                  { description: { containsIgnoreCase: $email } }
                ]
              }) {
                nodes {
                  id identifier title url priority state { name } createdAt updatedAt
                  labels { nodes { name } }
                }
              }
            }
          }
        `;
        const response = await fetch('https://api.linear.app/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: LINEAR_API_KEY },
          body: JSON.stringify({ query, variables: { teamId: LINEAR_TEAM_ID, email: user.email } }),
        });
        const json = await response.json();
        const issues = json.data?.team?.issues?.nodes || [];
        tickets = issues.map(i => ({
          id: i.id,
          linearId: i.identifier,
          title: i.title,
          url: i.url,
          priority: i.priority <= 1 ? 'urgent' : i.priority === 2 ? 'high' : i.priority === 3 ? 'medium' : 'low',
          status: i.state?.name?.toLowerCase().replace(/ /g, '_') || 'open',
          labels: i.labels?.nodes?.map(l => l.name) || [],
          createdAt: i.createdAt,
          updatedAt: i.updatedAt,
        }));
      } catch (ticketsErr) {
        console.warn('[admin] Failed to fetch Linear tickets for user', id, ticketsErr.message);
      }
    }

    res.json({ profile, subscriptions, plans, feedback, tickets });
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

// ── POST /api/admin/users/:id/coach-checkin — manually send a coach check-in ──
router.post('/users/:id/coach-checkin', async (req, res, next) => {
  try {
    const userId = req.params.id;

    // Find user's most recent plan (any status — don't gate the check-in on active-only)
    const { data: plans, error: planFetchErr } = await supabase
      .from('plans')
      .select('id, config_id, status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (planFetchErr) console.error('[admin check-in] plan fetch error:', planFetchErr.message);
    const plan = plans?.[0] || null;

    // Get coach ID from plan config (fall back to matteo if no plan)
    let coachId = 'matteo';
    if (plan?.config_id) {
      const { data: config } = await supabase
        .from('plan_configs')
        .select('coach_id')
        .eq('id', plan.config_id)
        .maybeSingle();
      if (config?.coach_id) coachId = config.coach_id;
    }

    // Coach personas
    const COACHES = {
      clara:  { name: 'Clara', style: 'warm and encouraging, uses simple language, celebrates small wins' },
      lars:   { name: 'Lars', style: 'direct and honest, short punchy sentences, expects discipline' },
      sophie: { name: 'Sophie', style: 'methodical and educational, references training science' },
      matteo: { name: 'Matteo', style: 'calm and balanced, philosophical, uses metaphors' },
      elena:  { name: 'Elena', style: 'passionate and race-focused, high energy' },
      tom:    { name: 'Tom', style: 'chatty and friendly, casual British humour' },
    };

    const coachInfo = COACHES[coachId] || COACHES.matteo;

    // Find most recent completed activity for context (only if user has a plan)
    let activities = null;
    if (plan) {
      const { data: acts } = await supabase
        .from('activities')
        .select('*')
        .eq('user_id', userId)
        .eq('plan_id', plan.id)
        .eq('completed', true)
        .order('completed_at', { ascending: false })
        .limit(1);
      activities = acts;
    }

    const activity = activities?.[0];

    // Generate the message via Claude
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    let body;

    if (apiKey) {
      const _fetch = typeof globalThis.fetch === 'function'
        ? globalThis.fetch
        : (() => { const f = require('node-fetch'); return f.default || f; })();

      const prompt = activity
        ? `You are ${coachInfo.name}, a cycling coach. Your style: ${coachInfo.style}.
The rider recently completed: ${activity.title || activity.type} (${activity.duration_mins ? activity.duration_mins + ' min' : 'unknown duration'}).
Write a brief, personalised check-in message (2-3 sentences max) asking how things are going and offering encouragement. Reference their recent training. Keep it natural and in character. No emojis. No greeting — jump straight in.`
        : plan
          ? `You are ${coachInfo.name}, a cycling coach. Your style: ${coachInfo.style}.
Write a brief, friendly check-in message (2-3 sentences max) asking how training is going and if they need any adjustments to their plan. Keep it natural and in character. No emojis. No greeting — jump straight in.`
          : `You are ${coachInfo.name}, a cycling coach. Your style: ${coachInfo.style}.
Write a brief, friendly message (2-3 sentences max) welcoming a new rider and encouraging them to set up their first training plan. Keep it natural and in character. No emojis. No greeting — jump straight in.`;

      try {
        const aiRes = await _fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 150,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const json = await aiRes.json();
        body = json.content?.[0]?.text?.trim();
      } catch (err) {
        console.error('[admin] Coach check-in AI error:', err);
      }
    }

    if (!body) {
      body = activity
        ? `How did your ${activity.title || 'session'} go? Let me know if you need any adjustments to your plan.`
        : plan
          ? `How is your training going? Let me know if you need any adjustments to your plan.`
          : `Good to see you here. When you're ready, set up your first training plan and I'll build something tailored to your goals.`;
    }

    // Save to chat session only if the user has a plan
    if (plan) {
      const sessionId = `${plan.id}_w0`;
      const { data: existingSession } = await supabase
        .from('chat_sessions')
        .select('messages')
        .eq('id', sessionId)
        .maybeSingle();

      const existingMessages = existingSession?.messages || [];
      const checkinMessage = {
        role: 'assistant',
        content: body,
        ts: Date.now(),
        checkin: true,
      };

      await supabase
        .from('chat_sessions')
        .upsert({
          id: sessionId,
          user_id: userId,
          plan_id: plan.id,
          week_num: null,
          messages: [...existingMessages, checkinMessage],
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
    }

    // Send push notification (always)
    await sendPushToUser(userId, {
      title: `${coachInfo.name} checked in`,
      body,
      type: 'coach_checkin',
      data: { coachId, planId: plan?.id || null },
    });

    res.json({ success: true, coachId, coachName: coachInfo.name, message: body });
  } catch (err) { next(err); }
});

module.exports = router;
// Named exports for shared use by users.js (pre-signup redemption) without
// creating a require-cycle via the default export.
module.exports._rcHelpers = {
  grantRevenueCatLifetime,
  grantRevenueCatPromotional,
  revokeRevenueCatPromotional,
  fetchRevenueCatSubscriber,
  classifyRevenueCatKey,
};
