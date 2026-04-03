import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const API_URL = process.env.ETAPA_API_URL || "http://localhost:3001";

/**
 * Supabase OAuth callback — exchanges the auth code for a session,
 * verifies the user has admin access, then redirects to the dashboard.
 * Non-admin users are signed out and redirected to login with an error.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard/users";

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: Record<string, unknown>) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: Record<string, unknown>) {
            cookieStore.set({ name, value: "", ...options });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Verify the user is an admin before allowing dashboard access
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        try {
          const checkRes = await fetch(
            `${API_URL}/api/admin/check?email=${encodeURIComponent(session.user.email)}`
          );
          const checkData = await checkRes.json();

          if (!checkData.isAdmin) {
            // Not an admin — sign out and redirect with error
            await supabase.auth.signOut();
            return NextResponse.redirect(`${origin}/login?error=forbidden`);
          }
        } catch {
          // Can't verify admin status — reject to be safe
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/login?error=forbidden`);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
