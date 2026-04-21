/**
 * Per-user config override proxy. Maps the admin dashboard's calls through
 * to the Etapa server, which stores them in the `user_config_overrides` table.
 *
 * See REMOTE_FIRST_ARCHITECTURE.md for the philosophy — these are the levers
 * the founder uses to resolve support tickets without shipping a build.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";

const API_URL = process.env.ETAPA_API_URL || "http://localhost:3001";

// GET /api/user-overrides?email=...   (or ?userId=...)
export async function GET(request: Request) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  const url = new URL(request.url);
  const qs = url.search; // includes ?
  try {
    const res = await fetch(`${API_URL}/api/admin/user-overrides${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

// PUT /api/user-overrides   body: { userId, overrides, note? }
export async function PUT(request: Request) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  const { userId, overrides, note } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_URL}/api/admin/user-overrides/${userId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ overrides, note }),
    });
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

// DELETE /api/user-overrides?userId=...
export async function DELETE(request: Request) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_URL}/api/admin/user-overrides/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
