const { Router } = require('express');
const { supabase } = require('../lib/supabase');
const router = Router();

// GET /api/users/me — return the authenticated user's profile
router.get('/me', (req, res) => {
  res.json({
    id:    req.user.id,
    email: req.user.email,
    name:  req.user.user_metadata?.full_name || req.user.user_metadata?.name || null,
  });
});

// DELETE /api/users/me — permanently delete the authenticated user's account and all data
router.delete('/me', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const email = req.user.email;

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
    ];

    const deletionResults = {};
    for (const table of tables) {
      const { error, count } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .eq('user_id', userId);
      deletionResults[table] = error ? `error: ${error.message}` : (count || 0);
    }

    // Delete the auth user from Supabase
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.error(`[users] Failed to delete auth user ${userId}:`, authDeleteError.message);
      return res.status(500).json({
        error: 'Data deleted but failed to remove auth user. Please contact support.',
        details: authDeleteError.message,
      });
    }

    console.log(`[users] Account deleted: ${userId} (${email})`, deletionResults);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
