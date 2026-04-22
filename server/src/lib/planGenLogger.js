/**
 * Plan-generation logger.
 *
 * Writes one row to public.plan_generations per job lifecycle so the admin
 * dashboard can inspect inputs/outputs of failed or stuck generations and
 * rerun them from the stored goal + config.
 *
 * Fire-and-forget everywhere — a broken DB must never prevent a user's
 * plan from being generated. If the insert / update fails we log to stderr
 * and carry on.
 */

const { supabase } = require('./supabase');

/**
 * Insert a 'running' row at job start.
 * Returns the inserted row id (or null if the insert failed) so the caller
 * can keep it on the in-memory job and pass it back to `finish`.
 *
 * `systemPrompt` and `prompt` are OPTIONAL — if passed, they're captured
 * so the admin debug page can show the exact Claude request for "another
 * pair of eyes" reproducibility.
 */
async function start({ userId, jobId, goal, config, reason = 'generate', model = null, systemPrompt = null, prompt = null }) {
  try {
    const { data, error } = await supabase
      .from('plan_generations')
      .insert({
        user_id: userId || null,
        job_id: jobId,
        status: 'running',
        reason,
        goal,
        config,
        model,
        system_prompt: systemPrompt,
        prompt,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      console.warn('[plan_gen_log] start insert failed:', error.message);
      return null;
    }
    return data?.id || null;
  } catch (err) {
    console.warn('[plan_gen_log] start threw:', err?.message);
    return null;
  }
}

/**
 * Update the running row with a final status + outcome fields.
 * `patch` is merged onto the row — typical fields:
 *   { status, plan_id, activities_count, error, duration_ms, progress }
 */
async function finish(id, patch) {
  if (!id) return;
  try {
    const { error } = await supabase
      .from('plan_generations')
      .update(patch)
      .eq('id', id);
    if (error) console.warn('[plan_gen_log] finish update failed:', error.message);
  } catch (err) {
    console.warn('[plan_gen_log] finish threw:', err?.message);
  }
}

/**
 * Update the progress message on the running row without finalising it.
 * Lets the admin dashboard show "stuck" jobs with their last-known stage.
 */
async function progress(id, progressText) {
  if (!id) return;
  try {
    await supabase
      .from('plan_generations')
      .update({ progress: progressText })
      .eq('id', id);
  } catch { /* swallow */ }
}

module.exports = { start, finish, progress };
