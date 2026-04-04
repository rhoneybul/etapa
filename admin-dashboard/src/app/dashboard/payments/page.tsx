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

export default function PaymentsPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<Subscription | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    fetch("/api/payments")
      .then((r) => r.json())
      .then((data) => setSubs(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
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
                      {sub.totalPaid > 0 && sub.status !== "refunded" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openRefund(sub); }}
                          className="text-xs text-red-500 hover:text-red-400 transition-colors"
                        >
                          Refund
                        </button>
                      )}
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
              {sub.totalPaid > 0 && sub.status !== "refunded" && (
                <div className="px-4 pb-3">
                  <button
                    onClick={() => openRefund(sub)}
                    className="text-xs text-red-500 hover:text-red-400 transition-colors"
                  >
                    Refund
                  </button>
                </div>
              )}
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
    </div>
  );
}
