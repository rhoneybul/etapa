/**
 * Plan-generation reaper.
 *
 * `plan_generations` rows can get stuck at status='running' when:
 *
 *   1. The server restarts mid-job. planJobs is an in-memory Map — a deploy
 *      or crash wipes it, but the DB row was only flipped to a terminal
 *      status inside runAsyncGeneration's try/catch, which never got to run.
 *   2. The Claude fetch hangs longer than any reasonable retry. The old code
 *      had no timeout, so a dropped connection would leave the job "running"
 *      until the user closes the app.
 *
 * The reaper is the belt-and-braces safety net: every N minutes (and once on
 * boot) it finds rows older than STALE_AFTER_MS that are still 'running' and
 * marks them failed. The app polling loop will then transition out of the
 * loading screen into an error state instead of showing a creeping progress
 * bar forever.
 *
 * Also flips any in-memory planJobs that are still 'running' but whose DB
 * row we just reaped — keeps the two views of the world consistent so a
 * late-arriving poll (race) doesn't see 'running' in memory but 'failed' in
 * Postgres.
 */

const { supabase } = require('./supabase');

// Belt-and-braces safety net for jobs that genuinely won't return.
// Must always be larger than runAsyncGeneration's ABSOLUTE_TIMEOUT_MS
// (10 min) by enough margin to cover post-processing, retry, and DB
// writes — otherwise we kill streaming jobs that are still producing
// tokens correctly. Apr 27 2026: bumped 5min → 15min to track the
// new 10min Claude call ceiling. Sonnet 4.6 + 32K cap takes 6-7 min
// on 12-week × 9-session plans; the streaming call's own absolute
// abort fires first if anything ACTUALLY hangs.
const STALE_AFTER_MS = 15 * 60 * 1000;  // 15 minutes
const SWEEP_INTERVAL_MS = 2 * 60 * 1000;  // every 2 minutes

let sweepTimer = null;

/**
 * Mark any `running` rows older than STALE_AFTER_MS as failed. Returns the
 * count of rows flipped so the caller can log it.
 */
async function reapStuckGenerations({ planJobs = null, now = Date.now() } = {}) {
  const cutoff = new Date(now - STALE_AFTER_MS).toISOString();

  try {
    // Find rows that look stuck. We keep the query narrow so it stays cheap
    // even on a big plan_generations table.
    const { data: stuck, error: selectErr } = await supabase
      .from('plan_generations')
      .select('id, job_id, created_at')
      .eq('status', 'running')
      .lt('created_at', cutoff);

    if (selectErr) {
      console.warn('[plan-gen-reaper] select failed:', selectErr.message);
      return { reaped: 0, error: selectErr.message };
    }
    if (!stuck || stuck.length === 0) return { reaped: 0 };

    // Flip the DB rows first so late-arriving polls see 'failed'. Each gets
    // a consistent duration_ms relative to when it started, so the admin
    // dashboard can still show how long the orphan sat around.
    const updates = stuck.map(row => ({
      id: row.id,
      status: 'failed',
      progress: 'Timed out',
      error: `Job exceeded ${Math.round(STALE_AFTER_MS / 1000)}s without finishing — most likely the server restarted or the Claude call hung. Auto-reaped.`,
      duration_ms: row.created_at ? now - new Date(row.created_at).getTime() : null,
      updated_at: new Date().toISOString(),
    }));

    // Postgres doesn't let you multi-update via upsert cleanly — run them
    // one at a time. Count is small (stale rows in the last N minutes), so
    // serial is fine.
    let reaped = 0;
    for (const u of updates) {
      const { error: updErr } = await supabase
        .from('plan_generations')
        .update({
          status: u.status,
          progress: u.progress,
          error: u.error,
          duration_ms: u.duration_ms,
          updated_at: u.updated_at,
        })
        .eq('id', u.id)
        .eq('status', 'running');  // only flip if still running — race guard
      if (!updErr) reaped++;
    }

    // Sync the in-memory job Map, if the caller passed it in, so any poll
    // that lands between now and the next sweep reports failed.
    if (planJobs && typeof planJobs.get === 'function') {
      for (const row of stuck) {
        if (!row.job_id) continue;
        const job = planJobs.get(row.job_id);
        if (job && job.status === 'running') {
          job.status = 'failed';
          job.progress = 'Timed out';
          job.error = 'Job timed out — the server likely restarted while this plan was being built. Please try again.';
        }
      }
    }

    if (reaped > 0) {
      console.log(`[plan-gen-reaper] Reaped ${reaped}/${stuck.length} stuck running row(s).`);
    }
    return { reaped };
  } catch (err) {
    console.warn('[plan-gen-reaper] threw:', err?.message);
    return { reaped: 0, error: err?.message };
  }
}

/**
 * Start a recurring sweep. Call once from server boot.
 * Safe to call multiple times — cancels any prior timer.
 */
function startReaper({ planJobs = null } = {}) {
  if (sweepTimer) clearInterval(sweepTimer);
  // Kick off the first sweep immediately so stuck rows from a prior deploy
  // get cleaned up on boot, not two minutes later.
  reapStuckGenerations({ planJobs }).catch((e) =>
    console.warn('[plan-gen-reaper] initial sweep threw:', e?.message)
  );
  sweepTimer = setInterval(() => {
    reapStuckGenerations({ planJobs }).catch((e) =>
      console.warn('[plan-gen-reaper] scheduled sweep threw:', e?.message)
    );
  }, SWEEP_INTERVAL_MS);
  // Unref so the timer doesn't keep the process alive in tests.
  if (sweepTimer.unref) sweepTimer.unref();
  console.log(`[plan-gen-reaper] Started — stale threshold ${Math.round(STALE_AFTER_MS / 1000)}s, sweep every ${Math.round(SWEEP_INTERVAL_MS / 1000)}s.`);
}

function stopReaper() {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

module.exports = {
  reapStuckGenerations,
  startReaper,
  stopReaper,
  STALE_AFTER_MS,
  SWEEP_INTERVAL_MS,
};
