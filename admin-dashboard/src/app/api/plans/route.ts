import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const plans = await etapaFetch("/api/admin/plans");
    return NextResponse.json(plans);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
