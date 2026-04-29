import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

// Proxies GET /api/admin/checkins on the Etapa API, forwarding the admin
// dashboard's auth token. Optional query: ?status=, ?userId=, ?limit=.
export async function GET(req: NextRequest) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  // Forward the entire query string so server-side filters (status,
  // userId, limit) apply unchanged.
  const qs = req.nextUrl.search || "";
  try {
    const data = await etapaFetch(`/api/admin/checkins${qs}`, token!);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
