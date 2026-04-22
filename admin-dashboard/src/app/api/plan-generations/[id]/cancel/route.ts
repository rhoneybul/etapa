import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

/**
 * POST /api/plan-generations/:id/cancel — mark a running generation cancelled.
 * Calls the admin-side server endpoint that bypasses user-ownership checks so
 * the dashboard can kill a stuck job for any user.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  let body: any = null;
  try { body = await request.json(); } catch { /* empty is fine */ }

  try {
    const result = await etapaFetch(
      `/api/admin/plan-generations/${params.id}/cancel`,
      token!,
      { method: "POST", body: body || {} }
    );
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
