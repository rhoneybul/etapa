/**
 * POST /api/user-overrides/quick
 * Body: { userId, action, flag? }
 *
 * Proxies to the server's one-tap preset actions. Used by the "Quick Actions"
 * page — the mobile-first admin screen.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";

const API_URL = process.env.ETAPA_API_URL || "http://localhost:3001";

export async function POST(request: Request) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  const { userId, action, flag } = await request.json();
  if (!userId || !action) {
    return NextResponse.json(
      { error: "userId and action are required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      `${API_URL}/api/admin/user-overrides/${userId}/quick/${action}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ flag }),
      }
    );
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
