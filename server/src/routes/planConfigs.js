const { Router } = require('express');
const { supabase } = require('../lib/supabase');
const {
  isMissingPlanConfigCoachIdColumn,
  removeCoachIdField,
} = require('../lib/planConfigCompat');
const router = Router();

// GET /api/plan-configs — list user's plan configs
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('plan_configs')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data.map(toClient));
  } catch (err) { next(err); }
});

// POST /api/plan-configs — create a plan config
router.post('/', async (req, res, next) => {
  try {
    const row = toRow(req.body, req.user.id);
    let { data, error } = await supabase.from('plan_configs').insert(row).select().single();
    if (isMissingPlanConfigCoachIdColumn(error)) {
      ({ data, error } = await supabase
        .from('plan_configs')
        .insert(removeCoachIdField(row))
        .select()
        .single());
    }
    if (error) throw error;
    res.status(201).json(toClient(data));
  } catch (err) { next(err); }
});

// PUT /api/plan-configs/:id — update a plan config
router.put('/:id', async (req, res, next) => {
  try {
    const updates = toRow(req.body, req.user.id);
    delete updates.id; // Don't overwrite PK
    let { data, error } = await supabase
      .from('plan_configs')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();
    if (isMissingPlanConfigCoachIdColumn(error)) {
      ({ data, error } = await supabase
        .from('plan_configs')
        .update(removeCoachIdField(updates))
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .select()
        .single());
    }
    if (error) throw error;
    res.json(toClient(data));
  } catch (err) { next(err); }
});

// DELETE /api/plan-configs/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('plan_configs')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Mappers ──────────────────────────────────────────────────────────────────
function toRow(c, userId) {
  return {
    id: c.id,
    user_id: userId,
    fitness_level: c.fitnessLevel || null,
    sessions_per_week: c.sessionsPerWeek || null,
    session_types: c.sessionTypes || null,
    cross_training_days_full: c.crossTrainingDaysFull || null,
    indoor_trainer: c.indoorTrainer || false,
    extra_notes: c.extraNotes || null,
    coach_id: c.coachId || null,
    created_at: c.createdAt || new Date().toISOString(),
  };
}

function toClient(row) {
  return {
    id: row.id,
    fitnessLevel: row.fitness_level,
    sessionsPerWeek: row.sessions_per_week,
    sessionTypes: row.session_types,
    crossTrainingDaysFull: row.cross_training_days_full,
    indoorTrainer: row.indoor_trainer,
    extraNotes: row.extra_notes,
    coachId: row.coach_id ?? null,
    createdAt: row.created_at,
  };
}

module.exports = router;
