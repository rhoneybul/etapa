"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

interface Payment {
  id: string;
  userId: string;
  userName: string;
  stripeCustomerId: string;
  plan: string;
  status: string;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/payments")
      .then((r) => r.json())
      .then((data) => setPayments(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse text-etapa-textMuted">Loading payments...</div>;

  const activeCount = payments.filter((p) => ["active", "trialing", "paid"].includes(p.status)).length;

  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-6">Subscriptions & Payments</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Subscriptions" value={payments.length} />
        <StatCard label="Active / Trialing" value={activeCount} />
        <StatCard label="Churned" value={payments.filter((p) => p.status === "canceled").length} />
      </div>

      <DataTable
        searchKey="userName"
        searchPlaceholder="Search by user..."
        columns={[
          { key: "userName", label: "User" },
          { key: "plan", label: "Plan", render: (p: Payment) => <Badge value={p.plan} /> },
          { key: "status", label: "Status", render: (p: Payment) => <Badge value={p.status} /> },
          { key: "currentPeriodEnd", label: "Period End", render: (p: Payment) => (
            <span className="text-xs text-etapa-textMid">{p.currentPeriodEnd ? new Date(p.currentPeriodEnd).toLocaleDateString() : "\u2014"}</span>
          )},
          { key: "stripeCustomerId", label: "Stripe ID", render: (p: Payment) => (
            <span className="font-mono text-xs text-etapa-textMuted">{p.stripeCustomerId}</span>
          )},
          { key: "createdAt", label: "Created", render: (p: Payment) => (
            <span className="text-xs text-etapa-textMid">{new Date(p.createdAt).toLocaleDateString()}</span>
          )},
        ]}
        data={payments}
      />
    </div>
  );
}
