"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

interface PlanConfig {
  daysPerWeek: number | null;
  sessionsPerWeek: number | null;
  fitnessLevel: string | null;
  indoorTrainer: boolean | null;
  coachId: string | null;
  trainingTypes: string[] | null;
  extraNotes: string | null;
}

interface PlanGoal {
  cyclingType: string | null;
  goalType: string | null;
  targetDistance: number | null;
  targetElevation: number | null;
  targetTime: string | null;
  targetDate: string | null;
  eventName: string | null;
}

interface Plan {
  id: string;
  name: string | null;
  status: string;
  weeks: number;
  startDate: string;
  createdAt: string;
  userId: string;
  userName: string;
  activityCount: number;
  config: PlanConfig | null;
  goal: PlanGoal | null;
}

export default function PlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (plan: Plan) => {
    const confirmed = window.confirm(
      `Delete "${plan.name || "Untitled Plan"}" by ${plan.userName}?\n\nThis will permanently remove the plan and all ${plan.activityCount} activities.\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(plan.id);
    try {
      const res = await fetch(`/api/plans/${plan.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(`Failed to delete plan: ${data.error || "Unknown error"}`);
        return;
      }
      setPlans((prev) => prev.filter((p) => p.id !== plan.id));
    } catch (err) {
      alert("Failed to delete plan. Check the console for details.");
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    fetch("/api/plans")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setError(data.error || `API error ${r.status}`);
          return;
        }
        if (Array.isArray(data)) {
          setPlans(data);
        } else if (data.error) {
          setError(data.error);
        } else {
          setPlans([]);
        }
      })
      .catch((err) => setError(err.message || "Failed to fetch plans"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse text-etapa-textMuted">Loading plans...</div>;

  if (error) return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-6">Plans</h1>
      <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-5 text-sm text-red-400">
        <p className="font-medium mb-1">Failed to load plans</p>
        <p className="text-red-400/70">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); window.location.reload(); }}
          className="mt-3 px-4 py-2 bg-red-900/30 border border-red-900/40 rounded-lg text-xs text-red-300 hover:bg-red-900/50 transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );

  const activePlans = plans.filter((p) => p.status === "active");
  const totalActivities = plans.reduce((sum, p) => sum + p.activityCount, 0);

  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-6">Plans</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Plans" value={plans.length} />
        <StatCard label="Active" value={activePlans.length} />
        <StatCard label="Total Activities" value={totalActivities} />
      </div>

      <DataTable
        searchKey="userName"
        searchPlaceholder="Search by user..."
        columns={[
          { key: "name", label: "Plan Name", render: (p: Plan) => (
            <div
              className="cursor-pointer"
              onClick={() => router.push(`/dashboard/plans/${p.id}`)}
            >
              <p className="font-medium text-etapa-primary hover:text-etapa-primary/80 transition-colors">{p.name || "Untitled"}</p>
              <p className="text-xs text-etapa-textMuted">{p.weeks} weeks, {p.activityCount} activities</p>
            </div>
          )},
          { key: "userName", label: "Created By" },
          { key: "goal", label: "Goal", render: (p: Plan) => p.goal ? (
            <div className="text-xs">
              <p className="font-medium text-white">{p.goal.cyclingType || "\u2014"} &middot; {p.goal.goalType || "\u2014"}</p>
              {p.goal.targetDistance && <p className="text-etapa-textMuted">{p.goal.targetDistance} km</p>}
              {p.goal.targetElevation && <p className="text-etapa-textMuted">{p.goal.targetElevation} m elev</p>}
              {p.goal.eventName && <p className="text-etapa-textMuted">{p.goal.eventName}</p>}
            </div>
          ) : <span className="text-xs text-etapa-textFaint">&mdash;</span> },
          { key: "config", label: "Config", render: (p: Plan) => p.config ? (
            <div className="text-xs">
              <p className="text-etapa-textMid">{p.config.sessionsPerWeek || p.config.daysPerWeek || "?"} sessions/wk</p>
              {p.config.fitnessLevel && <p className="text-etapa-textMuted">{p.config.fitnessLevel}</p>}
              {p.config.indoorTrainer && <p className="text-etapa-textMuted">Indoor trainer</p>}
            </div>
          ) : <span className="text-xs text-etapa-textFaint">&mdash;</span> },
          { key: "status", label: "Status", render: (p: Plan) => <Badge value={p.status} /> },
          { key: "startDate", label: "Start", render: (p: Plan) => (
            <span className="text-xs text-etapa-textMid">{p.startDate ? new Date(p.startDate).toLocaleDateString() : "\u2014"}</span>
          )},
          { key: "createdAt", label: "Created", render: (p: Plan) => (
            <span className="text-xs text-etapa-textMid">{new Date(p.createdAt).toLocaleDateString()}</span>
          )},
          { key: "actions", label: "", render: (p: Plan) => (
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
              disabled={deleting === p.id}
              className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {deleting === p.id ? "Deleting..." : "Delete"}
            </button>
          )},
        ]}
        data={plans}
      />
    </div>
  );
}
