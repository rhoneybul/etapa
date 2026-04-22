import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

/**
 * DELETE /api/pre-signup-grants/:id — revoke a pending grant.
 * Cannot revoke a grant once it's been redeemed (audit trail).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  try {
    const result = await etapaFetch(
      `/api/admin/pre-signup-grants/${params.id}`,
      token!,
      { method: "DELETE" }
    );
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
