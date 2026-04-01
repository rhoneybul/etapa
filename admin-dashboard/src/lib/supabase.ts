// Re-exports for convenience — but prefer importing directly from
// supabase-client.ts (client components) or supabase-server.ts (server components/API routes)
// to avoid the next/headers import error in client components.
export { createClient } from "./supabase-client";
export { createServerSupabaseClient } from "./supabase-server";
