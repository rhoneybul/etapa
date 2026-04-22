import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

// GET /api/users/:id/rate-limits — proxies to the backend admin endpoint.
// Returns the user's current override (null => uses global default), the
// current rolling-window usage, and the global defaults from env.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, token } = await requireAdmin();
  if (error) return error;
  try {
    const data = await etapaFetch(`/api/admin/users/${params.id}/rate-limits`, token!);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

// PUT /api/users/:id/rate-limits — write an override. Body can pass either
// integer limits or null (to fall back to the global default per field).
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, token } = await requireAdmin();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  try {
    const data = await etapaFetch(`/api/admin/users/${params.id}/rate-limits`, token!, {
      method: "PUT",
      body,
    });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

// DELETE /api/users/:id/rate-limits — reset the user to global defaults.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, token } = await requireAdmin();
  if (error) return error;
  try {
    const data = await etapaFetch(`/api/admin/users/${params.id}/rate-limits`, token!, {
      method: "DELETE",
    });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
