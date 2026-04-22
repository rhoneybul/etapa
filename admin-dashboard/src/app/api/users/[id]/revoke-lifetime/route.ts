import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

/**
 * POST /api/users/:id/revoke-lifetime — undo the lifetime grant.
 * Used when a grant was made in error or is being rolled back. Wipes the
 * RC promotional entitlement, clears the DB override, and marks the
 * lifetime subscription row as 'cancelled'.
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
      `/api/admin/users/${params.id}/revoke-lifetime`,
      token!,
      { method: "POST", body: body || {} }
    );
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
