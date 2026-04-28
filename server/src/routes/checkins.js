/**
 * Weekly check-ins — structured ritual where the rider answers a few
 * questions and Claude proposes plan adjustments.
 *
 * Distinct from server/src/routes/coachCheckin.js which fires post-session
 * pings. Those are unstructured "how did the ride go" reminders. These
 * are a planned weekly conversation: modifications, sessions done +
 * comments, life events coming up, injuries.
 *
 * Routes (all auth except where noted):
 *   GET    /api/checkins/pending            — most recent unresponded check-in for current user
 *   GET    /api/checkins                    — list all (history)
 *   POST   /api/checkins/:id/respond        — submit responses → kicks off Claude → returns suggestions
 *   POST   /api/checkins/:id/dismiss        — rider dismisses; status → 'dismissed'
 *   POST   /api/checkins/:id/apply          — commit one or more suggestions to the plan
 *   POST   /api/checkins/:id/physio-notes   — rider posts physio notes after appointment
 *
 * Admin (auth via /admin) — see server/src/routes/admin.js for /api/admin/checkins.
 */
const express = require('express');
const { supabase } = require('../lib/supabase');
const { sendPushToUser } = require('../lib/pushService');
const {
  detectCrisisInput,
  crisisResourcesPayload,
  sanitiseSuggestions,
} = require('../lib/checkinSafety');
const router = express.Router();

const _fetch = typeof globalThis.fetch === 'function'
  ? globalThis.fetch
  : (() => { const f = require('node-fetch'); return f.default || f; })();

const getAnthropicKey = () => process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || null;
const _claudeModel = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

function uid() {
  return `chk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Mappers ────────────────────────────────────────────────────────────────
function checkinToClient(row) {
  if (!row) return null;
  return {
    id: row.id,
    planId: row.plan_id,
    weekNum: row.week_num,
    status: row.status,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    respondedAt: row.responded_at,
    dismissedAt: row.dismissed_at,
    expiredAt: row.expired_at,
    reminderCount: row.reminder_count,
    inAppPopupDue: !!row.in_app_popup_due,
    responses: row.responses || null,
    suggestions: row.suggestions || null,
    trigger: row.trigger,
    createdAt: row.created_at,
  };
}

// ── GET pending ────────────────────────────────────────────────────────────
// Returns the most recent unresponded check-in (sent or pending, but not
// dismissed/responded/expired). When multiple are pending we return the
// newest only — the spec calls for showing one at a time.
router.get('/pending', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('coach_checkins')
      .select('*')
      .eq('user_id', req.user.id)
      .in('status', ['pending', 'sent'])
      .order('scheduled_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    res.json({ checkin: data?.[0] ? checkinToClient(data[0]) : null });
  } catch (err) { next(err); }
});

// ── GET history ────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('coach_checkins')
      .select('*')
      .eq('user_id', req.user.id)
      .order('scheduled_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ checkins: (data || []).map(checkinToClient) });
  } catch (err) { next(err); }
});

// ── POST /respond ──────────────────────────────────────────────────────────
// Body: { sessionsDone: [activityId, ...], sessionComments: { [activityId]: string },
//         modifications: string, lifeEvents: string,
//         injury: { reported: bool, description?: string, intentToSeePhysio?: bool } }
//
// Side-effects:
//   1. Persists responses on the check-in row
//   2. Calls Claude to propose plan adjustments → stores in suggestions jsonb
//   3. If injury.intentToSeePhysio is true, schedules a 'physio' activity
//      on the plan in the next 7 days (defaults to 3 days out, midday).
//   4. Sets status='responded'
router.post('/:id/respond', async (req, res, next) => {
  try {
    const checkinId = req.params.id;
    const body = req.body || {};

    // Load + ownership check
    const { data: checkin, error } = await supabase
      .from('coach_checkins')
      .select('*')
      .eq('id', checkinId)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!checkin) return res.status(404).json({ error: 'Check-in not found' });
    if (checkin.status === 'responded') {
      return res.status(409).json({ error: 'Already responded', checkin: checkinToClient(checkin) });
    }

    // Persist responses immediately so a Claude failure doesn't lose the
    // rider's input.
    const responses = {
      sessionsDone: Array.isArray(body.sessionsDone) ? body.sessionsDone : [],
      sessionComments: typeof body.sessionComments === 'object' ? body.sessionComments : {},
      modifications: String(body.modifications || ''),
      lifeEvents: String(body.lifeEvents || ''),
      injury: {
        reported: !!body.injury?.reported,
        description: String(body.injury?.description || ''),
        intentToSeePhysio: !!body.injury?.intentToSeePhysio,
      },
      submittedAt: new Date().toISOString(),
    };

    await supabase
      .from('coach_checkins')
      .update({ responses, responded_at: new Date().toISOString(), status: 'responded' })
      .eq('id', checkinId);

    // Schedule a physio activity if the rider said yes. Best-effort:
    // failures here don't fail the whole response.
    if (responses.injury.intentToSeePhysio && checkin.plan_id) {
      try {
        const physioId = `act_physio_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const threeDaysOut = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        await supabase.from('activities').insert({
          id: physioId,
          user_id: req.user.id,
          plan_id: checkin.plan_id,
          // Drop into the current week's day-of-week bucket. The exact
          // calendar day is encoded in created_at as a hint; the rider
          // can edit the day from ActivityDetail if their appointment
          // is scheduled for a different day.
          week: checkin.week_num || 1,
          day_of_week: threeDaysOut.getDay(),
          type: 'physio',
          sub_type: null,
          title: 'Physio appointment',
          description: 'Appointment scheduled following a check-in. Edit time as needed.',
          notes: 'Etapa scheduled this for you. Replace the placeholder with your actual appointment time.',
          duration_mins: 60,
          distance_km: null,
          effort: 'recovery',
          completed: false,
        });
      } catch (e) {
        console.warn('[checkins] physio activity insert failed:', e?.message);
      }
    }

    // Generate suggestions via Claude. Wrapped in try/catch so a Claude
    // outage still returns the persisted responses to the client.
    let suggestions = null;
    try {
      suggestions = await generateSuggestions(req.user.id, checkin, responses);
      await supabase
        .from('coach_checkins')
        .update({ suggestions })
        .eq('id', checkinId);
    } catch (e) {
      console.warn('[checkins] generateSuggestions failed:', e?.message);
    }

    const { data: updated } = await supabase
      .from('coach_checkins')
      .select('*')
      .eq('id', checkinId)
      .maybeSingle();
    res.json({ checkin: checkinToClient(updated) });
  } catch (err) { next(err); }
});

// ── POST /dismiss ──────────────────────────────────────────────────────────
router.post('/:id/dismiss', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('coach_checkins')
      .update({ status: 'dismissed', dismissed_at: new Date().toISOString(), in_app_popup_due: false })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /physio-notes ─────────────────────────────────────────────────────
// Body: { activityId, notes }. Stores notes on the activity, then re-runs
// suggestions on the most recent responded check-in so the plan adapts.
router.post('/:id/physio-notes', async (req, res, next) => {
  try {
    const { activityId, notes } = req.body || {};
    if (!activityId || !notes) return res.status(400).json({ error: 'activityId and notes required' });

    await supabase
      .from('activities')
      .update({ physio_notes: String(notes), completed: true, completed_at: new Date().toISOString() })
      .eq('id', activityId)
      .eq('user_id', req.user.id);

    // Re-run suggestions for this check-in incorporating the physio notes.
    const { data: checkin } = await supabase
      .from('coach_checkins')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (checkin) {
      try {
        const newSuggestions = await generateSuggestions(req.user.id, checkin, {
          ...(checkin.responses || {}),
          physioNotes: String(notes),
        });
        await supabase
          .from('coach_checkins')
          .update({ suggestions: newSuggestions })
          .eq('id', checkin.id);
      } catch (e) {
        console.warn('[checkins] post-physio suggestions failed:', e?.message);
      }
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Suggestions generator ──────────────────────────────────────────────────
// Sends responses + plan context + recent-history context to Claude.
// Strict guardrails:
//   • Coach is NOT a medical professional and must not give medical advice
//   • Injuries always recommend physio
//   • Output is a structured JSON object the client can review + apply
//
// Historical context: we fetch up to the last 3 responded check-ins for
// this user and pass them in as a "previous check-ins" block. This lets
// the coach spot patterns — a recurring knee niggle, repeated Sunday
// bonks, the same life event derailing the same day each week — and
// either (a) flag continuity in the summary or (b) shape the
// suggestions accordingly.
async function generateSuggestions(userId, checkin, responses) {
  // ── Safety gate 1: input screening for crisis language ──────────────
  // Runs BEFORE we burn a Claude call. If matched, we return crisis
  // resources straight away and never invoke the model. The rider gets
  // help, not a coach trying to optimise tempo intervals.
  const crisis = detectCrisisInput(responses);
  if (crisis.matched) {
    console.warn('[checkins] crisis input detected for user', userId, '— skipping suggestions');
    return crisisResourcesPayload();
  }

  const apiKey = getAnthropicKey();
  if (!apiKey) {
    return { fallback: true, message: 'Coach unavailable — please review the plan manually.' };
  }

  // Pull next-week activities so the suggestions reference real session ids.
  const nextWeek = (checkin.week_num || 0) + 1;
  const { data: nextWeekActs } = await supabase
    .from('activities')
    .select('id, week, day_of_week, type, sub_type, title, duration_mins, distance_km, effort')
    .eq('user_id', userId)
    .eq('plan_id', checkin.plan_id)
    .eq('week', nextWeek);

  // Recent check-ins — up to 3 most recent responded, excluding this one.
  // Trimmed to the fields that matter for pattern-spotting; suggestions
  // are kept compact (just summary) so we don't blow the prompt budget.
  const { data: recentCheckins } = await supabase
    .from('coach_checkins')
    .select('id, scheduled_at, week_num, responses, suggestions, status')
    .eq('user_id', userId)
    .eq('status', 'responded')
    .neq('id', checkin.id)
    .order('responded_at', { ascending: false })
    .limit(3);

  const historyBlock = (recentCheckins || []).map(c => ({
    weekNum: c.week_num,
    when: c.scheduled_at,
    sessionsDone: c.responses?.sessionsDone || [],
    sessionComments: c.responses?.sessionComments || {},
    modifications: c.responses?.modifications || '',
    lifeEvents: c.responses?.lifeEvents || '',
    injury: c.responses?.injury || null,
    coachSummary: c.suggestions?.summary || null,
    coachRecommendedPhysio: !!c.suggestions?.physioRecommended,
  }));

  const systemPrompt = `You are an experienced cycling coach reviewing a rider's weekly check-in.

CRITICAL GUARDRAILS — read first:
- You are NOT a doctor or physiotherapist. Never diagnose injuries, prescribe rest periods for medical conditions, suggest exercises for healing, or recommend medication.
- If the rider mentions any injury, pain, or "tweak", your only response on the medical side is: recommend they see a physiotherapist. You can suggest pulling back or skipping rides while they get assessed, but say nothing about treatment.
- Stay in lane: training adjustments only. Volume, intensity, ride days, swap suggestions, recovery placement.

Use the previous check-ins (when present) as context for pattern recognition:
- Recurring complaints (e.g. "right knee twingy" two weeks in a row) → escalate the physio recommendation, don't restart from zero.
- Recurring bonks / fuelling issues → mention it specifically in the summary so the rider sees you're tracking it.
- Same life event derailing the same day each week → adapt the schedule, not just this week's load.
- A clear improvement (e.g. they moved from missing two sessions to all completed) → acknowledge it. Brief, not gushing.
- Don't repeat a suggestion you made last week unless the rider hasn't acted on it.

ANCHOR EVERY SUGGESTION TO THE RIDER'S OWN WORDS:
- Each change.reason MUST quote a short, distinctive phrase from what the rider actually wrote ("you said: 'bonked at km 60'", "you wrote: 'travelling Wed-Fri'"). One quoted phrase per reason, max 12 words. The quote must appear verbatim in the rider's responses (modifications, lifeEvents, sessionComments, or injury.description).
- Do NOT invent reasons. If the rider didn't say something that justifies a change, don't suggest the change.
- The summary should reference at least one quote when the rider provided meaningful free-text. If they answered tersely, keep the summary short and don't over-pattern-match.
- This is non-negotiable. A suggestion without a grounding quote will be discarded server-side.

Your task: review the rider's responses and propose concrete adjustments to NEXT WEEK'S plan.

Output ONLY a JSON object with this shape:
{
  "summary": "1-2 sentence plain-English summary of what you noticed and what you're proposing",
  "physioRecommended": <bool — true if any injury was reported>,
  "changes": [
    {
      "activityId": "<id from next-week list>",
      "kind": "modify" | "skip" | "swap_to_recovery",
      "reason": "1 sentence why",
      "newDurationMins": <number or null>,
      "newDistanceKm": <number or null>,
      "newEffort": "easy" | "moderate" | "hard" | "recovery" | null
    }
  ]
}

If no changes are warranted, return changes: []. Don't pad. Don't speculate.`;

  const userMessage = `Rider's check-in responses (this week):
${JSON.stringify({
  sessionsDone: responses.sessionsDone,
  sessionComments: responses.sessionComments,
  modifications: responses.modifications,
  lifeEvents: responses.lifeEvents,
  injury: responses.injury,
  physioNotes: responses.physioNotes || null,
}, null, 2)}

Previous check-ins (most recent first, ${historyBlock.length} entr${historyBlock.length === 1 ? 'y' : 'ies'}):
${historyBlock.length === 0
  ? 'None — this is the rider\'s first check-in.'
  : JSON.stringify(historyBlock, null, 2)}

Next week's planned activities (week ${nextWeek}):
${JSON.stringify(nextWeekActs || [], null, 2)}

Propose adjustments. Remember: training only — never medical advice. Refer injuries to physio. Use the history to spot patterns and continuity.`;

  const response = await _fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: _claudeModel,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude returned ${response.status}`);
  }
  const data = await response.json();
  const text = data?.content?.[0]?.text || '{}';
  // Strip optional ``` fences if present
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch { parsed = { summary: text.slice(0, 200), changes: [] }; }

  // ── Safety gate 2: drop ungrounded suggestions ──────────────────────
  // The system prompt requires every change.reason to quote the rider's
  // words verbatim. Drop any change whose reason doesn't contain a
  // substring from the rider's actual text — guards against the model
  // hallucinating a reason and the rider then committing the change.
  const riderText = collectRiderText(responses);
  if (Array.isArray(parsed.changes) && riderText) {
    parsed.changes = parsed.changes.filter(c => {
      if (!c?.reason) return false;
      // Allow the change through only if its reason quotes >= 4 consecutive
      // words that appear in the rider's input. Cheap, conservative check
      // — false negatives (dropping a valid change) are recoverable on
      // the next check-in; false positives (keeping a hallucinated change)
      // are not.
      return reasonIsGrounded(c.reason, riderText);
    });
  }

  // ── Safety gate 3: scrub medical drift from any surviving fields ────
  parsed = sanitiseSuggestions(parsed);
  return parsed;
}

// Concatenate all rider free-text into one lowercased blob for grounding
// checks. Includes per-session comments and the injury description.
function collectRiderText(responses) {
  const bits = [];
  if (typeof responses?.modifications === 'string') bits.push(responses.modifications);
  if (typeof responses?.lifeEvents === 'string') bits.push(responses.lifeEvents);
  if (typeof responses?.injury?.description === 'string') bits.push(responses.injury.description);
  if (responses?.sessionComments && typeof responses.sessionComments === 'object') {
    for (const v of Object.values(responses.sessionComments)) {
      if (typeof v === 'string') bits.push(v);
    }
  }
  if (typeof responses?.physioNotes === 'string') bits.push(responses.physioNotes);
  return bits.join(' \u00B7 ').toLowerCase();
}

// True if the reason quotes a 4+ word phrase from the rider's input.
// We strip the reason of common punctuation, lowercase it, and slide a
// 4-gram window across it looking for substring matches in riderText.
function reasonIsGrounded(reason, riderText) {
  if (typeof reason !== 'string' || !riderText) return false;
  const norm = reason.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = norm.split(' ').filter(Boolean);
  if (tokens.length < 4) return false;
  for (let i = 0; i + 4 <= tokens.length; i++) {
    const phrase = tokens.slice(i, i + 4).join(' ');
    if (riderText.includes(phrase)) return true;
  }
  return false;
}

// ── Helper: create a check-in row + send the initial push ──────────────────
// Exported for the cron job and the admin manual-send route.
//
// Skips (returns null) when:
//   • the user has no active plan — there's nothing for the coach to suggest
//     changes to, so a check-in would be wasted.
//   • the user already has a responded/sent/pending check-in for the same
//     plan + week — prevents same-week duplicates after a schedule change.
//
// scheduled_at is the time the check-in was MEANT to fire (now() is fine
// when called from the cron at the rider's scheduled minute, but admin
// manual sends use now() too — that's accurate either way).
async function sendCheckin(userId, { trigger = 'scheduled' } = {}) {
  // Look up the user's active plan. We require an active plan because
  // suggestions are scoped to the next week of activities.
  const { data: plans } = await supabase
    .from('plans')
    .select('id, current_week, weeks, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  const plan = plans?.[0] || null;
  if (!plan) {
    console.log('[checkins] sendCheckin skipped — no active plan for user', userId);
    return null;
  }
  // Don't fire if the rider's plan is already complete (current_week past
  // the plan's total weeks). Surface a different ritual for that ("plan
  // complete, pick a new one") later.
  if (plan.weeks && plan.current_week && plan.current_week > plan.weeks) {
    console.log('[checkins] sendCheckin skipped — plan already complete for user', userId);
    return null;
  }

  // Same-plan, same-week dedupe. Includes responded check-ins so a rider
  // who already answered this week doesn't get a second one if they
  // change their schedule.
  const weekNum = plan.current_week || 1;
  const { data: existing } = await supabase
    .from('coach_checkins')
    .select('id, status')
    .eq('user_id', userId)
    .eq('plan_id', plan.id)
    .eq('week_num', weekNum)
    .in('status', ['pending', 'sent', 'responded'])
    .limit(1);
  if (existing?.length) {
    console.log('[checkins] sendCheckin skipped — already a check-in for week', weekNum, 'user', userId);
    return existing[0].id;
  }

  const id = uid();
  const now = new Date();
  const row = {
    id,
    user_id: userId,
    plan_id: plan.id,
    week_num: weekNum,
    status: 'sent',
    scheduled_at: now.toISOString(),
    sent_at: now.toISOString(),
    trigger,
  };
  const { error } = await supabase.from('coach_checkins').insert(row);
  if (error) throw error;

  await sendPushToUser(userId, {
    title: 'Your weekly check-in',
    body: 'Five quick questions — your coach is ready to tweak next week\'s plan.',
    type: 'weekly_checkin',
    data: { checkinId: id, planId: plan.id, scope: 'checkin' },
  });

  return id;
}

// ── Schedule prefs ─────────────────────────────────────────────────────────
// Mounted by index.js on its own path so `/api/checkin-prefs` is short and
// memorable. Returns sensible defaults when the row doesn't exist yet so
// the client can render the picker without an extra round-trip.
const prefsRouter = express.Router();
prefsRouter.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('user_checkin_prefs')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (error) throw error;
    res.json({
      enabled: !!(data?.enabled),
      dayOfWeek: data?.day_of_week ?? 0,
      timeOfDay: data?.time_of_day || '18:00',
      timezone: data?.timezone || 'UTC',
    });
  } catch (err) { next(err); }
});
prefsRouter.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    // Validate timezone against the IANA list. Falls back to UTC if the
    // device sent something unexpected. The client passes the device's
    // current timezone on every save (see SettingsScreen), so this row
    // tracks the rider as they travel — fires at 18:00 local wherever
    // they are, not where they originally configured.
    let tz = String(b.timezone || 'UTC').slice(0, 64);
    try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); }
    catch { tz = 'UTC'; }
    const row = {
      user_id: req.user.id,
      enabled: !!b.enabled,
      day_of_week: Math.max(0, Math.min(6, Number(b.dayOfWeek ?? 0))),
      time_of_day: String(b.timeOfDay || '18:00').slice(0, 5),
      timezone: tz,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('user_checkin_prefs')
      .upsert(row, { onConflict: 'user_id' });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.sendCheckin = sendCheckin;
router.prefsRouter = prefsRouter;
module.exports = router;
