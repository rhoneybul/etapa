"use client";

import { useEffect, useState } from "react";
import { User } from "@/types";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse text-gray-500">Loading users...</div>;

  const activeCount = users.filter((u) => u.status === "active").length;
  const planCounts = users.reduce((acc, u) => {
    acc[u.plan] = (acc[u.plan] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Users</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Users" value={users.length} />
        <StatCard label="Active" value={activeCount} sub={`${Math.round((activeCount / users.length) * 100)}% of total`} />
        <StatCard label="Enterprise" value={planCounts.enterprise || 0} />
        <StatCard label="Pro" value={planCounts.pro || 0} />
      </div>

      <DataTable
        searchKey="name"
        searchPlaceholder="Search users..."
        columns={[
          { key: "name", label: "Name", render: (u) => (
            <div>
              <p className="font-medium text-gray-900">{u.name}</p>
              <p className="text-xs text-gray-500">{u.email}</p>
            </div>
          )},
          { key: "plan", label: "Plan", render: (u) => <Badge value={u.plan} /> },
          { key: "status", label: "Status", render: (u) => <Badge value={u.status} /> },
          { key: "createdAt", label: "Joined", render: (u) => new Date(u.createdAt).toLocaleDateString() },
          { key: "lastLoginAt", label: "Last Login", render: (u) => new Date(u.lastLoginAt).toLocaleDateString() },
        ]}
        data={users}
      />
    </div>
  );
}
