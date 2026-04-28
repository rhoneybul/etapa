import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

/**
 * POST /api/claude-usage/audit
 *
 * "Ask the auditor" — proxies to the Etapa API. Returns ranked
 * cost-reduction suggestions from Claude based on the recent usage
 * aggregate.
 */
export async function POST(request: NextRequest) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  let body: any = {};
  try { body = await request.json(); } catch {}

  try {
    const result = await etapaFetch("/api/admin/claude-usage/audit", token!, {
      method: "POST",
      body, // etapaFetch JSON-stringifies via the Content-Type default
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
