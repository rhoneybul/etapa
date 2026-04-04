/**
 * Coach check-in routes — sends AI-generated post-session messages.
 *
 * POST /api/coach-checkin/run — trigger a check-in run (called by cron or admin)
 *   Finds activities completed yesterday, generates personalised coach messages,
 *   and sends them as push notifications.
 *
 * The user's notification preference (after_session | weekly | none) controls behaviour:
 *   - after_session: notified the day after each completed session
 *   - weekly: receives a single weekly summary (runs on Mondays)
 *   - none: no check-ins
 */
const express = require('express');
const { supabase } = require('../lib/supabase');
const { sendPushToUser } = require('../lib/pushService');
const router = express.Router();

const _fetch = typeof globalThis.fetch === 'function'
  ? globalThis.fetch
  : (() => { const f = require('node-fetch'); return f.default || f; })();

const getAnthropicKey = () => process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || null;

// Coach personas (subset — just names and styles for check-in messages)
const COACHES = {
  clara:  { name: 'Clara', style: 'warm and encouraging, uses simple language, celebrates small wins' },
  lars:   { name: 'Lars', style: 'direct and honest, short punchy sentences, expects discipline' },
  sophie: { name: 'Sophie', style: 'methodical and educational, references training science' },
  matteo: { name: 'Matteo', style: 'calm and balanced, philosophical, uses metaphors' },
  elena:  { name: 'Elena', style: 'passionate and race-focused, high energy' },
  tom:    { name: 'Tom', style: 'chatty and friendly, casual British humour' },
};

/**
 * Generate a personalised coach check-in message using Claude.
 * @param {string} coach - coach ID
 * @param {object} activity - the completed activity from yesterday
 * @param {object|null} nextActivity - the next scheduled (uncompleted) activity, if any
 * @param {boolean} isWeekly - weekly digest mode
 */
async function generateCheckinMessage(coach, activity, nextActivity = null, isWeekly = false) {
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    // Fallback template if no API key
    return isWeekly
      ? `How was your week of training? Let me know if you need any adjustments to your plan.`
      : `How did your ${activity.title || 'session'} go? Let me know if you need any adjustments.`;
  }

  const coachInfo = COACHES[coach] || COACHES.matteo;

  let nextActivityBlock = '';
  if (nextActivity) {
    nextActivityBlock = `
Their next scheduled session is:
- Title: ${nextActivity.title}
- Type: ${nextActivity.type}${nextActivity.sub_type ? ` (${nextActivity.sub_type})` : ''}
- Duration: ${nextActivity.duration_mins ? `${nextActivity.duration_mins} minutes` : 'TBD'}
- Distance: ${nextActivity.distance_km ? `${nextActivity.distance_km} km` : 'N/A'}
- Effort: ${nextActivity.effort || 'moderate'}
${nextActivity.description ? `- Description: ${nextActivity.description.slice(0, 200)}` : ''}`;
  }

  const prompt = isWeekly
    ? `You are ${coachInfo.name}, a cycling coach. Your style: ${coachInfo.style}.
Write a brief, friendly weekly check-in message (2-3 sentences max) asking how their week of training went and if they need any help. Keep it natural and in character. No emojis. No greeting — jump straight in.`
    : `You are ${coachInfo.name}, a cycling coach. Your style: ${coachInfo.style}.

The rider completed this session yesterday:
- Title: ${activity.title}
- Type: ${activity.type}${activity.sub_type ? ` (${activity.sub_type})` : ''}
- Duration: ${activity.duration_mins ? `${activity.duration_mins} minutes` : 'Unknown'}
- Effort: ${activity.effort || 'moderate'}
${activity.description ? `- Description: ${activity.description.slice(0, 200)}` : ''}
${nextActivityBlock}
Write a brief, personalised check-in message (3-4 sentences). First, ask specifically about the session they completed — reference the session by name, ask how their legs felt, if the effort level was right, etc. ${nextActivity ? `Then briefly mention what\'s coming next ("${nextActivity.title}") and offer a quick tip to prepare — pacing, nutrition, recovery, whatever fits.` : 'Then ask if they need any adjustments to their plan.'} Keep it natural and in character. No emojis. No greeting — jump straight in.`;

  try {
    const res = await _fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const json = await res.json();
    const text = json.content?.[0]?.text?.trim();
    if (text) return text;
  } catch (err) {
    console.error('[coach-checkin] AI generation error:', err);
  }

  // Fallback
  return isWeekly
    ? `How was your week of training? Let me know if you need any adjustments.`
    : `How did your ${activity.title || 'session'} go yesterday? Let me know if anything needs tweaking.`;
}

// ── POST /api/coach-checkin/run — trigger check-in processing ───────────────
// Protected by CRON_SECRET or admin auth
router.post('/run', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  const apiKey = process.env.ADMIN_API_KEY;

  const isAuthorized =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (apiKey && authHeader === `Bearer ${apiKey}`);

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date();
  const isMonday = now.getDay() === 1;

  try {
    // Get all user preferences
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('user_id, coach_checkin')
      .neq('coach_checkin', 'none');

    if (!prefs?.length) {
      return res.json({ sent: 0, message: 'No users with check-ins enabled' });
    }

    let sentCount = 0;

    for (const pref of prefs) {
      try {
        // Weekly users only get notified on Mondays
        if (pref.coach_checkin === 'weekly' && !isMonday) continue;

        // Find the user's most recent completed activity
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        const query = supabase
          .from('activities')
          .select('*, plans!inner(config_id)')
          .eq('user_id', pref.user_id)
          .eq('completed', true);

        if (pref.coach_checkin === 'after_session') {
          // Completed yesterday
          query.gte('completed_at', yesterday.toISOString())
               .lt('completed_at', today.toISOString());
        } else {
          // Weekly: completed in last 7 days
          const weekAgo = new Date(now);
          weekAgo.setDate(weekAgo.getDate() - 7);
          query.gte('completed_at', weekAgo.toISOString());
        }

        const { data: activities } = await query
          .order('completed_at', { ascending: false })
          .limit(1);

        if (!activities?.length) continue;

        const activity = activities[0];

        // Get coach ID from the plan config
        let coachId = 'matteo';
        if (activity.plans?.config_id) {
          const { data: config } = await supabase
            .from('plan_configs')
            .select('coach_id')
            .eq('id', activity.plans.config_id)
            .maybeSingle();
          if (config?.coach_id) coachId = config.coach_id;
        }

        // Find the next upcoming (uncompleted) activity in the same plan
        let nextActivity = null;
        if (activity.plan_id) {
          const { data: upcoming } = await supabase
            .from('activities')
            .select('title, type, sub_type, duration_mins, distance_km, effort, description, day_of_week, week')
            .eq('plan_id', activity.plan_id)
            .eq('completed', false)
            .order('week', { ascending: true })
            .order('day_of_week', { ascending: true })
            .limit(1);
          if (upcoming?.length) nextActivity = upcoming[0];
        }

        const coachInfo = COACHES[coachId] || COACHES.matteo;
        const isWeekly = pref.coach_checkin === 'weekly';
        const body = await generateCheckinMessage(coachId, activity, nextActivity, isWeekly);

        // Insert the check-in message into the plan-level coach chat session
        // so it appears in the global coach chat next time the user opens it.
        const planId = activity.plan_id;

        // Only save to chat_sessions if we have a valid plan_id — the FK
        // constraint requires it to reference an existing row in plans.
        if (planId) {
          const sessionId = `${planId}_w0`; // weekNum=0 means full plan scope

          const { data: existingSession } = await supabase
            .from('chat_sessions')
            .select('messages')
            .eq('id', sessionId)
            .maybeSingle();

          const existingMessages = existingSession?.messages || [];
          const checkinMessage = {
            role: 'assistant',
            content: body,
            ts: Date.now(),
            checkin: true, // flag so the UI can style it differently if needed
          };

          const { error: upsertErr } = await supabase
            .from('chat_sessions')
            .upsert({
              id: sessionId,
              user_id: pref.user_id,
              plan_id: planId,
              week_num: null,
              messages: [...existingMessages, checkinMessage],
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

          if (upsertErr) {
            // FK violation or other DB error — log but don't block the push
            console.error(`[coach-checkin] chat_sessions upsert failed for plan ${planId}:`, upsertErr.message);
          }
        }

        // Also send a push notification so the user knows about it
        await sendPushToUser(pref.user_id, {
          title: `${coachInfo.name} checked in`,
          body,
          type: 'coach_checkin',
          data: { coachId, activityId: activity.id, planId },
        });

        sentCount++;
      } catch (err) {
        console.error(`[coach-checkin] Error for user ${pref.user_id}:`, err);
      }
    }

    res.json({ sent: sentCount, total: prefs.length });
  } catch (err) {
    console.error('[coach-checkin] Run error:', err);
    res.status(500).json({ error: 'Failed to run check-ins' });
  }
});

module.exports = router;
