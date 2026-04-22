"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatCard } from "@/components/stat-card";

interface Generation {
  id: string;
  user_id: string | null;
  job_id: string | null;
  plan_id: string | null;
  status: "running" | "completed" | "failed" | "cancelled";
  progress: string | null;
  reason: string;
  model: string | null;
  activities_count: number | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
  user: { id: string; email?: string; name?: string | null } | null;
}

interface UsageRow {
  id: number;
  feature: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number | null;
  status: string;
  request_id: string | null;
  created_at: string;
}

interface Detail {
  generation: Generation & { goal: any; config: any };
  user: Generation["user"];
  usage: UsageRow[];
}

const STATUS_COLORS: Record<Generation["status"], string> = {
  running:   "bg-amber-900/30 text-amber-300 border-amber-700/30",
  completed: "bg-green-900/30 text-green-300 border-green-700/30",
  failed:    "bg-red-900/30 text-red-300 border-red-700/30",
  cancelled: "bg-etapa-surfaceLight text-etapa-textMuted border-etapa-border",
};

function formatDate(iso: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number | null) {
  if (ms == null) return "\u2014";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function PlanGenerationsPage() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [emailFilter, setEmailFilter] = useState<string>("");
  const [sinceHours, setSinceHours] = useState<string>("168"); // 7 days default

  // Detail modal + rerun
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rerunBusy, setRerunBusy] = useState(false);
  const [rerunResult, setRerunResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (emailFilter) params.set("email", emailFilter);
      if (sinceHours) params.set("sinceHours", sinceHours);
      const r = await fetch(`/api/plan-generations?${params.toString()}`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${r.status})`);
      }
      const body = await r.json();
      setGenerations(body.generations || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, emailFilter, sinceHours]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    setRerunResult(null);
    fetch(`/api/plan-generations/${selectedId}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${r.status})`);
        }
        return r.json();
      })
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  async function rerunGeneration(id: string) {
    if (!confirm("Rerun this generation with the original goal + config? The new plan will overwrite the old one if there was a successful plan.")) return;
    setRerunBusy(true);
    setRerunResult(null);
    try {
      const r = await fetch(`/api/plan-generations/${id}/rerun`, { method: "POST" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `Rerun failed (${r.status})`);
      setRerunResult(`Started job ${body.jobId}`);
      // Give the server a beat to insert the new plan_generations row
      setTimeout(refresh, 1500);
    } catch (e: any) {
      setRerunResult(`Error: ${e.message}`);
    } finally {
      setRerunBusy(false);
    }
  }

  const stats = useMemo(() => {
    const total = generations.length;
    const failed = generations.filter((g) => g.status === "failed").length;
    const running = generations.filter((g) => g.status === "running").length;
    const completed = generations.filter((g) => g.status === "completed").length;
    return { total, failed, running, completed };
  }, [generations]);

  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-1">Plan generations</h1>
      <p className="text-sm text-etapa-textMuted mb-6">
        Every plan-generation job, including ones that never finished. Use this to debug "why didn't my plan build?" — inspect the original inputs, see the error, rerun with the same goal + config.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total (filtered)" value={stats.total} />
        <StatCard label="Completed" value={stats.completed} />
        <StatCard label="Failed" value={stats.failed} />
        <StatCard label="Still running" value={stats.running} />
      </div>

      {/* Filters */}
      <div className="bg-etapa-surface rounded-xl border border-etapa-border p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1 block">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-etapa-surfaceLight border border-etapa-border rounded px-3 py-2 text-sm text-white"
            >
              <option value="">All</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1 block">User email (optional)</label>
            <input
              type="email"
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              placeholder="someone@example.com"
              className="w-full bg-etapa-surfaceLight border border-etapa-border rounded px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1 block">Window</label>
            <select
              value={sinceHours}
              onChange={(e) => setSinceHours(e.target.value)}
              className="w-full bg-etapa-surfaceLight border border-etapa-border rounded px-3 py-2 text-sm text-white"
            >
              <option value="1">Last hour</option>
              <option value="24">Last 24 hours</option>
              <option value="168">Last 7 days</option>
              <option value="720">Last 30 days</option>
              <option value="">All time</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-4 text-sm text-red-400 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse text-etapa-textMuted">Loading generations...</div>
      ) : generations.length === 0 ? (
        <div className="bg-etapa-surface rounded-xl border border-etapa-border p-6 text-center text-sm text-etapa-textFaint">
          No generations match the current filters.
        </div>
      ) : (
        <div className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-etapa-border bg-etapa-surfaceLight text-left">
                  <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">When</th>
                  <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">User</th>
                  <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Reason</th>
                  <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Acts</th>
                  <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Duration</th>
                  <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Error</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-etapa-border">
                {generations.map((g) => (
                  <tr key={g.id} className="hover:bg-etapa-surfaceLight transition-colors">
                    <td className="px-4 py-3 text-xs text-etapa-textMid whitespace-nowrap">{formatDate(g.created_at)}</td>
                    <td className="px-4 py-3 text-xs">
                      {g.user ? (
                        <Link href={`/dashboard/users/${g.user.id}`} className="text-etapa-primary hover:text-amber-400">
                          {g.user.email || g.user.id.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-etapa-textFaint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[g.status]}`}>
                        {g.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-etapa-textMid">{g.reason}</td>
                    <td className="px-4 py-3 text-xs text-etapa-textMid text-center">{g.activities_count ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-etapa-textMid">{formatDuration(g.duration_ms)}</td>
                    <td className="px-4 py-3 text-xs text-red-300 max-w-xs truncate" title={g.error || ""}>{g.error || "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setSelectedId(g.id)}
                        className="text-xs text-etapa-primary hover:text-amber-400 transition-colors mr-3"
                      >
                        Inspect
                      </button>
                      <button
                        onClick={() => rerunGeneration(g.id)}
                        disabled={rerunBusy}
                        className="text-xs text-etapa-textMid hover:text-white disabled:opacity-30"
                      >
                        Rerun
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rerunResult && (
        <div className="fixed bottom-6 right-6 bg-etapa-surface border border-etapa-border rounded-xl p-4 text-sm text-white shadow-lg">
          {rerunResult}
          <button onClick={() => setRerunResult(null)} className="ml-3 text-etapa-textMuted hover:text-white">×</button>
        </div>
      )}

      {/* Detail modal */}
      {selectedId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="bg-etapa-surface rounded-xl border border-etapa-border p-6 max-w-4xl w-full my-12 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Generation detail</h3>
              <button
                onClick={() => setSelectedId(null)}
                className="text-etapa-textMuted hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            {detailLoading ? (
              <div className="animate-pulse text-etapa-textMuted">Loading...</div>
            ) : !detail ? (
              <div className="text-etapa-textMuted">No detail available.</div>
            ) : (
              <div className="space-y-5">
                {/* Summary grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <DetailField label="Status" value={
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[detail.generation.status]}`}>
                      {detail.generation.status.toUpperCase()}
                    </span>
                  } />
                  <DetailField label="User" value={detail.user?.email || detail.generation.user_id || "—"} />
                  <DetailField label="Reason" value={detail.generation.reason} />
                  <DetailField label="Model" value={detail.generation.model || "—"} />
                  <DetailField label="Started" value={formatDate(detail.generation.created_at)} />
                  <DetailField label="Updated" value={formatDate(detail.generation.updated_at)} />
                  <DetailField label="Duration" value={formatDuration(detail.generation.duration_ms)} />
                  <DetailField label="Activities" value={detail.generation.activities_count ?? "—"} />
                </div>

                {/* Error */}
                {detail.generation.error && (
                  <div className="bg-red-900/20 border border-red-900/40 rounded p-3">
                    <div className="text-xs text-red-400 uppercase tracking-wide mb-1 font-medium">Error</div>
                    <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono">{detail.generation.error}</pre>
                  </div>
                )}

                {detail.generation.progress && !detail.generation.error && (
                  <div className="bg-etapa-surfaceLight border border-etapa-border rounded p-3">
                    <div className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1 font-medium">Last progress</div>
                    <div className="text-xs text-etapa-textMid">{detail.generation.progress}</div>
                  </div>
                )}

                {/* Goal + Config side by side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-etapa-surfaceLight border border-etapa-border rounded p-3">
                    <div className="text-xs text-etapa-textMuted uppercase tracking-wide mb-2 font-medium">Goal (input)</div>
                    <pre className="text-xs text-etapa-textMid overflow-x-auto font-mono whitespace-pre">{JSON.stringify(detail.generation.goal, null, 2)}</pre>
                  </div>
                  <div className="bg-etapa-surfaceLight border border-etapa-border rounded p-3">
                    <div className="text-xs text-etapa-textMuted uppercase tracking-wide mb-2 font-medium">Config (input)</div>
                    <pre className="text-xs text-etapa-textMid overflow-x-auto font-mono whitespace-pre">{JSON.stringify(detail.generation.config, null, 2)}</pre>
                  </div>
                </div>

                {/* Claude usage rows */}
                {detail.usage.length > 0 && (
                  <div>
                    <div className="text-xs text-etapa-textMuted uppercase tracking-wide mb-2 font-medium">Claude API calls ({detail.usage.length})</div>
                    <div className="bg-etapa-surfaceLight border border-etapa-border rounded overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-etapa-border">
                            <th className="px-3 py-2 text-left text-etapa-textMuted">When</th>
                            <th className="px-3 py-2 text-left text-etapa-textMuted">Status</th>
                            <th className="px-3 py-2 text-left text-etapa-textMuted">In</th>
                            <th className="px-3 py-2 text-left text-etapa-textMuted">Out</th>
                            <th className="px-3 py-2 text-left text-etapa-textMuted">Cost</th>
                            <th className="px-3 py-2 text-left text-etapa-textMuted">Latency</th>
                            <th className="px-3 py-2 text-left text-etapa-textMuted">Request ID</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.usage.map((u) => (
                            <tr key={u.id} className="border-t border-etapa-border">
                              <td className="px-3 py-2 text-etapa-textMid">{formatDate(u.created_at)}</td>
                              <td className="px-3 py-2"><span className={u.status === "ok" ? "text-green-400" : "text-red-400"}>{u.status}</span></td>
                              <td className="px-3 py-2 text-etapa-textMid">{u.input_tokens}</td>
                              <td className="px-3 py-2 text-etapa-textMid">{u.output_tokens}</td>
                              <td className="px-3 py-2 text-etapa-textMid">${Number(u.cost_usd).toFixed(4)}</td>
                              <td className="px-3 py-2 text-etapa-textMid">{formatDuration(u.duration_ms)}</td>
                              <td className="px-3 py-2 text-etapa-textFaint font-mono">{u.request_id || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Rerun button */}
                <div className="flex gap-2 justify-end border-t border-etapa-border pt-4">
                  <button
                    onClick={() => setSelectedId(null)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-etapa-surfaceLight text-etapa-textMid hover:bg-etapa-border"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => rerunGeneration(detail.generation.id)}
                    disabled={rerunBusy}
                    className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-etapa-primary hover:bg-etapa-primary/90 disabled:opacity-50"
                  >
                    {rerunBusy ? "Rerunning..." : "Rerun with same inputs"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1">{label}</div>
      <div className="text-xs text-white">{value}</div>
    </div>
  );
}
