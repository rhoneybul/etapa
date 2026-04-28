/**
 * Manual mock for src/services/storageService.js.
 *
 * Backed by an in-memory store that resets per test. Tests that need
 * specific data seed it via:
 *
 *   const storage = require('../../src/services/storageService');
 *   storage.__seed({ plans: [...], goals: [...], userPrefs: {...} });
 *
 * That covers the majority of screen tests — they need to render
 * against a known plan / goal state without going to AsyncStorage or
 * the network.
 */

let store = freshStore();

function freshStore() {
  return {
    plans: [],
    goals: [],
    planConfigs: [],
    userPrefs: { distanceUnit: 'km', maxHr: null, ftp: null },
    stravaTokens: null,
    onboardingDone: false,
  };
}

const __reset = jest.fn(() => { store = freshStore(); });
const __seed = jest.fn((seed) => { store = { ...freshStore(), ...seed }; });
const __get = jest.fn(() => store);

module.exports = {
  __esModule: true,
  __reset,
  __seed,
  __get,

  // Goals
  saveGoal: jest.fn(async (goal) => {
    const next = { id: goal.id || `goal-${Date.now()}`, ...goal };
    const idx = store.goals.findIndex(g => g.id === next.id);
    if (idx >= 0) store.goals[idx] = next; else store.goals.push(next);
    return next;
  }),
  getGoals: jest.fn(async () => [...store.goals]),
  getGoal: jest.fn(async (id) => store.goals.find(g => g.id === id) || null),
  deleteGoal: jest.fn(async (id) => { store.goals = store.goals.filter(g => g.id !== id); }),

  // Plan configs
  savePlanConfig: jest.fn(async (cfg) => {
    const next = { id: cfg.id || `cfg-${Date.now()}`, ...cfg };
    const idx = store.planConfigs.findIndex(c => c.id === next.id);
    if (idx >= 0) store.planConfigs[idx] = next; else store.planConfigs.push(next);
    return next;
  }),
  updatePlanConfig: jest.fn(async (id, updates) => {
    const idx = store.planConfigs.findIndex(c => c.id === id);
    if (idx >= 0) store.planConfigs[idx] = { ...store.planConfigs[idx], ...updates };
    return store.planConfigs[idx] || null;
  }),
  getPlanConfig: jest.fn(async (id) => store.planConfigs.find(c => c.id === id) || null),

  // Plans
  savePlan: jest.fn(async (plan) => {
    const next = { id: plan.id || `plan-${Date.now()}`, ...plan };
    const idx = store.plans.findIndex(p => p.id === next.id);
    if (idx >= 0) store.plans[idx] = next; else store.plans.push(next);
    return next;
  }),
  getPlans: jest.fn(async () => [...store.plans]),
  getPlan: jest.fn(async (id) => store.plans.find(p => p.id === id) || null),
  getActivePlans: jest.fn(async () => store.plans.filter(p => p.status !== 'archived')),
  getAllActivities: jest.fn(async () => store.plans.flatMap(p => p.activities || [])),
  shiftPlanStartDate: jest.fn(async () => ({ ok: true })),
  clearPlan: jest.fn(async () => ({ ok: true })),
  deletePlan: jest.fn(async (id) => { store.plans = store.plans.filter(p => p.id !== id); }),

  // Activity ops
  updateActivity: jest.fn(async (activityId, updates) => {
    for (const plan of store.plans) {
      const idx = plan.activities?.findIndex(a => a.id === activityId);
      if (idx >= 0) {
        plan.activities[idx] = { ...plan.activities[idx], ...updates };
        return plan.activities[idx];
      }
    }
    return null;
  }),
  markActivityComplete: jest.fn(async (activityId, forceState) => {
    for (const plan of store.plans) {
      const a = plan.activities?.find(x => x.id === activityId);
      if (a) {
        a.completed = forceState !== undefined ? forceState : !a.completed;
        a.completedAt = a.completed ? new Date().toISOString() : null;
        return a;
      }
    }
    return null;
  }),
  scheduleActivity: jest.fn(async () => ({ ok: true })),

  // Strava
  saveStravaTokens: jest.fn(async (t) => { store.stravaTokens = t; }),
  getStravaTokens: jest.fn(async () => store.stravaTokens),
  clearStravaTokens: jest.fn(async () => { store.stravaTokens = null; }),

  // User prefs
  getUserPrefs: jest.fn(async () => ({ ...store.userPrefs })),
  setUserPrefs: jest.fn(async (p) => { store.userPrefs = { ...store.userPrefs, ...p }; }),

  // Lifecycle
  clearUserData: jest.fn(async () => { store = freshStore(); }),
  ensureUserData: jest.fn(async () => true),
  hydrateFromServer: jest.fn(async () => ({ ok: true })),
  syncPlansToServer: jest.fn(async () => ({ ok: true })),

  // Onboarding
  isOnboardingDone: jest.fn(async () => store.onboardingDone),
  setOnboardingDone: jest.fn(async () => { store.onboardingDone = true; }),

  // Plan helpers (sync) — re-exported real impls would pull in the
  // real module; minimal stubs are fine for screen tests that don't
  // actually exercise these.
  getWeekActivities: jest.fn((plan, week) =>
    (plan?.activities || []).filter(a => a.week === week)
  ),
  getWeekProgress: jest.fn(() => ({ completed: 0, total: 0, percent: 0 })),
  isOnTrack: jest.fn(() => true),
  getActivityDate: jest.fn(() => new Date().toISOString()),
  getWeekMonthLabel: jest.fn(() => 'Apr 2026'),

  uid: jest.fn(() => `mock-${Math.random().toString(36).slice(2, 8)}`),
};
