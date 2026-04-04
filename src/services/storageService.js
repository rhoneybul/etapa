/**
 * Storage service — persists goals, plans, and activities.
 * Uses AsyncStorage locally + syncs to Supabase via the API server.
 * AsyncStorage is the source of truth; API sync is fire-and-forget.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

const KEYS = {
  GOALS:          '@etapa_goals',
  PLAN_CONFIGS:   '@etapa_plan_configs',
  PLANS:          '@etapa_plans',
  STRAVA:         '@etapa_strava',
  STRAVA_ACTIVITIES: '@etapa_strava_activities',
  CURRENT_USER:   '@etapa_current_user_id',
  USER_PREFS:     '@etapa_user_prefs',
  ONBOARDING_DONE:'@etapa_onboarding_done',
  // Legacy single-item keys (for migration)
  GOAL:           '@etapa_goal',
  PLAN_CONFIG:    '@etapa_plan_config',
  PLAN:           '@etapa_plan',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function getJSON(key) {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

async function setJSON(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

// ── Migration — one-time upgrade from single to multi ────────────────────────

async function migrateIfNeeded() {
  const oldGoal = await getJSON(KEYS.GOAL);
  const oldPlan = await getJSON(KEYS.PLAN);

  if (oldGoal || oldPlan) {
    const goals = oldGoal ? [oldGoal] : [];
    const plans = oldPlan ? [oldPlan] : [];
    const existingGoals = (await getJSON(KEYS.GOALS)) || [];
    const existingPlans = (await getJSON(KEYS.PLANS)) || [];

    if (existingGoals.length === 0 && goals.length > 0) {
      await setJSON(KEYS.GOALS, goals);
    }
    if (existingPlans.length === 0 && plans.length > 0) {
      await setJSON(KEYS.PLANS, plans);
    }

    // Remove old keys
    await AsyncStorage.multiRemove([KEYS.GOAL, KEYS.PLAN_CONFIG, KEYS.PLAN]);
  }
}

let migrated = false;
async function ensureMigrated() {
  if (!migrated) {
    await migrateIfNeeded();
    migrated = true;
  }
}

// ── Goals ────────────────────────────────────────────────────────────────────

export async function saveGoal(goal) {
  await ensureMigrated();
  const data = { id: uid(), createdAt: new Date().toISOString(), ...goal };
  const goals = (await getJSON(KEYS.GOALS)) || [];
  goals.push(data);
  await setJSON(KEYS.GOALS, goals);
  // Sync to server
  api.goals.create(data).catch(() => {});
  return data;
}

export async function getGoals() {
  await ensureMigrated();
  return (await getJSON(KEYS.GOALS)) || [];
}

export async function getGoal(id) {
  const goals = await getGoals();
  if (!id) return goals[0] || null;
  return goals.find(g => g.id === id) || null;
}

export async function deleteGoal(goalId) {
  await ensureMigrated();
  let goals = (await getJSON(KEYS.GOALS)) || [];
  goals = goals.filter(g => g.id !== goalId);
  await setJSON(KEYS.GOALS, goals);
  // Also delete associated plans
  let plans = (await getJSON(KEYS.PLANS)) || [];
  const plansToDelete = plans.filter(p => p.goalId === goalId);
  plans = plans.filter(p => p.goalId !== goalId);
  await setJSON(KEYS.PLANS, plans);
  // Sync to server
  plansToDelete.forEach(p => api.plans.delete(p.id).catch(() => {}));
  api.goals.delete(goalId).catch(() => {});
}

// ── Plan Config ──────────────────────────────────────────────────────────────

export async function savePlanConfig(config) {
  await ensureMigrated();
  const data = { id: uid(), createdAt: new Date().toISOString(), ...config };
  const configs = (await getJSON(KEYS.PLAN_CONFIGS)) || [];
  configs.push(data);
  await setJSON(KEYS.PLAN_CONFIGS, configs);
  // Sync to server
  api.planConfigs.create(data).catch(() => {});
  return data;
}

export async function updatePlanConfig(id, updates) {
  await ensureMigrated();
  const configs = (await getJSON(KEYS.PLAN_CONFIGS)) || [];
  const idx = configs.findIndex(c => c.id === id);
  if (idx < 0) return null;
  configs[idx] = { ...configs[idx], ...updates };
  await setJSON(KEYS.PLAN_CONFIGS, configs);
  api.planConfigs.update(id, configs[idx]).catch(() => {});
  return configs[idx];
}

export async function getPlanConfig(id) {
  const configs = (await getJSON(KEYS.PLAN_CONFIGS)) || [];
  if (!id) return configs[configs.length - 1] || null;
  return configs.find(c => c.id === id) || null;
}

// ── Plans ────────────────────────────────────────────────────────────────────

export async function savePlan(plan) {
  await ensureMigrated();
  let plans = (await getJSON(KEYS.PLANS)) || [];
  const idx = plans.findIndex(p => p.id === plan.id);
  if (idx >= 0) {
    plans[idx] = plan;
  } else {
    plans.push(plan);
  }
  await setJSON(KEYS.PLANS, plans);
  // Always push via create (server uses upsert — safe for both new and existing plans)
  api.plans.create(plan).catch(() => {});
  return plan;
}

export async function getPlans() {
  await ensureMigrated();
  return (await getJSON(KEYS.PLANS)) || [];
}

export async function getPlan(planId) {
  const plans = await getPlans();
  if (planId) return plans.find(p => p.id === planId) || null;
  // Backward compat: return the most recent active plan
  const active = plans.filter(p => p.status === 'active');
  return active.length > 0 ? active[active.length - 1] : plans[plans.length - 1] || null;
}

export async function getActivePlans() {
  const plans = await getPlans();
  return plans.filter(p => p.status === 'active');
}

export async function getAllActivities() {
  const plans = await getPlans();
  const activities = [];
  for (const plan of plans) {
    if (plan.activities) {
      for (const a of plan.activities) {
        // Attach plan metadata for calendar display
        activities.push({ ...a, _planStartDate: plan.startDate, _planWeeks: plan.weeks, _planId: plan.id });
      }
    }
  }
  return activities;
}

export async function clearPlan(planId) {
  await ensureMigrated();
  if (planId) {
    let plans = (await getJSON(KEYS.PLANS)) || [];
    plans = plans.filter(p => p.id !== planId);
    await setJSON(KEYS.PLANS, plans);
  } else {
    // Clear everything (legacy behavior)
    await setJSON(KEYS.GOALS, []);
    await setJSON(KEYS.PLANS, []);
    await setJSON(KEYS.PLAN_CONFIGS, []);
  }
}

/**
 * Delete a plan and its associated goal.
 */
export async function deletePlan(planId) {
  await ensureMigrated();
  let plans = (await getJSON(KEYS.PLANS)) || [];
  const plan = plans.find(p => p.id === planId);
  if (!plan) return;

  // Remove the plan
  plans = plans.filter(p => p.id !== planId);
  await setJSON(KEYS.PLANS, plans);

  // Sync to server
  api.plans.delete(planId).catch(() => {});

  // Remove the associated goal if no other plan references it
  if (plan.goalId) {
    const otherPlanWithGoal = plans.find(p => p.goalId === plan.goalId);
    if (!otherPlanWithGoal) {
      let goals = (await getJSON(KEYS.GOALS)) || [];
      goals = goals.filter(g => g.id !== plan.goalId);
      await setJSON(KEYS.GOALS, goals);
      api.goals.delete(plan.goalId).catch(() => {});
    }
  }

  // Clean up associated config
  if (plan.configId) {
    let configs = (await getJSON(KEYS.PLAN_CONFIGS)) || [];
    configs = configs.filter(c => c.id !== plan.configId);
    await setJSON(KEYS.PLAN_CONFIGS, configs);
    api.planConfigs.delete(plan.configId).catch(() => {});
  }
}

export async function updateActivity(activityId, updates) {
  const plans = await getPlans();
  for (const plan of plans) {
    const idx = plan.activities?.findIndex(a => a.id === activityId);
    if (idx >= 0) {
      plan.activities[idx] = { ...plan.activities[idx], ...updates };
      await savePlan(plan);
      // Sync activity update to server
      api.plans.updateActivity(plan.id, activityId, updates).catch(() => {});
      return plan.activities[idx];
    }
  }
  return null;
}

export async function markActivityComplete(activityId) {
  return updateActivity(activityId, {
    completed: true,
    completedAt: new Date().toISOString(),
  });
}

export async function scheduleActivity(activityId, dayOfWeek) {
  return updateActivity(activityId, { dayOfWeek });
}

// ── Strava tokens ────────────────────────────────────────────────────────────

export async function saveStravaTokens(tokens) {
  await setJSON(KEYS.STRAVA, tokens);
}

export async function getStravaTokens() {
  return getJSON(KEYS.STRAVA);
}

export async function clearStravaTokens() {
  await AsyncStorage.removeItem(KEYS.STRAVA);
}

// ── User data isolation ──────────────────────────────────────────────────────

/**
 * Clears all user-specific local data. Call on sign-out or when switching users.
 */
export async function clearUserData() {
  await AsyncStorage.multiRemove([
    KEYS.GOALS,
    KEYS.PLANS,
    KEYS.PLAN_CONFIGS,
    KEYS.CURRENT_USER,
  ]);
  migrated = false; // Reset migration flag so next user gets a fresh start
}

/**
 * Call on sign-in. If the userId differs from what's stored locally,
 * clears all local data so stale data from a previous user is never shown.
 * Returns true if data was cleared (caller should then hydrate from server).
 */
export async function ensureUserData(userId) {
  const storedUserId = await AsyncStorage.getItem(KEYS.CURRENT_USER);
  if (storedUserId && storedUserId !== userId) {
    await clearUserData();
    await AsyncStorage.setItem(KEYS.CURRENT_USER, userId);
    return true; // Data was cleared — caller should hydrate
  }
  if (!storedUserId) {
    await AsyncStorage.setItem(KEYS.CURRENT_USER, userId);
  }
  return false;
}

// ── Startup hydration ───────────────────────────────────────────────────────
// On first launch after install, or after a user switch, pull everything
// from the server to populate local storage.

export async function hydrateFromServer({ force = false } = {}) {
  await ensureMigrated();

  if (!force) {
    const localGoals   = (await getJSON(KEYS.GOALS)) || [];
    const localPlans   = (await getJSON(KEYS.PLANS)) || [];
    const localConfigs = (await getJSON(KEYS.PLAN_CONFIGS)) || [];

    // Only hydrate if ALL local stores are empty — avoids overwriting edits
    if (localGoals.length > 0 || localPlans.length > 0 || localConfigs.length > 0) {
      return { hydrated: false, reason: 'local_data_exists' };
    }
  }

  try {
    const [serverGoals, serverPlans, serverConfigs] = await Promise.all([
      api.goals.list(),
      api.plans.list(),
      api.planConfigs.list(),
    ]);

    await setJSON(KEYS.GOALS,       serverGoals  || []);
    await setJSON(KEYS.PLANS,       serverPlans  || []);
    await setJSON(KEYS.PLAN_CONFIGS, serverConfigs || []);

    const count = (serverGoals?.length || 0) + (serverPlans?.length || 0) + (serverConfigs?.length || 0);
    return { hydrated: true, count };
  } catch (err) {
    console.warn('Hydration from server failed:', err);
    return { hydrated: false, reason: 'api_error' };
  }
}

/**
 * Push all locally-stored plans (+ their activities) up to the server.
 * The server endpoint is now an upsert, so this is safe to call at any time —
 * it won't create duplicates and won't overwrite progress that only exists
 * server-side (activity completion state etc. is included in the local plan).
 *
 * Call this once after the user is authenticated so the admin dashboard always
 * has up-to-date data even if previous syncs failed silently.
 */
export async function syncPlansToServer() {
  try {
    const plans = (await getJSON(KEYS.PLANS)) || [];
    if (plans.length === 0) return { synced: 0 };
    let synced = 0;
    for (const plan of plans) {
      try {
        await api.plans.create(plan); // server uses upsert — idempotent
        synced++;
      } catch {
        // keep going — best-effort sync
      }
    }
    console.log(`[storageService] Synced ${synced}/${plans.length} plans to server`);
    return { synced };
  } catch (err) {
    console.warn('[storageService] syncPlansToServer failed:', err);
    return { synced: 0 };
  }
}

// ── Progress helpers ─────────────────────────────────────────────────────────

export function getWeekActivities(plan, weekNumber) {
  if (!plan?.activities) return [];
  return plan.activities.filter(a => a.week === weekNumber);
}

export function getWeekProgress(plan, weekNumber) {
  const activities = getWeekActivities(plan, weekNumber);
  const total = activities.filter(a => a.type !== 'rest').length;
  const done = activities.filter(a => a.completed && a.type !== 'rest').length;
  return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

export function isOnTrack(plan) {
  if (!plan) return null;
  const now = new Date();
  const start = new Date(plan.startDate);
  const daysSinceStart = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const currentWeek = Math.min(Math.floor(daysSinceStart / 7) + 1, plan.weeks);

  let totalExpected = 0;
  let totalDone = 0;
  for (let w = 1; w <= currentWeek; w++) {
    const { total, done } = getWeekProgress(plan, w);
    totalExpected += total;
    totalDone += done;
  }

  if (totalExpected === 0) return true;
  return (totalDone / totalExpected) >= 0.6;
}

/**
 * Get the date for a specific day in a specific week of a plan.
 */
export function getActivityDate(planStartDate, week, dayOfWeek) {
  // Parse as local date to avoid UTC timezone shift issues.
  // planStartDate is typically an ISO string like "2026-04-06T00:00:00.000Z".
  // Using new Date(iso) converts to local time which can shift the date by -1 day.
  const iso = typeof planStartDate === 'string' ? planStartDate : new Date(planStartDate).toISOString();
  const [datePart] = iso.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const start = new Date(y, m - 1, d); // local midnight — no timezone shift
  const offset = (week - 1) * 7 + (dayOfWeek ?? 0);
  const result = new Date(start);
  result.setDate(result.getDate() + offset);
  return result;
}

/**
 * Get the month label for a given week.
 */
export function getWeekMonthLabel(planStartDate, week) {
  // Parse as local date to avoid UTC shift
  const iso = typeof planStartDate === 'string' ? planStartDate : new Date(planStartDate).toISOString();
  const [datePart] = iso.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const weekStart = new Date(start);
  weekStart.setDate(weekStart.getDate() + (week - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const startMonth = months[weekStart.getMonth()];
  const endMonth = months[weekEnd.getMonth()];

  if (startMonth === endMonth) {
    return `${startMonth} ${weekStart.getFullYear()}`;
  }
  return `${startMonth} / ${endMonth} ${weekEnd.getFullYear()}`;
}

// ── User Preferences (local — units, display name, etc.) ───────────────────

export async function getUserPrefs() {
  const local = (await getJSON(KEYS.USER_PREFS)) || { units: 'km', displayName: '' };

  // If we have no local display name, try to pull from server
  if (!local.displayName) {
    try {
      const serverPrefs = await api.preferences.get();
      if (serverPrefs?.display_name) {
        local.displayName = serverPrefs.display_name;
        await setJSON(KEYS.USER_PREFS, local);
      }
    } catch {} // fire-and-forget
  }

  return local;
}

export async function setUserPrefs(prefs) {
  const current = await getUserPrefs();
  const updated = { ...current, ...prefs };
  await setJSON(KEYS.USER_PREFS, updated);

  // Sync display name to server (fire-and-forget)
  if (prefs.displayName !== undefined) {
    api.preferences.update({ display_name: prefs.displayName }).catch(() => {});
  }

  return updated;
}

// ── Onboarding state ────────────────────────────────────────────────────────

export async function isOnboardingDone() {
  const val = await AsyncStorage.getItem(KEYS.ONBOARDING_DONE);
  return val === 'true';
}

export async function setOnboardingDone() {
  await AsyncStorage.setItem(KEYS.ONBOARDING_DONE, 'true');
  // Also persist to server preferences (fire-and-forget)
  api.preferences.update({ onboarding_done: true }).catch(() => {});
}

export { uid };
