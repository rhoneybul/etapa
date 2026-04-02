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
  adminResponse: string | null;
  adminRespondedAt: string | null;
  createdAt: string;
}

function RespondModal({ item, onClose, onSent }: { item: FeedbackItem; onClose: () => void; onSent: () => void }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/feedback/${item.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      if (res.ok) {
        onSent();
        onClose();
      }
    } catch {
      // handle error
    }
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-etapa-surface border border-etapa-border rounded-2xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-white mb-1">Respond to Feedback</h3>
        <p className="text-sm text-etapa-textMuted mb-4">
          From {item.userName} &middot; {item.category}
        </p>

        <div className="bg-etapa-surfaceLight rounded-lg p-3 mb-4 border border-etapa-border">
          <p className="text-sm text-etapa-textMid">{item.message}</p>
        </div>

        <textarea
          className="w-full px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-white placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary resize-none"
          rows={4}
          placeholder="Type your response... This will be sent as a push notification to the user."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          autoFocus
        />

        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-etapa-textMid hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            className="px-4 py-2 bg-etapa-primary text-white text-sm font-medium rounded-lg hover:bg-etapa-primaryDark disabled:opacity-40 transition-colors"
          >
            {sending ? "Sending..." : "Send Response"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState<FeedbackItem | null>(null);

  function fetchFeedback() {
    fetch("/api/feedback")
      .then((r) => r.json())
      .then((data) => setFeedback(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchFeedback(); }, []);

  if (loading) return <div className="animate-pulse text-etapa-textMuted">Loading feedback...</div>;

  const bugCount = feedback.filter((f) => f.category === "bug").length;
  const featureCount = feedback.filter((f) => f.category === "feature").length;
  const supportCount = feedback.filter((f) => f.category === "support").length;
  const respondedCount = feedback.filter((f) => f.adminResponse).length;

  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-1">Feedback</h1>
      <p className="text-sm text-etapa-textMuted mb-6">User feedback submitted from the app. Click respond to reply via push notification.</p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Total" value={feedback.length} />
        <StatCard label="Bugs" value={bugCount} />
        <StatCard label="Features" value={featureCount} />
        <StatCard label="Support" value={supportCount} />
        <StatCard label="Responded" value={respondedCount} />
      </div>

      <DataTable
        searchKey="message"
        searchPlaceholder="Search feedback..."
        columns={[
          { key: "category", label: "Type", render: (f: FeedbackItem) => <Badge value={f.category} /> },
          { key: "message", label: "Message", render: (f: FeedbackItem) => (
            <div className="max-w-md">
              <p className="text-sm text-white truncate">{f.message}</p>
              {f.adminResponse && (
                <p className="text-xs text-etapa-primary mt-1 truncate">Replied: {f.adminResponse}</p>
              )}
            </div>
          )},
          { key: "userName", label: "User", render: (f: FeedbackItem) => (
            <div>
              <p className="text-sm font-medium text-white">{f.userName}</p>
              {f.userEmail && <p className="text-xs text-etapa-textMuted">{f.userEmail}</p>}
            </div>
          )},
          { key: "linearIssueKey", label: "Linear", render: (f: FeedbackItem) => (
            f.linearIssueUrl ? (
              <a
                href={f.linearIssueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-etapa-primary hover:text-amber-400 hover:underline"
              >
                {f.linearIssueKey}
              </a>
            ) : <span className="text-xs text-etapa-textFaint">&mdash;</span>
          )},
          { key: "createdAt", label: "Date", render: (f: FeedbackItem) => (
            <span className="text-xs text-etapa-textMid">{new Date(f.createdAt).toLocaleDateString()}</span>
          )},
          { key: "actions", label: "", render: (f: FeedbackItem) => (
            <button
              onClick={() => setRespondingTo(f)}
              className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors ${
                f.adminResponse
                  ? "text-etapa-textMuted hover:text-white"
                  : "text-etapa-primary hover:bg-etapa-primary/10"
              }`}
            >
              {f.adminResponse ? "Edit" : "Respond"}
            </button>
          )},
        ]}
        data={feedback}
      />

      {respondingTo && (
        <RespondModal
          item={respondingTo}
          onClose={() => setRespondingTo(null)}
          onSent={fetchFeedback}
        />
      )}
    </div>
  );
}
