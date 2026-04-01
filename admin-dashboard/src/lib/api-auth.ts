import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "./supabase-server";

/**
 * Verifies the current request has a valid Supabase session.
 * Returns the access token to forward to the Etapa API, or a 401 response.
 */
export async function requireAdmin(): Promise<{ error: NextResponse | null; token: string | null }> {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      token: null,
    };
  }

  return { error: null, token: session.access_token };
}
