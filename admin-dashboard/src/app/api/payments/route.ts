import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const payments = await etapaFetch("/api/admin/payments");
    return NextResponse.json(payments);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
