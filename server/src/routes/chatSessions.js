const { Router } = require('express');
const { supabase } = require('../lib/supabase');
const router = Router();

// GET /api/chat-sessions?planId=xxx — list chat sessions for a plan
router.get('/', async (req, res, next) => {
  try {
    let query = supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });

    if (req.query.planId) {
      query = query.eq('plan_id', req.query.planId);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data.map(toClient));
  } catch (err) { next(err); }
});

// PUT /api/chat-sessions/:planId/:weekNum — upsert a chat session
// weekNum = 0 means full plan scope (null in DB)
router.put('/:planId/:weekNum', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const planId = req.params.planId;
    const weekNum = parseInt(req.params.weekNum, 10) || null;
    const messages = req.body.messages || [];

    const id = `${planId}_w${weekNum || 0}`;

    const { error } = await supabase
      .from('chat_sessions')
      .upsert({
        id,
        user_id: userId,
        plan_id: planId,
        week_num: weekNum,
        messages,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/chat-sessions/:planId/:weekNum — clear a chat session
router.delete('/:planId/:weekNum', async (req, res, next) => {
  try {
    const planId = req.params.planId;
    const weekNum = parseInt(req.params.weekNum, 10) || null;
    const id = `${planId}_w${weekNum || 0}`;

    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Mappers ──────────────────────────────────────────────────────────────────
function toClient(row) {
  return {
    id: row.id,
    planId: row.plan_id,
    weekNum: row.week_num,
    messages: row.messages || [],
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

module.exports = router;
