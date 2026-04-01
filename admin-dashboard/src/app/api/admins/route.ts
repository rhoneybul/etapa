import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { etapaFetch } from "@/lib/etapa-api";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const admins = await etapaFetch("/api/admin/admins");
    return NextResponse.json(admins);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const API_URL = process.env.ETAPA_API_URL || "http://localhost:3001";
    const API_KEY = process.env.ADMIN_API_KEY || "";

    const res = await fetch(`${API_URL}/api/admin/grant`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: body.email }),
    });

    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const API_URL = process.env.ETAPA_API_URL || "http://localhost:3001";
    const API_KEY = process.env.ADMIN_API_KEY || "";

    const res = await fetch(`${API_URL}/api/admin/revoke`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
