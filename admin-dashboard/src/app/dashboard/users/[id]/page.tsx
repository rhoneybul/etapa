"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";

interface Profile {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  provider: string | null;
  providers: string[];
}

interface Subscription {
  id: string;
  plan: string;
  status: string;
  source: string;
  store: string | null;
  productId: string | null;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string | null;
}

interface Plan {
  id: string;
  name: string;
  status: string;
  weeks: number | null;
  startDate: string | null;
  createdAt: string;
  activityCount: number;
}

interface Feedback {
  id: string;
  category: string;
  message: string;
  appVersion: string | null;
  linearIssueKey: string | null;
  linearIssueUrl: string | null;
  adminResponse: string | null;
  adminRespondedAt: string | null;
  createdAt: string;
}

interface Ticket {
  id: string;
  linearId: string;
  title: string;
  url: string;
  priority: string;
  status: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

interface UserDetail {
  profile: Profile;
  subscriptions: Subscription[];
  plans: Plan[];
  feedback: Feedback[];
  tickets: Ticket[];
}

interface RCTransaction {
  kind: "one_time" | "subscription";
  productId: string;
  transactionId: string | null;
  store: string | null;
  isSandbox: boolean;
  purchaseDate: string | null;
  originalPurchaseDate?: string | null;
  expiresDate: string | null;
  periodType: string | null;
  refundedAt: string | null;
  billingIssueAt: string | null;
  unsubscribeDetectedAt: string | null;
  ownershipType: string | null;
}

interface RevenueCatData {
  found: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
  originalAppUserId: string | null;
  originalPurchaseDate: string | null;
  managementUrl: string | null;
  transactions: RCTransaction[];
  error?: string;
}

const SOURCE_STYLES: Record<string, string> = {
  "Apple IAP": "bg-blue-900/30 text-blue-300 border-blue-700/30",
  "Google Play": "bg-green-900/30 text-green-300 border-green-700/30",
  "Coupon": "bg-purple-900/30 text-purple-300 border-purple-700/30",
  "Free Trial": "bg-amber-900/30 text-amber-300 border-amber-700/30",
  "Stripe": "bg-indigo-900/30 text-indigo-300 border-indigo-700/30",
  "Promotional": "bg-pink-900/30 text-pink-300 border-pink-700/30",
};

function formatDate(iso: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider">{title}</h2>
        {typeof count === "number" && (
          <span className="text-xs text-etapa-textMuted">({count})</span>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="bg-etapa-surface rounded-xl border border-etapa-border p-6 text-center text-sm text-etapa-textFaint">
      {text}
    </div>
  );
}

interface GrantResult {
  ok: boolean;
  warnings?: string[];
  results: {
    revenueCat: { attempted: boolean; ok: boolean; detail: any };
    override: { attempted: boolean; ok: boolean; detail: any };
    subscription: { attempted: boolean; ok: boolean; detail: any };
  };
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rcData, setRcData] = useState<RevenueCatData | null>(null);
  const [rcLoading, setRcLoading] = useState(true);
  const [rcError, setRcError] = useState<string | null>(null);

  // Lifetime grant state
  const [grantModalOpen, setGrantModalOpen] = useState<null | "grant" | "revoke">(null);
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantResult, setGrantResult] = useState<GrantResult | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);

  // Regenerate-plan state
  const [regenPlanId, setRegenPlanId] = useState<string | null>(null);
  const [regenJobId, setRegenJobId] = useState<string | null>(null);
  const [regenProgress, setRegenProgress] = useState<string | null>(null);
  const [regenStatus, setRegenStatus] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenOverrides, setRegenOverrides] = useState<{ fitnessLevel: string; daysPerWeek: string; weeks: string }>({
    fitnessLevel: "",
    daysPerWeek: "",
    weeks: "",
  });

  // Rate limits (per-user overrides + current usage)
  interface RateLimitsData {
    weeklyPlanLimit: number | null;
    weeklyCoachMsgLimit: number | null;
    note: string | null;
    updatedAt: string | null;
    defaults: { plansPerWeek: number; coachMsgsPerWeek: number };
    usage: { plans7d: number; coachMsgs7d: number };
  }
  const [rlData, setRlData] = useState<RateLimitsData | null>(null);
  const [rlLoading, setRlLoading] = useState(false);
  const [rlSaving, setRlSaving] = useState(false);
  const [rlError, setRlError] = useState<string | null>(null);
  // `plans` = weekly plan override, `coach` = weekly coach msg override
  const [rlForm, setRlForm] = useState<{ plans: string; coach: string; note: string }>({
    plans: "",
    coach: "",
    note: "",
  });

  const refresh = useCallback(() => {
    if (!params?.id) return;
    setLoading(true);
    fetch(`/api/users/${params.id}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${r.status})`);
        }
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    setRcLoading(true);
    fetch(`/api/users/${params.id}/revenuecat`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `RevenueCat request failed (${r.status})`);
        return body as RevenueCatData;
      })
      .then((d) => setRcData(d))
      .catch((e) => setRcError(e.message))
      .finally(() => setRcLoading(false));

    setRlLoading(true);
    setRlError(null);
    fetch(`/api/users/${params.id}/rate-limits`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `Rate limits request failed (${r.status})`);
        return body as RateLimitsData;
      })
      .then((d) => {
        setRlData(d);
        // Pre-populate form with current overrides (empty string = unset / use default)
        setRlForm({
          plans: d.weeklyPlanLimit != null ? String(d.weeklyPlanLimit) : "",
          coach: d.weeklyCoachMsgLimit != null ? String(d.weeklyCoachMsgLimit) : "",
          note: d.note || "",
        });
      })
      .catch((e) => setRlError(e.message))
      .finally(() => setRlLoading(false));
  }, [params?.id]);

  async function saveRateLimits() {
    if (!params?.id) return;
    setRlSaving(true);
    setRlError(null);
    try {
      const parseVal = (v: string): number | null => {
        const s = v.trim();
        if (s === "") return null;
        const n = parseInt(s, 10);
        if (!Number.isFinite(n) || n < 0) throw new Error("Limits must be a non-negative integer or empty.");
        return n;
      };
      const body = {
        weeklyPlanLimit: parseVal(rlForm.plans),
        weeklyCoachMsgLimit: parseVal(rlForm.coach),
        note: rlForm.note.trim() || null,
      };
      const res = await fetch(`/api/users/${params.id}/rate-limits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Save failed (${res.status})`);
      }
      // Refresh to show updated values + server-side updated_at
      refresh();
    } catch (e: any) {
      setRlError(e.message);
    } finally {
      setRlSaving(false);
    }
  }

  async function resetRateLimits() {
    if (!params?.id) return;
    if (!confirm("Reset this user to the global defaults? Any override will be cleared.")) return;
    setRlSaving(true);
    setRlError(null);
    try {
      const res = await fetch(`/api/users/${params.id}/rate-limits`, { method: "DELETE" });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Reset failed (${res.status})`);
      }
      refresh();
    } catch (e: any) {
      setRlError(e.message);
    } finally {
      setRlSaving(false);
    }
  }

  useEffect(() => { refresh(); }, [refresh]);

  async function runGrant() {
    if (!params?.id) return;
    setGrantBusy(true);
    setGrantError(null);
    setGrantResult(null);
    try {
      const res = await fetch(`/api/users/${params.id}/grant-lifetime`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && !body?.results) {
        throw new Error(body.error || `Grant failed (${res.status})`);
      }
      setGrantResult(body as GrantResult);
      refresh();
    } catch (e: any) {
      setGrantError(e.message);
    } finally {
      setGrantBusy(false);
    }
  }

  // Poll job progress every second until done/failed.
  useEffect(() => {
    if (!regenJobId || regenStatus !== "running") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/plan-jobs/${regenJobId}`);
        const body = await r.json();
        if (cancelled) return;
        if (body?.progress) setRegenProgress(body.progress);
        if (body?.status === "completed") {
          setRegenStatus("done");
          setRegenProgress(null);
          refresh();
        } else if (body?.status === "failed") {
          setRegenStatus("failed");
          setRegenError(body?.error || "Regeneration failed");
        }
      } catch (e: any) {
        if (!cancelled) setRegenError(e.message);
      }
    };
    const iv = setInterval(tick, 1500);
    tick();
    return () => { cancelled = true; clearInterval(iv); };
  }, [regenJobId, regenStatus, refresh]);

  async function runRegenerate(planId: string) {
    setRegenJobId(null);
    setRegenProgress("Kicking off regeneration...");
    setRegenStatus("running");
    setRegenError(null);
    try {
      // Only send non-empty overrides so the server falls back to the plan's
      // stored goal + config for unchanged fields.
      const configOverrides: Record<string, unknown> = {};
      if (regenOverrides.fitnessLevel) configOverrides.fitnessLevel = regenOverrides.fitnessLevel;
      if (regenOverrides.daysPerWeek) configOverrides.daysPerWeek = Number(regenOverrides.daysPerWeek);
      if (regenOverrides.weeks) configOverrides.weeks = Number(regenOverrides.weeks);

      const res = await fetch(`/api/plans/${planId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configOverrides,
          reason: "triggered-from-admin-dashboard",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.jobId) throw new Error(body?.error || `Regenerate failed (${res.status})`);
      setRegenJobId(body.jobId);
      setRegenProgress("Consulting your AI coach...");
    } catch (e: any) {
      setRegenStatus("failed");
      setRegenError(e.message);
    }
  }

  async function runRevoke() {
    if (!params?.id) return;
    setGrantBusy(true);
    setGrantError(null);
    setGrantResult(null);
    try {
      const res = await fetch(`/api/users/${params.id}/revoke-lifetime`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && !body?.results) {
        throw new Error(body.error || `Revoke failed (${res.status})`);
      }
      setGrantResult(body as GrantResult);
      refresh();
    } catch (e: any) {
      setGrantError(e.message);
    } finally {
      setGrantBusy(false);
    }
  }

  if (loading) {
    return <div className="animate-pulse text-etapa-textMuted">Loading user...</div>;
  }

  if (error || !data) {
    return (
      <div>
        <Link href="/dashboard/users" className="text-xs text-etapa-textMuted hover:text-white">
          &larr; Back to Users
        </Link>
        <div className="mt-6 bg-red-900/20 border border-red-900/40 rounded-xl p-6 text-sm text-red-400">
          {error || "User not found"}
        </div>
      </div>
    );
  }

  const { profile, subscriptions, plans, feedback, tickets } = data;
  const displayName = profile.name || profile.email || profile.id;
  const activeSub = subscriptions.find((s) => ["active", "trialing", "paid"].includes(s.status));
  const hasLifetime = subscriptions.some(
    (s) => s.plan === "lifetime" && ["active", "paid"].includes(s.status)
  );

  return (
    <div>
      <Link href="/dashboard/users" className="text-xs text-etapa-textMuted hover:text-white">
        &larr; Back to Users
      </Link>

      {/* Header */}
      <div className="mt-3 mb-6 flex items-center gap-4">
        <div className="w-12 h-12 bg-etapa-primary/20 rounded-full flex items-center justify-center text-lg font-medium text-etapa-primary">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-white truncate">{displayName}</h1>
            {profile.isAdmin && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-etapa-primary/15 text-etapa-primary border border-etapa-primary/20">
                ADMIN
              </span>
            )}
          </div>
          <p className="text-sm text-etapa-textMuted">{profile.email}</p>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Current Plan"
          value={activeSub?.plan || "free"}
          sub={activeSub?.status || "\u2014"}
        />
        <StatCard label="Training Plans" value={plans.length} />
        <StatCard label="Feedback" value={feedback.length} />
        <StatCard label="Support Tickets" value={tickets.length} />
      </div>

      {/* Support actions — lifetime grant / revoke */}
      <Section title="Support Actions">
        <div className="bg-etapa-surface rounded-xl border border-etapa-border p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm text-white font-medium">
                Lifetime access
                {hasLifetime ? (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-300 border border-green-700/30">
                    ACTIVE
                  </span>
                ) : (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-etapa-surfaceLight text-etapa-textMuted border border-etapa-border">
                    NOT GRANTED
                  </span>
                )}
              </div>
              <p className="text-xs text-etapa-textMuted mt-1">
                Writes to RevenueCat, the user-config override, and the subscriptions table — belt-and-braces so the client unlocks immediately even if RC is slow.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {!hasLifetime ? (
                <button
                  onClick={() => setGrantModalOpen("grant")}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-etapa-primary text-white hover:bg-etapa-primary/90 transition-colors"
                >
                  Grant Lifetime
                </button>
              ) : (
                <button
                  onClick={() => setGrantModalOpen("revoke")}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-900/30 text-red-300 border border-red-900/40 hover:bg-red-900/50 transition-colors"
                >
                  Revoke Lifetime
                </button>
              )}
            </div>
          </div>

          {grantResult && (
            <div className="mt-4 border-t border-etapa-border pt-4">
              <div className="text-xs font-medium text-white mb-2">
                Last action result
                {grantResult.ok ? (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-300 border border-green-700/30">
                    OK
                  </span>
                ) : (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-900/30 text-amber-300 border border-amber-700/30">
                    PARTIAL
                  </span>
                )}
              </div>
              <ul className="space-y-1 text-xs text-etapa-textMid">
                <li className="flex items-center gap-2">
                  <span className={grantResult.results.revenueCat.ok ? "text-green-400" : "text-red-400"}>
                    {grantResult.results.revenueCat.ok ? "✓" : "✗"}
                  </span>
                  <span>RevenueCat entitlement</span>
                  {!grantResult.results.revenueCat.ok && (
                    <span className="text-etapa-textFaint">— check REVENUECAT_SECRET_API_KEY</span>
                  )}
                </li>
                <li className="flex items-center gap-2">
                  <span className={grantResult.results.override.ok ? "text-green-400" : "text-red-400"}>
                    {grantResult.results.override.ok ? "✓" : "✗"}
                  </span>
                  <span>user_config_overrides</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className={grantResult.results.subscription.ok ? "text-green-400" : "text-red-400"}>
                    {grantResult.results.subscription.ok ? "✓" : "✗"}
                  </span>
                  <span>subscriptions row</span>
                </li>
              </ul>
              {(grantResult.warnings || []).length > 0 && (
                <div className="mt-2 text-xs text-amber-300">
                  {(grantResult.warnings || []).map((w, i) => (<div key={i}>{w}</div>))}
                </div>
              )}
            </div>
          )}

          {grantError && (
            <div className="mt-4 border-t border-etapa-border pt-4 text-xs text-red-400">
              Error: {grantError}
            </div>
          )}
        </div>
      </Section>

      {/* Regenerate plan modal */}
      {regenPlanId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => regenStatus !== "running" && setRegenPlanId(null)}
        >
          <div
            className="bg-etapa-surface rounded-xl border border-etapa-border p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-white mb-1">Regenerate plan</h3>
            <p className="text-sm text-etapa-textMid mb-4">
              The existing plan will be snapshotted so it can be restored if the new one is worse. Leave overrides blank to keep the user's original inputs.
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1 block">Fitness level override</label>
                <select
                  disabled={regenStatus === "running"}
                  value={regenOverrides.fitnessLevel}
                  onChange={(e) => setRegenOverrides((p) => ({ ...p, fitnessLevel: e.target.value }))}
                  className="w-full bg-etapa-surfaceLight border border-etapa-border rounded px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  <option value="">— keep original —</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="expert">Expert</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1 block">Days / week</label>
                  <input
                    disabled={regenStatus === "running"}
                    type="number"
                    min="1"
                    max="7"
                    placeholder="keep"
                    value={regenOverrides.daysPerWeek}
                    onChange={(e) => setRegenOverrides((p) => ({ ...p, daysPerWeek: e.target.value }))}
                    className="w-full bg-etapa-surfaceLight border border-etapa-border rounded px-3 py-2 text-sm text-white disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1 block">Total weeks</label>
                  <input
                    disabled={regenStatus === "running"}
                    type="number"
                    min="2"
                    max="52"
                    placeholder="keep"
                    value={regenOverrides.weeks}
                    onChange={(e) => setRegenOverrides((p) => ({ ...p, weeks: e.target.value }))}
                    className="w-full bg-etapa-surfaceLight border border-etapa-border rounded px-3 py-2 text-sm text-white disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            {regenStatus === "running" && (
              <div className="mb-4 text-xs text-etapa-textMid bg-etapa-surfaceLight border border-etapa-border rounded p-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-etapa-primary animate-pulse" />
                  <span>{regenProgress || "Running..."}</span>
                </div>
              </div>
            )}
            {regenStatus === "done" && (
              <div className="mb-4 text-xs text-green-300 bg-green-900/20 border border-green-900/40 rounded p-3">
                Plan regenerated successfully. Activities now in place.
              </div>
            )}
            {regenStatus === "failed" && regenError && (
              <div className="mb-4 text-xs text-red-300 bg-red-900/20 border border-red-900/40 rounded p-3">
                Error: {regenError}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                disabled={regenStatus === "running"}
                onClick={() => setRegenPlanId(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-etapa-surfaceLight text-etapa-textMid hover:bg-etapa-border transition-colors disabled:opacity-50"
              >
                {regenStatus === "done" || regenStatus === "failed" ? "Close" : "Cancel"}
              </button>
              {regenStatus !== "done" && (
                <button
                  disabled={regenStatus === "running"}
                  onClick={() => runRegenerate(regenPlanId)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-etapa-primary hover:bg-etapa-primary/90 transition-colors disabled:opacity-50"
                >
                  {regenStatus === "running" ? "Regenerating..." : regenStatus === "failed" ? "Retry" : "Regenerate plan"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grant / revoke confirmation modal */}
      {grantModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !grantBusy && setGrantModalOpen(null)}
        >
          <div
            className="bg-etapa-surface rounded-xl border border-etapa-border p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-white mb-2">
              {grantModalOpen === "grant" ? "Grant lifetime access?" : "Revoke lifetime access?"}
            </h3>
            <p className="text-sm text-etapa-textMid mb-4">
              {grantModalOpen === "grant"
                ? `${displayName} will get permanent access via RevenueCat + the app override. This is idempotent — safe to re-run if it fails.`
                : `${displayName}'s lifetime will be revoked in RevenueCat and the app. Any non-lifetime subscription they have is NOT affected.`}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                disabled={grantBusy}
                onClick={() => setGrantModalOpen(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-etapa-surfaceLight text-etapa-textMid hover:bg-etapa-border transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={grantBusy}
                onClick={async () => {
                  if (grantModalOpen === "grant") await runGrant();
                  else await runRevoke();
                  setGrantModalOpen(null);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md text-white transition-colors disabled:opacity-50 ${
                  grantModalOpen === "grant" ? "bg-etapa-primary hover:bg-etapa-primary/90" : "bg-red-700 hover:bg-red-600"
                }`}
              >
                {grantBusy ? "Working..." : grantModalOpen === "grant" ? "Yes, grant lifetime" : "Yes, revoke"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile & account */}
      <Section title="Profile & Account">
        <div className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
          <dl className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-etapa-border">
            <div className="p-4 space-y-3">
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">User ID</dt>
                <dd className="text-xs font-mono text-etapa-textMid mt-1 break-all">{profile.id}</dd>
              </div>
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">Email</dt>
                <dd className="text-sm text-white mt-1">{profile.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">Name</dt>
                <dd className="text-sm text-white mt-1">{profile.name || "\u2014"}</dd>
              </div>
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">Auth Provider</dt>
                <dd className="text-sm text-white mt-1">
                  {profile.providers.length > 0 ? profile.providers.join(", ") : profile.provider || "\u2014"}
                </dd>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">Signed Up</dt>
                <dd className="text-sm text-white mt-1">{formatDateTime(profile.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">Last Sign In</dt>
                <dd className="text-sm text-white mt-1">{formatDateTime(profile.lastSignInAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">Email Confirmed</dt>
                <dd className="text-sm text-white mt-1">{formatDateTime(profile.emailConfirmedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-etapa-textMuted uppercase tracking-wide">Admin</dt>
                <dd className="text-sm text-white mt-1">{profile.isAdmin ? "Yes" : "No"}</dd>
              </div>
            </div>
          </dl>
        </div>
      </Section>

      {/* Subscriptions */}
      <Section title="Subscriptions & Payments" count={subscriptions.length}>
        {subscriptions.length === 0 ? (
          <EmptyRow text="No subscription records for this user." />
        ) : (
          <div className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-etapa-border bg-etapa-surfaceLight text-left">
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Plan</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Source</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Product</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Period End</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-etapa-border">
                  {subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-etapa-surfaceLight transition-colors">
                      <td className="px-4 py-3"><Badge value={sub.plan} /></td>
                      <td className="px-4 py-3"><Badge value={sub.status} /></td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                            SOURCE_STYLES[sub.source] || "bg-gray-800 text-gray-400 border-gray-700"
                          }`}
                        >
                          {sub.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid font-mono">
                        {sub.productId || "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid whitespace-nowrap">{formatDateTime(sub.currentPeriodEnd)}</td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid whitespace-nowrap">{formatDateTime(sub.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* RevenueCat transaction history */}
      <Section
        title="Transaction History (RevenueCat)"
        count={rcData?.transactions.length ?? undefined}
      >
        {rcLoading ? (
          <div className="bg-etapa-surface rounded-xl border border-etapa-border p-6 text-sm text-etapa-textMuted animate-pulse">
            Loading live transaction data from RevenueCat...
          </div>
        ) : rcError ? (
          <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-4 text-sm text-red-400">
            {rcError}
          </div>
        ) : !rcData || !rcData.found ? (
          <EmptyRow text="No RevenueCat record for this user. They may have never made a purchase via IAP, or the RC secret API key isn't configured on the server." />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <StatCard label="First Seen" value={formatDate(rcData.firstSeen)} />
              <StatCard label="Last Seen" value={formatDate(rcData.lastSeen)} />
              <StatCard
                label="First Purchase"
                value={formatDate(rcData.originalPurchaseDate)}
              />
              <StatCard label="Transactions" value={rcData.transactions.length} />
            </div>

            {rcData.transactions.length === 0 ? (
              <EmptyRow text="No purchase transactions recorded in RevenueCat." />
            ) : (
              <div className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-etapa-border bg-etapa-surfaceLight text-left">
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Kind</th>
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Product</th>
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Store</th>
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Env</th>
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Purchase Time</th>
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Expires</th>
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Flags</th>
                        <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Transaction ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-etapa-border">
                      {rcData.transactions.map((t, i) => (
                        <tr key={`${t.transactionId || t.productId}-${i}`} className="hover:bg-etapa-surfaceLight transition-colors">
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                t.kind === "subscription"
                                  ? "bg-indigo-900/30 text-indigo-300"
                                  : "bg-purple-900/30 text-purple-300"
                              }`}
                            >
                              {t.kind === "subscription" ? "subscription" : "one-time"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-etapa-textMid font-mono">{t.productId}</td>
                          <td className="px-4 py-3 text-xs text-etapa-textMid">{t.store || "\u2014"}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                t.isSandbox
                                  ? "bg-amber-900/30 text-amber-400"
                                  : "bg-green-900/30 text-green-400"
                              }`}
                            >
                              {t.isSandbox ? "sandbox" : "production"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-etapa-textMid whitespace-nowrap">
                            {formatDateTime(t.purchaseDate)}
                          </td>
                          <td className="px-4 py-3 text-xs text-etapa-textMid whitespace-nowrap">
                            {t.expiresDate ? formatDateTime(t.expiresDate) : "\u2014"}
                          </td>
                          <td className="px-4 py-3 space-x-1">
                            {t.refundedAt && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-900/30 text-orange-400">
                                refunded
                              </span>
                            )}
                            {t.billingIssueAt && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-900/30 text-red-400">
                                billing issue
                              </span>
                            )}
                            {t.unsubscribeDetectedAt && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-300">
                                unsubscribed
                              </span>
                            )}
                            {t.periodType && t.periodType !== "normal" && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-900/30 text-blue-300">
                                {t.periodType}
                              </span>
                            )}
                            {!t.refundedAt && !t.billingIssueAt && !t.unsubscribeDetectedAt && (!t.periodType || t.periodType === "normal") && (
                              <span className="text-xs text-etapa-textFaint">{"\u2014"}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-etapa-textFaint break-all">
                            {t.transactionId || "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {rcData.managementUrl && (
              <p className="mt-2 text-xs text-etapa-textFaint">
                Store management URL:{" "}
                <a
                  href={rcData.managementUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-etapa-primary hover:text-amber-400"
                >
                  {rcData.managementUrl}
                </a>
              </p>
            )}
          </>
        )}
      </Section>

      {/* Plans & activities */}
      <Section title="Plans & Activities" count={plans.length}>
        {plans.length === 0 ? (
          <EmptyRow text="No training plans yet." />
        ) : (
          <div className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-etapa-border bg-etapa-surfaceLight text-left">
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Plan</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Weeks</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Activities</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Start Date</th>
                    <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Created</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-etapa-border">
                  {plans.map((p) => (
                    <tr key={p.id} className="hover:bg-etapa-surfaceLight transition-colors">
                      <td className="px-4 py-3 text-white">{p.name || "\u2014"}</td>
                      <td className="px-4 py-3"><Badge value={p.status} /></td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid">{p.weeks ?? "\u2014"}</td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid">{p.activityCount}</td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid">{formatDate(p.startDate)}</td>
                      <td className="px-4 py-3 text-xs text-etapa-textMid">{formatDate(p.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            setRegenPlanId(p.id);
                            setRegenOverrides({ fitnessLevel: "", daysPerWeek: "", weeks: "" });
                            setRegenStatus("idle");
                            setRegenError(null);
                            setRegenProgress(null);
                            setRegenJobId(null);
                          }}
                          className="text-xs text-etapa-primary hover:text-amber-400 transition-colors"
                          title="Regenerate this plan"
                        >
                          Regenerate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* Rate limits — per-user overrides and current rolling usage */}
      <Section title="Rate Limits">
        {rlLoading ? (
          <EmptyRow text="Loading rate limits..." />
        ) : rlError ? (
          <div className="bg-etapa-surface rounded-xl border border-red-500/40 p-4 text-sm text-red-400">
            {rlError}
          </div>
        ) : rlData ? (
          <div className="bg-etapa-surface rounded-xl border border-etapa-border p-5 space-y-5">
            {/* Current usage */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1">Plans (last 7d)</div>
                <div className="text-white text-lg font-medium">
                  {rlData.usage.plans7d}
                  <span className="text-etapa-textFaint text-sm"> / {rlData.weeklyPlanLimit ?? rlData.defaults.plansPerWeek}</span>
                </div>
                {rlData.weeklyPlanLimit != null && (
                  <div className="text-[11px] text-etapa-textFaint mt-1">Override · default is {rlData.defaults.plansPerWeek}</div>
                )}
              </div>
              <div>
                <div className="text-xs text-etapa-textMuted uppercase tracking-wide mb-1">Coach messages (last 7d)</div>
                <div className="text-white text-lg font-medium">
                  {rlData.usage.coachMsgs7d}
                  <span className="text-etapa-textFaint text-sm"> / {rlData.weeklyCoachMsgLimit ?? rlData.defaults.coachMsgsPerWeek}</span>
                </div>
                {rlData.weeklyCoachMsgLimit != null && (
                  <div className="text-[11px] text-etapa-textFaint mt-1">Override · default is {rlData.defaults.coachMsgsPerWeek}</div>
                )}
              </div>
            </div>

            {/* Editable overrides */}
            <div className="border-t border-etapa-border pt-4">
              <div className="text-xs text-etapa-textMuted uppercase tracking-wide mb-3">Overrides (leave blank to use global defaults)</div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-xs text-etapa-textMid block mb-1">Weekly plan limit</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={rlForm.plans}
                    onChange={(e) => setRlForm((f) => ({ ...f, plans: e.target.value }))}
                    placeholder={`default: ${rlData.defaults.plansPerWeek}`}
                    className="w-full bg-etapa-surfaceLight border border-etapa-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-etapa-textFaint"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-etapa-textMid block mb-1">Weekly coach message limit</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={rlForm.coach}
                    onChange={(e) => setRlForm((f) => ({ ...f, coach: e.target.value }))}
                    placeholder={`default: ${rlData.defaults.coachMsgsPerWeek}`}
                    className="w-full bg-etapa-surfaceLight border border-etapa-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-etapa-textFaint"
                  />
                </label>
              </div>
              <label className="block mt-4">
                <span className="text-xs text-etapa-textMid block mb-1">Note (optional — why this override exists)</span>
                <input
                  type="text"
                  value={rlForm.note}
                  onChange={(e) => setRlForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. beta tester, support request #42, founder account"
                  className="w-full bg-etapa-surfaceLight border border-etapa-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-etapa-textFaint"
                />
              </label>

              <div className="flex items-center gap-3 mt-4">
                <button
                  type="button"
                  disabled={rlSaving}
                  onClick={saveRateLimits}
                  className="px-4 py-2 rounded-lg bg-etapa-primary text-white text-sm font-medium disabled:opacity-50"
                >
                  {rlSaving ? "Saving..." : "Save override"}
                </button>
                {(rlData.weeklyPlanLimit != null || rlData.weeklyCoachMsgLimit != null) && (
                  <button
                    type="button"
                    disabled={rlSaving}
                    onClick={resetRateLimits}
                    className="px-4 py-2 rounded-lg border border-etapa-border text-sm text-etapa-textMid disabled:opacity-50"
                  >
                    Reset to defaults
                  </button>
                )}
                {rlData.updatedAt && (
                  <span className="text-[11px] text-etapa-textFaint ml-auto">
                    Updated {new Date(rlData.updatedAt).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <EmptyRow text="No rate-limit data." />
        )}
      </Section>

      {/* Support & feedback */}
      <Section title="Support & Feedback" count={feedback.length + tickets.length}>
        <div className="space-y-6">
          <div>
            <p className="text-xs font-medium text-etapa-textMuted uppercase tracking-wide mb-2">
              Feedback ({feedback.length})
            </p>
            {feedback.length === 0 ? (
              <EmptyRow text="No feedback submitted." />
            ) : (
              <div className="space-y-3">
                {feedback.map((f) => (
                  <div
                    key={f.id}
                    className="bg-etapa-surface rounded-xl border border-etapa-border p-4"
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge value={f.category} />
                      <span className="text-xs text-etapa-textMuted">{formatDate(f.createdAt)}</span>
                      {f.appVersion && (
                        <span className="text-xs text-etapa-textFaint">v{f.appVersion}</span>
                      )}
                      {f.linearIssueUrl && (
                        <a
                          href={f.linearIssueUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto text-xs text-etapa-primary hover:text-amber-400"
                        >
                          {f.linearIssueKey || "View in Linear"} &rarr;
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-etapa-textMid whitespace-pre-wrap">{f.message}</p>
                    {f.adminResponse && (
                      <div className="mt-3 pt-3 border-t border-etapa-border">
                        <p className="text-xs text-etapa-textMuted mb-1">
                          Admin response &middot; {formatDate(f.adminRespondedAt)}
                        </p>
                        <p className="text-sm text-etapa-textMid whitespace-pre-wrap">
                          {f.adminResponse}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-etapa-textMuted uppercase tracking-wide mb-2">
              Linear Support Tickets ({tickets.length})
            </p>
            {tickets.length === 0 ? (
              <EmptyRow text="No Linear tickets referencing this user." />
            ) : (
              <div className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-etapa-border bg-etapa-surfaceLight text-left">
                      <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">ID</th>
                      <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Title</th>
                      <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Priority</th>
                      <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-etapa-border">
                    {tickets.map((t) => (
                      <tr key={t.id} className="hover:bg-etapa-surfaceLight transition-colors">
                        <td className="px-4 py-3">
                          <a
                            href={t.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-mono text-etapa-primary hover:text-amber-400"
                          >
                            {t.linearId}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-sm text-white">{t.title}</td>
                        <td className="px-4 py-3"><Badge value={t.priority} /></td>
                        <td className="px-4 py-3"><Badge value={t.status} /></td>
                        <td className="px-4 py-3 text-xs text-etapa-textMid">{formatDate(t.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
