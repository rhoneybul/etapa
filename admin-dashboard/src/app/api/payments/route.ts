import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { payments } from "@/lib/seed-data";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return NextResponse.json(payments);
}
