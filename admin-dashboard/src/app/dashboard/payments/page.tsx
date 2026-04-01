"use client";

import { useEffect, useState } from "react";
import { Payment } from "@/types";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/payments")
      .then((r) => r.json())
      .then(setPayments)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse text-gray-500">Loading payments...</div>;

  const totalRevenue = payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amount, 0);
  const failedCount = payments.filter((p) => p.status === "failed").length;

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Payments</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Payments" value={payments.length} />
        <StatCard label="Revenue" value={formatCurrency(totalRevenue, "USD")} sub="Succeeded payments only" />
        <StatCard label="Failed" value={failedCount} />
      </div>

      <DataTable
        searchKey="userName"
        searchPlaceholder="Search by user..."
        columns={[
          { key: "userName", label: "User" },
          { key: "description", label: "Description" },
          { key: "amount", label: "Amount", render: (p) => (
            <span className="font-medium">{formatCurrency(p.amount, p.currency)}</span>
          )},
          { key: "status", label: "Status", render: (p) => <Badge value={p.status} /> },
          { key: "createdAt", label: "Date", render: (p) => new Date(p.createdAt).toLocaleDateString() },
        ]}
        data={payments}
      />
    </div>
  );
}
