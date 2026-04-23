/**
 * Server-side Supabase client for Route Handlers, Server Components, and
 * Server Actions. Reads + writes cookies so the auth session persists across
 * requests. Do NOT use the service role key here — that one lives on the
 * Express backend. The browser session is the only auth context.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(all: { name: string; value: string; options: CookieOptions }[]) {
          try {
            for (const { name, value, options } of all) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — cookie writes are no-ops
            // there. Route Handlers + Server Actions can set cookies fine.
          }
        },
      },
    },
  );
}
