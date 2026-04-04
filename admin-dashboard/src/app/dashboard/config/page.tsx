"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef, useCallback } from "react";

interface MaintenanceConfig {
  enabled: boolean;
  title: string;
  message: string;
}

interface TrialConfig {
  days: number;
  bannerMessage: string;
}

interface MinVersionConfig {
  version: string;
  message: string;
  iosUrl: string;
  androidUrl: string;
}

const TRIAL_DEFAULTS: TrialConfig = {
  days: 7,
  bannerMessage: "Subscribe to unlock full training access",
};

const MIN_VERSION_DEFAULTS: MinVersionConfig = {
  version: "",
  message: "A new version of Etapa is available with important updates. Please update to continue.",
  iosUrl: "https://apps.apple.com/app/etapa/id6738893966",
  androidUrl: "https://play.google.com/store/apps/details?id=com.etapa.app",
};

/** Deep-compare two plain objects */
function isEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function ConfigPage() {
  const [loading, setLoading] = useState(true);

  // Current (editing) state
  const [maintenance, setMaintenance] = useState<MaintenanceConfig>({
    enabled: false,
    title: "We'll be right back",
    message: "Sorry, our wheels are spinning \u2014 we will be back soon.",
  });
  const [trial, setTrial] = useState<TrialConfig>(TRIAL_DEFAULTS);
  const [trialDaysText, setTrialDaysText] = useState("7");
  const [minVersion, setMinVersion] = useState<MinVersionConfig>(MIN_VERSION_DEFAULTS);

  // Saved (server) state — used to detect dirty
  const savedMaintenance = useRef<MaintenanceConfig>(maintenance);
  const savedTrial = useRef<TrialConfig>(trial);
  const savedMinVersion = useRef<MinVersionConfig>(minVersion);

  // Saving / saved flash state
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [savedMaintenanceFlash, setSavedMaintenanceFlash] = useState(false);
  const [savingTrial, setSavingTrial] = useState(false);
  const [savedTrialFlash, setSavedTrialFlash] = useState(false);
  const [savingMinVersion, setSavingMinVersion] = useState(false);
  const [savedMinVersionFlash, setSavedMinVersionFlash] = useState(false);

  // Dirty checks
  const maintenanceDirty = !isEqual(maintenance, savedMaintenance.current);
  const trialDirty = !isEqual(trial, savedTrial.current);
  const minVersionDirty = !isEqual(minVersion, savedMinVersion.current);
  const anyDirty = maintenanceDirty || trialDirty || minVersionDirty;

  // Warn on page exit with unsaved changes
  const anyDirtyRef = useRef(anyDirty);
  anyDirtyRef.current = anyDirty;

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (anyDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Load config from server
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        if (data.maintenance_mode) {
          setMaintenance(data.maintenance_mode);
          savedMaintenance.current = data.maintenance_mode;
        }
        if (data.trial_config) {
          const merged = { ...TRIAL_DEFAULTS, ...data.trial_config };
          setTrial(merged);
          setTrialDaysText(String(merged.days));
          savedTrial.current = merged;
        }
        if (data.min_version) {
          const merged = { ...MIN_VERSION_DEFAULTS, ...data.min_version };
          setMinVersion(merged);
          savedMinVersion.current = merged;
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Save handlers ──────────────────────────────────────────────────────────

  async function saveMaintenance_() {
    setSavingMaintenance(true);
    try {
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "maintenance_mode", value: maintenance }),
      });
      savedMaintenance.current = { ...maintenance };
      setSavedMaintenanceFlash(true);
      setTimeout(() => setSavedMaintenanceFlash(false), 2500);
    } catch { /* ignore */ }
    setSavingMaintenance(false);
  }

  async function saveTrial_() {
    setSavingTrial(true);
    try {
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "trial_config", value: trial }),
      });
      savedTrial.current = { ...trial };
      setSavedTrialFlash(true);
      setTimeout(() => setSavedTrialFlash(false), 2500);
    } catch { /* ignore */ }
    setSavingTrial(false);
  }

  async function saveMinVersion_() {
    setSavingMinVersion(true);
    try {
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "min_version", value: minVersion }),
      });
      savedMinVersion.current = { ...minVersion };
      setSavedMinVersionFlash(true);
      setTimeout(() => setSavedMinVersionFlash(false), 2500);
    } catch { /* ignore */ }
    setSavingMinVersion(false);
  }

  // ── Trial days input — free text that coerces to number on blur ────────────

  const handleTrialDaysChange = (val: string) => {
    // Allow the user to freely type (including clearing the field)
    setTrialDaysText(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      setTrial((t) => ({ ...t, days: parsed }));
    }
  };

  const handleTrialDaysBlur = () => {
    // Coerce to valid number on blur
    const parsed = parseInt(trialDaysText, 10);
    const clamped = isNaN(parsed) || parsed < 1 ? 1 : parsed > 365 ? 365 : parsed;
    setTrialDaysText(String(clamped));
    setTrial((t) => ({ ...t, days: clamped }));
  };

  if (loading) return <div className="animate-pulse text-etapa-textMuted">Loading config...</div>;

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-lg font-semibold text-white mb-1">Remote Config</h1>
        <p className="text-sm text-etapa-textMuted">Control app behaviour remotely. Changes take effect immediately.</p>
      </div>

      {/* Trial Period */}
      <div className="bg-etapa-surface border border-etapa-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-white mb-1">Trial Period</h2>
        <p className="text-xs text-etapa-textMuted mb-4">
          Free users get this many days to browse their plan before the paywall appears.
          The message shows in the upgrade banner inside the app.
        </p>

        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-etapa-textMuted block mb-1">Trial Length (days)</label>
              <input
                type="text"
                inputMode="numeric"
                value={trialDaysText}
                onChange={(e) => handleTrialDaysChange(e.target.value)}
                onBlur={handleTrialDaysBlur}
                className="w-full px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-etapa-primary"
              />
            </div>
            <div className="pt-5 text-xs text-etapa-textFaint">days after first plan</div>
          </div>
          <div>
            <label className="text-xs font-medium text-etapa-textMuted block mb-1">
              App Banner Message
            </label>
            <input
              type="text"
              value={trial.bannerMessage}
              onChange={(e) => setTrial({ ...trial, bannerMessage: e.target.value })}
              placeholder="Subscribe to unlock full training access"
              className="w-full px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-white placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary"
            />
            <p className="text-xs text-etapa-textFaint mt-1">
              Shown as the subtitle under &quot;X days of preview left&quot; in the app banner
            </p>
          </div>
        </div>

        <button
          onClick={saveTrial_}
          disabled={savingTrial || !trialDirty}
          className="mt-4 px-4 py-2 bg-etapa-primary text-white text-sm font-medium rounded-lg hover:bg-etapa-primaryDark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {savingTrial ? "Saving..." : savedTrialFlash ? "Saved!" : "Save Trial Settings"}
        </button>
      </div>

      {/* Maintenance Mode */}
      <div className="bg-etapa-surface border border-etapa-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Maintenance Mode</h2>
            <p className="text-xs text-etapa-textMuted mt-1">Show a &quot;down for maintenance&quot; screen to all users</p>
          </div>
          <button
            onClick={() => setMaintenance({ ...maintenance, enabled: !maintenance.enabled })}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              maintenance.enabled ? "bg-etapa-primary" : "bg-etapa-border"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                maintenance.enabled ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>

        {maintenance.enabled && (
          <div className="bg-red-900/20 border border-red-900/40 rounded-lg p-3 mb-4">
            <p className="text-xs font-medium text-red-400">
              Maintenance mode is ON. All users will see the maintenance screen.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-etapa-textMuted block mb-1">Title</label>
            <input
              type="text"
              value={maintenance.title}
              onChange={(e) => setMaintenance({ ...maintenance, title: e.target.value })}
              className="w-full px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-white placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-etapa-textMuted block mb-1">Message</label>
            <textarea
              value={maintenance.message}
              onChange={(e) => setMaintenance({ ...maintenance, message: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-white placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary resize-none"
            />
          </div>
        </div>

        <button
          onClick={saveMaintenance_}
          disabled={savingMaintenance || !maintenanceDirty}
          className="mt-4 px-4 py-2 bg-etapa-primary text-white text-sm font-medium rounded-lg hover:bg-etapa-primaryDark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {savingMaintenance ? "Saving..." : savedMaintenanceFlash ? "Saved!" : "Save Changes"}
        </button>
      </div>

      {/* Minimum App Version */}
      <div className="bg-etapa-surface border border-etapa-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-white mb-1">Minimum App Version</h2>
        <p className="text-xs text-etapa-textMuted mb-4">
          Users running a version older than this will see a forced upgrade screen
          and won&apos;t be able to use the app until they update.
        </p>

        {minVersion.version && (
          <div className="bg-amber-900/20 border border-amber-900/40 rounded-lg p-3 mb-4">
            <p className="text-xs font-medium text-amber-400">
              Minimum version is set to <span className="font-mono">{minVersion.version}</span>.
              Users below this version will be blocked.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-etapa-textMuted block mb-1">
              Minimum Version (semver)
            </label>
            <input
              type="text"
              value={minVersion.version}
              onChange={(e) => setMinVersion({ ...minVersion, version: e.target.value })}
              placeholder="e.g. 0.49.0"
              className="w-full px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-white font-mono placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary"
            />
            <p className="text-xs text-etapa-textFaint mt-1">
              Leave blank to disable the version gate. Current app version is defined in app.json.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-etapa-textMuted block mb-1">
              Upgrade Message
            </label>
            <textarea
              value={minVersion.message}
              onChange={(e) => setMinVersion({ ...minVersion, message: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-white placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-etapa-textMuted block mb-1">iOS App Store URL</label>
              <input
                type="text"
                value={minVersion.iosUrl}
                onChange={(e) => setMinVersion({ ...minVersion, iosUrl: e.target.value })}
                className="w-full px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-xs text-white placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-etapa-textMuted block mb-1">Google Play URL</label>
              <input
                type="text"
                value={minVersion.androidUrl}
                onChange={(e) => setMinVersion({ ...minVersion, androidUrl: e.target.value })}
                className="w-full px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-xs text-white placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary"
              />
            </div>
          </div>
        </div>

        <button
          onClick={saveMinVersion_}
          disabled={savingMinVersion || !minVersionDirty}
          className="mt-4 px-4 py-2 bg-etapa-primary text-white text-sm font-medium rounded-lg hover:bg-etapa-primaryDark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {savingMinVersion ? "Saving..." : savedMinVersionFlash ? "Saved!" : "Save Version Settings"}
        </button>
      </div>
    </div>
  );
}
