import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

/**
 * GET /api/claude-usage?days=30
 *
 * Proxies to the Etapa API's admin Claude-usage aggregation. Returns the
 * three breakdowns (by feature, by user, by day) plus window totals.
 * Used by the /dashboard/claude-usage page.
 */
export async function GET(request: NextRequest) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  const search = request.nextUrl.searchParams.toString();
  const path = search ? `/api/admin/claude-usage?${search}` : "/api/admin/claude-usage";

  try {
    const result = await etapaFetch(path, token!);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
