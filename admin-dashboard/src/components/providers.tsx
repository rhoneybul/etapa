"use client";

// No global providers needed — Supabase auth is handled directly per component.
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
