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
    const { data, error } = await supabase.from('goals').insert(row).select().single();
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
  return {
    id: g.id,
    user_id: userId,
    cycling_type: g.cyclingType,
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
  return {
    id: row.id,
    cyclingType: row.cycling_type,
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
