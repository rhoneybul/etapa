/**
 * Notification routes — push token registration, notification listing, read status.
 */
const express = require('express');
const { supabase } = require('../lib/supabase');
const router = express.Router();

// ── POST /api/notifications/register-token ──────────────────────────────────
// Register or refresh an Expo push token for the authenticated user
router.post('/register-token', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });

    const tokenId = `pt_${userId.slice(0, 8)}_${Buffer.from(token).toString('base64').slice(0, 12)}`;

    const { error } = await supabase.from('push_tokens').upsert({
      id: tokenId,
      user_id: userId,
      token,
      platform: platform || 'ios',
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,token' });

    if (error) {
      // If unique constraint conflict, try update instead
      if (error.code === '23505') {
        await supabase.from('push_tokens')
          .update({ active: true, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('token', token);
      } else {
        console.error('[notifications] Token registration error:', error);
        return res.status(500).json({ error: 'Failed to register token' });
      }
    }

    // Also ensure user_preferences row exists
    await supabase.from('user_preferences').upsert({
      user_id: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications] Register token error:', err);
    res.status(500).json({ error: 'Failed to register token' });
  }
});

// ── GET /api/notifications ──────────────────────────────────────────────────
// List notifications for the authenticated user (most recent first)
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error('[notifications] List error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// ── GET /api/notifications/unread-count ─────────────────────────────────────
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) throw error;

    res.json({ count: count || 0 });
  } catch (err) {
    console.error('[notifications] Unread count error:', err);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// ── PATCH /api/notifications/:id/read ───────────────────────────────────────
router.patch('/:id/read', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', req.params.id)
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications] Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// ── PATCH /api/notifications/read-all ───────────────────────────────────────
router.patch('/read-all', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications] Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

module.exports = router;
