import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

/**
 * GET /api/plan-generations — list plan generation attempts.
 * Query params passed through to the server:
 *   status, userId, email, limit, sinceHours
 */
export async function GET(request: NextRequest) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  const search = request.nextUrl.searchParams.toString();
  const path = search
    ? `/api/admin/plan-generations?${search}`
    : "/api/admin/plan-generations";

  try {
    const result = await etapaFetch(path, token!);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
