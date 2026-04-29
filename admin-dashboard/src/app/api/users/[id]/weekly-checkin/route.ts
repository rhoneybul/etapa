import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

/**
 * POST /api/users/:id/weekly-checkin — manually fire the structured weekly
 * check-in for a single user. Distinct from /coach-checkin which sends the
 * older post-session encouragement message. Same code path the cron uses;
 * server-side dedupe prevents same-week duplicates UNLESS the request
 * body carries `{ force: true }`, which expires the existing row and
 * fires a fresh push.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  // Read the body if any. Defaulting to an empty object means callers
  // that don't pass a body (the existing per-user user-detail page) keep
  // working unchanged — the server treats absent `force` as false.
  let body: { force?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // No body / not JSON — treat as default.
  }

  try {
    const result = await etapaFetch(
      `/api/admin/users/${params.id}/weekly-checkin`,
      token!,
      { method: "POST", body }
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
