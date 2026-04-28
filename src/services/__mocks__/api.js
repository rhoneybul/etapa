/**
 * Manual mock for src/services/api.js — used by jest.mock('../services/api').
 *
 * Default behaviour: every endpoint resolves with empty / null shaped
 * data so screens can mount without exploding. Tests that need a
 * specific response do so via:
 *   const api = require('../../src/services/api').default;
 *   api.checkins.pending.mockResolvedValueOnce([{ id: 'c1', ... }]);
 *
 * Keep the surface area in sync with the real api.js. When you add a
 * new endpoint there, mirror it here so dependent screens don't
 * silently fail with `undefined is not a function`.
 */

const ok = (val) => jest.fn().mockResolvedValue(val);

const api = {
  // Plans
  plans: {
    list: ok([]),
    get: ok(null),
    create: ok({ id: 'mock-plan' }),
    update: ok({ ok: true }),
    updateActivity: ok({ ok: true }),
    delete: ok({ ok: true }),
  },

  // Goals
  goals: {
    list: ok([]),
    create: ok({ id: 'mock-goal' }),
    update: ok({ ok: true }),
    delete: ok({ ok: true }),
  },

  // Plan configs
  planConfigs: {
    get: ok(null),
    save: ok({ ok: true }),
  },

  // Preferences
  preferences: {
    get: ok({ coach_checkin: 'after_session', push_enabled: true, onboarding_done: false }),
    update: ok({ ok: true }),
  },

  // Notifications (in-app card list, push registration)
  notifications: {
    list: ok([]),
    unreadCount: ok({ count: 0 }),
    markRead: ok({ ok: true }),
    registerToken: ok({ ok: true }),
  },

  // Weekly check-ins
  checkins: {
    pending: ok([]),
    list: ok([]),
    respond: ok({ id: 'mock-checkin', suggestions: null }),
    dismiss: ok({ ok: true }),
    physioNotes: ok({ ok: true }),
  },
  checkinPrefs: {
    get: ok({ frequency: 'after_session' }),
    save: ok({ ok: true }),
  },

  // Subscription / RevenueCat bridge
  subscription: {
    sync: ok({ ok: true }),
    status: ok({ active: false }),
  },

  // Support / feedback
  support: {
    sendMessage: ok({ ok: true }),
    listMessages: ok([]),
  },
  feedback: {
    submit: ok({ ok: true }),
  },

  // Strava bridge (we don't use Strava data in AI per the legal audit
  // — the bridge here just stubs the connection check).
  strava: {
    status: ok({ connected: false }),
    disconnect: ok({ ok: true }),
  },

  // Auth helpers (the real api.js has these for refreshing the access
  // token; the storage-tier auth lives in authService).
  auth: {
    refresh: ok({ access_token: 'mock-token' }),
  },
};

// buildWorkoutExportUrl is exported as a named function from api.js.
const buildWorkoutExportUrl = jest.fn().mockResolvedValue({
  url: 'https://mock-export/workout.zwo',
  expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
});

module.exports = {
  __esModule: true,
  default: api,
  api,
  buildWorkoutExportUrl,
};
