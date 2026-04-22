import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

/**
 * POST /api/users/:id/grant-lifetime — grant the user lifetime access.
 *
 * Proxies to the server's belt-and-braces endpoint which:
 *   (1) grants a RevenueCat promotional lifetime entitlement
 *   (2) writes user_config_overrides.entitlement = 'lifetime'
 *   (3) upserts a 'lifetime' row into subscriptions
 *
 * Returns { ok, warnings[], results: {...} } so the UI can surface which
 * of the three writes succeeded and show a specific warning when (1) fails.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  let body: any = null;
  try { body = await request.json(); } catch { /* empty body is fine */ }

  try {
    const result = await etapaFetch(
      `/api/admin/users/${params.id}/grant-lifetime`,
      token!,
      { method: "POST", body: body || {} }
    );
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
