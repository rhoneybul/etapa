"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

interface Signup {
  id: string;
  email: string;
  source: string | null;
  referrer: string | null;
  userAgent: string | null;
  createdAt: string;
  unsubscribedAt: string | null;
  unsubscribeSource: string | null;
}

function formatDate(ts: string) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export default function SignupsPage() {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const fetchSignups = () => {
    setLoading(true);
    fetch("/api/signups")
      .then((r) => r.json())
      .then((data) => setSignups(Array.isArray(data) ? data : []))
      .catch(() => setError("Failed to load signups"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSignups();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return signups;
    return signups.filter(
      (s) =>
        s.email.toLowerCase().includes(q) ||
        (s.source || "").toLowerCase().includes(q) ||
        (s.referrer || "").toLowerCase().includes(q)
    );
  }, [signups, query]);

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from the interest list?`)) return;
    const res = await fetch(`/api/signups/${id}`, { method: "DELETE" });
    if (res.ok) fetchSignups();
  };

  // Safer-by-default: "Copy emails" copies ONLY subscribed (opt-in) emails
  // so you can paste into a sender without accidentally hitting people who
  // unsubscribed. Unsubscribed emails are still visible in the table and
  // still exported in the CSV with a column marking their status.
  const handleCopyAll = async () => {
    const subscribed = filtered.filter((s) => !s.unsubscribedAt);
    const excluded = filtered.length - subscribed.length;
    const text = subscribed.map((s) => s.email).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      alert(
        `Copied ${subscribed.length} email${subscribed.length === 1 ? "" : "s"} to clipboard` +
        (excluded > 0 ? ` (${excluded} unsubscribed address${excluded === 1 ? "" : "es"} excluded)` : "")
      );
    } catch {
      alert("Copy failed");
    }
  };

  const handleExportCsv = () => {
    const header = ["email", "source", "referrer", "created_at", "unsubscribed_at", "unsubscribe_source"];
    const rows = filtered.map((s) => [
      s.email,
      s.source || "",
      s.referrer || "",
      s.createdAt,
      s.unsubscribedAt || "",
      s.unsubscribeSource || "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etapa-interest-signups-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Quick source breakdown
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of signups) {
      const key = s.source || "unknown";
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [signups]);

  if (loading) {
    return <div className="animate-pulse text-etapa-textMuted">Loading interest signups...</div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Interest Signups</h1>
          <p className="text-sm text-etapa-textMuted mt-1">
            People who registered interest in Etapa while we&apos;re pre-launch.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopyAll}
            disabled={filtered.length === 0}
            className="px-3 py-2 text-xs font-medium text-white bg-etapa-surfaceLight border border-etapa-border rounded-lg hover:bg-etapa-border disabled:opacity-40"
          >
            Copy emails
          </button>
          <button
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="px-3 py-2 text-xs font-medium text-black bg-etapa-primary rounded-lg hover:bg-amber-400 disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4">
          <p className="text-xs text-etapa-textMuted uppercase tracking-wider">Total</p>
          <p className="text-2xl font-semibold text-white mt-1">{signups.length}</p>
        </div>
        <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4">
          <p className="text-xs text-etapa-textMuted uppercase tracking-wider">Last 24h</p>
          <p className="text-2xl font-semibold text-white mt-1">
            {signups.filter((s) => Date.now() - new Date(s.createdAt).getTime() < 86400000).length}
          </p>
        </div>
        <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4">
          <p className="text-xs text-etapa-textMuted uppercase tracking-wider">Last 7 days</p>
          <p className="text-2xl font-semibold text-white mt-1">
            {signups.filter((s) => Date.now() - new Date(s.createdAt).getTime() < 86400000 * 7).length}
          </p>
        </div>
        <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4">
          <p className="text-xs text-etapa-textMuted uppercase tracking-wider">Top source</p>
          <p className="text-sm font-medium text-white mt-2 truncate">
            {sourceCounts[0] ? `${sourceCounts[0][0]} (${sourceCounts[0][1]})` : "—"}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          placeholder="Search email, source, or referrer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:max-w-md px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-white placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary"
        />
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {/* Desktop table */}
      <div className="hidden sm:block bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-etapa-border bg-etapa-surfaceLight">
              <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase">Email</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase">Source</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase">When</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-etapa-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-etapa-textFaint">
                  {signups.length === 0 ? "No signups yet." : "No matches for your search."}
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr
                  key={s.id}
                  className={`hover:bg-etapa-surfaceLight ${s.unsubscribedAt ? "opacity-60" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-white">
                    <div className="flex items-center gap-2">
                      <a href={`mailto:${s.email}`} className="hover:text-etapa-primary">
                        {s.email}
                      </a>
                      {s.unsubscribedAt && (
                        <span
                          title={`Unsubscribed ${formatDate(s.unsubscribedAt)}${s.unsubscribeSource ? " via " + s.unsubscribeSource : ""}`}
                          className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 whitespace-nowrap"
                        >
                          Unsubscribed
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-etapa-textMid">
                    {s.source ? (
                      <span className="inline-block text-xs px-2 py-1 bg-etapa-surfaceLight rounded border border-etapa-border">
                        {s.source}
                      </span>
                    ) : (
                      <span className="text-etapa-textFaint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-etapa-textMid whitespace-nowrap">
                    {formatDate(s.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(s.id, s.email)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-etapa-surface rounded-xl border border-etapa-border p-6 text-center text-etapa-textFaint text-sm">
            {signups.length === 0 ? "No signups yet." : "No matches for your search."}
          </div>
        ) : (
          filtered.map((s) => (
            <div
              key={s.id}
              className={`bg-etapa-surface rounded-xl border border-etapa-border p-4 ${s.unsubscribedAt ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white text-sm truncate">{s.email}</p>
                    {s.unsubscribedAt && (
                      <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 shrink-0">
                        Unsub
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-etapa-textMuted mt-1">
                    {formatDate(s.createdAt)}
                    {s.source ? ` · ${s.source}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(s.id, s.email)}
                  className="text-xs text-red-400 hover:text-red-300 shrink-0"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
