/**
 * Allowlist helper — single source of truth for "can this email see the
 * finance dashboard?". Duplicated check on both the middleware (fast path)
 * AND the DB via RLS (belt-and-braces). If the env var drifts from the
 * DB `finance.admin_allowlist` table, the DB wins because RLS blocks reads.
 *
 * ALLOWED_EMAILS is a comma-separated env var set in Vercel.
 * In dev, set it in finance-dashboard/.env.local.
 */

export function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAllowedEmails().includes(email.toLowerCase());
}
