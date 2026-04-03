/**
 * Server-side helper to call the Etapa API from Next.js API routes.
 * Authenticates using the user's Supabase JWT, forwarded as a Bearer token.
 */

const API_URL = process.env.ETAPA_API_URL || "http://localhost:3001";

export async function etapaFetch(
  path: string,
  token: string,
  options?: { method?: string; body?: unknown }
) {
  const res = await fetch(`${API_URL}${path}`, {
    method: options?.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
    // Don't cache in Next.js — always fetch fresh
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etapa API error ${res.status}: ${text}`);
  }

  return res.json();
}
