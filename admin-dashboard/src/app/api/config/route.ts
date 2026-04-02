import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";

const API_URL = process.env.ETAPA_API_URL || "http://localhost:3001";

export async function GET() {
  const { error, token } = await requireAdmin();
  if (error) return error;

  try {
    const res = await fetch(`${API_URL}/api/app-config`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return NextResponse.json(await res.json());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  const { key, value } = await request.json();

  try {
    const res = await fetch(`${API_URL}/api/admin/app-config/${key}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }

    return NextResponse.json(await res.json());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
