import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

/**
 * POST /api/users/:id/coach-checkin — manually trigger a coach check-in for a user.
 * Proxies to the Express admin endpoint.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  try {
    const result = await etapaFetch(
      `/api/admin/users/${params.id}/coach-checkin`,
      token!,
      { method: "POST" }
    );
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
