/**
 * Push notification service — sends notifications via Expo Push API.
 * Also persists to the notifications table for in-app display.
 *
 * Expo Push API docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */
const { supabase } = require('../lib/supabase');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification to a specific user.
 * @param {string} userId - Supabase user ID
 * @param {object} notification - { title, body, data, type }
 * @returns {object} - { sent: boolean, notificationId: string }
 */
async function sendPushToUser(userId, { title, body, data = {}, type = 'system' }) {
  // 1. Persist to notifications table (always, even if push fails)
  const notificationId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { error: dbError } = await supabase.from('notifications').insert({
    id: notificationId,
    user_id: userId,
    type,
    title,
    body,
    data,
    read: false,
  });

  if (dbError) {
    console.error('[push] Failed to persist notification:', dbError);
  }

  // 2. Get user's active push tokens
  const { data: tokens, error: tokenError } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId)
    .eq('active', true);

  if (tokenError || !tokens?.length) {
    console.log(`[push] No active push tokens for user ${userId}`);
    return { sent: false, notificationId };
  }

  // 3. Send via Expo Push API
  const messages = tokens.map(t => ({
    to: t.token,
    sound: 'default',
    title,
    body,
    data: { ...data, notificationId, type },
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    const result = await res.json();
    console.log(`[push] Sent ${messages.length} notification(s) to user ${userId}:`, result.data?.map(r => r.status));

    // Handle invalid tokens (mark as inactive)
    if (result.data) {
      for (let i = 0; i < result.data.length; i++) {
        const ticket = result.data[i];
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          await supabase
            .from('push_tokens')
            .update({ active: false, updated_at: new Date().toISOString() })
            .eq('token', tokens[i].token);
          console.log(`[push] Deactivated invalid token for user ${userId}`);
        }
      }
    }

    return { sent: true, notificationId };
  } catch (err) {
    console.error('[push] Expo push API error:', err);
    return { sent: false, notificationId };
  }
}

/**
 * Send push notifications to multiple users.
 */
async function sendPushToUsers(userIds, notification) {
  const results = await Promise.allSettled(
    userIds.map(userId => sendPushToUser(userId, notification))
  );
  return results.map((r, i) => ({
    userId: userIds[i],
    ...(r.status === 'fulfilled' ? r.value : { sent: false, error: r.reason?.message }),
  }));
}

module.exports = { sendPushToUser, sendPushToUsers };
