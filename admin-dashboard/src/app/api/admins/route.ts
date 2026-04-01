import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

export async function GET() {
  const { error, token } = await requireAdmin();
  if (error) return error;

  try {
    const admins = await etapaFetch("/api/admin/admins", token!);
    return NextResponse.json(admins);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const API_URL = process.env.ETAPA_API_URL || "http://localhost:3001";
    const res = await fetch(`${API_URL}/api/admin/grant`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: body.email }),
      cache: "no-store",
    });

    const result = await res.json();
    if (!res.ok) return NextResponse.json(result, { status: res.status });
    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const API_URL = process.env.ETAPA_API_URL || "http://localhost:3001";
    const res = await fetch(`${API_URL}/api/admin/revoke`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
      cache: "no-store",
    });

    const result = await res.json();
    if (!res.ok) return NextResponse.json(result, { status: res.status });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
