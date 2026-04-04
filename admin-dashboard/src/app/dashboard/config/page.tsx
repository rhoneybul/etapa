"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

interface MaintenanceConfig {
  enabled: boolean;
  title: string;
  message: string;
}

interface TrialConfig {
  days: number;
  bannerMessage: string;
}

const TRIAL_DEFAULTS: TrialConfig = {
  days: 7,
  bannerMessage: "Subscribe to unlock full training access",
};

export default function ConfigPage() {
  const [loading, setLoading] = useState(true);
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [savingTrial, setSavingTrial] = useState(false);
  const [savedTrial, setSavedTrial] = useState(false);
  const [maintenance, setMaintenance] = useState<MaintenanceConfig>({
    enabled: false,
    title: "We'll be right back",
    message: "Sorry, our wheels are spinning \u2014 we will be back soon.",
  });
  const [trial, setTrial] = useState<TrialConfig>(TRIAL_DEFAULTS);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        if (data.maintenance_mode) setMaintenance(data.maintenance_mode);
        if (data.trial_config) {
          setTrial({ ...TRIAL_DEFAULTS, ...data.trial_config });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveMaintenance() {
    setSavingMaintenance(true);
    try {
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "maintenance_mode", value: maintenance }),
      });
    } catch { /* ignore */ }
    setSavingMaintenance(false);
  }

  async function saveTrial() {
    setSavingTrial(true);
    try {
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "trial_config", value: trial }),
      });
      setSavedTrial(true);
      setTimeout(() => setSavedTrial(false), 2500);
    } catch { /* ignore */ }
    setSavingTrial(false);
  }

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
                type="number"
                min={1}
                max={90}
                value={trial.days}
                onChange={(e) => setTrial({ ...trial, days: Math.max(1, parseInt(e.target.value) || 7) })}
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
              Shown as the subtitle under "X days of preview left" in the app banner
            </p>
          </div>
        </div>

        <button
          onClick={saveTrial}
          disabled={savingTrial}
          className="mt-4 px-4 py-2 bg-etapa-primary text-white text-sm font-medium rounded-lg hover:bg-etapa-primaryDark disabled:opacity-40 transition-colors"
        >
          {savingTrial ? "Saving..." : savedTrial ? "Saved!" : "Save Trial Settings"}
        </button>
      </div>

      {/* Maintenance Mode */}
      <div className="bg-etapa-surface border border-etapa-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Maintenance Mode</h2>
            <p className="text-xs text-etapa-textMuted mt-1">Show a "down for maintenance" screen to all users</p>
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
          onClick={saveMaintenance}
          disabled={savingMaintenance}
          className="mt-4 px-4 py-2 bg-etapa-primary text-white text-sm font-medium rounded-lg hover:bg-etapa-primaryDark disabled:opacity-40 transition-colors"
        >
          {savingMaintenance ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
