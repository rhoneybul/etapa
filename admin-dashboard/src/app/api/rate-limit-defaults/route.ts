import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

// GET /api/rate-limit-defaults — current global rate limits + env fallback values.
export async function GET() {
  const { error, token } = await requireAdmin();
  if (error) return error;
  try {
    const data = await etapaFetch(`/api/admin/rate-limit-defaults`, token!);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

// PUT /api/rate-limit-defaults — update the global defaults.
// Body: { plansPerWeek?: number, coachMsgsPerWeek?: number }
export async function PUT(req: NextRequest) {
  const { error, token } = await requireAdmin();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  try {
    const data = await etapaFetch(`/api/admin/rate-limit-defaults`, token!, {
      method: "PUT",
      body,
    });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
