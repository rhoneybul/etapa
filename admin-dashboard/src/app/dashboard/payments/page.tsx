"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paid: boolean;
  created: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  hostedUrl: string | null;
  amountRefunded: number;
}

interface Subscription {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  stripeCustomerId: string;
  plan: string;
  status: string;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  totalPaid: number;
  currency: string;
  payments: PaymentRecord[];
  upcomingInvoice: {
    amount: number;
    currency: string;
    dueDate: string | null;
  } | null;
}

function formatCurrency(amount: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<Subscription | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
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

  const openRefund = (sub: Subscription) => {
    setRefundTarget(sub);
    setRefundAmount(sub.totalPaid.toFixed(2));
    setRefundError(null);
  };

  const handleRefund = async () => {
    if (!refundTarget) return;
    const amount = parseFloat(refundAmount);
    if (isNaN(amount) || amount <= 0) {
      setRefundError("Enter a valid amount");
      return;
    }
    if (amount > refundTarget.totalPaid) {
      setRefundError(`Cannot exceed total paid (${formatCurrency(refundTarget.totalPaid, refundTarget.currency)})`);
      return;
    }

    setRefunding(true);
    setRefundError(null);

    try {
      const res = await fetch("/api/payments/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId: refundTarget.id,
          amountCents: Math.round(amount * 100),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRefundError(data.error || "Refund failed");
      } else {
        setRefundTarget(null);
        fetchData();
      }
    } catch {
      setRefundError("Network error — please try again");
    } finally {
      setRefunding(false);
    }
  };

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
  const totalRevenue = subs.reduce((sum, s) => sum + s.totalPaid, 0);
  const trialingSubs = subs.filter((s) => s.status === "trialing");

  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-6">Subscriptions & Payments</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Subscriptions" value={subs.length} />
        <StatCard label="Active / Paid" value={activeSubs.length} />
        <StatCard label="In Trial" value={trialingSubs.length} />
        <StatCard label="Total Revenue" value={formatCurrency(totalRevenue)} />
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-etapa-border bg-etapa-surfaceLight">
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide w-6"></th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Total Paid</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Trial End</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Next Payment</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Started</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-etapa-border">
              {subs.map((sub) => (
                <>
                  <tr
                    key={sub.id}
                    className="hover:bg-etapa-surfaceLight transition-colors cursor-pointer"
                    onClick={() => setExpanded(expanded === sub.id ? null : sub.id)}
                  >
                    <td className="px-4 py-3 text-etapa-textFaint">
                      <span className={`inline-block transition-transform ${expanded === sub.id ? "rotate-90" : ""}`}>&#9656;</span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-white">{sub.userName}</p>
                        <p className="text-xs text-etapa-textMuted">{sub.userEmail}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge value={sub.plan} /></td>
                    <td className="px-4 py-3"><Badge value={sub.status} /></td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-white">{formatCurrency(sub.totalPaid, sub.currency)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-etapa-textMid">
                      {sub.status === "trialing" ? formatDate(sub.trialEnd) : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-xs text-etapa-textMid">
                      {sub.upcomingInvoice ? (
                        <div>
                          <span className="text-white">{formatCurrency(sub.upcomingInvoice.amount, sub.upcomingInvoice.currency)}</span>
                          <span className="text-etapa-textMuted ml-1">on {formatDate(sub.upcomingInvoice.dueDate)}</span>
                        </div>
                      ) : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-xs text-etapa-textMid">{formatDate(sub.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {sub.totalPaid > 0 && sub.status !== "refunded" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openRefund(sub); }}
                            className="text-xs text-red-500 hover:text-red-400 transition-colors"
                          >
                            Refund
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(sub); setDeleteError(null); }}
                          className="text-xs text-red-500 hover:text-red-400 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === sub.id && (
                    <tr key={`${sub.id}-detail`}>
                      <td colSpan={9} className="px-8 py-4 bg-etapa-bgDeep">
                        <div className="mb-2">
                          <span className="text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Payment History</span>
                          {sub.stripeCustomerId && (
                            <span className="ml-4 font-mono text-xs text-etapa-textFaint">{sub.stripeCustomerId}</span>
                          )}
                        </div>
                        {sub.payments.length === 0 ? (
                          <p className="text-xs text-etapa-textFaint">No payments recorded</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-etapa-textMuted">
                                <th className="text-left py-1 pr-4">Date</th>
                                <th className="text-left py-1 pr-4">Amount</th>
                                <th className="text-left py-1 pr-4">Status</th>
                                <th className="text-left py-1 pr-4">Period</th>
                                <th className="text-left py-1 pr-4">Refunded</th>
                                <th className="text-left py-1">Invoice</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-etapa-border">
                              {sub.payments.map((p) => (
                                <tr key={p.id} className="text-etapa-textMid">
                                  <td className="py-2 pr-4">{formatDate(p.created)}</td>
                                  <td className="py-2 pr-4 text-white font-medium">{formatCurrency(p.amount, p.currency)}</td>
                                  <td className="py-2 pr-4">
                                    <Badge value={p.paid ? "paid" : p.status} />
                                  </td>
                                  <td className="py-2 pr-4">
                                    {p.periodStart && p.periodEnd
                                      ? `${formatDate(p.periodStart)} \u2013 ${formatDate(p.periodEnd)}`
                                      : "\u2014"}
                                  </td>
                                  <td className="py-2 pr-4">
                                    {p.amountRefunded > 0 ? (
                                      <span className="text-red-400">{formatCurrency(p.amountRefunded, p.currency)}</span>
                                    ) : "\u2014"}
                                  </td>
                                  <td className="py-2">
                                    {p.hostedUrl ? (
                                      <a href={p.hostedUrl} target="_blank" rel="noopener noreferrer" className="text-etapa-primary hover:underline">
                                        View
                                      </a>
                                    ) : "\u2014"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {subs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-etapa-textFaint">
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
              <button
                onClick={() => setExpanded(expanded === sub.id ? null : sub.id)}
                className="w-full text-left p-4 hover:bg-etapa-surfaceLight transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">{sub.userName}</p>
                    {sub.userEmail && <p className="text-xs text-etapa-textMuted truncate">{sub.userEmail}</p>}
                  </div>
                  <span className="font-medium text-white shrink-0 ml-3">{formatCurrency(sub.totalPaid, sub.currency)}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge value={sub.plan} />
                  <Badge value={sub.status} />
                  <span className="text-xs text-etapa-textFaint ml-auto">{formatDate(sub.createdAt)}</span>
                </div>
                {sub.upcomingInvoice && (
                  <p className="text-xs text-etapa-textMid mt-2">
                    Next: {formatCurrency(sub.upcomingInvoice.amount, sub.upcomingInvoice.currency)} on {formatDate(sub.upcomingInvoice.dueDate)}
                  </p>
                )}
              </button>
              <div className="px-4 pb-3 flex items-center gap-3">
                {sub.totalPaid > 0 && sub.status !== "refunded" && (
                  <button
                    onClick={() => openRefund(sub)}
                    className="text-xs text-red-500 hover:text-red-400 transition-colors"
                  >
                    Refund
                  </button>
                )}
                <button
                  onClick={() => { setDeleteTarget(sub); setDeleteError(null); }}
                  className="text-xs text-red-500 hover:text-red-400 transition-colors"
                >
                  Delete
                </button>
              </div>
              {expanded === sub.id && (
                <div className="px-4 pb-4 border-t border-etapa-border pt-3">
                  <span className="text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Payment History</span>
                  {sub.stripeCustomerId && (
                    <p className="font-mono text-xs text-etapa-textFaint mt-0.5 break-all">{sub.stripeCustomerId}</p>
                  )}
                  {sub.payments.length === 0 ? (
                    <p className="text-xs text-etapa-textFaint mt-2">No payments recorded</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {sub.payments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-xs">
                          <div>
                            <span className="text-white font-medium">{formatCurrency(p.amount, p.currency)}</span>
                            <span className="text-etapa-textFaint ml-2">{formatDate(p.created)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge value={p.paid ? "paid" : p.status} />
                            {p.hostedUrl && (
                              <a href={p.hostedUrl} target="_blank" rel="noopener noreferrer" className="text-etapa-primary hover:underline">
                                View
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <p className="mt-2 text-xs text-etapa-textFaint">{subs.length} subscription{subs.length !== 1 ? "s" : ""}</p>

      {/* Refund Modal */}
      {refundTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setRefundTarget(null)}>
          <div
            className="bg-etapa-surface border border-etapa-border rounded-xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-white mb-1">Refund</h2>
            <p className="text-sm text-etapa-textMid mb-4">
              {refundTarget.userName} &middot; {refundTarget.plan} plan
            </p>

            <div className="mb-4">
              <label className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1 block">
                Total Paid
              </label>
              <p className="text-lg font-semibold text-white">
                {formatCurrency(refundTarget.totalPaid, refundTarget.currency)}
              </p>
            </div>

            <div className="mb-4">
              <label className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1 block">
                Refund Amount ({refundTarget.currency.toUpperCase()})
              </label>
              <div className="flex items-center gap-2">
                <span className="text-etapa-textMid">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={refundTarget.totalPaid}
                  value={refundAmount}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val > refundTarget.totalPaid) return;
                    setRefundAmount(e.target.value);
                  }}
                  className="flex-1 px-3 py-2 bg-etapa-bgDeep border border-etapa-border rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              {refundError && (
                <p className="text-xs text-red-400 mt-1">{refundError}</p>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRefundTarget(null)}
                className="px-4 py-2 text-sm text-etapa-textMid hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRefund}
                disabled={refunding}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {refunding ? "Processing..." : `Refund ${refundAmount ? formatCurrency(parseFloat(refundAmount) || 0, refundTarget.currency) : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

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
                {!["canceled", "refunded", "expired"].includes(deleteTarget.status) && (
                  <> The active Stripe subscription will also be cancelled.</>
                )}
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
