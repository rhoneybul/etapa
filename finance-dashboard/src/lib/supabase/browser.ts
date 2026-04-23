/**
 * Browser-side Supabase client. Reads from the public anon key — all access
 * to `finance.*` is gated by RLS keyed on the JWT email against
 * `finance.admin_allowlist`. If someone without an allowlisted email steals
 * the anon key they still see nothing.
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";

export function getBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
