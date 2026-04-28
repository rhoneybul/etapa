import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

/**
 * POST /api/users/:id/weekly-checkin — manually fire the structured weekly
 * check-in for a single user. Distinct from /coach-checkin which sends the
 * older post-session encouragement message. Same code path the cron uses;
 * server-side dedupe prevents same-week duplicates.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  try {
    const result = await etapaFetch(
      `/api/admin/users/${params.id}/weekly-checkin`,
      token!,
      { method: "POST" }
    );
    return NextResponse.json(result);
  } catch (err: any) {
    // etapaFetch throws on non-2xx — surface the underlying message so
    // the dashboard can show "no_active_plan" / "plan_complete" rather
    // than a generic 502.
    const msg = String(err?.message || "");
    const statusMatch = msg.match(/Etapa API error (\d+)/);
    const status = statusMatch ? Number(statusMatch[1]) : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
