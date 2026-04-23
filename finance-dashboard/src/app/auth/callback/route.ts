/**
 * Google OAuth callback. Supabase bounces the user here with `?code=...`
 * after they pick their Google account. We exchange it for a session,
 * let the middleware run on the next request, and redirect home.
 *
 * If the email isn't allowlisted, middleware signs them out and sends
 * them to /login?error=unauthorised. We don't repeat that check here —
 * middleware runs before every page.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no-code", request.url));
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url));
  }

  return NextResponse.redirect(new URL("/", request.url));
}
