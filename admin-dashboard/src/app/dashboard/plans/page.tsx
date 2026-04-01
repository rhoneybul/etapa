"use client";

import { useEffect, useState } from "react";
import { Plan } from "@/types";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => r.json())
      .then(setPlans)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse text-gray-500">Loading plans...</div>;

  const totalProjects = plans.reduce((sum, p) => sum + p.projectCount, 0);
  const activeCount = plans.filter((p) => p.status === "active").length;

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Plans</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Plans" value={plans.length} />
        <StatCard label="Active" value={activeCount} />
        <StatCard label="Total Projects" value={totalProjects} />
      </div>

      <DataTable
        searchKey="name"
        searchPlaceholder="Search plans..."
        columns={[
          { key: "name", label: "Plan Name", render: (p) => (
            <div>
              <p className="font-medium text-gray-900">{p.name}</p>
              <p className="text-xs text-gray-500 max-w-xs truncate">{p.description}</p>
            </div>
          )},
          { key: "createdByName", label: "Created By" },
          { key: "projectCount", label: "Projects" },
          { key: "status", label: "Status", render: (p) => <Badge value={p.status} /> },
          { key: "createdAt", label: "Created", render: (p) => new Date(p.createdAt).toLocaleDateString() },
        ]}
        data={plans}
      />
    </div>
  );
}
