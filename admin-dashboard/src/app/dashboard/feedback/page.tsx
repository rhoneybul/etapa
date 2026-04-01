"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

interface FeedbackItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  category: string;
  message: string;
  appVersion: string | null;
  deviceInfo: string | null;
  linearIssueId: string | null;
  linearIssueKey: string | null;
  linearIssueUrl: string | null;
  createdAt: string;
}

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/feedback")
      .then((r) => r.json())
      .then((data) => setFeedback(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse text-gray-500">Loading feedback...</div>;

  const bugCount = feedback.filter((f) => f.category === "bug").length;
  const featureCount = feedback.filter((f) => f.category === "feature").length;
  const supportCount = feedback.filter((f) => f.category === "support").length;

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Feedback</h1>
      <p className="text-sm text-gray-500 mb-6">User feedback submitted from the app, linked to Linear issues.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Feedback" value={feedback.length} />
        <StatCard label="Bugs" value={bugCount} />
        <StatCard label="Feature Requests" value={featureCount} />
        <StatCard label="Support" value={supportCount} />
      </div>

      <DataTable
        searchKey="message"
        searchPlaceholder="Search feedback..."
        columns={[
          { key: "category", label: "Type", render: (f: FeedbackItem) => <Badge value={f.category} /> },
          { key: "message", label: "Message", render: (f: FeedbackItem) => (
            <p className="text-sm text-gray-900 max-w-md truncate">{f.message}</p>
          )},
          { key: "userName", label: "Submitted By", render: (f: FeedbackItem) => (
            <div>
              <p className="text-sm font-medium text-gray-900">{f.userName}</p>
              {f.userEmail && <p className="text-xs text-gray-500">{f.userEmail}</p>}
            </div>
          )},
          { key: "linearIssueKey", label: "Linear", render: (f: FeedbackItem) => (
            f.linearIssueUrl ? (
              <a
                href={f.linearIssueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                {f.linearIssueKey}
              </a>
            ) : <span className="text-xs text-gray-400">—</span>
          )},
          { key: "createdAt", label: "Date", render: (f: FeedbackItem) => new Date(f.createdAt).toLocaleDateString() },
        ]}
        data={feedback}
      />
    </div>
  );
}
