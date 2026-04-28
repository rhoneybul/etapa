const { Router } = require('express');
const { supabase } = require('../lib/supabase');
const router = Router();

// GET /api/goals — list user's goals
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data.map(toClient));
  } catch (err) { next(err); }
});

// POST /api/goals — create a goal
router.post('/', async (req, res, next) => {
  try {
    const row = toRow(req.body, req.user.id);
    const { data, error } = await supabase.from('goals').upsert(row, { onConflict: 'id' }).select().single();
    if (error) throw error;
    res.status(201).json(toClient(data));
  } catch (err) { next(err); }
});

// DELETE /api/goals/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase.from('goals').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Mappers ──────────────────────────────────────────────────────────────────
function toRow(g, userId) {
  // Multi-bike: the new `cyclingTypes` array is the source of truth, but
  // we keep writing `cycling_type` as the legacy single-value column for
  // back-compat with old plan-gen code paths and admin views. Derive
  // single value from the array when needed (single → that key, multi →
  // 'mixed').
  const cyclingTypes = Array.isArray(g.cyclingTypes) && g.cyclingTypes.length > 0
    ? g.cyclingTypes
    : (g.cyclingType ? [g.cyclingType] : []);
  const legacySingle = cyclingTypes.length === 1
    ? cyclingTypes[0]
    : (cyclingTypes.length > 1 ? 'mixed' : (g.cyclingType || null));
  return {
    id: g.id,
    user_id: userId,
    cycling_type: legacySingle,
    cycling_types: cyclingTypes.length > 0 ? cyclingTypes : null,
    goal_type: g.goalType,
    target_distance: g.targetDistance || null,
    target_elevation: g.targetElevation || null,
    target_time: g.targetTime || null,
    target_date: g.targetDate || null,
    event_name: g.eventName || null,
    route_name: g.routeName || null,
    created_at: g.createdAt || new Date().toISOString(),
  };
}

function toClient(row) {
  // Prefer the multi-value array; if the column doesn't exist yet (running
  // against a DB that hasn't been migrated), fall back to wrapping the
  // legacy single value so clients always see a `cyclingTypes` array.
  const cyclingTypes = Array.isArray(row.cycling_types) && row.cycling_types.length > 0
    ? row.cycling_types
    : (row.cycling_type ? [row.cycling_type] : []);
  return {
    id: row.id,
    cyclingType: row.cycling_type,
    cyclingTypes,
    goalType: row.goal_type,
    targetDistance: row.target_distance ? Number(row.target_distance) : null,
    targetElevation: row.target_elevation ? Number(row.target_elevation) : null,
    targetTime: row.target_time ? Number(row.target_time) : null,
    targetDate: row.target_date,
    eventName: row.event_name,
    routeName: row.route_name,
    createdAt: row.created_at,
  };
}

module.exports = router;
