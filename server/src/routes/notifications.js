/**
 * Notification routes — push token registration, notification listing, read status.
 */
const express = require('express');
const { supabase } = require('../lib/supabase');
const router = express.Router();

// ── Slack helper ──────────────────────────────────────────────────────────────
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || process.env.SLACK_SUBSCRIPTIONS_WEBHOOK_URL;

async function notifySlack(text) {
  if (!SLACK_WEBHOOK_URL) {
    console.warn('[notifications slack] No SLACK_WEBHOOK_URL configured — skipping notification');
    return;
  }
  try {
    const _fetch = typeof globalThis.fetch === 'function'
      ? globalThis.fetch
      : (() => { const f = require('node-fetch'); return f.default || f; })();
    const resp = await _fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!resp.ok) {
      console.error('[notifications slack] Webhook returned', resp.status, await resp.text().catch(() => ''));
    } else {
      console.log('[notifications slack] Sent:', text.slice(0, 80));
    }
  } catch (err) {
    console.error('[notifications slack] Failed to notify:', err.message);
  }
}

// ── POST /api/notifications/register-token ──────────────────────────────────
// Register or refresh an Expo push token for the authenticated user
router.post('/register-token', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });

    // Check if this user has registered any tokens before — if not, it's a new signup
    const { count: existingCount, error: countError } = await supabase
      .from('push_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (countError) console.error('[notifications] push_tokens count error:', countError);

    // Primary check: no existing push tokens
    let isNewUser = (existingCount || 0) === 0;

    // Fallback: if the user's auth account was created within the last 5 minutes,
    // treat as new even if push_tokens check was unreliable
    if (!isNewUser) {
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(userId);
        if (user?.created_at) {
          const ageMs = Date.now() - new Date(user.created_at).getTime();
          if (ageMs < 5 * 60 * 1000) isNewUser = true; // created < 5 min ago
        }
      } catch {}
    }

    console.log(`[notifications] register-token userId=${userId.slice(0, 8)}… existingCount=${existingCount} isNewUser=${isNewUser}`);

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

    // Notify Slack about the new signup (fire-and-forget, don't block response)
    if (isNewUser) {
      const email = req.user?.email || userId;
      const platformLabel = (platform || 'ios').toUpperCase();
      notifySlack(`🎉 *New sign-up* — ${email} just joined on ${platformLabel}`);
    }

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
// Accepts an optional ?type=coach_reply (or comma-separated list) to scope
// the count to specific notification types. Used by the Home screen's
// coach card to show a "1" badge only when there's a new coach reply —
// not every unread system notification.
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (req.query.type) {
      const types = String(req.query.type).split(',').map(s => s.trim()).filter(Boolean);
      if (types.length === 1) query = query.eq('type', types[0]);
      else if (types.length > 1) query = query.in('type', types);
    }

    // Optional scope exclusion. The home-screen coach card asks for
    // `?excludeScope=session` so coach replies from a session-scoped
    // chat (i.e. the rider asked about one specific ride) don't bump
    // the home chip — the notification still exists, just doesn't
    // pull focus from the main coach thread. Stored under data->>scope
    // by sendPushToUser when scope === 'session'.
    if (req.query.excludeScope) {
      const exclude = String(req.query.excludeScope).split(',').map(s => s.trim()).filter(Boolean);
      // PostgREST `not` filter on a jsonb path
      for (const s of exclude) {
        query = query.or(`data->>scope.is.null,data->>scope.neq.${s}`);
      }
    }

    const { count, error } = await query;

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
// Accepts optional ?type=coach_reply (or comma list) to only mark
// notifications of that type as read. CoachChatScreen calls this on
// mount with type=coach_reply so opening the chat clears the Home
// badge without also dismissing other pending system notifications.
router.patch('/read-all', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    let query = supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (req.query.type) {
      const types = String(req.query.type).split(',').map(s => s.trim()).filter(Boolean);
      if (types.length === 1) query = query.eq('type', types[0]);
      else if (types.length > 1) query = query.in('type', types);
    }

    const { error } = await query;

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications] Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// ── POST /api/notifications/test ────────────────────────────────────────────
// User-initiated test push so they can self-diagnose whether notifications
// are reaching their device. Fires sendPushToUser with a test payload,
// returns the resulting { sent, notificationId, activeTokens } so the
// client Settings row can say "not reaching you — registration issue" vs
// "push was sent, check your device's DnD / Focus modes".
router.post('/test', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { count: activeTokens } = await supabase
      .from('push_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('active', true);

    const { sendPushToUser } = require('../lib/pushService');
    const result = await sendPushToUser(userId, {
      title: 'Push check',
      body: 'If you see this, notifications are working.',
      type: 'system',
      data: { test: true },
    });

    res.json({ ...result, activeTokens: activeTokens || 0 });
  } catch (err) {
    console.error('[notifications] Test push error:', err);
    res.status(500).json({ error: 'Failed to send test push', detail: err?.message });
  }
});

module.exports = router;
