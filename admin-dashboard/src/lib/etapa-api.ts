/**
 * Server-side helper to call the Etapa API from Next.js API routes.
 * Uses ADMIN_API_KEY for authentication.
 */

const API_URL = process.env.ETAPA_API_URL || "http://localhost:3001";
const API_KEY = process.env.ADMIN_API_KEY || "";

export async function etapaFetch(path: string) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    // Don't cache in Next.js — always fetch fresh
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etapa API error ${res.status}: ${text}`);
  }

  return res.json();
}
