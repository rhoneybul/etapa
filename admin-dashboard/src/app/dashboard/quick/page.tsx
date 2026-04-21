/**
 * Quick Actions — the mobile-first support lever.
 *
 * This is the page the founder opens at 10pm when a user has written in saying
 * something is broken. Two taps to look up the user, one tap to fix them.
 *
 * See REMOTE_FIRST_ARCHITECTURE.md for why this exists.
 *
 * Layout principles:
 *   - Big touch targets (py-4 on every button)
 *   - No tables, no hover states
 *   - Single column, scrollable
 *   - Status toasts, not modals
 */
"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

type QuickAction =
  | "grant-free-month"
  | "grant-lifetime"
  | "grant-pro"
  | "unlock-coaches"
  | "reset-entitlement"
  | "force-onboarding";

interface UserOverride {
  userId: string;
  overrides: Record<string, unknown>;
  note?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

const ACTIONS: Array<{
  key: QuickAction;
  label: string;
  description: string;
  tone: "primary" | "warn";
}> = [
  {
    key: "grant-free-month",
    label: "Grant a free month",
    description: "30-day trial override for this user.",
    tone: "primary",
  },
  {
    key: "grant-pro",
    label: "Grant Pro access",
    description: "Unlocks all paid features until cleared.",
    tone: "primary",
  },
  {
    key: "grant-lifetime",
    label: "Grant Lifetime access",
    description: "Permanent unlock. Use sparingly.",
    tone: "primary",
  },
  {
    key: "unlock-coaches",
    label: "Unlock all coaches",
    description: "Every coach persona available to the user.",
    tone: "primary",
  },
  {
    key: "force-onboarding",
    label: "Force re-onboarding",
    description: "User sees the onboarding flow again on next open.",
    tone: "warn",
  },
  {
    key: "reset-entitlement",
    label: "Clear entitlement override",
    description: "Removes any Pro/Lifetime override we set.",
    tone: "warn",
  },
];

export default function QuickActionsPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<UserOverride | null>(null);
  const [flashError, setFlashError] = useState("");
  const [flashSuccess, setFlashSuccess] = useState("");

  async function lookup() {
    if (!email.trim()) return;
    setLoading(true);
    setFlashError("");
    setUser(null);
    try {
      const res = await fetch(
        `/api/user-overrides?email=${encodeURIComponent(email.trim())}`
      );
      const data = await res.json();
      if (!res.ok) {
        setFlashError(data.error || "User not found");
      } else {
        setUser(data);
      }
    } catch {
      setFlashError("Lookup failed — is the server up?");
    } finally {
      setLoading(false);
    }
  }

  async function runAction(action: QuickAction) {
    if (!user?.userId) return;
    setLoading(true);
    setFlashError("");
    try {
      const res = await fetch("/api/user-overrides/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlashError(data.error || `Action "${action}" failed`);
      } else {
        setUser({ ...user, overrides: data.overrides || {} });
        setFlashSuccess(
          `Done — applied "${action.replace(/-/g, " ")}"`
        );
        setTimeout(() => setFlashSuccess(""), 3500);
      }
    } catch {
      setFlashError("Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function clearAll() {
    if (!user?.userId) return;
    if (!confirm("Remove ALL overrides for this user? This cannot be undone.")) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/user-overrides?userId=${encodeURIComponent(user.userId)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setUser({ ...user, overrides: {} });
        setFlashSuccess("All overrides cleared");
        setTimeout(() => setFlashSuccess(""), 3500);
      } else {
        setFlashError("Clear failed");
      }
    } catch {
      setFlashError("Clear failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">Quick Actions</h1>
        <p className="text-sm text-etapa-textMuted mt-1">
          One-tap support levers. Look up a user by email, apply a fix.
        </p>
      </div>

      {/* Lookup */}
      <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4 mb-4">
        <label className="block text-xs text-etapa-textMuted uppercase tracking-wider mb-2">
          User email
        </label>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            placeholder="user@example.com"
            className="flex-1 bg-etapa-bg border border-etapa-border rounded-lg px-3 py-3 text-white text-sm focus:outline-none focus:border-etapa-primary"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button
            onClick={lookup}
            disabled={loading || !email.trim()}
            className="px-4 py-3 text-sm font-semibold text-black bg-etapa-primary rounded-lg disabled:opacity-40"
          >
            {loading ? "…" : "Look up"}
          </button>
        </div>
      </div>

      {/* Flash messages */}
      {flashError && (
        <div className="bg-red-950 border border-red-700 rounded-xl p-4 mb-4 text-sm text-red-200">
          {flashError}
        </div>
      )}
      {flashSuccess && (
        <div className="bg-emerald-950 border border-emerald-700 rounded-xl p-4 mb-4 text-sm text-emerald-200">
          {flashSuccess}
        </div>
      )}

      {/* User card + actions */}
      {user && (
        <>
          <div className="bg-etapa-surface border border-etapa-border rounded-xl p-4 mb-4">
            <p className="text-xs text-etapa-textMuted uppercase tracking-wider">
              User ID
            </p>
            <p className="text-sm text-white mt-1 font-mono break-all">{user.userId}</p>
            <p className="text-xs text-etapa-textMuted uppercase tracking-wider mt-3">
              Current overrides
            </p>
            <pre className="text-xs text-white mt-1 whitespace-pre-wrap break-all bg-etapa-bg rounded-lg p-3 border border-etapa-border">
              {Object.keys(user.overrides || {}).length === 0
                ? "(none)"
                : JSON.stringify(user.overrides, null, 2)}
            </pre>
            {user.updatedAt && (
              <p className="text-[11px] text-etapa-textMuted mt-2">
                Last updated {new Date(user.updatedAt).toLocaleString()}
              </p>
            )}
          </div>

          <div className="space-y-2 mb-4">
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                onClick={() => runAction(a.key)}
                disabled={loading}
                className={`w-full text-left p-4 rounded-xl border transition disabled:opacity-40 ${
                  a.tone === "primary"
                    ? "bg-etapa-surface border-etapa-border hover:border-etapa-primary"
                    : "bg-etapa-surface border-etapa-border hover:border-amber-600"
                }`}
              >
                <div className="font-semibold text-white text-sm">{a.label}</div>
                <div className="text-xs text-etapa-textMuted mt-1">
                  {a.description}
                </div>
              </button>
            ))}

            <button
              onClick={clearAll}
              disabled={loading}
              className="w-full text-left p-4 rounded-xl border bg-etapa-surface border-red-800 hover:border-red-600 transition disabled:opacity-40"
            >
              <div className="font-semibold text-red-200 text-sm">
                Clear ALL overrides
              </div>
              <div className="text-xs text-etapa-textMuted mt-1">
                Returns this user to the defaults. Cannot be undone.
              </div>
            </button>
          </div>
        </>
      )}

      {/* Help text */}
      <div className="mt-8 text-xs text-etapa-textMuted leading-relaxed">
        <p className="mb-2">
          <strong className="text-white">How this works:</strong> Actions write
          to the <code className="text-etapa-primary">user_config_overrides</code>{" "}
          table. The app fetches overrides on every open and merges them on top
          of the global config.
        </p>
        <p>
          Changes are live within 5 minutes of the user&apos;s next app-foreground.
          For global config (pricing, copy, features), use the{" "}
          <a href="/dashboard/config" className="text-etapa-primary underline">
            Config
          </a>{" "}
          page.
        </p>
      </div>
    </div>
  );
}
