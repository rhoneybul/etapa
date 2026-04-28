const { Router } = require('express');
const { supabase } = require('../lib/supabase');
const rateLimits = require('../lib/rateLimits');
const { toZwo, toMrc, suggestedFilename } = require('../lib/workoutExport');
const { signExportUrl } = require('../lib/exportSigning');
const { notifyNewUserOnce } = require('../lib/userLifecycle');
const { notify: notifySlack } = require('../lib/slack');
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
    let { error: planErr } = await supabase
      .from('plans')
      .upsert(planRow, { onConflict: 'id' });

    // If the goal doesn't exist on the server yet (FK violation), retry without goal_id.
    // This handles the race where the goal sync hasn't landed before the plan sync.
    if (planErr && planErr.code === '23503' && planErr.message?.includes('goal_id')) {
      const { error: retryErr } = await supabase
        .from('plans')
        .upsert({ ...planRow, goal_id: null }, { onConflict: 'id' });
      if (retryErr) throw retryErr;
    } else if (planErr) {
      throw planErr;
    }

    // Replace activities: delete all existing then upsert fresh set.
    // Using upsert (not insert) so that concurrent sync requests don't collide
    // on the primary key — a second overlapping call will just overwrite instead
    // of throwing a duplicate key 500.
    if (plan.activities && plan.activities.length > 0) {
      await supabase.from('activities').delete().eq('plan_id', plan.id).eq('user_id', userId);
      const actRows = plan.activities.map(a => activityToRow(a, userId, plan.id));
      const { error: actErr } = await supabase.from('activities').upsert(actRows, { onConflict: 'id' });
      if (actErr) throw actErr;
    }

    // Belt-and-braces signup ping — riders who declined push and skipped
    // settings still trigger the Slack on first plan creation. Idempotent.
    notifyNewUserOnce(userId, req.user?.email, 'plan_created').catch(() => {});

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
        const { error: insErr } = await supabase.from('activities').upsert(actRows, { onConflict: 'id' });
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
    // Per-session bike override. Nullable. Set to null to clear.
    if (b.bikeType !== undefined)    updates.bike_type = b.bikeType || null;
    // Structure (warmup/main/cooldown breakdown). Persisted so the
    // workout export endpoint can read it. Nullable.
    if (b.structure !== undefined)   updates.structure = b.structure || null;
    // Cached AI ride tips. Two paths in:
    //   - explicit { tips: [...] } from the client after a fresh
    //     /api/ai/explain-tips call (we round-trip the cache so it
    //     survives a normal updateActivity merge).
    //   - explicit { tips: null } to bust the cache after a material
    //     edit (duration / structure / bike).
    if (b.tips !== undefined)        updates.tips = b.tips || null;

    // Heuristic cache-bust: if any material field changes (duration /
    // structure / bike type / effort) and the client didn't already
    // null-out tips, clear them so the next view regenerates against
    // the new shape. Otherwise riders see stale advice for a session
    // that's been retuned.
    const materialEdit =
      b.durationMins !== undefined ||
      b.structure !== undefined ||
      b.bikeType !== undefined ||
      b.effort !== undefined;
    if (materialEdit && b.tips === undefined) {
      updates.tips = null;
    }

    const { error } = await supabase
      .from('activities')
      .update(updates)
      .eq('id', req.params.activityId)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Workout export (Path 1: share-sheet) ────────────────────────────────────
// POST /api/plans/:planId/activities/:activityId/export-url
//
// Mints a one-shot signed URL the client opens via Linking.openURL. The
// URL points at the public /api/exports/workout download endpoint, with
// an HMAC signature, expiry, and the (uid, planId, activityId, format)
// tuple it covers. Bearer auth required to mint; the resulting URL is
// itself opaque and self-validating.
//
// Sport gate: only `type:'ride'` activities export. Strength sessions
// return 400 here so we don't even mint a URL. The button on the client
// is gated to indoor rides specifically; the API is permissive and will
// happily mint a URL for any ride.
router.post('/:planId/activities/:activityId/export-url', async (req, res, next) => {
  try {
    const format = String(req.body?.format || req.query?.format || 'zwo').toLowerCase();
    if (format !== 'zwo' && format !== 'mrc') {
      return res.status(400).json({ error: 'Unsupported format. Use zwo or mrc.' });
    }

    // Confirm the activity exists and belongs to this user. We don't return
    // the body here — we just gatekeep, and only mint a URL if the rider
    // is allowed to export this session. Single-row fetch.
    const { data: act, error } = await supabase
      .from('activities')
      .select('id, plan_id, user_id, type')
      .eq('id', req.params.activityId)
      .eq('plan_id', req.params.planId)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!act) return res.status(404).json({ error: 'Activity not found' });
    if (act.type !== 'ride') {
      return res.status(400).json({ error: 'Only ride sessions can be exported as a workout file.' });
    }

    // Resolve the public base URL: prefer EXPORT_BASE_URL (set in prod),
    // fall back to the incoming request's origin. Belt + braces: if the
    // signing secret isn't set we surface that explicitly so the client
    // can show a clean error rather than a generic 500.
    const baseUrl = process.env.EXPORT_BASE_URL
      || `${req.protocol}://${req.get('host')}`;

    let signed;
    try {
      signed = signExportUrl({
        baseUrl,
        userId: req.user.id,
        planId: req.params.planId,
        activityId: req.params.activityId,
        format,
      });
    } catch (err) {
      return res.status(503).json({ error: 'Export not configured on this server.' });
    }
    res.json(signed);
  } catch (err) { next(err); }
});

// ── Plan snapshots / versions ───────────────────────────────────────────────
// Snapshots are taken automatically before destructive operations (regenerate,
// revert) so the user can always roll back. The shape is deliberately simple:
// one row per version, with the plan meta + activities + config stored as JSONB.

/**
 * Internal helper: capture the current state of a plan as a snapshot row.
 * Called from the revert endpoint and from runAsyncGeneration when it's
 * processing a regenerate (see server/src/routes/ai.js).
 *
 * Returns the new snapshot id, or null if the plan doesn't exist.
 */
async function takeSnapshot({ userId, planId, reason = 'pre-regenerate', label = null }) {
  // Fetch the plan row + activities + config in parallel
  const [planR, actsR, configR] = await Promise.all([
    supabase.from('plans').select('*').eq('id', planId).eq('user_id', userId).maybeSingle(),
    supabase.from('activities').select('*').eq('plan_id', planId).eq('user_id', userId),
    supabase.from('plan_configs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
  ]);
  if (planR.error) throw planR.error;
  if (!planR.data) return null;  // nothing to snapshot

  const snapshotId = `ps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { error } = await supabase.from('plan_snapshots').insert({
    id: snapshotId,
    plan_id: planId,
    user_id: userId,
    label: label || defaultSnapshotLabel(reason),
    reason,
    plan_meta: planR.data,
    activities: actsR.data || [],
    config_snapshot: configR.data?.[0] || null,
  });
  if (error) throw error;
  return snapshotId;
}

function defaultSnapshotLabel(reason) {
  switch (reason) {
    case 'pre-regenerate': return 'Before regenerate';
    case 'pre-revert':     return 'Before revert';
    case 'manual':         return 'Manual save';
    default:               return 'Snapshot';
  }
}

// GET /api/plans/:id/versions — list all snapshots for a plan, newest first
router.get('/:id/versions', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('plan_snapshots')
      .select('id, plan_id, label, reason, created_at, plan_meta, config_snapshot, activities')
      .eq('plan_id', req.params.id)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    res.json((data || []).map(row => ({
      id: row.id,
      planId: row.plan_id,
      label: row.label,
      reason: row.reason,
      createdAt: row.created_at,
      // Surface just enough meta for the history list — not the full activities
      // (which can be large). The full blob comes back on revert.
      summary: {
        weeks: row.plan_meta?.weeks || null,
        currentWeek: row.plan_meta?.current_week || null,
        activityCount: Array.isArray(row.activities) ? row.activities.length : 0,
        fitnessLevel: row.config_snapshot?.fitness_level || null,
        daysPerWeek:  row.config_snapshot?.days_per_week || row.config_snapshot?.sessions_per_week || null,
      },
    })));
  } catch (err) { next(err); }
});

// POST /api/plans/:id/versions/:snapshotId/revert
// Restores a snapshot. Before replacing, we snapshot the CURRENT state as
// reason='pre-revert' so revert is also reversible.
router.post('/:id/versions/:snapshotId/revert', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id: planId, snapshotId } = req.params;

    // 1. Fetch the target snapshot (must belong to this user + plan)
    const { data: snap, error: fetchErr } = await supabase
      .from('plan_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .eq('plan_id', planId)
      .eq('user_id', userId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!snap) return res.status(404).json({ error: 'Snapshot not found' });

    // 2. Snapshot the current state first (so this revert is reversible)
    await takeSnapshot({ userId, planId, reason: 'pre-revert' });

    // 3. Restore plan meta (only fields the user can meaningfully go back)
    const meta = snap.plan_meta || {};
    await supabase
      .from('plans')
      .update({
        name:         meta.name || null,
        status:       meta.status || 'active',
        start_date:   meta.start_date || null,
        weeks:        meta.weeks || null,
        current_week: meta.current_week || 1,
      })
      .eq('id', planId)
      .eq('user_id', userId);

    // 4. Replace activities with the snapshot's activities
    await supabase.from('activities').delete().eq('plan_id', planId).eq('user_id', userId);
    const acts = Array.isArray(snap.activities) ? snap.activities : [];
    if (acts.length > 0) {
      // Each activity row comes out with user_id, plan_id already set from its
      // original row. We re-stamp user_id defensively in case a user's auth.uid
      // changed (shouldn't happen, but belt-and-braces).
      const rows = acts.map(a => ({ ...a, user_id: userId, plan_id: planId }));
      const { error: insErr } = await supabase.from('activities').upsert(rows, { onConflict: 'id' });
      if (insErr) throw insErr;
    }

    res.json({ ok: true, planId, restoredFrom: snapshotId });
  } catch (err) { next(err); }
});

// DELETE /api/plans/:id/versions/:snapshotId — remove a saved version
router.delete('/:id/versions/:snapshotId', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('plan_snapshots')
      .delete()
      .eq('id', req.params.snapshotId)
      .eq('plan_id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// POST /api/plans/:id/regenerate
// Takes an automatic pre-regenerate snapshot, then kicks off async generation
// with the goal + (possibly tweaked) config. Returns a jobId the client can
// poll via the existing /api/ai/plan-job/:jobId endpoint.
//
// Body: { goal, config }  where config may contain tweaked fitness/weeks/days
router.post('/:id/regenerate', async (req, res, next) => {
  try {
    // Weekly plan limit (counts initial + regenerations from plan_generations)
    if (await rateLimits.checkAndBlockPlan(req, res)) return;

    const userId = req.user.id;
    const planId = req.params.id;
    const { goal, config } = req.body || {};
    if (!goal || !config) {
      return res.status(400).json({ error: 'goal and config are required' });
    }

    // 1. Verify the plan belongs to this user
    const { data: plan, error: planErr } = await supabase
      .from('plans')
      .select('id')
      .eq('id', planId)
      .eq('user_id', userId)
      .maybeSingle();
    if (planErr) throw planErr;
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    // 2. Snapshot current state
    const snapshotId = await takeSnapshot({ userId, planId, reason: 'pre-regenerate' });

    // 3. Delegate to the existing async generation endpoint by calling its
    //    helper directly. To keep the wiring clean, we import lazily.
    //    When generation completes, runAsyncGeneration writes activities with
    //    planId === job.plan.id. We pass `replacePlanId` so it overwrites this
    //    plan's activities rather than creating a new plan.
    const { startGenerationJob } = require('./ai');
    const jobId = await startGenerationJob({
      userId,
      goal,
      config,
      replacePlanId: planId,
      reason: 'regenerate',
    });

    res.json({ ok: true, jobId, snapshotId });
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
    // Per-session bike override (multi-bike rollout). Nullable; old activities
    // simply don't set it.
    bike_type: a.bikeType || null,
    // Structure block — persisted so workout export and admin tools can
    // read it without going back to the client cache. Nullable.
    structure: a.structure || null,
    // Cached AI-generated ride tips (POST /api/ai/explain-tips). Nullable
    // — populated lazily on first view, kept on the row so subsequent
    // opens skip the Claude call. We pass it through round-tripping to
    // avoid wiping the cache on a normal client save.
    tips: a.tips || null,
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
    bikeType: row.bike_type || null,
    structure: row.structure || null,
    tips: row.tips || null,
    completed: row.completed,
    completedAt: row.completed_at,
    stravaActivityId: row.strava_activity_id,
    stravaData: row.strava_data,
  };
}

module.exports = router;
// Named export so ai.js / admin.js can take snapshots without duplicating logic
module.exports.takeSnapshot = takeSnapshot;
