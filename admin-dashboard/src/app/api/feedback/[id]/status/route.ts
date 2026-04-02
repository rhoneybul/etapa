import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";

const API_URL = process.env.ETAPA_API_URL || "http://localhost:3001";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error, token } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();

  try {
    const res = await fetch(`${API_URL}/api/admin/feedback/${id}/status`, {
      method: "PATCH",
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
