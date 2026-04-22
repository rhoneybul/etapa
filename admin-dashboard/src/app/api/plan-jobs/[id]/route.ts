import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

/**
 * GET /api/plan-jobs/:id — poll status of an admin-initiated plan
 * regeneration job. Passes through to the server's standard plan-job
 * endpoint which returns { status, progress, activities, plan, error }.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  try {
    const result = await etapaFetch(
      `/api/admin/plan-jobs/${params.id}`,
      token!,
    );
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
