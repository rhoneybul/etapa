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

    // Return defaults if no row exists yet. New users default to the
    // weekly cadence — the per-session "after_session" check-in has
    // been retired in favour of the structured weekly check-in flow.
    res.json(data || {
      user_id: userId,
      coach_checkin: 'weekly',
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
      // 'after_session' is retired — old clients sending it get
      // silently mapped to 'weekly' so a stale binary doesn't 400 on
      // every settings save. Once enough users have updated, we can
      // tighten this to a hard 400 again.
      const incoming = coach_checkin === 'after_session' ? 'weekly' : coach_checkin;
      const valid = ['weekly', 'none'];
      if (!valid.includes(incoming)) {
        return res.status(400).json({ error: `coach_checkin must be one of: ${valid.join(', ')}` });
      }
      updates.coach_checkin = incoming;
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
