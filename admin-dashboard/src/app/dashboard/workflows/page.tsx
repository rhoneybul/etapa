"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Workflows admin page — manage screen-level kill-switch + redirect from
 * the admin dashboard without editing raw JSON. Writes through the
 * existing /api/config PUT endpoint, persisting into app_config.workflows.
 *
 * See WORKFLOWS.md for the doctrine and what happens when a screen is
 * disabled or redirected.
 */

// Keep this list in sync with src/screens/*. The audit script
// (scripts/remote-first-audit.js) confirms coverage on each.
// Order roughly reflects user-facing priority — the screens most likely
// to need a kill-switch sit at the top.
const KNOWN_SCREENS = [
  "HomeScreen",
  "PlanLoadingScreen",
  "PlanConfigScreen",
  "PlanOverviewScreen",
  "PaywallScreen",
  "CoachChatScreen",
  "SignInScreen",
  "GoalSetupScreen",
  "ChangeCoachScreen",
  "BeginnerProgramScreen",
  "CalendarScreen",
  "WeekViewScreen",
  "ActivityDetailScreen",
  "PlanReadyScreen",
  "RegeneratePlanScreen",
  "FeedbackScreen",
  "SupportChatScreen",
  "SettingsScreen",
];

// Valid redirect targets. Limited to screens that are almost never broken
// so admins don't accidentally redirect to a screen that's also disabled.
const REDIRECT_TARGETS = ["Home", "Settings", "Paywall", "SignIn"];

interface ScreenOverride {
  disabled?: boolean;
  redirectTo?: string | null;
  disabledCopy?: string;
}

interface WorkflowsConfig {
  screens: Record<string, ScreenOverride>;
}

export default function WorkflowsPage() {
  const [config, setConfig] = useState<WorkflowsConfig>({ screens: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/config");
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      const body = await r.json();
      const wf = body.workflows || { screens: {} };
      setConfig({ screens: wf.screens || {} });
      setDirty(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function updateScreen(name: string, patch: Partial<ScreenOverride>) {
    setConfig((prev) => {
      const screens = { ...prev.screens };
      const existing = screens[name] || {};
      const merged = { ...existing, ...patch };
      // Strip empty/default values so we don't bloat the JSON persisted.
      if (!merged.disabled && !merged.redirectTo && !merged.disabledCopy) {
        delete screens[name];
      } else {
        screens[name] = merged;
      }
      return { screens };
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "workflows", value: config }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${r.status})`);
      }
      setLastSaved(new Date());
      setDirty(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const stats = useMemo(() => {
    const total = KNOWN_SCREENS.length;
    const disabled = KNOWN_SCREENS.filter((n) => config.screens[n]?.disabled).length;
    const redirected = KNOWN_SCREENS.filter((n) => config.screens[n]?.redirectTo).length;
    return { total, disabled, redirected };
  }, [config]);

  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-1">Workflows — screen overrides</h1>
      <p className="text-sm text-etapa-textMuted mb-6">
        Disable or redirect individual screens without shipping a build. Changes take effect within ~5 minutes for every user on any version that has <code className="bg-etapa-surfaceLight px-1.5 py-0.5 rounded text-xs">useScreenGuard</code> wired. See <Link href="/WORKFLOWS.md" className="text-etapa-primary">WORKFLOWS.md</Link> for the full doctrine.
      </p>

      {/* Summary + save bar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <span className="text-xs text-etapa-textMid">
          <span className="text-white font-medium">{stats.total}</span> screens covered ·{" "}
          <span className="text-red-300">{stats.disabled}</span> disabled ·{" "}
          <span className="text-amber-300">{stats.redirected}</span> redirected
        </span>
        <div className="ml-auto flex items-center gap-3">
          {lastSaved && (
            <span className="text-xs text-etapa-textFaint">
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <button
            disabled={!dirty || saving}
            onClick={save}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-etapa-primary hover:bg-etapa-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : dirty ? "Save changes" : "No changes"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-4 text-sm text-red-400 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse text-etapa-textMuted">Loading workflows...</div>
      ) : (
        <div className="bg-etapa-surface rounded-xl border border-etapa-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-etapa-border bg-etapa-surfaceLight text-left">
                <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Screen</th>
                <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Disabled</th>
                <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Redirect to</th>
                <th className="px-4 py-3 text-xs font-medium text-etapa-textMuted uppercase tracking-wide">Disabled copy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-etapa-border">
              {KNOWN_SCREENS.map((name) => {
                const entry = config.screens[name] || {};
                const isDisabled = !!entry.disabled;
                const isRedirected = !!entry.redirectTo;
                return (
                  <tr key={name} className={isDisabled || isRedirected ? "bg-amber-900/5" : ""}>
                    <td className="px-4 py-3">
                      <div className="text-white font-mono text-xs">{name}</div>
                      {isDisabled && (
                        <div className="text-[10px] text-red-400 mt-0.5">DISABLED FOR ALL USERS</div>
                      )}
                      {!isDisabled && isRedirected && (
                        <div className="text-[10px] text-amber-400 mt-0.5">REDIRECTING → {entry.redirectTo}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isDisabled}
                          onChange={(e) => updateScreen(name, { disabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="relative w-9 h-5 bg-etapa-surfaceLight peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-etapa-textMuted after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-900 peer-checked:after:bg-red-300 border border-etapa-border"></div>
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={entry.redirectTo || ""}
                        onChange={(e) => updateScreen(name, { redirectTo: e.target.value || null })}
                        className="bg-etapa-surfaceLight border border-etapa-border rounded px-2 py-1 text-xs text-white"
                      >
                        <option value="">— none —</option>
                        {REDIRECT_TARGETS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={entry.disabledCopy || ""}
                        onChange={(e) => updateScreen(name, { disabledCopy: e.target.value })}
                        placeholder="Default: 'Taking a break…'"
                        className="w-full bg-etapa-surfaceLight border border-etapa-border rounded px-2 py-1 text-xs text-white"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dirty && (
        <div className="fixed bottom-6 right-6 bg-etapa-primary text-white rounded-xl px-4 py-3 text-sm shadow-lg flex items-center gap-3">
          Unsaved changes
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1 bg-white/20 rounded-md font-medium hover:bg-white/30 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save now"}
          </button>
        </div>
      )}
    </div>
  );
}

// Minimal Link-lite fallback — imports are kept inline to avoid bloating
// the doc import list.
function Link({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return <a href={href} className={className}>{children}</a>;
}
