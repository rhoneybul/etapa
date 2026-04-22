import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

/**
 * POST /api/plan-generations/:id/rerun — rerun a past generation with its
 * stored inputs. Returns { jobId } — poll via /api/plan-jobs/:jobId.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  try {
    const result = await etapaFetch(
      `/api/admin/plan-generations/${params.id}/rerun`,
      token!,
      { method: "POST", body: {} }
    );
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
