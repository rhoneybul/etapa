"use client";

import { useEffect, useState } from "react";
import { SupportTicket } from "@/types";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

export default function TicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tickets")
      .then((r) => r.json())
      .then(setTickets)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse text-gray-500">Loading tickets...</div>;

  const openCount = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;
  const urgentCount = tickets.filter((t) => t.priority === "urgent" || t.priority === "high").length;

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Support Tickets</h1>
      <p className="text-sm text-gray-500 mb-6">Synced from Linear — support tickets created by users.</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Tickets" value={tickets.length} />
        <StatCard label="Open / In Progress" value={openCount} />
        <StatCard label="Urgent + High" value={urgentCount} />
      </div>

      <DataTable
        searchKey="title"
        searchPlaceholder="Search tickets..."
        columns={[
          { key: "linearId", label: "ID", render: (t) => (
            <span className="font-mono text-xs text-indigo-600">{t.linearId}</span>
          )},
          { key: "title", label: "Title", render: (t) => (
            <div>
              <p className="font-medium text-gray-900">{t.title}</p>
              <p className="text-xs text-gray-500">{t.userName}</p>
            </div>
          )},
          { key: "priority", label: "Priority", render: (t) => <Badge value={t.priority} /> },
          { key: "status", label: "Status", render: (t) => <Badge value={t.status} /> },
          { key: "createdAt", label: "Created", render: (t) => new Date(t.createdAt).toLocaleDateString() },
          { key: "updatedAt", label: "Updated", render: (t) => new Date(t.updatedAt).toLocaleDateString() },
        ]}
        data={tickets}
      />
    </div>
  );
}
