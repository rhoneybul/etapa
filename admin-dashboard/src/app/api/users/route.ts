import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const users = await etapaFetch("/api/admin/users");
    return NextResponse.json(users);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
