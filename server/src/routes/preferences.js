/**
 * User preferences routes — notification settings, coach check-in frequency.
 */
const express = require('express');
const { supabase } = require('../lib/supabase');
const { notifyNewUserOnce } = require('../lib/userLifecycle');
const router = express.Router();

// ── GET /api/preferences ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    // Return defaults if no row exists yet
    res.json(data || {
      user_id: userId,
      coach_checkin: 'after_session',
      push_enabled: true,
    });
  } catch (err) {
    console.error('[preferences] Get error:', err);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// ── PUT /api/preferences ────────────────────────────────────────────────────
router.put('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { coach_checkin, push_enabled, display_name, onboarding_done } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (coach_checkin !== undefined) {
      const valid = ['after_session', 'weekly', 'none'];
      if (!valid.includes(coach_checkin)) {
        return res.status(400).json({ error: `coach_checkin must be one of: ${valid.join(', ')}` });
      }
      updates.coach_checkin = coach_checkin;
    }
    if (push_enabled !== undefined) {
      updates.push_enabled = !!push_enabled;
    }
    if (display_name !== undefined) {
      updates.display_name = (display_name || '').slice(0, 100); // sanitise length
    }
    if (onboarding_done !== undefined) {
      updates.onboarding_done = !!onboarding_done;
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;

    // First-touch Slack ping. Idempotent — fires once per user across
    // all paths that call notifyNewUserOnce. Particularly useful for
    // riders who declined push permissions and so never hit
    // /api/notifications/register-token.
    notifyNewUserOnce(userId, req.user?.email, 'preferences').catch(() => {});

    res.json(data);
  } catch (err) {
    console.error('[preferences] Update error:', err);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

module.exports = router;
