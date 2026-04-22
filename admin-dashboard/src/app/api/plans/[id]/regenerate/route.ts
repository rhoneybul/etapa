import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

/**
 * POST /api/plans/:id/regenerate — kick off an admin-initiated regeneration.
 *
 * Proxies to the server's /api/admin/plans/:id/regenerate endpoint which
 * snapshots the current plan, then runs generation using the plan's
 * original goal + config (with optional overrides from the request body).
 *
 * Returns { jobId, snapshotId, pollUrl } — the UI then polls the job via
 * /api/plan-jobs/:jobId to surface progress until completion.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  let body: any = null;
  try { body = await request.json(); } catch { /* empty body is fine */ }

  try {
    const result = await etapaFetch(
      `/api/admin/plans/${params.id}/regenerate`,
      token!,
      { method: "POST", body: body || {} }
    );
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
