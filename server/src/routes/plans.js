const { Router } = require('express');
const { supabase } = require('../lib/supabase');
const router = Router();

// GET /api/plans — list user's plans with activities
router.get('/', async (req, res, next) => {
  try {
    const { data: plans, error } = await supabase
      .from('plans')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });
    if (error) throw error;

    // Fetch activities for all plans in one query
    const planIds = plans.map(p => p.id);
    let activities = [];
    if (planIds.length > 0) {
      const { data: acts, error: actErr } = await supabase
        .from('activities')
        .select('*')
        .in('plan_id', planIds)
        .eq('user_id', req.user.id)
        .order('week', { ascending: true })
        .order('day_of_week', { ascending: true });
      if (actErr) throw actErr;
      activities = acts;
    }

    // Group activities by plan
    const actByPlan = {};
    activities.forEach(a => {
      if (!actByPlan[a.plan_id]) actByPlan[a.plan_id] = [];
      actByPlan[a.plan_id].push(activityToClient(a));
    });

    res.json(plans.map(p => planToClient(p, actByPlan[p.id] || [])));
  } catch (err) { next(err); }
});

// POST /api/plans — create or replace a plan with activities (upsert — safe to call repeatedly)
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const plan = req.body;

    // Upsert plan row — if the plan already exists (same id) we overwrite it cleanly
    const planRow = planToRow(plan, userId);
    const { error: planErr } = await supabase
      .from('plans')
      .upsert(planRow, { onConflict: 'id' });
    if (planErr) throw planErr;

    // Replace activities: delete all existing then bulk-insert fresh set
    // (Upsert on activities is tricky because IDs can change between edits)
    if (plan.activities && plan.activities.length > 0) {
      await supabase.from('activities').delete().eq('plan_id', plan.id).eq('user_id', userId);
      const actRows = plan.activities.map(a => activityToRow(a, userId, plan.id));
      const { error: actErr } = await supabase.from('activities').insert(actRows);
      if (actErr) throw actErr;
    }

    res.status(201).json({ id: plan.id });
  } catch (err) { next(err); }
});

// PUT /api/plans/:id — update a plan and its activities
router.put('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const plan = req.body;
    const planId = req.params.id;

    // Update plan row
    const { error: planErr } = await supabase
      .from('plans')
      .update({
        name: plan.name || null,
        status: plan.status,
        current_week: plan.currentWeek,
      })
      .eq('id', planId)
      .eq('user_id', userId);
    if (planErr) throw planErr;

    // Replace all activities: delete existing, insert new
    if (plan.activities) {
      const { error: delErr } = await supabase
        .from('activities')
        .delete()
        .eq('plan_id', planId)
        .eq('user_id', userId);
      if (delErr) throw delErr;

      if (plan.activities.length > 0) {
        const actRows = plan.activities.map(a => activityToRow(a, userId, planId));
        const { error: insErr } = await supabase.from('activities').insert(actRows);
        if (insErr) throw insErr;
      }
    }

    res.json({ id: planId });
  } catch (err) { next(err); }
});

// DELETE /api/plans/:id
router.delete('/:id', async (req, res, next) => {
  try {
    // Activities cascade-deleted via FK
    const { error } = await supabase
      .from('plans')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// PATCH /api/plans/:planId/activities/:activityId — update a single activity
router.patch('/:planId/activities/:activityId', async (req, res, next) => {
  try {
    const updates = {};
    const b = req.body;
    if (b.completed !== undefined)   updates.completed = b.completed;
    if (b.completedAt !== undefined) updates.completed_at = b.completedAt;
    if (b.distanceKm !== undefined)  updates.distance_km = b.distanceKm;
    if (b.durationMins !== undefined) updates.duration_mins = b.durationMins;
    if (b.effort !== undefined)      updates.effort = b.effort;
    if (b.dayOfWeek !== undefined)   updates.day_of_week = b.dayOfWeek;
    if (b.title !== undefined)       updates.title = b.title;
    if (b.description !== undefined) updates.description = b.description;

    const { error } = await supabase
      .from('activities')
      .update(updates)
      .eq('id', req.params.activityId)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Mappers ──────────────────────────────────────────────────────────────────
function planToRow(p, userId) {
  return {
    id: p.id,
    user_id: userId,
    goal_id: p.goalId || null,
    config_id: p.configId || null,
    name: p.name || null,
    status: p.status || 'active',
    start_date: p.startDate,
    weeks: p.weeks,
    current_week: p.currentWeek || 1,
    created_at: p.createdAt || new Date().toISOString(),
  };
}

function planToClient(row, activities) {
  return {
    id: row.id,
    goalId: row.goal_id,
    configId: row.config_id,
    name: row.name,
    status: row.status,
    startDate: row.start_date,
    weeks: row.weeks,
    currentWeek: row.current_week,
    activities,
    createdAt: row.created_at,
  };
}

function activityToRow(a, userId, planId) {
  return {
    id: a.id,
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
    strava_activity_id: a.stravaActivityId || null,
    strava_data: a.stravaData || null,
  };
}

function activityToClient(row) {
  return {
    id: row.id,
    planId: row.plan_id,
    week: row.week,
    dayOfWeek: row.day_of_week,
    type: row.type,
    subType: row.sub_type,
    title: row.title,
    description: row.description,
    notes: row.notes,
    durationMins: row.duration_mins,
    distanceKm: row.distance_km ? Number(row.distance_km) : null,
    effort: row.effort,
    completed: row.completed,
    completedAt: row.completed_at,
    stravaActivityId: row.strava_activity_id,
    stravaData: row.strava_data,
  };
}

module.exports = router;
