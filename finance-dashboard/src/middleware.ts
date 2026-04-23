/**
 * Auth middleware — runs on every request except static assets + the OAuth
 * callback. Flow:
 *
 *   1. Anonymous → redirect to /login.
 *   2. Authenticated but email not in ALLOWED_EMAILS → sign out, redirect to
 *      /login?error=unauthorised.
 *   3. Authenticated + allowed + visiting /login → redirect to /.
 *   4. Authenticated + allowed + anything else → pass through.
 *
 * Allowlist check is duplicated in DB RLS so if this middleware is ever
 * bypassed (e.g. direct API calls) the database still refuses to hand over
 * finance rows. See supabase/migrations/20260423000002_finance_schema.sql.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowed } from "@/lib/auth/allowlist";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // OAuth callback must pass through unauthenticated — Supabase completes
  // the code exchange inside /auth/callback.
  if (req.nextUrl.pathname.startsWith("/auth/callback")) return res;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (all: { name: string; value: string; options: CookieOptions }[]) => {
          for (const { name, value, options } of all) {
            res.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isLogin = req.nextUrl.pathname === "/login";

  if (!user) {
    // Not signed in — only /login is reachable.
    if (isLogin) return res;
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Signed in — check allowlist before anything else.
  if (!isAllowed(user.email)) {
    await supabase.auth.signOut();
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=unauthorised";
    return NextResponse.redirect(url);
  }

  // Signed in + allowed — bounce off /login so we don't show it again.
  if (isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  // Skip static assets, favicon, and the Next.js internal routes so the
  // Supabase getUser() call doesn't fire on every image request.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
