/**
 * Remote Config — the single source of truth for backend-driven app behaviour.
 *
 * See REMOTE_FIRST_ARCHITECTURE.md for the full philosophy. The short version:
 *
 *   1. Fetch config from the backend on app open + on resume (throttled)
 *   2. Persist every successful fetch to AsyncStorage (last-known-good)
 *   3. On read, return the in-memory copy (cache-first, then network)
 *   4. Every accessor has a mandatory fallback — the app NEVER crashes because
 *      the network is down or a key is missing
 *   5. User-specific overrides are merged deep-last and win over global values
 *
 * Usage:
 *
 *   import remoteConfig from './remoteConfig';
 *   import { COACHES as LOCAL_COACHES } from '../data/coaches';
 *
 *   // Boot:
 *   await remoteConfig.init();               // loads cache, starts fetch in bg
 *
 *   // Reads:
 *   const coaches = remoteConfig.getJson('coaches', LOCAL_COACHES);
 *   const title   = remoteConfig.getString('copy.home.emptyTitle', 'Ready when you are');
 *   const on      = remoteConfig.getBool('features.stravaSync.enabled', true);
 *
 *   // React reactively:
 *   const unsub = remoteConfig.subscribe(() => forceRerender());
 *
 *   // Force refresh (debug / settings):
 *   await remoteConfig.refresh();
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, AppState } from 'react-native';
import Constants from 'expo-constants';
import { getSession } from './authService';

const BASE_URL       = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
const STORAGE_KEY    = '@etapa:remoteConfig:v1';
const FETCH_TTL_MS   = 5 * 60 * 1000;  // 5 min — stale-while-revalidate
const FETCH_TIMEOUT  = 8000;           // 8s — don't block boot forever

// ── Version info ────────────────────────────────────────────────────────────
// Pulled from expo-constants so the server can return version-specific payloads.
const APP_VERSION =
  Constants?.expoConfig?.version ||
  Constants?.manifest?.version   ||
  '0.0.0';

// ── In-memory state ─────────────────────────────────────────────────────────
let _config     = {};        // merged global + user overrides
let _fetchedAt  = 0;         // ms since epoch
let _initialised = false;
let _inflight   = null;      // dedupe concurrent refreshes
const _listeners = new Set();

// ── Defaults ────────────────────────────────────────────────────────────────
// These are the "last resort" values when both the cache and the network fail.
// They mirror the shape documented in REMOTE_FIRST_ARCHITECTURE.md.
const DEFAULTS = {
  version: 1,
  features: {
    stravaSync:       { enabled: true },
    aiCoachChat:      { enabled: true },
    quickPlan:        { enabled: true },
    beginnerProgram:  { enabled: true },
    pushNotifications:{ enabled: true },
  },
  copy: {},             // every getString has its own fallback; keep empty
  coaches: null,        // null signals: use bundled COACHES
  fitnessLevels: null,  // null signals: use bundled list
  planDurations: null,
  maintenance:    { enabled: false, title: '', message: '' },
  minVersion:     { ios: '0.0.0', android: '0.0.0', message: '' },
  pricing:        { currency: 'gbp', monthly: 799, annual: 4999, lifetime: 9999, starter: 1499 },
  trial:          { days: 7, bannerMessage: 'Subscribe to unlock full training access' },
  banner:         { active: false, message: '', cta: null },
  userOverrides:  {},
};

// ── Utility: deep get (dot-path) ─────────────────────────────────────────────
function deepGet(obj, path) {
  if (!obj) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

// ── Utility: deep-merge (right wins) ─────────────────────────────────────────
function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(a, b) {
  if (!isPlainObject(a)) return b;
  if (!isPlainObject(b)) return b === undefined ? a : b;
  const out = { ...a };
  for (const k of Object.keys(b)) {
    out[k] = deepMerge(a[k], b[k]);
  }
  return out;
}

// ── Event: notify subscribers ────────────────────────────────────────────────
function notify() {
  for (const fn of _listeners) {
    try { fn(_config); } catch (e) { /* swallow — one bad listener shouldn't break others */ }
  }
}

// ── Persist to AsyncStorage ──────────────────────────────────────────────────
async function persist(config, fetchedAt) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ config, fetchedAt }));
  } catch (e) {
    console.warn('[remoteConfig] persist failed:', e.message);
  }
}

// ── Load from AsyncStorage (last-known-good) ─────────────────────────────────
async function loadFromCache() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.config) return null;
    return parsed;
  } catch (e) {
    console.warn('[remoteConfig] loadFromCache failed:', e.message);
    return null;
  }
}

// ── Network fetch ────────────────────────────────────────────────────────────
async function fetchFromServer() {
  // Attach JWT if we have one (for user-specific overrides).
  let token = null;
  try {
    const session = await getSession();
    token = session?.access_token || null;
  } catch { /* anonymous fetch is fine */ }

  const headers = {
    'Accept': 'application/json',
    'X-App-Version':  APP_VERSION,
    'X-App-Platform': Platform.OS,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(`${BASE_URL}/api/app-config`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn('[remoteConfig] fetch non-200:', res.status);
      return null;
    }
    const json = await res.json();
    if (!isPlainObject(json)) return null;
    return json;
  } catch (e) {
    clearTimeout(timer);
    if (e.name !== 'AbortError') {
      console.warn('[remoteConfig] fetch failed:', e.message);
    }
    return null;
  }
}

// ── Merge logic: defaults → server-global → userOverrides ────────────────────
function mergeConfig(serverPayload) {
  if (!isPlainObject(serverPayload)) return DEFAULTS;
  // Base: defaults merged with server global
  const { userOverrides, ...global } = serverPayload;
  const baseMerged = deepMerge(DEFAULTS, global);
  // Apply user overrides on top if present
  if (isPlainObject(userOverrides)) {
    return deepMerge(baseMerged, userOverrides);
  }
  return baseMerged;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise on app boot. Loads cache synchronously (well, one await), then
 * fires a background fetch without blocking. Safe to call multiple times.
 */
async function init() {
  if (_initialised) return _config;
  _initialised = true;

  // 1. Hydrate from AsyncStorage so UI renders instantly.
  const cached = await loadFromCache();
  if (cached?.config) {
    _config = mergeConfig(cached.config);
    _fetchedAt = cached.fetchedAt || 0;
    notify();
  } else {
    _config = DEFAULTS;
  }

  // 2. Fire a background refresh — do not await, do not block boot.
  refresh().catch(() => { /* already logged inside */ });

  // 3. Re-fetch on resume-from-background (throttled).
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      const age = Date.now() - _fetchedAt;
      if (age > FETCH_TTL_MS) refresh().catch(() => {});
    }
  });

  return _config;
}

/**
 * Force a fresh fetch. Dedupes concurrent calls.
 */
async function refresh() {
  if (_inflight) return _inflight;
  _inflight = (async () => {
    const payload = await fetchFromServer();
    if (payload) {
      const merged = mergeConfig(payload);
      _config = merged;
      _fetchedAt = Date.now();
      await persist(payload, _fetchedAt);
      notify();
    }
    _inflight = null;
    return _config;
  })();
  return _inflight;
}

/**
 * Return the whole merged config object. Useful for debugging.
 */
function getAll() {
  return _config;
}

/**
 * Generic get — returns whatever is at `path` or `fallback` if missing/null.
 */
function get(path, fallback) {
  const v = deepGet(_config, path);
  return v === undefined || v === null ? fallback : v;
}

/**
 * Typed getters — each validates the type and falls back if mismatched.
 */
function getString(path, fallback = '') {
  const v = deepGet(_config, path);
  return typeof v === 'string' ? v : fallback;
}

function getBool(path, fallback = false) {
  const v = deepGet(_config, path);
  return typeof v === 'boolean' ? v : fallback;
}

function getNumber(path, fallback = 0) {
  const v = deepGet(_config, path);
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function getJson(path, fallback = null) {
  const v = deepGet(_config, path);
  if (v === undefined || v === null) return fallback;
  // Accept arrays and plain objects
  if (Array.isArray(v) || isPlainObject(v)) return v;
  return fallback;
}

/**
 * Convenience: shortcut for copy lookup. `t('copy.home.emptyTitle', 'fallback')`.
 */
function t(key, fallback = '') {
  // Support both 'copy.xxx' and bare 'xxx' under copy.
  const fullPath = key.startsWith('copy.') ? key : `copy.${key}`;
  return getString(fullPath, fallback);
}

/**
 * Subscribe to config changes. Returns an unsubscribe fn.
 */
function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * Hard reset — clears cache and re-fetches. Debug-only.
 */
async function hardReset() {
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
  _config = DEFAULTS;
  _fetchedAt = 0;
  notify();
  return refresh();
}

const remoteConfig = {
  init,
  refresh,
  hardReset,
  getAll,
  get,
  getString,
  getBool,
  getNumber,
  getJson,
  t,
  subscribe,
  // expose for tests/debugging
  _defaults: DEFAULTS,
  _appVersion: APP_VERSION,
};

export default remoteConfig;
export {
  init,
  refresh,
  hardReset,
  getAll,
  get,
  getString,
  getBool,
  getNumber,
  getJson,
  t,
  subscribe,
};
