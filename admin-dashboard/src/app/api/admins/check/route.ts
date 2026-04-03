import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.ETAPA_API_URL || "http://localhost:3001";

/**
 * GET /api/admins/check?email=... — proxy to Express admin check endpoint.
 * Used by the dashboard layout to verify admin status client-side.
 */
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email") || "";

  try {
    const res = await fetch(
      `${API_URL}/api/admin/check?email=${encodeURIComponent(email)}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ isAdmin: false });
  }
}
