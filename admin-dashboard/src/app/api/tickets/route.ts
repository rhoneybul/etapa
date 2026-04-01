import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { tickets } from "@/lib/seed-data";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return NextResponse.json(tickets);
}
