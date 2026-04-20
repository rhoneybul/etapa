import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    const result = await etapaFetch(`/api/admin/signups/${id}`, token!, { method: "DELETE" });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
