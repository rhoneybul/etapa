import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { admins } from "@/lib/seed-data";

// In production, this would be a database. For now we use an in-memory array.
// The seed data is the source of truth — add/remove persists only for the server lifetime.

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return NextResponse.json(admins);
}

export async function POST(request: Request) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const { email, name } = body;

  if (!email || !name) {
    return NextResponse.json({ error: "email and name are required" }, { status: 400 });
  }

  if (admins.some((a) => a.email === email)) {
    return NextResponse.json({ error: "Already an admin" }, { status: 409 });
  }

  const newAdmin = {
    id: `a${admins.length + 1}`,
    email,
    name,
    grantedAt: new Date().toISOString(),
    grantedBy: session!.user!.email!,
  };

  admins.push(newAdmin);
  return NextResponse.json(newAdmin, { status: 201 });
}

export async function DELETE(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json({ error: "email param required" }, { status: 400 });
  }

  const idx = admins.findIndex((a) => a.email === email);
  if (idx === -1) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  // Prevent removing yourself
  admins.splice(idx, 1);
  return NextResponse.json({ success: true });
}
