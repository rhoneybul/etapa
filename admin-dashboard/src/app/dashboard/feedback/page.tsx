"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
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
  status?: string;
  createdAt: string;
}

interface ThreadMessage {
  id: string;
  senderRole: "user" | "admin";
  senderName: string;
  message: string;
  createdAt: string;
}

interface ThreadData {
  feedback: {
    id: string;
    userId: string;
    userName: string;
    userEmail: string | null;
    category: string;
    message: string;
    status: string;
    createdAt: string;
  };
  messages: ThreadMessage[];
}

// ── Thread Panel ────────────────────────────────────────────────────────────
function ThreadPanel({
  feedbackItem,
  onClose,
  onStatusChange,
}: {
  feedbackItem: FeedbackItem;
  onClose: () => void;
  onStatusChange: () => void;
}) {
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  function fetchThread() {
    setLoading(true);
    fetch(`/api/feedback/${feedbackItem.id}/messages`)
      .then((r) => r.json())
      .then((data) => setThread(data))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchThread();
  }, [feedbackItem.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages]);

  async function handleSend() {
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/feedback/${feedbackItem.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim() }),
      });
      if (res.ok) {
        setReply("");
        fetchThread();
      }
    } catch {
      // handle error
    }
    setSending(false);
  }

  async function handleStatusChange(newStatus: string) {
    await fetch(`/api/feedback/${feedbackItem.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchThread();
    onStatusChange();
  }

  const status = thread?.feedback?.status || feedbackItem.status || "open";

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-etapa-border">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="text-etapa-textMuted hover:text-white transition-colors text-lg"
          >
            &larr;
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white truncate">
                {feedbackItem.userName}
              </h3>
              <Badge value={feedbackItem.category} />
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  status === "open"
                    ? "bg-amber-500/15 text-amber-400"
                    : status === "resolved"
                    ? "bg-green-500/15 text-green-400"
                    : "bg-zinc-500/15 text-zinc-400"
                }`}
              >
                {status}
              </span>
            </div>
            {feedbackItem.userEmail && (
              <p className="text-xs text-etapa-textMuted truncate">
                {feedbackItem.userEmail}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === "open" && (
            <button
              onClick={() => handleStatusChange("resolved")}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
            >
              Resolve
            </button>
          )}
          {status === "resolved" && (
            <button
              onClick={() => handleStatusChange("open")}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              Reopen
            </button>
          )}
          {feedbackItem.linearIssueUrl && (
            <a
              href={feedbackItem.linearIssueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-etapa-primary hover:text-amber-400 hover:underline px-2 py-1"
            >
              {feedbackItem.linearIssueKey}
            </a>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {loading ? (
          <div className="text-etapa-textMuted animate-pulse text-sm">
            Loading thread...
          </div>
        ) : (
          <>
            {/* Original feedback message */}
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] font-bold text-blue-400 flex-shrink-0 mt-0.5">
                {feedbackItem.userName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium text-white">
                    {feedbackItem.userName}
                  </span>
                  <span className="text-[10px] text-etapa-textFaint">
                    {new Date(feedbackItem.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 text-sm text-etapa-textMid leading-relaxed whitespace-pre-wrap bg-etapa-surfaceLight rounded-lg px-3 py-2 border border-etapa-border">
                  {feedbackItem.message}
                </div>
                {feedbackItem.appVersion && (
                  <p className="mt-1 text-[10px] text-etapa-textFaint">
                    v{feedbackItem.appVersion} &middot;{" "}
                    {feedbackItem.deviceInfo}
                  </p>
                )}
              </div>
            </div>

            {/* Thread messages */}
            {thread?.messages?.map((msg) => (
              <div key={msg.id} className="flex items-start gap-3">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 ${
                    msg.senderRole === "admin"
                      ? "bg-etapa-primary/20 text-etapa-primary"
                      : "bg-blue-500/20 text-blue-400"
                  }`}
                >
                  {msg.senderName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-white">
                      {msg.senderName}
                    </span>
                    <span
                      className={`text-[10px] font-medium ${
                        msg.senderRole === "admin"
                          ? "text-etapa-primary"
                          : "text-etapa-textFaint"
                      }`}
                    >
                      {msg.senderRole === "admin" ? "Admin" : "User"}
                    </span>
                    <span className="text-[10px] text-etapa-textFaint">
                      {new Date(msg.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div
                    className={`mt-1 text-sm leading-relaxed whitespace-pre-wrap rounded-lg px-3 py-2 border ${
                      msg.senderRole === "admin"
                        ? "bg-etapa-primary/5 border-etapa-primary/20 text-etapa-textMid"
                        : "bg-etapa-surfaceLight border-etapa-border text-etapa-textMid"
                    }`}
                  >
                    {msg.message}
                  </div>
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Reply input */}
      <div className="px-5 py-3 border-t border-etapa-border bg-etapa-surface">
        <div className="flex gap-2">
          <textarea
            className="flex-1 px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-white placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary resize-none"
            rows={2}
            placeholder="Type a reply... This will notify the user via push notification."
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={!reply.trim() || sending}
            className="px-4 self-end bg-etapa-primary text-white text-sm font-medium rounded-lg hover:bg-etapa-primaryDark disabled:opacity-40 transition-colors h-9"
          >
            {sending ? "..." : "Send"}
          </button>
        </div>
        <p className="text-[10px] text-etapa-textFaint mt-1">
          Ctrl+Enter to send
        </p>
      </div>
    </div>
  );
}

// ── Main Feedback Page ──────────────────────────────────────────────────────
export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<FeedbackItem | null>(null);
  const [search, setSearch] = useState("");

  function fetchFeedback() {
    fetch("/api/feedback")
      .then((r) => r.json())
      .then((data) => setFeedback(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchFeedback();
  }, []);

  if (loading)
    return (
      <div className="animate-pulse text-etapa-textMuted">
        Loading feedback...
      </div>
    );

  const bugCount = feedback.filter((f) => f.category === "bug").length;
  const featureCount = feedback.filter((f) => f.category === "feature").length;
  const supportCount = feedback.filter((f) => f.category === "support").length;
  const openCount = feedback.filter(
    (f) => !f.status || f.status === "open"
  ).length;

  const filtered = feedback.filter((f) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.message.toLowerCase().includes(q) ||
      f.userName.toLowerCase().includes(q) ||
      (f.userEmail || "").toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q)
    );
  });

  // If a thread is selected, show the two-panel layout
  if (selectedItem) {
    return (
      <div className="h-[calc(100vh-64px)] flex">
        {/* Left: feedback list (narrow) */}
        <div className="w-80 border-r border-etapa-border flex flex-col bg-etapa-surface/50">
          <div className="p-3 border-b border-etapa-border">
            <input
              type="text"
              placeholder="Search feedback..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-xs text-white placeholder-etapa-textFaint focus:outline-none focus:ring-1 focus:ring-etapa-primary"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedItem(f)}
                className={`w-full text-left px-4 py-3 border-b border-etapa-border hover:bg-etapa-surfaceLight transition-colors ${
                  selectedItem.id === f.id
                    ? "bg-etapa-primary/10 border-l-2 border-l-etapa-primary"
                    : ""
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-white truncate">
                    {f.userName}
                  </span>
                  <Badge value={f.category} />
                  {(!f.status || f.status === "open") && !f.adminResponse && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-etapa-textMid truncate">
                  {f.message}
                </p>
                <p className="text-[10px] text-etapa-textFaint mt-1">
                  {new Date(f.createdAt).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Right: thread view */}
        <div className="flex-1 bg-black">
          <ThreadPanel
            feedbackItem={selectedItem}
            onClose={() => setSelectedItem(null)}
            onStatusChange={fetchFeedback}
          />
        </div>
      </div>
    );
  }

  // Default: full-width list view
  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-1">Feedback</h1>
      <p className="text-sm text-etapa-textMuted mb-6">
        User feedback from the app. Click any item to view the full conversation
        and reply.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Total" value={feedback.length} />
        <StatCard label="Open" value={openCount} />
        <StatCard label="Bugs" value={bugCount} />
        <StatCard label="Features" value={featureCount} />
        <StatCard label="Support" value={supportCount} />
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by message, user, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm px-3 py-2 bg-etapa-surface border border-etapa-border rounded-lg text-sm text-white placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary focus:border-transparent"
        />
      </div>

      <div className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-etapa-border bg-etapa-surfaceLight">
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">
                  User
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">
                  Type
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">
                  Message
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">
                  Date
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">
                  Linear
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-etapa-border">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-etapa-textFaint"
                  >
                    No feedback found
                  </td>
                </tr>
              ) : (
                filtered.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => setSelectedItem(f)}
                    className="hover:bg-etapa-surfaceLight transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {f.userName}
                        </p>
                        {f.userEmail && (
                          <p className="text-xs text-etapa-textMuted">
                            {f.userEmail}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge value={f.category} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-sm">
                        <p className="text-sm text-white truncate">
                          {f.message}
                        </p>
                        {f.adminResponse && (
                          <p className="text-xs text-etapa-primary mt-1 truncate">
                            Replied: {f.adminResponse}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          !f.status || f.status === "open"
                            ? "bg-amber-500/15 text-amber-400"
                            : f.status === "resolved"
                            ? "bg-green-500/15 text-green-400"
                            : "bg-zinc-500/15 text-zinc-400"
                        }`}
                      >
                        {f.status || "open"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-etapa-textMid">
                        {new Date(f.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {f.linearIssueUrl ? (
                        <a
                          href={f.linearIssueUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-etapa-primary hover:text-amber-400 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {f.linearIssueKey}
                        </a>
                      ) : (
                        <span className="text-xs text-etapa-textFaint">
                          &mdash;
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-xs text-etapa-textFaint border-t border-etapa-border">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}
