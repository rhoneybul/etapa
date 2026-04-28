/**
 * Weekly check-ins cron sweep.
 *
 * Public route guarded by CRON_SECRET — Railway / Supabase cron should
 * hit this every 30 minutes. Two responsibilities:
 *
 *   1. Fire scheduled check-ins. For each user with enabled prefs whose
 *      next scheduled time falls inside the previous 30-minute window,
 *      create a coach_checkins row + push notification. We don't try to
 *      compute "next scheduled" precisely — instead we look at the user's
 *      day_of_week + time_of_day and compare to "now" in their timezone,
 *      tolerating a 30-minute slop.
 *
 *   2. Send reminder pushes for already-sent check-ins. Cadence per spec:
 *      • +12h after sent_at → reminder #1 (if reminder_count < 1)
 *      • +24h after sent_at → reminder #2 (if reminder_count < 2)
 *      • +48h after sent_at → set in_app_popup_due = true, status stays 'sent'
 *      • +14 days → status → 'expired'
 *
 * Idempotent — running twice in the same window won't double-send because
 * we check the day_of_week + most-recent-checkin window.
 */
const express = require('express');
const { supabase } = require('../lib/supabase');
const { sendPushToUser } = require('../lib/pushService');
const checkinsRouter = require('./checkins');
const router = express.Router();

const CRON_SECRET = process.env.CRON_SECRET;

function authed(req) {
  if (!CRON_SECRET) return false;
  const h = req.headers.authorization || '';
  return h === `Bearer ${CRON_SECRET}`;
}

// Compute the rider's "current local moment" given an IANA timezone.
// Returns { dow: 0-6, hh: 0-23, mm: 0-59 }. Falls back to UTC if the tz
// is invalid or missing.
function localNow(tz) {
  const now = new Date();
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'UTC',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const dowStr = parts.find(p => p.type === 'weekday')?.value || 'Sun';
    const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const hh = Number(parts.find(p => p.type === 'hour')?.value || 0);
    const mm = Number(parts.find(p => p.type === 'minute')?.value || 0);
    return { dow: dowMap[dowStr] ?? 0, hh, mm };
  } catch {
    return { dow: now.getUTCDay(), hh: now.getUTCHours(), mm: now.getUTCMinutes() };
  }
}

// "Now" minus N minutes ISO. Used for the dedupe-window check.
function isoMinutesAgo(min) {
  return new Date(Date.now() - min * 60 * 1000).toISOString();
}

// ── Pure sweep function ──────────────────────────────────────────────────
// Runs the same logic as POST /sweep but without an HTTP boundary. Called
// directly by the in-process scheduler in server/src/index.js so we don't
// need a separate Railway cron service. Returns the per-run summary so
// the HTTP handler below can echo it back to admin / cron callers.
async function runSweep() {
  const summary = { fired: 0, reminded12h: 0, reminded24h: 0, popupSet: 0, expired: 0 };
  try {
    // ── Fire scheduled check-ins ─────────────────────────────────────────
    const { data: prefs } = await supabase
      .from('user_checkin_prefs')
      .select('*')
      .eq('enabled', true);
    for (const p of (prefs || [])) {
      const local = localNow(p.timezone);
      if (local.dow !== p.day_of_week) continue;
      const [targetHH, targetMM] = String(p.time_of_day || '18:00').split(':').map(n => parseInt(n, 10) || 0);
      // 30-minute window centred on the target time
      const minutesFromTarget = (local.hh * 60 + local.mm) - (targetHH * 60 + targetMM);
      if (Math.abs(minutesFromTarget) > 30) continue;

      // De-dupe: skip if we already sent a check-in to this user in the
      // last 12 hours (covers same-day double-fires from two cron runs).
      const { data: recent } = await supabase
        .from('coach_checkins')
        .select('id')
        .eq('user_id', p.user_id)
        .gte('scheduled_at', isoMinutesAgo(12 * 60))
        .limit(1);
      if (recent?.length) continue;

      try {
        await checkinsRouter.sendCheckin(p.user_id);
        summary.fired += 1;
      } catch (e) {
        console.warn('[checkins-cron] sendCheckin failed:', p.user_id, e?.message);
      }
    }

    // ── Reminder cadence on already-sent check-ins ────────────────────────
    const cutoff14d = isoMinutesAgo(14 * 24 * 60);
    const { data: pending } = await supabase
      .from('coach_checkins')
      .select('*')
      .in('status', ['sent', 'pending'])
      .gte('sent_at', cutoff14d);

    for (const ci of (pending || [])) {
      if (!ci.sent_at) continue;
      const elapsedMin = (Date.now() - new Date(ci.sent_at).getTime()) / 60000;

      // +14 days → expire
      if (elapsedMin > 14 * 24 * 60) {
        await supabase
          .from('coach_checkins')
          .update({ status: 'expired', expired_at: new Date().toISOString() })
          .eq('id', ci.id);
        summary.expired += 1;
        continue;
      }

      // +48h → in-app popup due (next launch will surface the popup)
      if (elapsedMin >= 48 * 60 && !ci.in_app_popup_due) {
        await supabase
          .from('coach_checkins')
          .update({ in_app_popup_due: true })
          .eq('id', ci.id);
        summary.popupSet += 1;
      }

      // +24h push (reminder_count goes 1 → 2)
      if (elapsedMin >= 24 * 60 && (ci.reminder_count || 0) < 2) {
        try {
          await sendPushToUser(ci.user_id, {
            title: 'Still got 2 minutes for your check-in?',
            body: 'Five quick questions and your coach can shape next week.',
            type: 'weekly_checkin',
            data: { checkinId: ci.id, planId: ci.plan_id, scope: 'checkin' },
          });
          await supabase
            .from('coach_checkins')
            .update({ reminder_count: 2 })
            .eq('id', ci.id);
          summary.reminded24h += 1;
        } catch (e) { console.warn('[checkins-cron] reminder24h failed:', e?.message); }
        continue;
      }

      // +12h push (reminder_count 0 → 1)
      if (elapsedMin >= 12 * 60 && (ci.reminder_count || 0) < 1) {
        try {
          await sendPushToUser(ci.user_id, {
            title: 'Your check-in\'s waiting',
            body: 'Five quick questions when you have a moment.',
            type: 'weekly_checkin',
            data: { checkinId: ci.id, planId: ci.plan_id, scope: 'checkin' },
          });
          await supabase
            .from('coach_checkins')
            .update({ reminder_count: 1 })
            .eq('id', ci.id);
          summary.reminded12h += 1;
        } catch (e) { console.warn('[checkins-cron] reminder12h failed:', e?.message); }
      }
    }

    return summary;
  } catch (err) {
    console.error('[checkins-cron] sweep failed:', err);
    throw err;
  }
}

// HTTP wrapper around runSweep. Kept around for admin / external cron
// invocations (Railway cron service, cron-job.org, etc.) so the in-process
// scheduler isn't the only path. Auth via CRON_SECRET, same as before.
router.post('/sweep', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'Unauthorised' });
  try {
    const summary = await runSweep();
    res.json({ ok: true, summary });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Sweep failed' });
  }
});

// Admin manual-send endpoint. Body: { userId }. Auth via CRON_SECRET or
// the admin router (the latter is mounted in admin.js and forwards here).
router.post('/admin-send', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'Unauthorised' });
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const id = await checkinsRouter.sendCheckin(userId, { trigger: 'manual' });
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Send failed' });
  }
});

router.runSweep = runSweep;
module.exports = router;
