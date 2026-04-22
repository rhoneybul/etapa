import { runs } from '../route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/run-tests/cancel
 *
 * Body: { runId: string }
 *
 * Flips isCancelled on the run registry so the streaming POST handler
 * (see ../route.js) short-circuits its scenario loop and sends DELETE
 * on every in-flight plan-job id. Returns 200 whether or not the run
 * was found — cancelling an already-completed run is a no-op, not an
 * error the user should see.
 *
 * Serverless caveat: on Vercel, the runs Map is scoped to a single
 * lambda instance. If this cancel request hits a different lambda than
 * the one running the work, nothing happens. In practice a single dash-
 * board session almost always gets the same lambda, so it works.
 * If you need guaranteed cross-instance cancellation, the fallback plan
 * is in the cancel-via-Supabase branch of this code (not yet built).
 */
export async function POST(req) {
  let body = null;
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const runId = body?.runId;
  if (!runId) return new Response(JSON.stringify({ error: 'runId required' }), {
    status: 400, headers: { 'Content-Type': 'application/json' },
  });

  const run = runs.get(runId);
  if (!run) {
    // Run either completed already, never existed, or is on a different
    // lambda. All three are "there's nothing to cancel, move on".
    return Response.json({ ok: true, found: false });
  }

  run.isCancelled = true;
  run.cancelAllJobs?.().catch((err) => {
    console.warn(`[run-tests/cancel ${runId}] cancelAllJobs threw:`, err?.message);
  });

  return Response.json({ ok: true, found: true });
}
