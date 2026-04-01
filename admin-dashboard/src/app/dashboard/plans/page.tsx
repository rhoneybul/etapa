"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

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
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => r.json())
      .then((data) => setPlans(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse text-gray-500">Loading plans...</div>;

  const activePlans = plans.filter((p) => p.status === "active");
  const totalActivities = plans.reduce((sum, p) => sum + p.activityCount, 0);

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Plans</h1>

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
            <div>
              <p className="font-medium text-gray-900">{p.name || "Untitled"}</p>
              <p className="text-xs text-gray-500">{p.weeks} weeks, {p.activityCount} activities</p>
            </div>
          )},
          { key: "userName", label: "Created By" },
          { key: "status", label: "Status", render: (p: Plan) => <Badge value={p.status} /> },
          { key: "startDate", label: "Start", render: (p: Plan) => new Date(p.startDate).toLocaleDateString() },
          { key: "createdAt", label: "Created", render: (p: Plan) => new Date(p.createdAt).toLocaleDateString() },
        ]}
        data={plans}
      />
    </div>
  );
}
