/**
 * /login — the only unauthenticated page. Google OAuth button that punts to
 * Supabase, which bounces to Google, which bounces back to /auth/callback.
 *
 * The callback confirms the session + the middleware allowlist check; if the
 * email isn't allowlisted we get sent back here with ?error=unauthorised and
 * the banner below shows.
 */
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";

function LoginInner() {
  const params = useSearchParams();
  const err = params.get("error");

  async function signInWithGoogle() {
    const supabase = getBrowserSupabase();
    // Redirect back to /auth/callback so the PKCE code exchange happens on
    // our server, not the browser — the session cookie lands in the right
    // place for the middleware to see it on the next request.
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h1 className="text-lg font-semibold mb-1">Etapa Finance</h1>
        <p className="text-sm text-zinc-400 mb-6">Single-user dashboard. Sign in with the allowlisted Google account.</p>

        {err === "unauthorised" && (
          <div className="mb-4 rounded border border-red-900/50 bg-red-950/40 text-red-300 text-sm px-3 py-2">
            That Google account isn&apos;t allowlisted for this dashboard.
          </div>
        )}

        <button
          onClick={signInWithGoogle}
          className="w-full rounded-lg bg-brand text-brand-fg font-medium py-2.5 hover:opacity-90 transition"
        >
          Continue with Google
        </button>
      </div>
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
