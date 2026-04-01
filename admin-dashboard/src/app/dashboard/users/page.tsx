"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  subscription: {
    plan: string;
    status: string;
    current_period_end: string | null;
  } | null;
  planCount: number;
  firstPlanAt: string | null;
  messageCount: number;
  feedbackCount: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse text-gray-500">Loading users...</div>;

  const withSub = users.filter((u) => u.subscription);
  const activeSubs = users.filter((u) => ["active", "trialing", "paid"].includes(u.subscription?.status || ""));
  const totalMessages = users.reduce((sum, u) => sum + u.messageCount, 0);
  const totalPlans = users.reduce((sum, u) => sum + u.planCount, 0);

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Users</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Users" value={users.length} />
        <StatCard label="Active Subscriptions" value={activeSubs.length} />
        <StatCard label="Total Plans" value={totalPlans} />
        <StatCard label="Total Messages" value={totalMessages} />
      </div>

      <DataTable
        searchKey="email"
        searchPlaceholder="Search by email..."
        columns={[
          { key: "name", label: "User", render: (u: User) => (
            <div>
              <p className="font-medium text-gray-900">{u.name || "—"}</p>
              <p className="text-xs text-gray-500">{u.email}</p>
            </div>
          )},
          { key: "subscription", label: "Plan", render: (u: User) => (
            u.subscription ? <Badge value={u.subscription.plan} /> : <span className="text-xs text-gray-400">free</span>
          )},
          { key: "subStatus", label: "Status", render: (u: User) => (
            u.subscription ? <Badge value={u.subscription.status} /> : <span className="text-xs text-gray-400">—</span>
          )},
          { key: "planCount", label: "Plans", render: (u: User) => (
            <div className="text-center">
              <p className="font-medium text-gray-900">{u.planCount}</p>
              {u.firstPlanAt && <p className="text-xs text-gray-500">since {new Date(u.firstPlanAt).toLocaleDateString()}</p>}
            </div>
          )},
          { key: "messageCount", label: "Messages", render: (u: User) => (
            <span className="text-sm text-gray-700">{u.messageCount}</span>
          )},
          { key: "feedbackCount", label: "Feedback", render: (u: User) => (
            <span className="text-sm text-gray-700">{u.feedbackCount}</span>
          )},
          { key: "createdAt", label: "Signed Up", render: (u: User) => new Date(u.createdAt).toLocaleDateString() },
          { key: "lastSignInAt", label: "Last Sign In", render: (u: User) => u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString() : "—" },
        ]}
        data={users}
      />
    </div>
  );
}
