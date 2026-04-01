import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

export async function GET() {
  const { error, token } = await requireAdmin();
  if (error) return error;

  try {
    const feedback = await etapaFetch("/api/admin/feedback", token!);
    return NextResponse.json(feedback);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
