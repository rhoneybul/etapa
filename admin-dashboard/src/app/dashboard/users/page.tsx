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
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchUsers = () => {
    setLoading(true);
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async (user: User) => {
    const confirmed = window.confirm(
      `Permanently delete ${user.name || user.email} and ALL their data?\n\nThis will remove their plans, activities, subscriptions, messages, feedback, and auth account.\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    const doubleConfirm = window.confirm(
      `Are you absolutely sure? Type OK to confirm deletion of ${user.email}.`
    );
    if (!doubleConfirm) return;

    setDeleting(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
      } else {
        alert(`Failed to delete user: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert("Failed to delete user. Check the console for details.");
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <div className="animate-pulse text-etapa-textMuted">Loading users...</div>;

  const activeSubs = users.filter((u) => ["active", "trialing", "paid"].includes(u.subscription?.status || ""));
  const totalMessages = users.reduce((sum, u) => sum + u.messageCount, 0);
  const totalPlans = users.reduce((sum, u) => sum + u.planCount, 0);

  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-6">Users</h1>

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
              <p className="font-medium text-white">{u.name || "\u2014"}</p>
              <p className="text-xs text-etapa-textMuted">{u.email}</p>
            </div>
          )},
          { key: "subscription", label: "Plan", render: (u: User) => (
            u.subscription ? <Badge value={u.subscription.plan} /> : <span className="text-xs text-etapa-textFaint">free</span>
          )},
          { key: "subStatus", label: "Status", render: (u: User) => (
            u.subscription ? <Badge value={u.subscription.status} /> : <span className="text-xs text-etapa-textFaint">\u2014</span>
          )},
          { key: "planCount", label: "Plans", render: (u: User) => (
            <div className="text-center">
              <p className="font-medium text-white">{u.planCount}</p>
              {u.firstPlanAt && <p className="text-xs text-etapa-textMuted">since {new Date(u.firstPlanAt).toLocaleDateString()}</p>}
            </div>
          )},
          { key: "messageCount", label: "Messages", render: (u: User) => (
            <span className="text-sm text-etapa-textMid">{u.messageCount}</span>
          )},
          { key: "feedbackCount", label: "Feedback", render: (u: User) => (
            <span className="text-sm text-etapa-textMid">{u.feedbackCount}</span>
          )},
          { key: "createdAt", label: "Signed Up", render: (u: User) => (
            <span className="text-xs text-etapa-textMid">{new Date(u.createdAt).toLocaleDateString()}</span>
          )},
          { key: "lastSignInAt", label: "Last Sign In", render: (u: User) => (
            <span className="text-xs text-etapa-textMid">{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString() : "\u2014"}</span>
          )},
          { key: "actions", label: "", render: (u: User) => (
            <button
              onClick={() => handleDelete(u)}
              disabled={deleting === u.id}
              className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {deleting === u.id ? "Deleting..." : "Delete"}
            </button>
          )},
        ]}
        data={users}
      />
    </div>
  );
}
