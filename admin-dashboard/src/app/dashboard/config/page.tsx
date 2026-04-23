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

interface PricingConfig {
  currency: string;
  monthly: number;   // amount in pence/cents
  annual: number;
  lifetime: number;
  starter: number;
}

interface ComingSoonFeature {
  text: string;
  emoji: string;
}

interface CouponEntry {
  enabled: boolean;
  code: string;
}

interface CouponConfig {
  starter: CouponEntry;
  lifetime: CouponEntry;
}

interface ComingSoonConfig {
  enabled: boolean;
  showOnHome: boolean;
  title: string;
  features: ComingSoonFeature[];
}

// ── Feature flags ────────────────────────────────────────────────────────────
// Shape matches what the mobile app reads via remoteConfig.getBool(
// 'features.<flagId>.enabled', <fallback>). Adding a flag here gives you a
// global toggle; per-user overrides live on the user detail page and merge
// on top via user_config_overrides.
type FeatureFlagsConfig = Record<string, { enabled: boolean }>;

type FeatureFlagDef = {
  id: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
};

const FEATURE_FLAGS: FeatureFlagDef[] = [
  {
    id: "planPicker",
    label: "Guided plan picker (intake flow)",
    description:
      "Opt-in 3-step coach-voiced intake shown to users with no plan yet. Asks intent, longest ride, timeline and recommends a path.",
    defaultEnabled: false,
  },
  {
    id: "beginnerProgram",
    label: "Beginner program pathway",
    description: "The 12-week beginner programme card on the home empty state and its flow.",
    defaultEnabled: true,
  },
  {
    id: "quickPlan",
    label: "Quick plan pathway",
    description: "The 'Just get better' ongoing plan card on the home empty state.",
    defaultEnabled: true,
  },
];

const TRIAL_DEFAULTS: TrialConfig = {
  days: 7,
  bannerMessage: "Subscribe to unlock full training access",
};

const COUPON_DEFAULTS: CouponConfig = {
  starter:  { enabled: false, code: "" },
  lifetime: { enabled: false, code: "" },
};

const PRICING_DEFAULTS: PricingConfig = {
  currency: "gbp",
  monthly: 999,    // £9.99
  annual: 7999,    // £79.99
  lifetime: 9999,  // £99.99
  starter: 1499,   // £14.99
};

const COMING_SOON_DEFAULTS: ComingSoonConfig = {
  enabled: false,
  showOnHome: false,
  title: "What's coming next",
  features: [],
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
  const [comingSoon, setComingSoon] = useState<ComingSoonConfig>(COMING_SOON_DEFAULTS);
  const [pricing, setPricing] = useState<PricingConfig>(PRICING_DEFAULTS);
  const [pricingDisplay, setPricingDisplay] = useState({
    monthly: "9.99", annual: "79.99", lifetime: "99.99", starter: "14.99",
  });
  const [savingPricing, setSavingPricing] = useState(false);
  const [savedPricingFlash, setSavedPricingFlash] = useState(false);
  const [coupons, setCoupons] = useState<CouponConfig>(COUPON_DEFAULTS);
  const [savingCoupons, setSavingCoupons] = useState(false);
  const [savedCouponsFlash, setSavedCouponsFlash] = useState(false);

  // Feature flags — one row per known flag. Values come from the server's
  // `features` key (jsonb object). Unknown-to-the-server flags default to
  // their defaultEnabled. Save writes the whole features object back.
  const [features, setFeatures] = useState<FeatureFlagsConfig>({});
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [savedFeaturesFlash, setSavedFeaturesFlash] = useState(false);

  // Rate limits — global defaults, admin-editable. Written into app_config.
  const [rateLimitDefaults, setRateLimitDefaults] = useState<{
    plansPerWeek: number;
    coachMsgsPerWeek: number;
    envFallback: { plansPerWeek: number; coachMsgsPerWeek: number };
  } | null>(null);
  const [rlPlansText, setRlPlansText] = useState("");
  const [rlCoachText, setRlCoachText] = useState("");
  const [rlSaving, setRlSaving] = useState(false);
  const [rlSavedFlash, setRlSavedFlash] = useState(false);
  const [rlError, setRlError] = useState<string | null>(null);

  // Saved (server) state — used to detect dirty
  const savedMaintenance = useRef<MaintenanceConfig>(maintenance);
  const savedTrial = useRef<TrialConfig>(trial);
  const savedMinVersion = useRef<MinVersionConfig>(minVersion);
  const savedComingSoon = useRef<ComingSoonConfig>(comingSoon);
  const savedPricing = useRef<PricingConfig>(pricing);
  const savedCoupons = useRef<CouponConfig>(coupons);
  const savedFeatures = useRef<FeatureFlagsConfig>(features);

  // Saving / saved flash state
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [savedMaintenanceFlash, setSavedMaintenanceFlash] = useState(false);
  const [savingTrial, setSavingTrial] = useState(false);
  const [savedTrialFlash, setSavedTrialFlash] = useState(false);
  const [savingMinVersion, setSavingMinVersion] = useState(false);
  const [savedMinVersionFlash, setSavedMinVersionFlash] = useState(false);
  const [savingComingSoon, setSavingComingSoon] = useState(false);
  const [savedComingSoonFlash, setSavedComingSoonFlash] = useState(false);

  // Dirty checks
  const maintenanceDirty = !isEqual(maintenance, savedMaintenance.current);
  const trialDirty = !isEqual(trial, savedTrial.current);
  const minVersionDirty = !isEqual(minVersion, savedMinVersion.current);
  const comingSoonDirty = !isEqual(comingSoon, savedComingSoon.current);
  const pricingDirty = !isEqual(pricing, savedPricing.current);
  const featuresDirty = !isEqual(features, savedFeatures.current);
  const couponsDirty = !isEqual(coupons, savedCoupons.current);
  const anyDirty = maintenanceDirty || trialDirty || minVersionDirty || comingSoonDirty || pricingDirty || couponsDirty || featuresDirty;

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
        if (data.coming_soon) {
          const merged = { ...COMING_SOON_DEFAULTS, ...data.coming_soon };
          setComingSoon(merged);
          savedComingSoon.current = merged;
        }
        if (data.pricing_config) {
          const merged = { ...PRICING_DEFAULTS, ...data.pricing_config };
          setPricing(merged);
          setPricingDisplay({
            monthly: (merged.monthly / 100).toFixed(2),
            annual: (merged.annual / 100).toFixed(2),
            lifetime: (merged.lifetime / 100).toFixed(2),
            starter: (merged.starter / 100).toFixed(2),
          });
          savedPricing.current = merged;
        }
        if (data.coupon_config) {
          const merged = { ...COUPON_DEFAULTS, ...data.coupon_config };
          setCoupons(merged);
          savedCoupons.current = merged;
        }
        // Features — seed each known flag from server state, or fall back to
        // its defaultEnabled so the UI always shows a full set of toggles.
        const seed: FeatureFlagsConfig = {};
        for (const f of FEATURE_FLAGS) {
          const existing = data?.features?.[f.id];
          seed[f.id] = { enabled: existing ? !!existing.enabled : f.defaultEnabled };
        }
        setFeatures(seed);
        savedFeatures.current = seed;
      })
      .finally(() => setLoading(false));

    // Fetch rate limit defaults (separate endpoint — lives in app_config but
    // is surfaced via a typed API for clarity).
    fetch("/api/rate-limit-defaults")
      .then((r) => r.json())
      .then((data) => {
        if (data?.plansPerWeek !== undefined) {
          setRateLimitDefaults(data);
          setRlPlansText(String(data.plansPerWeek));
          setRlCoachText(String(data.coachMsgsPerWeek));
        }
      })
      .catch(() => {});
  }, []);

  async function saveRateLimitDefaults() {
    setRlSaving(true);
    setRlError(null);
    try {
      const plansPerWeek = parseInt(rlPlansText, 10);
      const coachMsgsPerWeek = parseInt(rlCoachText, 10);
      if (!Number.isFinite(plansPerWeek) || plansPerWeek < 0
          || !Number.isFinite(coachMsgsPerWeek) || coachMsgsPerWeek < 0) {
        throw new Error("Both limits must be non-negative integers.");
      }
      const res = await fetch("/api/rate-limit-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plansPerWeek, coachMsgsPerWeek }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Save failed (${res.status})`);
      setRateLimitDefaults((prev) => prev ? { ...prev, plansPerWeek: body.plansPerWeek, coachMsgsPerWeek: body.coachMsgsPerWeek } : prev);
      setRlSavedFlash(true);
      setTimeout(() => setRlSavedFlash(false), 1500);
    } catch (e: any) {
      setRlError(e.message);
    } finally {
      setRlSaving(false);
    }
  }

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

  async function saveFeatures_() {
    setSavingFeatures(true);
    try {
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "features", value: features }),
      });
      savedFeatures.current = { ...features };
      setSavedFeaturesFlash(true);
      setTimeout(() => setSavedFeaturesFlash(false), 2500);
    } catch { /* ignore */ }
    setSavingFeatures(false);
  }

  async function saveComingSoon_() {
    setSavingComingSoon(true);
    try {
      // Filter out empty features before saving
      const cleaned = { ...comingSoon, features: comingSoon.features.filter(f => f.text.trim()) };
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "coming_soon", value: cleaned }),
      });
      setComingSoon(cleaned);
      savedComingSoon.current = { ...cleaned };
      setSavedComingSoonFlash(true);
      setTimeout(() => setSavedComingSoonFlash(false), 2500);
    } catch { /* ignore */ }
    setSavingComingSoon(false);
  }

  const handlePriceChange = useCallback((plan: keyof typeof pricingDisplay, val: string) => {
    setPricingDisplay((d) => ({ ...d, [plan]: val }));
    const parsed = Math.round(parseFloat(val) * 100);
    if (!isNaN(parsed) && parsed >= 0) {
      setPricing((p) => ({ ...p, [plan]: parsed }));
    }
  }, []);

  const handlePriceBlur = useCallback((plan: keyof typeof pricingDisplay) => {
    const parsed = parseFloat(pricingDisplay[plan]);
    const clamped = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setPricingDisplay((d) => ({ ...d, [plan]: clamped.toFixed(2) }));
    setPricing((p) => ({ ...p, [plan]: Math.round(clamped * 100) }));
  }, [pricingDisplay]);

  async function savePricing_() {
    setSavingPricing(true);
    try {
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "pricing_config", value: pricing }),
      });
      savedPricing.current = { ...pricing };
      setSavedPricingFlash(true);
      setTimeout(() => setSavedPricingFlash(false), 2500);
    } catch { /* ignore */ }
    setSavingPricing(false);
  }

  async function saveCoupons_() {
    setSavingCoupons(true);
    try {
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "coupon_config", value: coupons }),
      });
      savedCoupons.current = { ...coupons };
      setSavedCouponsFlash(true);
      setTimeout(() => setSavedCouponsFlash(false), 2500);
    } catch { /* ignore */ }
    setSavingCoupons(false);
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
    const clamped = isNaN(parsed) || parsed < 0 ? 0 : parsed > 365 ? 365 : parsed;
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

      {/* Global Rate Limits */}
      <div className="bg-etapa-surface border border-etapa-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-white mb-1">Global Rate Limits</h2>
        <p className="text-xs text-etapa-textMuted mb-4">
          Default caps applied to every user. Individual users can be given higher or lower limits
          on their detail page. Env vars set an ultimate fallback{rateLimitDefaults ? ` (currently ${rateLimitDefaults.envFallback.plansPerWeek} / ${rateLimitDefaults.envFallback.coachMsgsPerWeek})` : ""}.
        </p>

        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-etapa-textMuted block mb-1">Plans per week</label>
              <input
                type="text"
                inputMode="numeric"
                value={rlPlansText}
                onChange={(e) => setRlPlansText(e.target.value.replace(/[^\d]/g, ""))}
                className="w-full px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-etapa-primary"
              />
            </div>
            <div className="pt-5 text-xs text-etapa-textFaint">rolling 7 days, includes regenerations</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-etapa-textMuted block mb-1">Coach messages per week</label>
              <input
                type="text"
                inputMode="numeric"
                value={rlCoachText}
                onChange={(e) => setRlCoachText(e.target.value.replace(/[^\d]/g, ""))}
                className="w-full px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-etapa-primary"
              />
            </div>
            <div className="pt-5 text-xs text-etapa-textFaint">rolling 7 days, user-sent only</div>
          </div>
        </div>

        {rlError && <p className="text-xs text-red-400 mt-3">{rlError}</p>}

        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            disabled={rlSaving}
            onClick={saveRateLimitDefaults}
            className="px-4 py-2 rounded-lg bg-etapa-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {rlSaving ? "Saving..." : "Save defaults"}
          </button>
          {rlSavedFlash && <span className="text-xs text-green-400">Saved</span>}
        </div>
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

      {/* Pricing */}
      <div className="bg-etapa-surface border border-etapa-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-white mb-1">Pricing</h2>
        <p className="text-xs text-etapa-textMuted mb-4">
          Set the prices shown on the paywall and used for in-app purchases.
          Amounts are in GBP. Changes take effect immediately.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {([
            { key: "monthly" as const,  label: "Monthly",  hint: "/month" },
            { key: "annual" as const,   label: "Annual",   hint: "/year" },
            { key: "lifetime" as const, label: "Lifetime", hint: "one-time" },
            { key: "starter" as const,  label: "Starter",  hint: "one-time" },
          ]).map(({ key, label, hint }) => (
            <div key={key}>
              <label className="text-xs font-medium text-etapa-textMuted block mb-1">
                {label} <span className="text-etapa-textFaint">({hint})</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-etapa-textMuted">£</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={pricingDisplay[key]}
                  onChange={(e) => handlePriceChange(key, e.target.value)}
                  onBlur={() => handlePriceBlur(key)}
                  className="w-full pl-7 pr-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-etapa-primary"
                />
              </div>
            </div>
          ))}
        </div>

        {pricing.annual >= pricing.lifetime && (
          <div className="bg-amber-900/20 border border-amber-900/40 rounded-lg p-3 mt-4">
            <p className="text-xs font-medium text-amber-400">
              Annual price is equal to or higher than lifetime — users may not see value in the annual plan.
            </p>
          </div>
        )}

        <button
          onClick={savePricing_}
          disabled={savingPricing || !pricingDirty}
          className="mt-4 px-4 py-2 bg-etapa-primary text-white text-sm font-medium rounded-lg hover:bg-etapa-primaryDark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {savingPricing ? "Saving..." : savedPricingFlash ? "Saved!" : "Save Prices"}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {/* Coming Soon */}
      <div className="bg-etapa-surface border border-etapa-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Coming Soon</h2>
            <p className="text-xs text-etapa-textMuted mt-1">
              Show upcoming features in the app. Appears in Settings and optionally on the Home screen.
            </p>
          </div>
          <button
            onClick={() => setComingSoon({ ...comingSoon, enabled: !comingSoon.enabled })}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              comingSoon.enabled ? "bg-etapa-primary" : "bg-etapa-border"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                comingSoon.enabled ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-etapa-textMuted block mb-1">Title</label>
            <input
              type="text"
              value={comingSoon.title}
              onChange={(e) => setComingSoon({ ...comingSoon, title: e.target.value })}
              placeholder="What's coming next"
              className="w-full px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-white placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={comingSoon.showOnHome}
              onChange={(e) => setComingSoon({ ...comingSoon, showOnHome: e.target.checked })}
              className="w-4 h-4 rounded border-etapa-border bg-etapa-surfaceLight text-etapa-primary focus:ring-etapa-primary"
            />
            <label className="text-xs text-etapa-textMuted">Also show on Home screen</label>
          </div>

          <div>
            <label className="text-xs font-medium text-etapa-textMuted block mb-2">Features</label>
            {comingSoon.features.map((f, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={f.emoji}
                  onChange={(e) => {
                    const updated = [...comingSoon.features];
                    updated[i] = { ...updated[i], emoji: e.target.value };
                    setComingSoon({ ...comingSoon, features: updated });
                  }}
                  placeholder="🔜"
                  className="w-14 px-2 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-etapa-primary"
                />
                <input
                  type="text"
                  value={f.text}
                  onChange={(e) => {
                    const updated = [...comingSoon.features];
                    updated[i] = { ...updated[i], text: e.target.value };
                    setComingSoon({ ...comingSoon, features: updated });
                  }}
                  placeholder="Feature description..."
                  className="flex-1 px-3 py-2 bg-etapa-surfaceLight border border-etapa-border rounded-lg text-sm text-white placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary"
                />
                <button
                  onClick={() => {
                    const updated = comingSoon.features.filter((_, idx) => idx !== i);
                    setComingSoon({ ...comingSoon, features: updated });
                  }}
                  className="text-red-400 hover:text-red-300 text-lg px-1"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() => setComingSoon({ ...comingSoon, features: [...comingSoon.features, { text: "", emoji: "🔜" }] })}
              className="text-xs text-etapa-primary hover:text-etapa-primaryDark mt-1"
            >
              + Add feature
            </button>
          </div>
        </div>

        <button
          onClick={saveComingSoon_}
          disabled={savingComingSoon || !comingSoonDirty}
          className="mt-4 px-4 py-2 bg-etapa-primary text-white text-sm font-medium rounded-lg hover:bg-etapa-primaryDark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {savingComingSoon ? "Saving..." : savedComingSoonFlash ? "Saved!" : "Save Coming Soon"}
        </button>
      </div>

      {/* Feature Flags — global toggles. Per-user overrides live on the
          user detail page and deep-merge on top of whatever is set here. */}
      <div className="bg-etapa-surface border border-etapa-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-white mb-1">Feature flags</h2>
        <p className="text-xs text-etapa-textMuted mb-4">
          Global on/off for each feature. The mobile app reads these via remote config (<code className="text-etapa-textMuted">features.&lt;id&gt;.enabled</code>) and caches for ~5 minutes, so changes take effect within a few minutes on next app open. Per-user overrides are on the user detail page.
        </p>
        <div className="space-y-3">
          {FEATURE_FLAGS.map((f) => {
            const v = features[f.id]?.enabled ?? f.defaultEnabled;
            return (
              <div
                key={f.id}
                className="bg-etapa-surfaceLight border border-etapa-border rounded-lg p-4 flex items-start justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">{f.label}</p>
                    <code className="text-[10px] text-etapa-textMuted">features.{f.id}.enabled</code>
                  </div>
                  <p className="text-xs text-etapa-textMuted mt-1">{f.description}</p>
                </div>
                <label className="flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={v}
                    onChange={(e) =>
                      setFeatures((prev) => ({
                        ...prev,
                        [f.id]: { enabled: e.target.checked },
                      }))
                    }
                    className="sr-only peer"
                  />
                  <div className="relative w-11 h-6 bg-etapa-border peer-checked:bg-etapa-primary rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5" />
                </label>
              </div>
            );
          })}
        </div>

        <button
          onClick={saveFeatures_}
          disabled={savingFeatures || !featuresDirty}
          className="mt-4 px-4 py-2 bg-etapa-primary text-white text-sm font-medium rounded-lg hover:bg-etapa-primaryDark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {savingFeatures ? "Saving..." : savedFeaturesFlash ? "Saved!" : "Save feature flags"}
        </button>
      </div>

      {/* Coupon Codes */}
      <div className="bg-etapa-surface border border-etapa-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-white mb-1">Coupon Codes</h2>
        <p className="text-xs text-etapa-textMuted mb-4">
          When enabled, users can enter a code on the paywall to get free access to that plan.
          Redemptions are tracked and visible on the Payments page.
        </p>

        <div className="space-y-4">
          {(["starter", "lifetime"] as const).map((plan) => (
            <div key={plan} className="bg-etapa-surfaceLight border border-etapa-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-white capitalize">{plan} coupon</p>
                  <p className="text-xs text-etapa-textMuted mt-0.5">
                    {plan === "lifetime" ? "Grants lifetime access" : "Grants 3 months of starter access"}
                  </p>
                </div>
                <button
                  onClick={() => setCoupons({ ...coupons, [plan]: { ...coupons[plan], enabled: !coupons[plan].enabled } })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${coupons[plan].enabled ? "bg-etapa-primary" : "bg-etapa-border"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${coupons[plan].enabled ? "translate-x-5" : ""}`} />
                </button>
              </div>
              <div>
                <label className="text-xs font-medium text-etapa-textMuted block mb-1">Code</label>
                <input
                  type="text"
                  value={coupons[plan].code}
                  onChange={(e) => setCoupons({ ...coupons, [plan]: { ...coupons[plan], code: e.target.value.toUpperCase() } })}
                  placeholder={plan === "lifetime" ? "e.g. LIFETIME2024" : "e.g. STARTER2024"}
                  className="w-full px-3 py-2 bg-etapa-surface border border-etapa-border rounded-lg text-sm text-white font-mono placeholder-etapa-textFaint focus:outline-none focus:ring-2 focus:ring-etapa-primary uppercase"
                />
              </div>
              {coupons[plan].enabled && !coupons[plan].code && (
                <p className="text-xs text-amber-400 mt-2">⚠ Coupon is enabled but no code is set.</p>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={saveCoupons_}
          disabled={savingCoupons || !couponsDirty}
          className="mt-4 px-4 py-2 bg-etapa-primary text-white text-sm font-medium rounded-lg hover:bg-etapa-primaryDark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {savingCoupons ? "Saving..." : savedCouponsFlash ? "Saved!" : "Save Coupon Settings"}
        </button>
      </div>
    </div>
  );
}
