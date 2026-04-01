"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

interface Ticket {
  id: string;
  linearId: string;
  title: string;
  priority: string;
  status: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tickets")
      .then((r) => r.json())
      .then((data) => setTickets(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse text-gray-500">Loading tickets...</div>;

  const openCount = tickets.filter((t) => !["closed", "resolved", "done", "cancelled"].includes(t.status)).length;

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Support Tickets</h1>
      <p className="text-sm text-gray-500 mb-6">Fetched from Linear. Shows issues matching "support" in the title.</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Tickets" value={tickets.length} />
        <StatCard label="Open" value={openCount} />
        <StatCard label="Resolved / Closed" value={tickets.length - openCount} />
      </div>

      <DataTable
        searchKey="title"
        searchPlaceholder="Search tickets..."
        columns={[
          { key: "linearId", label: "ID", render: (t: Ticket) => (
            <span className="font-mono text-xs text-indigo-600">{t.linearId}</span>
          )},
          { key: "title", label: "Title", render: (t: Ticket) => (
            <p className="font-medium text-gray-900 max-w-md truncate">{t.title}</p>
          )},
          { key: "priority", label: "Priority", render: (t: Ticket) => <Badge value={t.priority} /> },
          { key: "status", label: "Status", render: (t: Ticket) => <Badge value={t.status} /> },
          { key: "createdAt", label: "Created", render: (t: Ticket) => new Date(t.createdAt).toLocaleDateString() },
        ]}
        data={tickets}
      />
    </div>
  );
}
