"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

interface ActivityFeedback {
  activityId: string;
  title?: string | null;
  effort?: string | null;
  rpe?: number | null;
  feel?: string | null;
  note?: string | null;
  recordedAt?: string | null;
}

interface CheckinResponses {
  sessionsDone?: string[];
  sessionComments?: Record<string, string>;
  modifications?: string;
  lifeEvents?: string;
  activityFeedback?: ActivityFeedback[];
  injury?: { reported?: boolean; description?: string; intentToSeePhysio?: boolean };
  submittedAt?: string;
}

interface SuggestionChange {
  activityId?: string;
  kind?: string;
  reason?: string;
  newDurationMins?: number | null;
  newDistanceKm?: number | null;
  newEffort?: string | null;
}

interface CheckinSuggestions {
  summary?: string;
  physioRecommended?: boolean;
  changes?: SuggestionChange[];
  crisisResources?: boolean;
  resources?: { label: string; detail: string }[];
}

interface Checkin {
  id: string;
  userId: string;
  userEmail: string | null;
  planId: string | null;
  planName: string | null;
  weekNum: number | null;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  dismissedAt: string | null;
  expiredAt: string | null;
  reminderCount: number | null;
  trigger: string | null;
  responses: CheckinResponses | null;
  suggestions: CheckinSuggestions | null;
  createdAt: string;
}

const STATUS_FILTERS = ["all", "pending", "sent", "responded", "dismissed", "expired"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

// Pill styling per status. Colour-coding follows the same logic the iOS
// app uses in CheckInScreen so admin + rider see the same semantics:
//   responded → primary pink (something happened, good)
//   sent      → blue (in flight, awaiting rider)
//   pending   → amber (queued, not yet pushed)
//   dismissed → muted (rider opted out)
//   expired   → muted (force-resend or sweep retired it)
const STATUS_STYLES: Record<string, string> = {
  responded: "bg-pink-500/10 text-pink-400 border-pink-500/30",
  sent: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  dismissed: "bg-etapa-surfaceLight text-etapa-textFaint border-etapa-border",
  expired: "bg-etapa-surfaceLight text-etapa-textFaint border-etapa-border",
};

function formatDate(ts: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function formatRelative(ts: string | null) {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(ts);
}

const EFFORT_LABEL: Record<string, string> = {
  way_too_easy: "way too easy",
  easy: "easy",
  just_right: "just right",
  hard: "hard",
  way_too_hard: "way too hard",
};

const FEEL_LABEL: Record<string, string> = { strong: "strong", ok: "ok", off: "off" };

export default function CheckinsPage() {
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Per-row in-flight indicator for the re-send button so the admin knows
  // the click registered while the round-trip is pending.
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);

  const fetchCheckins = () => {
    setLoading(true);
    const qs = statusFilter === "all" ? "" : `?status=${statusFilter}`;
    fetch(`/api/checkins${qs}`)
      .then((r) => r.json())
      .then((data) => setCheckins(Array.isArray(data) ? data : []))
      .catch(() => setError("Failed to load check-ins"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCheckins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return checkins;
    return checkins.filter(
      (c) =>
        (c.userEmail || "").toLowerCase().includes(q) ||
        (c.planName || "").toLowerCase().includes(q) ||
        (c.id || "").toLowerCase().includes(q) ||
        (c.userId || "").toLowerCase().includes(q)
    );
  }, [checkins, query]);

  // Counts for the summary cards. We compute over the full unfiltered
  // result so the cards show "everything we know about" rather than
  // "what matches your current search". Status filter still narrows the
  // table itself.
  const counts = useMemo(() => {
    const c = { total: checkins.length, pending: 0, sent: 0, responded: 0 };
    for (const ck of checkins) {
      if (ck.status === "pending") c.pending++;
      else if (ck.status === "sent") c.sent++;
      else if (ck.status === "responded") c.responded++;
    }
    return c;
  }, [checkins]);

  const handleResend = async (userId: string, email: string | null, force: boolean) => {
    const label = email || userId.slice(0, 8) + "…";
    if (force && !confirm(
      `Force re-send the weekly check-in for ${label}?\n\nThis expires the rider's existing check-in (whatever its state) and fires a fresh push.`
    )) return;

    setResendingUserId(userId);
    try {
      const res = await fetch(`/api/users/${userId}/weekly-checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Send failed: ${json?.error || res.status}`);
        return;
      }
      if (json.deduped) {
        // The server skipped the dedupe — admin probably tapped without
        // realising there was a pending one. Offer the force path.
        const yes = confirm(
          `${label} already has a ${json.existingStatus || "pending"} check-in for this week.\n\n` +
          `Force re-send and replace it?`
        );
        if (yes) {
          await handleResend(userId, email, true);
          return;
        }
      } else {
        alert(`Sent. New check-in id: ${json.id}`);
      }
      fetchCheckins();
    } catch (e: any) {
      alert(`Send failed: ${e?.message || e}`);
    } finally {
      setResendingUserId(null);
    }
  };

  if (loading && checkins.length === 0) {
    return <div className="animate-pulse text-etapa-textMuted">Loading check-ins…</div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Weekly Check-ins</h1>
          <p className="text-sm text-etapa-textMuted mt-1">
            All structured weekly check-ins across riders. Click a row to see the rider&apos;s responses and the coach&apos;s suggestions.
          </p>
        </div>
        <button
          onClick={fetchCheckins}
          className="px-3 py-2 text-xs font-medium text-white bg-etapa-surfaceLight border border-etapa-border rounded-lg hover:bg-etapa-border self-start sm:self-end"
        >
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4">
          <p className="text-xs text-etapa-textMuted uppercase tracking-wider">Total loaded</p>
          <p className="text-2xl font-semibold text-white mt-1">{counts.total}</p>
        </div>
        <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4">
          <p className="text-xs text-etapa-textMuted uppercase tracking-wider">Pending</p>
          <p className="text-2xl font-semibold text-amber-400 mt-1">{counts.pending}</p>
        </div>
        <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4">
          <p className="text-xs text-etapa-textMuted uppercase tracking-wider">Sent (awaiting)</p>
          <p className="text-2xl font-semibold text-blue-400 mt-1">{counts.sent}</p>
        </div>
        <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4">
          <p className="text-xs text-etapa-textMuted uppercase tracking-wider">Responded</p>
          <p className="text-2xl font-semibold text-pink-400 mt-1">{counts.responded}</p>
        </div>
      </div>

      {/* Filters: status pills + search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                statusFilter === s
                  ? "bg-etapa-primary/20 border-etapa-primary text-white"
                  : "bg-etapa-surfaceLight border-etapa-border text-etapa-textMid hover:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search email, plan, or id…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 sm:max-w-xs px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-white placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary"
        />
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {/* Desktop table */}
      <div className="hidden sm:block bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-etapa-border bg-etapa-surfaceLight">
              <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase">Rider</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase">Plan / Wk</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase">Trigger</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase">Scheduled</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase">Responded</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-etapa-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-etapa-textFaint">
                  {checkins.length === 0 ? "No check-ins yet." : "No matches for your filter."}
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <Row
                  key={c.id}
                  c={c}
                  expanded={expandedId === c.id}
                  onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  onResend={() => handleResend(c.userId, c.userEmail, false)}
                  onForceResend={() => handleResend(c.userId, c.userEmail, true)}
                  resending={resendingUserId === c.userId}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-etapa-surface rounded-xl border border-etapa-border p-6 text-center text-etapa-textFaint text-sm">
            {checkins.length === 0 ? "No check-ins yet." : "No matches for your filter."}
          </div>
        ) : (
          filtered.map((c) => (
            <MobileCard
              key={c.id}
              c={c}
              expanded={expandedId === c.id}
              onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
              onResend={() => handleResend(c.userId, c.userEmail, false)}
              onForceResend={() => handleResend(c.userId, c.userEmail, true)}
              resending={resendingUserId === c.userId}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Row + expanded detail. Kept inline rather than separate files because the
// shape is bespoke to this page and there's no other reuser.
// ────────────────────────────────────────────────────────────────────────────

interface RowProps {
  c: Checkin;
  expanded: boolean;
  onToggle: () => void;
  onResend: () => void;
  onForceResend: () => void;
  resending: boolean;
}

function StatusPill({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] || STATUS_STYLES.dismissed;
  return (
    <span className={`inline-block text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full border ${cls}`}>
      {status}
    </span>
  );
}

function Row({ c, expanded, onToggle, onResend, onForceResend, resending }: RowProps) {
  return (
    <>
      <tr
        className={`hover:bg-etapa-surfaceLight cursor-pointer ${expanded ? "bg-etapa-surfaceLight" : ""}`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 font-medium text-white">
          <div className="text-sm">{c.userEmail || c.userId.slice(0, 8) + "…"}</div>
          <div className="text-[10px] text-etapa-textFaint font-mono mt-0.5">{c.id}</div>
        </td>
        <td className="px-4 py-3 text-etapa-textMid">
          <div className="text-xs">{c.planName || "—"}</div>
          {c.weekNum != null && <div className="text-[10px] text-etapa-textFaint">Week {c.weekNum}</div>}
        </td>
        <td className="px-4 py-3">
          <StatusPill status={c.status} />
        </td>
        <td className="px-4 py-3 text-xs text-etapa-textMid">
          {c.trigger ? (
            <span className="inline-block text-[10px] px-2 py-0.5 bg-etapa-surfaceLight rounded border border-etapa-border">
              {c.trigger}
            </span>
          ) : (
            <span className="text-etapa-textFaint">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-etapa-textMid whitespace-nowrap">{formatRelative(c.scheduledAt)}</td>
        <td className="px-4 py-3 text-xs text-etapa-textMid whitespace-nowrap">{formatRelative(c.respondedAt)}</td>
        <td className="px-4 py-3 text-right">
          <button
            onClick={(e) => { e.stopPropagation(); onResend(); }}
            disabled={resending}
            className="text-[11px] text-etapa-primary hover:text-pink-300 disabled:opacity-40"
          >
            {resending ? "Sending…" : "Re-send"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-etapa-surfaceLight">
          <td colSpan={7} className="px-4 py-4">
            <ExpandedDetail c={c} onForceResend={onForceResend} resending={resending} />
          </td>
        </tr>
      )}
    </>
  );
}

function MobileCard({ c, expanded, onToggle, onResend, onForceResend, resending }: RowProps) {
  return (
    <div className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
      <div className="p-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-white text-sm truncate">{c.userEmail || c.userId.slice(0, 8) + "…"}</p>
            <p className="text-xs text-etapa-textMuted mt-1">
              {c.planName || "—"}{c.weekNum != null ? ` · Wk ${c.weekNum}` : ""}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <StatusPill status={c.status} />
              <span className="text-[10px] text-etapa-textFaint">{formatRelative(c.scheduledAt)}</span>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onResend(); }}
            disabled={resending}
            className="text-[11px] text-etapa-primary hover:text-pink-300 disabled:opacity-40 shrink-0"
          >
            {resending ? "…" : "Re-send"}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-etapa-border p-4 bg-etapa-surfaceLight">
          <ExpandedDetail c={c} onForceResend={onForceResend} resending={resending} />
        </div>
      )}
    </div>
  );
}

// Inline detail panel — shows the rider's responses (free-text + per-session
// feedback) and the coach's suggestion summary + structured changes. Kept
// dense rather than tabbed because admins want everything at-a-glance.
function ExpandedDetail({
  c, onForceResend, resending,
}: { c: Checkin; onForceResend: () => void; resending: boolean }) {
  const r = c.responses;
  const s = c.suggestions;

  return (
    <div className="space-y-4 text-sm">
      {/* ── Rider responses ── */}
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-etapa-textMuted mb-2">Rider responses</p>
        {!r ? (
          <p className="text-etapa-textFaint italic">Not yet responded.</p>
        ) : (
          <div className="space-y-2">
            {r.modifications ? (
              <div>
                <p className="text-[10px] text-etapa-textMuted mb-0.5">Anything to flag</p>
                <p className="text-white">{r.modifications}</p>
              </div>
            ) : null}
            {r.activityFeedback && r.activityFeedback.length > 0 && (
              <div>
                <p className="text-[10px] text-etapa-textMuted mb-1">Per-session feedback</p>
                <ul className="space-y-1">
                  {r.activityFeedback.map((f) => (
                    <li key={f.activityId} className="text-xs text-etapa-textMid">
                      <span className="text-white">{f.title || "Session"}</span>
                      {f.effort && EFFORT_LABEL[f.effort] ? <> · {EFFORT_LABEL[f.effort]}</> : null}
                      {f.feel && FEEL_LABEL[f.feel] ? <> · felt {FEEL_LABEL[f.feel]}</> : null}
                      {f.note ? <> · &ldquo;{f.note}&rdquo;</> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.injury?.reported && (
              <div>
                <p className="text-[10px] text-etapa-textMuted mb-0.5">Injury</p>
                <p className="text-amber-400">
                  {r.injury.description || "Reported, no detail given"}
                  {r.injury.intentToSeePhysio ? " · will see physio" : ""}
                </p>
              </div>
            )}
            {r.sessionsDone && r.sessionsDone.length > 0 && (
              <p className="text-[10px] text-etapa-textFaint">
                Marked {r.sessionsDone.length} session{r.sessionsDone.length === 1 ? "" : "s"} done
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Coach suggestions ── */}
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-etapa-textMuted mb-2">Coach suggestions</p>
        {!s ? (
          <p className="text-etapa-textFaint italic">No suggestions generated yet.</p>
        ) : s.crisisResources ? (
          <p className="text-amber-400 text-xs">Crisis resources surfaced — Claude was bypassed.</p>
        ) : (
          <div className="space-y-2">
            {s.summary ? <p className="text-white italic">&ldquo;{s.summary}&rdquo;</p> : null}
            {s.physioRecommended && (
              <p className="text-xs text-amber-400">⚕ Physio recommended.</p>
            )}
            {s.changes && s.changes.length > 0 ? (
              <ul className="space-y-1">
                {s.changes.map((ch, i) => (
                  <li key={i} className="text-xs text-etapa-textMid">
                    <span className="text-pink-400 font-medium uppercase text-[10px] tracking-wider mr-1.5">
                      {ch.kind || "modify"}
                    </span>
                    {ch.reason || "(no reason)"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-etapa-textFaint">No changes proposed — stick with the plan.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Lifecycle timestamps ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-etapa-border text-[11px]">
        <Field label="Scheduled" value={formatDate(c.scheduledAt)} />
        <Field label="Sent" value={formatDate(c.sentAt)} />
        <Field label="Responded" value={formatDate(c.respondedAt)} />
        <Field label="Reminders" value={String(c.reminderCount ?? 0)} />
      </div>

      {/* ── Force re-send action ── */}
      {c.status !== "responded" && (
        <div className="pt-2 border-t border-etapa-border">
          <button
            onClick={onForceResend}
            disabled={resending}
            className="text-xs px-3 py-1.5 rounded-md border border-etapa-border bg-etapa-surface hover:bg-etapa-surfaceLight text-etapa-textMid hover:text-white disabled:opacity-40"
            title="Expires this row and fires a fresh check-in + push"
          >
            {resending ? "Force-sending…" : "Force-resend (expire + push fresh)"}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-etapa-textMuted">{label}</p>
      <p className="text-white">{value}</p>
    </div>
  );
}
