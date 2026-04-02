"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

interface MaintenanceConfig {
  enabled: boolean;
  title: string;
  message: string;
}

export default function ConfigPage() {
  const [config, setConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maintenance, setMaintenance] = useState<MaintenanceConfig>({
    enabled: false,
    title: "We'll be right back",
    message: "Sorry, our wheels are spinning \u2014 we will be back soon.",
  });

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setConfig(data);
        if (data.maintenance_mode) {
          setMaintenance(data.maintenance_mode);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveMaintenance() {
    setSaving(true);
    try {
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "maintenance_mode", value: maintenance }),
      });
    } catch {
      // handle error
    }
    setSaving(false);
  }

  if (loading) return <div className="animate-pulse text-etapa-textMuted">Loading config...</div>;

  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-1">Remote Config</h1>
      <p className="text-sm text-etapa-textMuted mb-8">Control app behaviour remotely. Changes take effect immediately.</p>

      {/* Maintenance Mode */}
      <div className="bg-etapa-surface border border-etapa-border rounded-xl p-6 max-w-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Maintenance Mode</h2>
            <p className="text-xs text-etapa-textMuted mt-1">Show a "down for maintenance" screen to all users</p>
          </div>
          <button
            onClick={() => {
              const next = { ...maintenance, enabled: !maintenance.enabled };
              setMaintenance(next);
            }}
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
          disabled={saving}
          className="mt-4 px-4 py-2 bg-etapa-primary text-white text-sm font-medium rounded-lg hover:bg-etapa-primaryDark disabled:opacity-40 transition-colors"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
