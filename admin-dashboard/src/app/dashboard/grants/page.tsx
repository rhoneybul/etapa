"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatCard } from "@/components/stat-card";

type Tier = "lifetime" | "starter";

const TIER_LABELS: Record<Tier, string> = {
  lifetime: "Lifetime",
  starter: "Starter (3 months)",
};

interface Grant {
  id: string;
  email: string;
  entitlement: string;
  note: string | null;
  status: "pending" | "redeemed" | "revoked";
  grantedAt: string;
  grantedBy: string | null;
  redeemedAt: string | null;
  redeemedUser: { id: string; email?: string; name?: string | null } | null;
}

interface CreateSummary {
  summary: {
    requested: number;
    valid: number;
    invalid: number;
    created: number;
    skipped: number;
  };
  inserted: { id: string; email: string }[];
  skipped: { email: string; reason: string; hint?: string }[];
  invalid: { input: string; reason: string }[];
}

function formatDate(iso: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: Grant["status"] }) {
  const styles: Record<Grant["status"], string> = {
    pending:
      "bg-amber-900/30 text-amber-300 border-amber-700/30",
    redeemed:
      "bg-green-900/30 text-green-300 border-green-700/30",
    revoked:
      "bg-etapa-surfaceLight text-etapa-textMuted border-etapa-border",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}
    >
      {status.toUpperCase()}
    </span>
  );
}

export default function GrantsPage() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Single-email form
  const [singleEmail, setSingleEmail] = useState("");
  const [singleNote, setSingleNote] = useState("");

  // Bulk textarea
  const [bulkText, setBulkText] = useState("");
  const [bulkNote, setBulkNote] = useState("");

  // Tier picker — shared across single + bulk entry modes.
  const [tier, setTier] = useState<Tier>("lifetime");

  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<CreateSummary | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/pre-signup-grants");
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      const body = await r.json();
      setGrants(body.grants || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const pendingCount = useMemo(() => grants.filter((g) => g.status === "pending").length, [grants]);
  const redeemedCount = useMemo(() => grants.filter((g) => g.status === "redeemed").length, [grants]);

  async function submitGrants() {
    setSubmitting(true);
    setLastResult(null);
    try {
      const body: Record<string, unknown> = { entitlement: tier };
      if (mode === "single") {
        if (!singleEmail.trim()) { setSubmitting(false); return; }
        body.email = singleEmail.trim();
        if (singleNote.trim()) body.note = singleNote.trim();
      } else {
        if (!bulkText.trim()) { setSubmitting(false); return; }
        body.bulkText = bulkText;
        if (bulkNote.trim()) body.note = bulkNote.trim();
      }

      const r = await fetch("/api/pre-signup-grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Create failed");
      setLastResult(data);
      // Reset inputs on success (but keep the result visible)
      if (mode === "single") setSingleEmail("");
      else setBulkText("");
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeGrant(id: string) {
    if (!confirm("Revoke this grant? The recipient will no longer get their tier applied when they sign up.")) return;
    setRevokingId(id);
    try {
      const r = await fetch(`/api/pre-signup-grants/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `Revoke failed (${r.status})`);
      }
      refresh();
    } catch (e: any) {
      alert(`Failed: ${e.message}`);
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-1">Pre-signup grants</h1>
      <p className="text-sm text-etapa-textMuted mb-6">
        Give Lifetime or Starter (3-month) access to an email <em>before</em> they sign up. When someone registers with that email, the app unlocks automatically — no further action needed. For users who already have accounts, use the Grant Lifetime button on their profile instead.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total grants" value={grants.length} />
        <StatCard label="Pending" value={pendingCount} />
        <StatCard label="Redeemed" value={redeemedCount} />
      </div>

      {/* ── Create form ────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">New grant</h2>
        </div>
        <div className="bg-etapa-surface rounded-xl border border-etapa-border p-4">
          {/* Mode toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode("single")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === "single"
                  ? "bg-etapa-primary text-white"
                  : "bg-etapa-surfaceLight text-etapa-textMid hover:bg-etapa-border"
              }`}
            >
              Single email
            </button>
            <button
              onClick={() => setMode("bulk")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === "bulk"
                  ? "bg-etapa-primary text-white"
                  : "bg-etapa-surfaceLight text-etapa-textMid hover:bg-etapa-border"
              }`}
            >
              Bulk paste
            </button>
          </div>

          {/* Tier picker — determines what the grant gives the recipient. */}
          <div className="mb-4">
            <label className="text-xs text-etapa-textMuted uppercase tracking-wide mb-2 block">Tier</label>
            <div className="flex gap-2">
              {(Object.keys(TIER_LABELS) as Tier[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    tier === t
                      ? "bg-etapa-primary text-white"
                      : "bg-etapa-surfaceLight text-etapa-textMid hover:bg-etapa-border"
                  }`}
                >
                  {TIER_LABELS[t]}
                </button>
              ))}
            </div>
            <p className="text-xs text-etapa-textMuted mt-1">
              {tier === "lifetime"
                ? "Permanent access. Best for founders, thank-yous, contest prizes."
                : "3 months of paid access (Starter tier). Best for beta cohorts or time-limited trials."}
            </p>
          </div>

          {mode === "single" ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1 block">Email</label>
                <input
                  type="email"
                  value={singleEmail}
                  onChange={(e) => setSingleEmail(e.target.value)}
                  placeholder="friend@example.com"
                  className="w-full bg-etapa-surfaceLight border border-etapa-border rounded px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1 block">Note (optional)</label>
                <input
                  type="text"
                  value={singleNote}
                  onChange={(e) => setSingleNote(e.target.value)}
                  placeholder="e.g. Beta tester — Discord cohort"
                  className="w-full bg-etapa-surfaceLight border border-etapa-border rounded px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1 block">Emails — one per line (or comma / semicolon separated)</label>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={8}
                  placeholder={"alice@example.com\nbob@example.com\ncarol@example.com"}
                  className="w-full bg-etapa-surfaceLight border border-etapa-border rounded px-3 py-2 text-sm text-white font-mono"
                />
                <p className="text-xs text-etapa-textMuted mt-1">
                  Duplicates + invalid emails are filtered automatically. Emails that already belong to a user are skipped — use Grant Lifetime on their profile instead.
                </p>
              </div>
              <div>
                <label className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1 block">Note for the batch (optional)</label>
                <input
                  type="text"
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  placeholder="e.g. Launch day giveaway"
                  className="w-full bg-etapa-surfaceLight border border-etapa-border rounded px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end mt-4">
            <button
              disabled={submitting}
              onClick={submitGrants}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-etapa-primary hover:bg-etapa-primary/90 disabled:opacity-50"
            >
              {submitting ? "Creating..." : mode === "single" ? `Grant ${TIER_LABELS[tier].toLowerCase()}` : `Create ${TIER_LABELS[tier].toLowerCase()} batch`}
            </button>
          </div>

          {/* Result of last create call */}
          {lastResult && (
            <div className="mt-4 border-t border-etapa-border pt-4 text-xs text-etapa-textMid">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-white font-medium">Last batch</span>
                <span>Created <span className="text-green-400">{lastResult.summary.created}</span></span>
                <span>Skipped <span className="text-amber-400">{lastResult.summary.skipped}</span></span>
                <span>Invalid <span className="text-red-400">{lastResult.summary.invalid}</span></span>
              </div>
              {lastResult.skipped.length > 0 && (
                <details className="mb-1">
                  <summary className="cursor-pointer text-amber-400">Skipped ({lastResult.skipped.length})</summary>
                  <ul className="mt-1 pl-4 space-y-0.5">
                    {lastResult.skipped.map((s, i) => (
                      <li key={i}><span className="font-mono">{s.email}</span> — {s.reason}{s.hint ? ` (${s.hint})` : ""}</li>
                    ))}
                  </ul>
                </details>
              )}
              {lastResult.invalid.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-red-400">Invalid ({lastResult.invalid.length})</summary>
                  <ul className="mt-1 pl-4 space-y-0.5">
                    {lastResult.invalid.map((s, i) => (
                      <li key={i}><span className="font-mono">{s.input}</span> — {s.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Grants table ───────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">All grants</h2>
          <span className="text-xs text-etapa-textMuted">({grants.length})</span>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-4 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="animate-pulse text-etapa-textMuted">Loading grants...</div>
        ) : grants.length === 0 ? (
          <div className="bg-etapa-surface rounded-xl border border-etapa-border p-6 text-center text-sm text-etapa-textFaint">
            No grants yet.
          </div>
        ) : (
          <div className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-etapa-border bg-etapa-surfaceLight text-left">
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Email</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Tier</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Note</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Granted</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Redeemed</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-etapa-border">
                  {grants.map((g) => (
                    <tr key={g.id} className="hover:bg-etapa-surfaceLight transition-colors">
                      <td className="px-4 py-3 text-white font-mono text-xs">{g.email}</td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid">
                        {TIER_LABELS[g.entitlement as Tier] || g.entitlement}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={g.status} /></td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid max-w-md truncate" title={g.note || ""}>
                        {g.note || "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid">{formatDate(g.grantedAt)}</td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid">
                        {g.redeemedUser ? (
                          <Link
                            href={`/dashboard/users/${g.redeemedUser.id}`}
                            className="text-etapa-primary hover:text-amber-400"
                          >
                            {formatDate(g.redeemedAt)}
                          </Link>
                        ) : (
                          <span>{formatDate(g.redeemedAt)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {g.status === "pending" ? (
                          <button
                            onClick={() => revokeGrant(g.id)}
                            disabled={revokingId === g.id}
                            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-30"
                          >
                            {revokingId === g.id ? "Revoking..." : "Revoke"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
