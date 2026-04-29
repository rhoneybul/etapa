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
  // Locally-managed "I can't ride on these days" list. Stored as
  // [{ date: 'YYYY-MM-DD', reason: '' }]. Used by the Calendar to render
  // hatched/struck-through cells, and by the coach prompt builder so the
  // AI plans around the rider's stated unavailable days. Lives client-
  // side only for v1 — no server roundtrip — to keep the feature snappy
  // and offline-safe; we'll move it to the server once the schema lands.
  UNAVAILABLE_DATES: '@etapa_unavailable_dates_v1',
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
  // Always bump updatedAt on write. Several screens (notably HomeScreen's
  // load() cache check) short-circuit reloads when the plan-level hash
  // hasn't changed. Any mutation that flows through this function — a
  // completion toggle, an activity edit, a day move — is by definition a
  // "plan changed" event, so bumping updatedAt here is the right semantic
  // and means those cache checks stay honest without every callsite
  // having to remember to pass force:true.
  plan.updatedAt = new Date().toISOString();
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

/**
 * Shift a plan's start date without regenerating any activities.
 *
 * Activity calendar dates are computed dynamically via getActivityDate
 * (plan.startDate, week, dayOfWeek), so updating plan.startDate alone
 * is enough to reposition every session — no need to mutate the
 * activities array. This is the right primitive for "move my plan to
 * start today" / "shift everything one week later" flows that the
 * coach chat or Settings screens trigger.
 *
 * `newStartDate` accepts either a Date or a 'YYYY-MM-DD' string. We
 * normalise to YYYY-MM-DD for storage so timezone shenanigans don't
 * accidentally bump the date by ±1 day on round-trip.
 */
export async function shiftPlanStartDate(planId, newStartDate) {
  const plans = await getPlans();
  const plan = plans.find(p => p.id === planId);
  if (!plan) throw new Error('Plan not found');
  let ymd;
  if (newStartDate instanceof Date) {
    const y = newStartDate.getFullYear();
    const m = String(newStartDate.getMonth() + 1).padStart(2, '0');
    const d = String(newStartDate.getDate()).padStart(2, '0');
    ymd = `${y}-${m}-${d}`;
  } else if (typeof newStartDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(newStartDate)) {
    ymd = newStartDate;
  } else {
    throw new Error('newStartDate must be a Date or YYYY-MM-DD string');
  }
  plan.startDate = ymd;
  await savePlan(plan); // bumps updatedAt + syncs to server
  return plan;
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

/**
 * Toggle an activity's completion state.
 *
 * Lucia reported (Apr 2026 TestFlight) that she tapped the check "to see
 * what happens and I cannot undo it". The old behaviour hard-coded
 * completed=true, so tapping the check always set true, never unset it.
 * Now the tap is a proper toggle: if the user explicitly flips a session
 * back to uncompleted, we clear completedAt too so the timeline doesn't
 * show a stale completion timestamp.
 *
 * Optional `forceState` (true/false) lets future callers bypass the
 * toggle — e.g. a bulk-mark-week-complete flow that should always set
 * true regardless of current state.
 */
export async function markActivityComplete(activityId, forceState) {
  // Look up current activity to know what we're toggling from.
  let nextCompleted = forceState;
  if (forceState === undefined) {
    // Fetch current plan → find activity → flip its completed flag.
    // We do this ad-hoc rather than accepting the current state as a
    // caller parameter because not every caller has it at hand, and
    // the DB is already our source of truth.
    const plans = await getPlans();
    const act = plans
      .flatMap((p) => p.activities || [])
      .find((a) => a && a.id === activityId);
    nextCompleted = !(act && act.completed);
  }
  return updateActivity(activityId, {
    completed: nextCompleted,
    completedAt: nextCompleted ? new Date().toISOString() : null,
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
 * Intentionally broad — every key that could expose one user's data to another
 * must be listed here.
 */
export async function clearUserData() {
  await AsyncStorage.multiRemove([
    KEYS.GOALS,
    KEYS.PLANS,
    KEYS.PLAN_CONFIGS,
    KEYS.CURRENT_USER,
    KEYS.ONBOARDING_DONE,
    KEYS.USER_PREFS,          // display name, units — must not bleed to next user
    KEYS.STRAVA,              // Strava OAuth tokens are user-specific
    KEYS.STRAVA_ACTIVITIES,   // cached activities are user-specific
  ]);
  migrated = false; // Reset migration flag so next user gets a fresh start
}

/**
 * Call on sign-in. If the userId differs from what's stored locally (or if no
 * user was stored — e.g. just after sign-out), clears all local data so stale
 * data from a previous session is never shown.
 * Returns true if data was cleared (caller should then force-hydrate from server).
 */
export async function ensureUserData(userId) {
  const storedUserId = await AsyncStorage.getItem(KEYS.CURRENT_USER);
  if (storedUserId !== userId) {
    // Covers both "different user" and "no stored user" (null !== userId).
    // Clear everything so the new user starts with a clean slate,
    // then immediately stamp the new user ID so this only runs once per session.
    await clearUserData();
    await AsyncStorage.setItem(KEYS.CURRENT_USER, userId);
    return true; // Caller must force-hydrate from server
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
  const sp = plan.startDate.split('T')[0].split('-');
  const start = new Date(Number(sp[0]), Number(sp[1]) - 1, Number(sp[2]), 12, 0, 0);
  const daysSinceStart = Math.round((now - start) / (1000 * 60 * 60 * 24));
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
  // Parse as local date at noon to avoid UTC timezone shift and DST edge cases.
  // planStartDate is YYYY-MM-DD (or legacy ISO string — split on 'T' handles both).
  const datePart = String(planStartDate).split('T')[0];
  const [y, m, d] = datePart.split('-').map(Number);
  const start = new Date(y, m - 1, d, 12, 0, 0); // noon local — no timezone shift

  // Snap to Monday of the start week so dayOfWeek=0 always means Monday,
  // even if the stored start date isn't exactly Monday (timezone edge, custom date, etc.)
  const jsDay = start.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const mondayOffset = jsDay === 0 ? -6 : -(jsDay - 1);
  const monday = new Date(start);
  monday.setDate(monday.getDate() + mondayOffset);

  const offset = (week - 1) * 7 + (dayOfWeek ?? 0);
  const result = new Date(monday);
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
//
// The "have you seen the onboarding tour" flag is per-USER, not per-device.
// That means: if you finish the tour on your phone, then log into the same
// account on your tablet or reinstall the app, the tour does NOT play again.
// Conversely, a brand-new account sees the tour on its first log-in even if
// a previous account on this same device had already completed it.
//
// Implementation: server is the source of truth (`preferences.onboarding_done`).
// The local AsyncStorage copy is a read-through cache so we skip the network
// call on subsequent boots where we've already confirmed "done". The cache
// is cleared in clearUserData() on logout so a new account's session starts
// fresh.

export async function isOnboardingDone() {
  // Fast path — local cache says done, trust it.
  const local = await AsyncStorage.getItem(KEYS.ONBOARDING_DONE);
  if (local === 'true') return true;
  // Ask the server. This is the per-user source of truth so a user who
  // finished onboarding on one device doesn't see it again on another.
  try {
    const prefs = await api.preferences.get();
    if (prefs?.onboarding_done) {
      // Cache locally so next boot takes the fast path above.
      await AsyncStorage.setItem(KEYS.ONBOARDING_DONE, 'true');
      return true;
    }
  } catch {
    // Offline / server error — fall through to "not done" so the user
    // still gets the tour. Better to show it twice than to swallow it on
    // a first-time user with a flaky connection.
  }
  return false;
}

export async function setOnboardingDone() {
  await AsyncStorage.setItem(KEYS.ONBOARDING_DONE, 'true');
  // Persist to server so the flag follows the user across devices.
  api.preferences.update({ onboarding_done: true }).catch(() => {});
}

// ── Unavailable dates (rider-blocked days) ─────────────────────────────────
//
// Lightweight local store for "I can't ride these days" used by the Calendar
// "Mark unavailable" sheet and surfaced to the coach so it plans around the
// rider's life (travel, work crunches, family). Shape:
//   [{ date: 'YYYY-MM-DD', reason: '' }]
// We store the date as a YYYY-MM-DD string (NOT a JS Date) so timezone shifts
// can't bump anything by ±1 day on round-trip. `reason` is optional free text.
//
// All mutations dedupe on `date` — the most recent reason wins for a given
// day. Getters always return an array so callers can spread / map without
// nullish-checking.

export async function getUnavailableDates() {
  const raw = (await getJSON(KEYS.UNAVAILABLE_DATES)) || [];
  // Normalise: strip any malformed entries from older builds.
  return raw.filter(e => e && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date));
}

export async function setUnavailableDates(arr) {
  // Accept either [{ date, reason }] or a bare ['YYYY-MM-DD'] for callers
  // that just want to mark dates without a reason. We coerce to the
  // canonical object shape on write so the read side never has to branch.
  const normalised = (Array.isArray(arr) ? arr : []).map(e => {
    if (typeof e === 'string') return { date: e, reason: '' };
    return { date: e.date, reason: typeof e.reason === 'string' ? e.reason : '' };
  }).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date));
  await setJSON(KEYS.UNAVAILABLE_DATES, normalised);
  return normalised;
}

export async function addUnavailableDates(dateArr, reason) {
  // Merge new dates into the existing list, deduping on `date`. If a date
  // already exists, the supplied reason overwrites the old one (the rider
  // is editing their note for that day).
  if (!Array.isArray(dateArr) || dateArr.length === 0) return getUnavailableDates();
  const existing = await getUnavailableDates();
  const byDate = {};
  existing.forEach(e => { byDate[e.date] = e; });
  dateArr.forEach(d => {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    byDate[d] = { date: d, reason: reason || (byDate[d]?.reason ?? '') };
  });
  // Sort ascending for stable rendering — the calendar reads this list
  // every redraw and a stable order makes the diff cheaper.
  const merged = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  await setJSON(KEYS.UNAVAILABLE_DATES, merged);
  return merged;
}

export async function removeUnavailableDate(date) {
  if (typeof date !== 'string') return getUnavailableDates();
  const existing = await getUnavailableDates();
  const filtered = existing.filter(e => e.date !== date);
  await setJSON(KEYS.UNAVAILABLE_DATES, filtered);
  return filtered;
}

export { uid };
