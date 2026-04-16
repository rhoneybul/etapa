"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/badge";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const EFFORT_COLORS: Record<string, string> = {
  easy: "bg-green-900/30 text-green-400 border-green-800",
  moderate: "bg-amber-900/30 text-amber-400 border-amber-800",
  hard: "bg-red-900/30 text-red-400 border-red-800",
  recovery: "bg-blue-900/30 text-blue-400 border-blue-800",
};

interface Activity {
  id: string;
  week: number;
  dayOfWeek: number | null;
  type: string;
  subType: string | null;
  title: string;
  description: string | null;
  notes: string | null;
  durationMins: number | null;
  distanceKm: number | null;
  effort: string;
  completed: boolean;
  completedAt: string | null;
}

interface PlanDetail {
  id: string;
  name: string | null;
  status: string;
  weeks: number;
  startDate: string;
  currentWeek: number;
  createdAt: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  goalId: string | null;
  configId: string | null;
  config: {
    daysPerWeek: number | null;
    sessionsPerWeek: number | null;
    fitnessLevel: string | null;
    indoorTrainer: boolean | null;
    coachId: string | null;
    trainingTypes: string[] | null;
    extraNotes: string | null;
  } | null;
  goal: {
    cyclingType: string | null;
    goalType: string | null;
    targetDistance: number | null;
    targetElevation: number | null;
    targetTime: string | null;
    targetDate: string | null;
    eventName: string | null;
    planName: string | null;
  } | null;
  activities: Activity[];
}

export default function PlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const planId = params.id as string;

  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingActivity, setEditingActivity] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Activity>>({});
  const [saving, setSaving] = useState(false);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [viewMode, setViewMode] = useState<"weeks" | "calendar">("weeks");

  const fetchPlan = () => {
    setLoading(true);
    fetch(`/api/plans/${planId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load plan (${r.status})`);
        return r.json();
      })
      .then((data) => {
        setPlan(data);
        // Auto-expand current week
        if (data.currentWeek) {
          setExpandedWeeks(new Set([data.currentWeek]));
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPlan();
  }, [planId]);

  const toggleWeek = (week: number) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(week)) next.delete(week);
      else next.add(week);
      return next;
    });
  };

  const expandAll = () => {
    if (!plan) return;
    const allWeeks = new Set(Array.from({ length: plan.weeks }, (_, i) => i + 1));
    setExpandedWeeks(allWeeks);
  };

  const collapseAll = () => setExpandedWeeks(new Set());

  const startEdit = (activity: Activity) => {
    setEditingActivity(activity.id);
    setEditForm({ ...activity });
  };

  const cancelEdit = () => {
    setEditingActivity(null);
    setEditForm({});
  };

  const saveActivity = async () => {
    if (!editingActivity || !plan) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/plans/${planId}/activities/${editingActivity}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error("Failed to save");

      // Update local state
      setPlan({
        ...plan,
        activities: plan.activities.map((a) =>
          a.id === editingActivity ? { ...a, ...editForm } : a
        ),
      });
      setEditingActivity(null);
      setEditForm({});
    } catch (err) {
      alert("Failed to save activity. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const deletePlan = async () => {
    if (!plan) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete "${plan.name || "Untitled Plan"}" for ${plan.userName}? This will permanently remove the plan and all ${plan.activities.length} activities.`
    );
    if (!confirmed) return;
    const doubleConfirm = window.confirm(
      "This action cannot be undone. Are you absolutely sure?"
    );
    if (!doubleConfirm) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/plans/${planId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete plan");
      router.push("/dashboard/plans");
    } catch (err) {
      alert("Failed to delete plan. Please try again.");
      setDeleting(false);
    }
  };

  if (loading) return <div className="animate-pulse text-etapa-textMuted">Loading plan...</div>;
  if (error) return <div className="text-red-400">{error}</div>;
  if (!plan) return <div className="text-etapa-textMuted">Plan not found</div>;

  // Group activities by week
  const byWeek: Record<number, Activity[]> = {};
  for (const a of plan.activities) {
    if (!byWeek[a.week]) byWeek[a.week] = [];
    byWeek[a.week].push(a);
  }

  // Helper to get a date for a given week/day
  const getDate = (week: number, dayOfWeek: number | null) => {
    if (!plan.startDate) return null;
    const [datePart] = plan.startDate.split("T");
    const [y, m, d] = datePart.split("-").map(Number);
    const start = new Date(y, m - 1, d);
    const offset = (week - 1) * 7 + (dayOfWeek ?? 0);
    const result = new Date(start);
    result.setDate(result.getDate() + offset);
    return result;
  };

  const completedCount = plan.activities.filter((a) => a.completed).length;
  const totalCount = plan.activities.length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={() => router.push("/dashboard/plans")}
            className="text-etapa-textMid hover:text-white transition-colors text-lg shrink-0"
          >
            &larr;
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-white truncate">
              {plan.name || "Untitled Plan"}
            </h1>
            <p className="text-xs text-etapa-textMuted truncate">
              {plan.userName} {plan.userEmail ? `(${plan.userEmail})` : ""} &middot;{" "}
              {plan.weeks} weeks &middot; {totalCount} activities
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-8 sm:ml-0">
          <Badge value={plan.status} />
          <button
            onClick={deletePlan}
            disabled={deleting}
            className="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-800 text-xs font-medium rounded-lg hover:bg-red-900/50 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {deleting ? "Deleting..." : "Delete Plan"}
          </button>
        </div>
      </div>

      {/* Plan info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4">
          <p className="text-xs text-etapa-textMuted mb-1">Start Date</p>
          <p className="text-sm font-medium text-white">
            {plan.startDate
              ? new Date(plan.startDate).toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "\u2014"}
          </p>
        </div>
        <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4">
          <p className="text-xs text-etapa-textMuted mb-1">Progress</p>
          <p className="text-sm font-medium text-white">
            {completedCount}/{totalCount} completed
          </p>
          <div className="mt-2 h-1.5 bg-etapa-border rounded-full overflow-hidden">
            <div
              className="h-full bg-etapa-primary rounded-full transition-all"
              style={{
                width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
        {plan.goal && (
          <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4">
            <p className="text-xs text-etapa-textMuted mb-1">Goal</p>
            <p className="text-sm font-medium text-white">
              {plan.goal.planName || plan.goal.goalType || "\u2014"}
            </p>
            <p className="text-xs text-etapa-textMuted mt-0.5">
              {plan.goal.cyclingType}
              {plan.goal.targetDistance ? ` \u00B7 ${plan.goal.targetDistance} km` : ""}
              {plan.goal.eventName ? ` \u00B7 ${plan.goal.eventName}` : ""}
            </p>
          </div>
        )}
        {plan.config && (
          <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4">
            <p className="text-xs text-etapa-textMuted mb-1">Config</p>
            <p className="text-sm font-medium text-white">
              {plan.config.daysPerWeek || plan.config.sessionsPerWeek || "?"} days/week
            </p>
            <p className="text-xs text-etapa-textMuted mt-0.5">
              {plan.config.fitnessLevel || ""}
              {plan.config.coachId ? ` \u00B7 ${plan.config.coachId}` : ""}
              {plan.config.indoorTrainer ? " \u00B7 Indoor" : ""}
            </p>
          </div>
        )}
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center bg-etapa-surface border border-etapa-border rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode("weeks")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "weeks"
                ? "bg-etapa-primary text-white"
                : "text-etapa-textMuted hover:text-white"
            }`}
          >
            Weeks
          </button>
          <button
            onClick={() => setViewMode("calendar")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "calendar"
                ? "bg-etapa-primary text-white"
                : "text-etapa-textMuted hover:text-white"
            }`}
          >
            Calendar
          </button>
        </div>
        {viewMode === "weeks" && (
          <div className="flex items-center gap-3">
            <button
              onClick={expandAll}
              className="text-xs text-etapa-primary hover:text-etapa-primary/80 transition-colors"
            >
              Expand all
            </button>
            <span className="text-etapa-textFaint text-xs">&middot;</span>
            <button
              onClick={collapseAll}
              className="text-xs text-etapa-textMuted hover:text-white transition-colors"
            >
              Collapse all
            </button>
          </div>
        )}
      </div>

      {/* Calendar view */}
      {viewMode === "calendar" && (() => {
        // Build a map of date string → activities
        const activityByDate: Record<string, Activity[]> = {};
        for (const a of plan.activities) {
          const d = getDate(a.week, a.dayOfWeek);
          if (d) {
            const key = d.toISOString().split("T")[0];
            if (!activityByDate[key]) activityByDate[key] = [];
            activityByDate[key].push(a);
          }
        }

        // Find date range: plan start → plan end
        const [startPart] = plan.startDate.split("T");
        const [sy, sm, sd] = startPart.split("-").map(Number);
        const planStart = new Date(sy, sm - 1, sd);
        const planEnd = new Date(planStart);
        planEnd.setDate(planEnd.getDate() + plan.weeks * 7 - 1);

        // Build months to render
        const months: { year: number; month: number }[] = [];
        const cursor = new Date(planStart.getFullYear(), planStart.getMonth(), 1);
        while (cursor <= planEnd) {
          months.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
          cursor.setMonth(cursor.getMonth() + 1);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return (
          <div className="space-y-6">
            {months.map(({ year, month }) => {
              const monthStart = new Date(year, month, 1);
              const monthName = monthStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              // Monday=0 start: getDay() returns 0=Sun, so Mon=0 means (getDay()+6)%7
              const firstDayOffset = (monthStart.getDay() + 6) % 7;

              const cells: (number | null)[] = [];
              for (let i = 0; i < firstDayOffset; i++) cells.push(null);
              for (let d = 1; d <= daysInMonth; d++) cells.push(d);
              // Pad to fill last row
              while (cells.length % 7 !== 0) cells.push(null);

              return (
                <div key={`${year}-${month}`}>
                  <h3 className="text-sm font-medium text-white mb-2">{monthName}</h3>
                  <div className="border border-etapa-border rounded-xl overflow-hidden">
                    {/* Day header */}
                    <div className="grid grid-cols-7 bg-etapa-surface">
                      {DAY_LABELS.map((d) => (
                        <div key={d} className="px-1 py-2 text-center text-[10px] font-medium text-etapa-textMuted uppercase tracking-wide">
                          {d}
                        </div>
                      ))}
                    </div>
                    {/* Date cells */}
                    <div className="grid grid-cols-7">
                      {cells.map((day, i) => {
                        if (day === null) {
                          return <div key={i} className="border-t border-etapa-border bg-etapa-surface/30 min-h-[72px]" />;
                        }
                        const cellDate = new Date(year, month, day);
                        const key = cellDate.toISOString().split("T")[0];
                        const acts = activityByDate[key] || [];
                        const isInPlan = cellDate >= planStart && cellDate <= planEnd;
                        const isToday = cellDate.getTime() === today.getTime();

                        return (
                          <div
                            key={i}
                            className={`border-t border-etapa-border min-h-[72px] px-1 py-1 ${
                              isInPlan ? "bg-etapa-surface" : "bg-etapa-surface/30"
                            } ${isToday ? "ring-1 ring-inset ring-etapa-primary" : ""}`}
                          >
                            <p className={`text-[10px] mb-0.5 ${
                              isToday ? "text-etapa-primary font-bold" : "text-etapa-textFaint"
                            }`}>
                              {day}
                            </p>
                            <div className="space-y-0.5">
                              {acts.map((a) => {
                                const ec = EFFORT_COLORS[a.effort] || "bg-gray-800 text-gray-400 border-gray-700";
                                return (
                                  <div
                                    key={a.id}
                                    className={`text-[10px] leading-tight px-1 py-0.5 rounded border truncate ${ec} ${
                                      a.completed ? "opacity-50 line-through" : ""
                                    }`}
                                    title={`${a.title}${a.durationMins ? ` · ${a.durationMins}m` : ""}${a.distanceKm ? ` · ${a.distanceKm}km` : ""}`}
                                  >
                                    {a.title}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Weeks view */}
      {viewMode === "weeks" && (
      <div className="space-y-3">
        {Array.from({ length: plan.weeks }, (_, i) => i + 1).map((week) => {
          const weekActivities = byWeek[week] || [];
          const isExpanded = expandedWeeks.has(week);
          const weekCompleted = weekActivities.filter((a) => a.completed).length;
          const weekStart = getDate(week, 0);
          const isCurrent = week === plan.currentWeek;

          return (
            <div
              key={week}
              className={`bg-etapa-surface border rounded-xl overflow-hidden ${
                isCurrent ? "border-etapa-primary" : "border-etapa-border"
              }`}
            >
              {/* Week header */}
              <button
                onClick={() => toggleWeek(week)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-etapa-surfaceLight transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-etapa-textFaint w-4">
                    {isExpanded ? "\u25BC" : "\u25B6"}
                  </span>
                  <span className="text-sm font-medium text-white">
                    Week {week}
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] bg-etapa-primary/20 text-etapa-primary px-2 py-0.5 rounded-full font-medium">
                      CURRENT
                    </span>
                  )}
                  {weekStart && (
                    <span className="text-xs text-etapa-textMuted">
                      {weekStart.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <span className="text-xs text-etapa-textMuted hidden sm:inline">
                    {weekActivities.length} sessions
                  </span>
                  <span className="text-xs text-etapa-textMuted">
                    {weekCompleted}/{weekActivities.length} done
                  </span>
                </div>
              </button>

              {/* Activities */}
              {isExpanded && (
                <div className="border-t border-etapa-border divide-y divide-etapa-border">
                  {weekActivities.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-etapa-textFaint">
                      No activities this week
                    </div>
                  ) : (
                    weekActivities.map((activity) => {
                      const isEditing = editingActivity === activity.id;
                      const date = getDate(activity.week, activity.dayOfWeek);
                      const effortClass =
                        EFFORT_COLORS[activity.effort] ||
                        "bg-gray-800 text-gray-400 border-gray-700";

                      if (isEditing) {
                        return (
                          <div
                            key={activity.id}
                            className="px-4 py-4 bg-etapa-surfaceLight"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                              <div>
                                <label className="text-[10px] text-etapa-textMuted uppercase tracking-wide mb-1 block">
                                  Title
                                </label>
                                <input
                                  type="text"
                                  value={editForm.title || ""}
                                  onChange={(e) =>
                                    setEditForm({ ...editForm, title: e.target.value })
                                  }
                                  className="w-full px-3 py-2 bg-etapa-surface border border-etapa-border rounded-lg text-sm text-white focus:ring-2 focus:ring-etapa-primary focus:border-transparent outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-etapa-textMuted uppercase tracking-wide mb-1 block">
                                  Type
                                </label>
                                <input
                                  type="text"
                                  value={editForm.type || ""}
                                  onChange={(e) =>
                                    setEditForm({ ...editForm, type: e.target.value })
                                  }
                                  className="w-full px-3 py-2 bg-etapa-surface border border-etapa-border rounded-lg text-sm text-white focus:ring-2 focus:ring-etapa-primary focus:border-transparent outline-none"
                                />
                              </div>
                            </div>
                            <div className="mb-3">
                              <label className="text-[10px] text-etapa-textMuted uppercase tracking-wide mb-1 block">
                                Description
                              </label>
                              <textarea
                                value={editForm.description || ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    description: e.target.value,
                                  })
                                }
                                rows={3}
                                className="w-full px-3 py-2 bg-etapa-surface border border-etapa-border rounded-lg text-sm text-white focus:ring-2 focus:ring-etapa-primary focus:border-transparent outline-none resize-none"
                              />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                              <div>
                                <label className="text-[10px] text-etapa-textMuted uppercase tracking-wide mb-1 block">
                                  Day
                                </label>
                                <select
                                  value={editForm.dayOfWeek ?? ""}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      dayOfWeek:
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value),
                                    })
                                  }
                                  className="w-full px-3 py-2 bg-etapa-surface border border-etapa-border rounded-lg text-sm text-white focus:ring-2 focus:ring-etapa-primary focus:border-transparent outline-none"
                                >
                                  <option value="">—</option>
                                  {DAY_LABELS.map((d, i) => (
                                    <option key={i} value={i}>
                                      {d}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-[10px] text-etapa-textMuted uppercase tracking-wide mb-1 block">
                                  Duration (min)
                                </label>
                                <input
                                  type="number"
                                  value={editForm.durationMins ?? ""}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      durationMins: e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    })
                                  }
                                  className="w-full px-3 py-2 bg-etapa-surface border border-etapa-border rounded-lg text-sm text-white focus:ring-2 focus:ring-etapa-primary focus:border-transparent outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-etapa-textMuted uppercase tracking-wide mb-1 block">
                                  Distance (km)
                                </label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={editForm.distanceKm ?? ""}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      distanceKm: e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    })
                                  }
                                  className="w-full px-3 py-2 bg-etapa-surface border border-etapa-border rounded-lg text-sm text-white focus:ring-2 focus:ring-etapa-primary focus:border-transparent outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-etapa-textMuted uppercase tracking-wide mb-1 block">
                                  Effort
                                </label>
                                <select
                                  value={editForm.effort || "moderate"}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      effort: e.target.value,
                                    })
                                  }
                                  className="w-full px-3 py-2 bg-etapa-surface border border-etapa-border rounded-lg text-sm text-white focus:ring-2 focus:ring-etapa-primary focus:border-transparent outline-none"
                                >
                                  <option value="easy">Easy</option>
                                  <option value="moderate">Moderate</option>
                                  <option value="hard">Hard</option>
                                  <option value="recovery">Recovery</option>
                                </select>
                              </div>
                            </div>
                            <div className="mb-3">
                              <label className="text-[10px] text-etapa-textMuted uppercase tracking-wide mb-1 block">
                                Notes
                              </label>
                              <textarea
                                value={editForm.notes || ""}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, notes: e.target.value })
                                }
                                rows={2}
                                className="w-full px-3 py-2 bg-etapa-surface border border-etapa-border rounded-lg text-sm text-white focus:ring-2 focus:ring-etapa-primary focus:border-transparent outline-none resize-none"
                              />
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={saveActivity}
                                disabled={saving}
                                className="px-4 py-1.5 bg-etapa-primary text-white text-xs font-medium rounded-lg hover:bg-etapa-primary/90 disabled:opacity-50 transition-colors"
                              >
                                {saving ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-4 py-1.5 text-etapa-textMuted text-xs hover:text-white transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={activity.id}
                          className="px-4 py-3 hover:bg-etapa-surfaceLight/50 transition-colors group"
                        >
                          <div className="flex items-start gap-3 sm:gap-4">
                            {/* Day column */}
                            <div className="w-12 sm:w-16 flex-shrink-0">
                              <p className="text-xs font-medium text-etapa-textMid">
                                {activity.dayOfWeek !== null
                                  ? DAY_LABELS[activity.dayOfWeek]
                                  : "—"}
                              </p>
                              {date && (
                                <p className="text-[10px] text-etapa-textFaint">
                                  {date.toLocaleDateString("en-GB", {
                                    day: "numeric",
                                    month: "short",
                                  })}
                                </p>
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                {activity.completed && (
                                  <span className="text-green-400 text-xs">&#10003;</span>
                                )}
                                <p
                                  className={`text-sm font-medium ${
                                    activity.completed
                                      ? "text-etapa-textMuted line-through"
                                      : "text-white"
                                  }`}
                                >
                                  {activity.title}
                                </p>
                              </div>
                              {activity.description && (
                                <p className="text-xs text-etapa-textMuted mt-0.5 line-clamp-2">
                                  {activity.description}
                                </p>
                              )}
                              {activity.notes && (
                                <p className="text-xs text-etapa-textFaint mt-0.5 italic">
                                  {activity.notes}
                                </p>
                              )}

                              {/* Meta — inline on mobile, side on desktop */}
                              <div className="flex items-center gap-2 flex-wrap mt-1.5 sm:hidden">
                                <span className="text-xs text-etapa-textMuted">
                                  {activity.type}
                                  {activity.subType ? ` / ${activity.subType}` : ""}
                                </span>
                                {activity.durationMins && (
                                  <span className="text-xs text-etapa-textFaint">
                                    {activity.durationMins}m
                                  </span>
                                )}
                                {activity.distanceKm && (
                                  <span className="text-xs text-etapa-textFaint">
                                    {activity.distanceKm}km
                                  </span>
                                )}
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full border ${effortClass}`}
                                >
                                  {activity.effort}
                                </span>
                                <button
                                  onClick={() => startEdit(activity)}
                                  className="text-xs text-etapa-primary hover:text-etapa-primary/80 transition-all ml-auto"
                                >
                                  Edit
                                </button>
                              </div>
                            </div>

                            {/* Meta — desktop only */}
                            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs text-etapa-textMuted">
                                {activity.type}
                                {activity.subType ? ` / ${activity.subType}` : ""}
                              </span>
                              {activity.durationMins && (
                                <span className="text-xs text-etapa-textFaint">
                                  {activity.durationMins}m
                                </span>
                              )}
                              {activity.distanceKm && (
                                <span className="text-xs text-etapa-textFaint">
                                  {activity.distanceKm}km
                                </span>
                              )}
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full border ${effortClass}`}
                              >
                                {activity.effort}
                              </span>
                              <button
                                onClick={() => startEdit(activity)}
                                className="opacity-0 group-hover:opacity-100 text-xs text-etapa-primary hover:text-etapa-primary/80 transition-all ml-1"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
