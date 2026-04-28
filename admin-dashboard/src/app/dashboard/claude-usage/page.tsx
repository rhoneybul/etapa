"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StatCard } from "@/components/stat-card";

// ── Types ────────────────────────────────────────────────────────────────
interface FeatureRow {
  feature: string;
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  errors: number;
}

interface UserRow {
  userId: string;
  email: string | null;
  name: string | null;
  displayName: string | null;
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  byFeature: Record<string, number>;
}

interface DayRow {
  date: string;
  calls: number;
  costUsd: number;
}

interface UsageResponse {
  days: number;
  since: string;
  total: { calls: number; costUsd: number; errors: number };
  byFeature: FeatureRow[];
  byUser: UserRow[];
  byDay: DayRow[];
}

interface AuditSuggestion {
  title: string;
  severity: "high" | "medium" | "low";
  estSavingsPct: number;
  reason: string;
  action: string;
}

interface AuditResponse {
  days: number;
  since: string;
  totalCostUsd: number;
  audit: {
    summary?: string;
    totalCostUsd?: number;
    totalSavingsPctEstimate?: number;
    suggestions?: AuditSuggestion[];
    parseFailed?: boolean;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────
function fmtUsd(n: number): string {
  if (n == null || isNaN(n)) return "$0.00";
  return `$${n.toFixed(n >= 100 ? 2 : n >= 1 ? 3 : 4)}`;
}
function fmtNum(n: number): string {
  if (n == null) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
function severityClass(s: string): string {
  if (s === "high") return "bg-red-900/40 text-red-400 border border-red-900/60";
  if (s === "medium") return "bg-yellow-900/40 text-yellow-400 border border-yellow-900/60";
  return "bg-slate-800/60 text-slate-300 border border-slate-700";
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function ClaudeUsagePage() {
  const [days, setDays] = useState<number>(30);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState<boolean>(true);
  const [usageError, setUsageError] = useState<string | null>(null);

  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const loadUsage = useCallback(async (d: number) => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const res = await fetch(`/api/claude-usage?days=${d}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: UsageResponse = await res.json();
      setUsage(data);
    } catch (e: any) {
      setUsageError(e?.message || "Failed to load");
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => { loadUsage(days); }, [days, loadUsage]);

  const runAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    setAudit(null);
    try {
      const res = await fetch("/api/claude-usage/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AuditResponse = await res.json();
      setAudit(data);
    } catch (e: any) {
      setAuditError(e?.message || "Audit failed");
    } finally {
      setAuditLoading(false);
    }
  }, [days]);

  // Day chart — pure inline SVG bars so we don't pull in a chart lib for one view.
  const renderDayChart = (rows: DayRow[]) => {
    if (!rows.length) return <div className="text-etapa-textFaint text-sm">No data in this window.</div>;
    const max = Math.max(...rows.map(r => r.costUsd), 0.0001);
    return (
      <div className="flex items-end gap-1 h-32 mt-4">
        {rows.map(r => {
          const h = Math.max(2, Math.round((r.costUsd / max) * 100));
          return (
            <div key={r.date} className="flex-1 flex flex-col items-center justify-end" title={`${r.date} · ${fmtUsd(r.costUsd)} · ${r.calls} calls`}>
              <div className="w-full bg-etapa-primary/60 rounded-sm" style={{ height: `${h}%` }} />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Claude usage</h1>
          <p className="text-sm text-etapa-textMid mt-1">
            Where the Anthropic spend is going. Use the auditor to get cost-reduction suggestions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                days === d
                  ? "bg-etapa-primary text-white"
                  : "bg-etapa-surface text-etapa-textMid hover:bg-etapa-surfaceLight"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {usageLoading && (
        <div className="text-etapa-textMid text-sm py-12 text-center">Loading…</div>
      )}
      {usageError && (
        <div className="text-red-400 text-sm py-4">Failed to load usage: {usageError}</div>
      )}

      {usage && !usageLoading && (
        <>
          {/* Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label={`Total spend (${usage.days}d)`} value={fmtUsd(usage.total.costUsd)} />
            <StatCard label="API calls" value={fmtNum(usage.total.calls)} />
            <StatCard
              label="Errors"
              value={fmtNum(usage.total.errors)}
              valueClassName={usage.total.errors > 0 ? "text-red-400" : "text-white"}
            />
          </div>

          {/* Day trend */}
          <div className="bg-etapa-surface rounded-lg p-5 border border-etapa-border">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Daily spend</h2>
              <span className="text-xs text-etapa-textFaint">last {usage.days} days</span>
            </div>
            {renderDayChart(usage.byDay)}
            <div className="flex justify-between mt-2 text-xs text-etapa-textFaint">
              <span>{usage.byDay[0]?.date || ""}</span>
              <span>{usage.byDay[usage.byDay.length - 1]?.date || ""}</span>
            </div>
          </div>

          {/* By feature */}
          <div className="bg-etapa-surface rounded-lg border border-etapa-border overflow-hidden">
            <div className="px-5 py-3 border-b border-etapa-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">By feature</h2>
              <span className="text-xs text-etapa-textFaint">
                Where each dollar goes — rank by cost share
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-etapa-bg/40">
                <tr className="text-xs text-etapa-textFaint">
                  <th className="text-left px-5 py-2 font-medium">Feature</th>
                  <th className="text-right px-3 py-2 font-medium">Calls</th>
                  <th className="text-right px-3 py-2 font-medium">In tokens</th>
                  <th className="text-right px-3 py-2 font-medium">Out tokens</th>
                  <th className="text-right px-3 py-2 font-medium">Cache R/W</th>
                  <th className="text-right px-3 py-2 font-medium">Errors</th>
                  <th className="text-right px-5 py-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {usage.byFeature.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-etapa-textFaint">No usage in this window.</td></tr>
                )}
                {usage.byFeature.map(f => {
                  const share = usage.total.costUsd ? (f.costUsd / usage.total.costUsd) * 100 : 0;
                  return (
                    <tr key={f.feature} className="border-t border-etapa-border hover:bg-etapa-surfaceLight/40">
                      <td className="px-5 py-3 text-white font-mono text-xs">{f.feature}</td>
                      <td className="text-right px-3 text-etapa-textMid">{fmtNum(f.calls)}</td>
                      <td className="text-right px-3 text-etapa-textMid">{fmtNum(f.inputTokens)}</td>
                      <td className="text-right px-3 text-etapa-textMid">{fmtNum(f.outputTokens)}</td>
                      <td className="text-right px-3 text-etapa-textFaint">
                        {f.cacheReadTokens || f.cacheCreateTokens
                          ? `${fmtNum(f.cacheReadTokens)} / ${fmtNum(f.cacheCreateTokens)}`
                          : "—"}
                      </td>
                      <td className={`text-right px-3 ${f.errors > 0 ? "text-red-400" : "text-etapa-textFaint"}`}>
                        {f.errors || "—"}
                      </td>
                      <td className="text-right px-5 py-3">
                        <span className="text-white font-medium">{fmtUsd(f.costUsd)}</span>
                        <span className="text-etapa-textFaint ml-2 text-xs">{share.toFixed(0)}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Top users */}
          <div className="bg-etapa-surface rounded-lg border border-etapa-border overflow-hidden">
            <div className="px-5 py-3 border-b border-etapa-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Top spenders</h2>
              <span className="text-xs text-etapa-textFaint">top 50 by cost</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-etapa-bg/40">
                <tr className="text-xs text-etapa-textFaint">
                  <th className="text-left px-5 py-2 font-medium">User</th>
                  <th className="text-right px-3 py-2 font-medium">Calls</th>
                  <th className="text-right px-3 py-2 font-medium">In tokens</th>
                  <th className="text-right px-3 py-2 font-medium">Out tokens</th>
                  <th className="text-right px-5 py-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {usage.byUser.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-etapa-textFaint">No usage in this window.</td></tr>
                )}
                {usage.byUser.map(u => (
                  <tr key={u.userId} className="border-t border-etapa-border hover:bg-etapa-surfaceLight/40">
                    <td className="px-5 py-3">
                      <Link href={`/dashboard/users/${u.userId}`} className="group">
                        <p className="text-white font-medium group-hover:text-etapa-primary transition-colors">
                          {u.name || u.email?.split("@")[0] || "Unknown"}
                        </p>
                        <p className="text-xs text-etapa-textFaint">{u.email || u.userId}</p>
                      </Link>
                    </td>
                    <td className="text-right px-3 text-etapa-textMid">{fmtNum(u.calls)}</td>
                    <td className="text-right px-3 text-etapa-textMid">{fmtNum(u.inputTokens)}</td>
                    <td className="text-right px-3 text-etapa-textMid">{fmtNum(u.outputTokens)}</td>
                    <td className="text-right px-5 py-3 text-white font-medium">{fmtUsd(u.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Auditor */}
          <div className="bg-etapa-surface rounded-lg border border-etapa-border p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">Ask the auditor</h2>
                <p className="text-sm text-etapa-textMid mt-1 max-w-2xl">
                  Sends the per-feature usage breakdown to Claude with a meta-prompt asking for
                  concrete cost-reduction ideas. Specific actions, ranked by estimated savings,
                  with the data each suggestion is anchored to. No PII is sent — feature totals only.
                </p>
              </div>
              <button
                onClick={runAudit}
                disabled={auditLoading}
                className={`shrink-0 px-4 py-2 rounded text-sm font-semibold transition-colors ${
                  auditLoading
                    ? "bg-etapa-surfaceLight text-etapa-textFaint cursor-wait"
                    : "bg-etapa-primary text-white hover:bg-etapa-primaryHover"
                }`}
              >
                {auditLoading ? "Auditing…" : "Suggest savings"}
              </button>
            </div>

            {auditError && (
              <div className="mt-4 text-red-400 text-sm">Audit failed: {auditError}</div>
            )}

            {audit?.audit?.summary && (
              <div className="mt-5 bg-etapa-bg/40 border border-etapa-border rounded p-4">
                <p className="text-sm text-white">{audit.audit.summary}</p>
                {audit.audit.totalSavingsPctEstimate != null && (
                  <p className="text-xs text-etapa-textFaint mt-2">
                    Total estimated savings:{" "}
                    <span className="text-etapa-primary font-semibold">
                      {audit.audit.totalSavingsPctEstimate}%
                    </span>{" "}
                    of spend (≈ {fmtUsd((audit.totalCostUsd * (audit.audit.totalSavingsPctEstimate || 0)) / 100)} / window)
                  </p>
                )}
              </div>
            )}

            {audit?.audit?.suggestions && audit.audit.suggestions.length > 0 && (
              <div className="mt-4 space-y-3">
                {audit.audit.suggestions.map((s, i) => (
                  <div key={i} className="border border-etapa-border rounded p-4 bg-etapa-bg/40">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-white">{s.title}</h3>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded uppercase tracking-wide ${severityClass(s.severity)}`}>
                          {s.severity}
                        </span>
                        <span className="text-xs text-etapa-primary font-semibold">
                          ~{s.estSavingsPct}% saved
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-etapa-textMid mt-2">{s.reason}</p>
                    <p className="text-sm text-white mt-2 font-mono text-xs bg-etapa-surfaceLight rounded p-2">
                      <span className="text-etapa-textFaint">action: </span>
                      {s.action}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {audit?.audit && (!audit.audit.suggestions || audit.audit.suggestions.length === 0) && !auditLoading && (
              <div className="mt-4 text-etapa-textMid text-sm">
                Auditor returned no actionable suggestions. Either spend is well-optimised already, or there's not enough variety in the window to spot patterns. Try a longer window.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
