"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

interface Subscription {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  plan: string;
  status: string;
  source: string;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
}

interface RCTransaction {
  kind: "one_time" | "subscription";
  productId: string;
  transactionId: string | null;
  store: string | null;
  isSandbox: boolean;
  purchaseDate: string | null;
  originalPurchaseDate?: string | null;
  expiresDate: string | null;
  periodType: string | null;
  refundedAt: string | null;
  billingIssueAt: string | null;
  unsubscribeDetectedAt: string | null;
  ownershipType: string | null;
}

interface RevenueCatData {
  found: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
  originalAppUserId: string | null;
  originalPurchaseDate: string | null;
  managementUrl: string | null;
  transactions: RCTransaction[];
}

function formatDate(iso: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const SOURCE_STYLES: Record<string, string> = {
  "Apple IAP": "bg-blue-900/30 text-blue-300 border-blue-700/30",
  "Google Play": "bg-green-900/30 text-green-300 border-green-700/30",
  "Coupon": "bg-purple-900/30 text-purple-300 border-purple-700/30",
  "Free Trial": "bg-amber-900/30 text-amber-300 border-amber-700/30",
};

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

  const [txTarget, setTxTarget] = useState<Subscription | null>(null);
  const [txData, setTxData] = useState<RevenueCatData | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const openTransactions = async (sub: Subscription) => {
    setTxTarget(sub);
    setTxData(null);
    setTxError(null);
    setTxLoading(true);
    try {
      const res = await fetch(`/api/users/${sub.userId}/revenuecat`);
      const body = await res.json();
      if (!res.ok) {
        setTxError(body.error || `Request failed (${res.status})`);
      } else {
        setTxData(body as RevenueCatData);
      }
    } catch (err: any) {
      setTxError(err.message || "Network error");
    } finally {
      setTxLoading(false);
    }
  };

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

  // Group by source
  const sourceCounts: Record<string, number> = {};
  for (const sub of subs) {
    const src = sub.source || "Unknown";
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-6">Subscriptions & Payments</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Total Subscriptions" value={subs.length} />
        <StatCard label="Active / Paid" value={activeSubs.length} />
        <StatCard label="In Trial" value={trialingSubs.length} />
        <StatCard label="Plans" value={Object.entries(planCounts).map(([p, c]) => `${p}: ${c}`).join(", ") || "\u2014"} />
        <StatCard label="Sources" value={Object.entries(sourceCounts).map(([s, c]) => `${s}: ${c}`).join(", ") || "\u2014"} />
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
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Source</th>
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
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${SOURCE_STYLES[sub.source] || "bg-gray-800 text-gray-400 border-gray-700"}`}>
                      {sub.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-etapa-textMid">
                    {sub.status === "trialing" ? formatDate(sub.trialEnd) : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-xs text-etapa-textMid">
                    {formatDate(sub.currentPeriodEnd)}
                  </td>
                  <td className="px-4 py-3 text-xs text-etapa-textMid whitespace-nowrap">{formatDateTime(sub.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <Link
                        href={`/dashboard/users/${sub.userId}`}
                        className="text-xs text-etapa-textMuted hover:text-white transition-colors"
                      >
                        View user
                      </Link>
                      <button
                        onClick={() => openTransactions(sub)}
                        className="text-xs text-etapa-primary hover:text-amber-400 transition-colors"
                      >
                        Transactions
                      </button>
                      <button
                        onClick={() => { setDeleteTarget(sub); setDeleteError(null); }}
                        className="text-xs text-red-500 hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {subs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-etapa-textFaint">
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
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${SOURCE_STYLES[sub.source] || "bg-gray-800 text-gray-400 border-gray-700"}`}>
                    {sub.source}
                  </span>
                  <span className="text-xs text-etapa-textFaint ml-auto">{formatDate(sub.createdAt)}</span>
                </div>
                {sub.currentPeriodEnd && (
                  <p className="text-xs text-etapa-textMid mt-2">
                    Period ends: {formatDate(sub.currentPeriodEnd)}
                  </p>
                )}
              </div>
              <div className="px-4 pb-3 flex items-center gap-3">
                <Link
                  href={`/dashboard/users/${sub.userId}`}
                  className="text-xs text-etapa-textMuted hover:text-white transition-colors"
                >
                  View user
                </Link>
                <button
                  onClick={() => openTransactions(sub)}
                  className="text-xs text-etapa-primary hover:text-amber-400 transition-colors"
                >
                  Transactions
                </button>
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
              {deleteTarget.userName} &middot; {deleteTarget.plan} plan &middot; {deleteTarget.source}
            </p>

            <div className="bg-red-900/20 border border-red-900/40 rounded-lg p-3 mb-4">
              <p className="text-xs font-medium text-red-400">
                This will permanently remove this subscription record from the database.
                If this is an Apple IAP or Google Play subscription, the user may still have
                an active subscription in the store — this only removes the local record.
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

      {/* Transactions Modal */}
      {txTarget && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setTxTarget(null)}
        >
          <div
            className="bg-etapa-surface border border-etapa-border rounded-xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-etapa-border flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-white truncate">
                  Transactions — {txTarget.userName}
                </h2>
                <p className="text-xs text-etapa-textMuted truncate">
                  {txTarget.userEmail} &middot; Live from RevenueCat
                </p>
              </div>
              <button
                onClick={() => setTxTarget(null)}
                className="text-etapa-textMuted hover:text-white p-1"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-auto">
              {txLoading ? (
                <div className="text-sm text-etapa-textMuted animate-pulse">Loading live transactions...</div>
              ) : txError ? (
                <div className="bg-red-900/20 border border-red-900/40 rounded-lg p-4 text-sm text-red-400">
                  {txError}
                </div>
              ) : !txData || !txData.found ? (
                <div className="text-sm text-etapa-textFaint text-center py-8">
                  No RevenueCat record for this user. They may have never made a purchase via IAP,
                  or the RC secret API key isn't configured on the server.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    <div className="bg-etapa-surfaceLight rounded-lg p-3">
                      <p className="text-[10px] text-etapa-textMuted uppercase tracking-wide">First Seen</p>
                      <p className="text-sm text-white mt-0.5">{formatDate(txData.firstSeen)}</p>
                    </div>
                    <div className="bg-etapa-surfaceLight rounded-lg p-3">
                      <p className="text-[10px] text-etapa-textMuted uppercase tracking-wide">Last Seen</p>
                      <p className="text-sm text-white mt-0.5">{formatDate(txData.lastSeen)}</p>
                    </div>
                    <div className="bg-etapa-surfaceLight rounded-lg p-3">
                      <p className="text-[10px] text-etapa-textMuted uppercase tracking-wide">First Purchase</p>
                      <p className="text-sm text-white mt-0.5">{formatDate(txData.originalPurchaseDate)}</p>
                    </div>
                    <div className="bg-etapa-surfaceLight rounded-lg p-3">
                      <p className="text-[10px] text-etapa-textMuted uppercase tracking-wide">Transactions</p>
                      <p className="text-sm text-white mt-0.5">{txData.transactions.length}</p>
                    </div>
                  </div>

                  {txData.transactions.length === 0 ? (
                    <p className="text-sm text-etapa-textFaint text-center py-6">
                      No purchase transactions recorded in RevenueCat.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-etapa-border text-left">
                            <th className="px-3 py-2 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Kind</th>
                            <th className="px-3 py-2 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Product</th>
                            <th className="px-3 py-2 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Store</th>
                            <th className="px-3 py-2 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Env</th>
                            <th className="px-3 py-2 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Purchase Time</th>
                            <th className="px-3 py-2 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Expires</th>
                            <th className="px-3 py-2 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Flags</th>
                            <th className="px-3 py-2 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Tx ID</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-etapa-border">
                          {txData.transactions.map((t, i) => (
                            <tr key={`${t.transactionId || t.productId}-${i}`}>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    t.kind === "subscription"
                                      ? "bg-indigo-900/30 text-indigo-300"
                                      : "bg-purple-900/30 text-purple-300"
                                  }`}
                                >
                                  {t.kind === "subscription" ? "sub" : "one-time"}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs text-etapa-textMid font-mono">{t.productId}</td>
                              <td className="px-3 py-2 text-xs text-etapa-textMid">{t.store || "\u2014"}</td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    t.isSandbox
                                      ? "bg-amber-900/30 text-amber-400"
                                      : "bg-green-900/30 text-green-400"
                                  }`}
                                >
                                  {t.isSandbox ? "sandbox" : "prod"}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs text-etapa-textMid whitespace-nowrap">
                                {formatDateTime(t.purchaseDate)}
                              </td>
                              <td className="px-3 py-2 text-xs text-etapa-textMid whitespace-nowrap">
                                {t.expiresDate ? formatDateTime(t.expiresDate) : "\u2014"}
                              </td>
                              <td className="px-3 py-2 space-x-1">
                                {t.refundedAt && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-900/30 text-orange-400">
                                    refunded
                                  </span>
                                )}
                                {t.billingIssueAt && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-900/30 text-red-400">
                                    billing
                                  </span>
                                )}
                                {t.unsubscribeDetectedAt && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-300">
                                    unsub
                                  </span>
                                )}
                                {t.periodType && t.periodType !== "normal" && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-900/30 text-blue-300">
                                    {t.periodType}
                                  </span>
                                )}
                                {!t.refundedAt && !t.billingIssueAt && !t.unsubscribeDetectedAt && (!t.periodType || t.periodType === "normal") && (
                                  <span className="text-xs text-etapa-textFaint">{"\u2014"}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs font-mono text-etapa-textFaint break-all">
                                {t.transactionId || "\u2014"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <StatCard label="Total Redemptions" value={redemptions.length} />
              <StatCard label="Unique Users" value={new Set(redemptions.map(r => r.user_id)).size} />
              <StatCard label="Lifetime Codes" value={redemptions.filter(r => r.plan === "lifetime").length} />
              <StatCard label="Starter Codes" value={redemptions.filter(r => r.plan !== "lifetime").length} />
            </div>

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
