import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

/**
 * GET  /api/pre-signup-grants — list all pre-signup lifetime grants.
 * POST /api/pre-signup-grants — create one, many, or a bulk-paste batch.
 */
export async function GET() {
  const { error, token } = await requireAdmin();
  if (error) return error;

  try {
    const result = await etapaFetch("/api/admin/pre-signup-grants", token!);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  let body: any = null;
  try { body = await request.json(); } catch { /* empty is fine */ }

  try {
    const result = await etapaFetch(
      "/api/admin/pre-signup-grants",
      token!,
      { method: "POST", body: body || {} }
    );
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
