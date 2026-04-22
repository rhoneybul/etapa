"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

interface TrialInfo {
  startedAt: string;
  daysTotal: number;
  daysLeft: number;
  ended: boolean;
  isSubscribed: boolean;
}

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
  hasBeginner: boolean;
  messageCount: number;
  feedbackCount: number;
  trial: TrialInfo | null;
}

function TrialCell({ trial, subscription }: { trial: TrialInfo | null; subscription: User["subscription"] }) {
  if (!trial) return <span className="text-xs text-etapa-textFaint">no plan</span>;

  // Subscribed — show subscribed badge with plan info
  if (trial.isSubscribed || (subscription && ["active", "trialing", "paid"].includes(subscription.status))) {
    return (
      <div>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-900/40 text-green-400">
          subscribed
        </span>
        {subscription?.plan && (
          <p className="text-xs text-etapa-textFaint mt-0.5">
            {subscription.plan} plan
          </p>
        )}
      </div>
    );
  }

  if (trial.ended) {
    return (
      <div>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-900/40 text-red-400">
          trial ended
        </span>
        <p className="text-xs text-etapa-textFaint mt-0.5">
          started {new Date(trial.startedAt).toLocaleDateString()}
        </p>
      </div>
    );
  }

  const pct = Math.round(((trial.daysTotal - trial.daysLeft) / trial.daysTotal) * 100);

  return (
    <div className="min-w-[110px]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-etapa-textMid">
          {trial.daysLeft === 0 ? "last day" : `${trial.daysLeft}d left`}
        </span>
        <span className="text-xs text-etapa-textFaint">{trial.daysTotal}d trial</span>
      </div>
      <div className="w-full bg-etapa-surfaceLight rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full bg-etapa-primary"
          style={{ width: `${100 - pct}%` }}
        />
      </div>
      <p className="text-xs text-etapa-textFaint mt-0.5">
        since {new Date(trial.startedAt).toLocaleDateString()}
      </p>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sendingCheckin, setSendingCheckin] = useState<string | null>(null);

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

  const handleSendCheckin = async (user: User) => {
    if (!window.confirm(`Send a coach check-in notification to ${user.name || user.email}?`)) return;

    setSendingCheckin(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}/coach-checkin`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(`Check-in sent!\n\nCoach: ${data.coachName}\nMessage: "${data.message}"`);
      } else {
        alert(`Failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert("Failed to send check-in. Check the console for details.");
      console.error(err);
    } finally {
      setSendingCheckin(null);
    }
  };

  if (loading) return <div className="animate-pulse text-etapa-textMuted">Loading users...</div>;

  const activeSubs = users.filter((u) => ["active", "trialing", "paid"].includes(u.subscription?.status || ""));
  const beginnerUsers = users.filter((u) => u.hasBeginner);
  const totalMessages = users.reduce((sum, u) => sum + u.messageCount, 0);
  const totalPlans = users.reduce((sum, u) => sum + u.planCount, 0);

  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-6">Users</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Total Users" value={users.length} />
        <StatCard label="Active Subscriptions" value={activeSubs.length} />
        <StatCard label="Beginner Users" value={beginnerUsers.length} />
        <StatCard label="Total Plans" value={totalPlans} />
        <StatCard label="Total Messages" value={totalMessages} />
      </div>

      <DataTable
        searchKey="email"
        searchPlaceholder="Search by email..."
        columns={[
          { key: "name", label: "User", render: (u: User) => (
            <Link href={`/dashboard/users/${u.id}`} className="block group">
              <div className="flex items-center gap-2">
                <p className="font-medium text-white group-hover:text-etapa-primary transition-colors">{u.name || "\u2014"}</p>
                {u.hasBeginner && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-etapa-primary/15 text-etapa-primary border border-etapa-primary/20">
                    BEGINNER
                  </span>
                )}
              </div>
              <p className="text-xs text-etapa-textMuted group-hover:text-etapa-textMid transition-colors">{u.email}</p>
            </Link>
          )},
          { key: "subscription", label: "Plan", render: (u: User) => {
            if (!u.subscription) return <span className="text-xs text-etapa-textFaint">free</span>;
            // Lifetime gets a magenta chip so it's visually distinct at a glance —
            // CS reps often need to spot "user X has lifetime" quickly when a
            // paywall-related ticket lands. See ADMIN_AUDIT.md finding H1.
            if (u.subscription.plan === "lifetime") {
              return (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-etapa-primary/15 text-etapa-primary border border-etapa-primary/20">
                  LIFETIME
                </span>
              );
            }
            return <Badge value={u.subscription.plan} />;
          }},
          { key: "subStatus", label: "Status", render: (u: User) => (
            u.subscription ? <Badge value={u.subscription.status} /> : <span className="text-xs text-etapa-textFaint">\u2014</span>
          )},
          { key: "planCount", label: "Plans", render: (u: User) => (
            <div className="text-center">
              <p className="font-medium text-white">{u.planCount}</p>
              {u.firstPlanAt && <p className="text-xs text-etapa-textMuted">since {new Date(u.firstPlanAt).toLocaleDateString()}</p>}
            </div>
          )},
          { key: "trial", label: "Trial", render: (u: User) => (
            <TrialCell trial={u.trial} subscription={u.subscription} />
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
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleSendCheckin(u)}
                disabled={sendingCheckin === u.id}
                className="text-xs text-etapa-primary hover:text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Send coach check-in"
              >
                {sendingCheckin === u.id ? "Sending..." : "Check-in"}
              </button>
              <button
                onClick={() => handleDelete(u)}
                disabled={deleting === u.id}
                className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting === u.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          )},
        ]}
        data={users}
      />
    </div>
  );
}
