import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";

const API_URL = process.env.ETAPA_API_URL || "http://localhost:3001";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  try {
    const res = await fetch(`${API_URL}/api/admin/feedback/${id}/messages`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();

  try {
    const res = await fetch(`${API_URL}/api/admin/feedback/${id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
