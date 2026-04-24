/**
 * Coach-chat-job reaper.
 *
 * `coach_chat_jobs` rows can get stuck at status='running' when:
 *
 *   1. The server restarts mid-call. The in-memory `coachChatJobs` Map gets
 *      wiped; the DB row was only ever going to be flipped to a terminal
 *      status inside the wrapping try/catch, which never fires.
 *   2. The Claude fetch hangs past the AbortController timeout without the
 *      catch branch writing a failure for some reason (network weirdness,
 *      server OOM kill mid-update, etc.).
 *
 * Same belt-and-braces pattern as planGenReaper — every N minutes we find
 * rows older than STALE_AFTER_MS still 'running' and mark them failed. The
 * client polling loop then transitions to an error state and the user
 * gets a "message timed out, tap to retry" chip instead of an infinite
 * spinner.
 *
 * Timeout choice: coach chat's Claude call is hard-capped at 60s server-side
 * (see runCoachChatJob). We pad to 3 minutes here to cover DB writes, SSE
 * cleanup, and any retry inside the handler — anything older than that is
 * definitively dead.
 */

const { supabase } = require('./supabase');

const STALE_AFTER_MS = 3 * 60 * 1000;   // 3 minutes
const SWEEP_INTERVAL_MS = 2 * 60 * 1000; // sweep every 2 minutes

let sweepTimer = null;

/**
 * Mark any `running` or `pending` rows older than STALE_AFTER_MS as failed.
 * Returns the count of rows flipped so the caller can log it.
 */
async function reapStuckCoachJobs({ coachChatJobs = null, now = Date.now() } = {}) {
  const cutoff = new Date(now - STALE_AFTER_MS).toISOString();

  try {
    const { data: stuck, error: selectErr } = await supabase
      .from('coach_chat_jobs')
      .select('id, job_id, user_id, created_at, status')
      .in('status', ['pending', 'running'])
      .lt('created_at', cutoff);

    if (selectErr) {
      console.warn('[coach-chat-reaper] select failed:', selectErr.message);
      return { reaped: 0, error: selectErr.message };
    }
    if (!stuck || stuck.length === 0) return { reaped: 0 };

    let reaped = 0;
    for (const row of stuck) {
      const durationMs = row.created_at ? now - new Date(row.created_at).getTime() : null;
      const { error: updErr } = await supabase
        .from('coach_chat_jobs')
        .update({
          status: 'failed',
          error: `Job exceeded ${Math.round(STALE_AFTER_MS / 1000)}s without finishing — server likely restarted or the Claude call hung. Auto-reaped.`,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .in('status', ['pending', 'running']); // race guard
      if (!updErr) reaped++;
    }

    // Sync any in-memory jobs so a late poll reports failed consistently.
    if (coachChatJobs && typeof coachChatJobs.get === 'function') {
      for (const row of stuck) {
        if (!row.job_id) continue;
        const job = coachChatJobs.get(row.job_id);
        if (job && (job.status === 'pending' || job.status === 'running')) {
          job.status = 'failed';
          job.error = 'Message timed out — please try again.';
        }
      }
    }

    if (reaped > 0) {
      console.log(`[coach-chat-reaper] Reaped ${reaped}/${stuck.length} stuck job(s).`);
    }
    return { reaped };
  } catch (err) {
    console.warn('[coach-chat-reaper] threw:', err?.message);
    return { reaped: 0, error: err?.message };
  }
}

function startCoachChatReaper({ coachChatJobs = null } = {}) {
  if (sweepTimer) clearInterval(sweepTimer);
  reapStuckCoachJobs({ coachChatJobs }).catch((e) =>
    console.warn('[coach-chat-reaper] initial sweep threw:', e?.message)
  );
  sweepTimer = setInterval(() => {
    reapStuckCoachJobs({ coachChatJobs }).catch((e) =>
      console.warn('[coach-chat-reaper] scheduled sweep threw:', e?.message)
    );
  }, SWEEP_INTERVAL_MS);
  if (sweepTimer.unref) sweepTimer.unref();
  console.log(`[coach-chat-reaper] Started — stale threshold ${Math.round(STALE_AFTER_MS / 1000)}s, sweep every ${Math.round(SWEEP_INTERVAL_MS / 1000)}s.`);
}

function stopCoachChatReaper() {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

module.exports = {
  reapStuckCoachJobs,
  startCoachChatReaper,
  stopCoachChatReaper,
  STALE_AFTER_MS,
  SWEEP_INTERVAL_MS,
};
