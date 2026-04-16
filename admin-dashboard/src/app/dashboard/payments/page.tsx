"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

interface Subscription {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  plan: string;
  status: string;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
}

function formatDate(iso: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface CouponRedemption {
  id: string;
  user_id: string;
  user_email: string | null;
  coupon_code: string;
  plan: string;
  redeemed_at: string;
}

export default function PaymentsPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [redemptions, setRedemptions] = useState<CouponRedemption[]>([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    fetch("/api/payments")
      .then((r) => r.json())
      .then((data) => setSubs(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    setRedemptionsLoading(true);
    fetch("/api/coupons/redemptions")
      .then((r) => r.json())
      .then((data) => setRedemptions(Array.isArray(data) ? data : []))
      .finally(() => setRedemptionsLoading(false));
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/payments/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || "Delete failed");
      } else {
        setDeleteTarget(null);
        fetchData();
      }
    } catch {
      setDeleteError("Network error — please try again");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="animate-pulse text-etapa-textMuted">Loading payments...</div>;

  const activeSubs = subs.filter((s) => ["active", "trialing", "paid"].includes(s.status));
  const trialingSubs = subs.filter((s) => s.status === "trialing");

  // Group by plan for stats
  const planCounts: Record<string, number> = {};
  for (const sub of subs) {
    const plan = sub.plan || "unknown";
    planCounts[plan] = (planCounts[plan] || 0) + 1;
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-6">Subscriptions & Payments</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Subscriptions" value={subs.length} />
        <StatCard label="Active / Paid" value={activeSubs.length} />
        <StatCard label="In Trial" value={trialingSubs.length} />
        <StatCard label="Plans" value={Object.entries(planCounts).map(([p, c]) => `${p}: ${c}`).join(", ") || "—"} />
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-etapa-border bg-etapa-surfaceLight">
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Trial End</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Period End</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Started</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-etapa-border">
              {subs.map((sub) => (
                <tr
                  key={sub.id}
                  className="hover:bg-etapa-surfaceLight transition-colors"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-white">{sub.userName}</p>
                      <p className="text-xs text-etapa-textMuted">{sub.userEmail}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge value={sub.plan} /></td>
                  <td className="px-4 py-3"><Badge value={sub.status} /></td>
                  <td className="px-4 py-3 text-xs text-etapa-textMid">
                    {sub.status === "trialing" ? formatDate(sub.trialEnd) : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-xs text-etapa-textMid">
                    {formatDate(sub.currentPeriodEnd)}
                  </td>
                  <td className="px-4 py-3 text-xs text-etapa-textMid">{formatDate(sub.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { setDeleteTarget(sub); setDeleteError(null); }}
                      className="text-xs text-red-500 hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {subs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-etapa-textFaint">
                    No subscriptions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {subs.length === 0 ? (
          <div className="bg-etapa-surface rounded-xl border border-etapa-border p-6 text-center text-etapa-textFaint text-sm">
            No subscriptions found
          </div>
        ) : (
          subs.map((sub) => (
            <div key={sub.id} className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">{sub.userName}</p>
                    {sub.userEmail && <p className="text-xs text-etapa-textMuted truncate">{sub.userEmail}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge value={sub.plan} />
                  <Badge value={sub.status} />
                  <span className="text-xs text-etapa-textFaint ml-auto">{formatDate(sub.createdAt)}</span>
                </div>
                {sub.currentPeriodEnd && (
                  <p className="text-xs text-etapa-textMid mt-2">
                    Period ends: {formatDate(sub.currentPeriodEnd)}
                  </p>
                )}
              </div>
              <div className="px-4 pb-3 flex items-center gap-3">
                <button
                  onClick={() => { setDeleteTarget(sub); setDeleteError(null); }}
                  className="text-xs text-red-500 hover:text-red-400 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="mt-2 text-xs text-etapa-textFaint">{subs.length} subscription{subs.length !== 1 ? "s" : ""}</p>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setDeleteTarget(null)}>
          <div
            className="bg-etapa-surface border border-etapa-border rounded-xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-white mb-1">Delete Subscription</h2>
            <p className="text-sm text-etapa-textMid mb-4">
              {deleteTarget.userName} &middot; {deleteTarget.plan} plan
            </p>

            <div className="bg-red-900/20 border border-red-900/40 rounded-lg p-3 mb-4">
              <p className="text-xs font-medium text-red-400">
                This will permanently remove this subscription record from the database.
              </p>
            </div>

            {deleteError && (
              <p className="text-xs text-red-400 mb-3">{deleteError}</p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-etapa-textMid hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {deleting ? "Deleting..." : "Delete Subscription"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coupon Redemptions */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-white mb-3">Coupon Redemptions</h2>
        {redemptionsLoading ? (
          <div className="text-sm text-etapa-textMuted animate-pulse">Loading...</div>
        ) : redemptions.length === 0 ? (
          <div className="bg-etapa-surface border border-etapa-border rounded-xl p-6 text-center text-sm text-etapa-textMuted">
            No coupon redemptions yet.
          </div>
        ) : (
          <>
            {/* Summary by user */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <StatCard label="Total Redemptions" value={redemptions.length} />
              <StatCard label="Unique Users" value={new Set(redemptions.map(r => r.user_id)).size} />
              <StatCard label="Lifetime Codes" value={redemptions.filter(r => r.plan === "lifetime").length} />
              <StatCard label="Starter Codes" value={redemptions.filter(r => r.plan !== "lifetime").length} />
            </div>

            {/* Per-user breakdown */}
            <div className="bg-etapa-surface border border-etapa-border rounded-xl overflow-hidden mb-4">
              <div className="px-4 py-3 border-b border-etapa-border">
                <span className="text-xs font-semibold text-etapa-textMuted uppercase tracking-wider">Usage by User</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-etapa-border text-left">
                    <th className="px-4 py-2 text-xs font-semibold text-etapa-textMuted uppercase tracking-wider">User</th>
                    <th className="px-4 py-2 text-xs font-semibold text-etapa-textMuted uppercase tracking-wider">Codes Used</th>
                    <th className="px-4 py-2 text-xs font-semibold text-etapa-textMuted uppercase tracking-wider">Plans</th>
                    <th className="px-4 py-2 text-xs font-semibold text-etapa-textMuted uppercase tracking-wider">Last Redeemed</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(
                    redemptions.reduce((acc, r) => {
                      const key = r.user_id;
                      if (!acc[key]) {
                        acc[key] = {
                          userId: r.user_id,
                          email: r.user_email,
                          codes: [] as string[],
                          plans: new Set<string>(),
                          lastRedeemed: r.redeemed_at,
                          count: 0,
                        };
                      }
                      acc[key].codes.push(r.coupon_code);
                      acc[key].plans.add(r.plan);
                      acc[key].count++;
                      if (r.user_email) acc[key].email = r.user_email;
                      if (r.redeemed_at > acc[key].lastRedeemed) acc[key].lastRedeemed = r.redeemed_at;
                      return acc;
                    }, {} as Record<string, { userId: string; email: string | null; codes: string[]; plans: Set<string>; lastRedeemed: string; count: number }>)
                  )
                    .sort((a, b) => b.count - a.count)
                    .map((u) => (
                      <tr key={u.userId} className="border-b border-etapa-border last:border-0 hover:bg-etapa-surfaceLight transition-colors">
                        <td className="px-4 py-2 text-etapa-textMid text-xs">{u.email || u.userId}</td>
                        <td className="px-4 py-2">
                          <span className="text-white font-medium text-xs">{u.count}</span>
                          <span className="text-etapa-textFaint text-xs ml-2">{u.codes.join(", ")}</span>
                        </td>
                        <td className="px-4 py-2">
                          {Array.from(u.plans).map((plan) => (
                            <span key={plan} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mr-1 ${
                              plan === "lifetime"
                                ? "bg-purple-900/30 text-purple-300 border border-purple-700/30"
                                : "bg-etapa-primary/10 text-etapa-primary border border-etapa-primary/20"
                            }`}>
                              {plan}
                            </span>
                          ))}
                        </td>
                        <td className="px-4 py-2 text-etapa-textMuted text-xs">{formatDate(u.lastRedeemed)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Full redemption log */}
            <div className="bg-etapa-surface border border-etapa-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-etapa-border">
                <span className="text-xs font-semibold text-etapa-textMuted uppercase tracking-wider">All Redemptions</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-etapa-border text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-etapa-textMuted uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-xs font-semibold text-etapa-textMuted uppercase tracking-wider">Code</th>
                    <th className="px-4 py-3 text-xs font-semibold text-etapa-textMuted uppercase tracking-wider">Plan</th>
                    <th className="px-4 py-3 text-xs font-semibold text-etapa-textMuted uppercase tracking-wider">Redeemed</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((r) => (
                    <tr key={r.id} className="border-b border-etapa-border last:border-0 hover:bg-etapa-surfaceLight transition-colors">
                      <td className="px-4 py-3 text-etapa-textMid">{r.user_email || r.user_id}</td>
                      <td className="px-4 py-3 font-mono text-etapa-primary">{r.coupon_code}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.plan === "lifetime"
                            ? "bg-purple-900/30 text-purple-300 border border-purple-700/30"
                            : "bg-etapa-primary/10 text-etapa-primary border border-etapa-primary/20"
                        }`}>
                          {r.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-etapa-textMuted">{formatDate(r.redeemed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
