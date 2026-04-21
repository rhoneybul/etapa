/**
 * useRemoteConfig — React hook wrapper around the remoteConfig service.
 *
 * Re-renders the component whenever remote config is refreshed. Returns the
 * same accessor shape as the imperative service so switching is painless.
 *
 *   const { get, getString, getBool, getJson, t } = useRemoteConfig();
 *   const title = getString('copy.home.emptyTitle', 'Ready when you are');
 *
 * If you only need *one* value and want the minimum surface:
 *
 *   const title = useConfigString('copy.home.emptyTitle', 'Ready when you are');
 *
 * These hooks are cheap — they subscribe to a single in-process event emitter
 * and never trigger a re-render if no values changed.
 */

import { useEffect, useState, useSyncExternalStore, useCallback } from 'react';
import remoteConfig from './remoteConfig';

// React 18+ has useSyncExternalStore; fall back gracefully just in case.
const subscribe = (cb) => remoteConfig.subscribe(cb);
const getSnapshot = () => remoteConfig.getAll();

export function useRemoteConfig() {
  // Using useState + subscribe gives wide RN compatibility.
  const [, force] = useState(0);

  useEffect(() => {
    const unsub = remoteConfig.subscribe(() => force((x) => x + 1));
    return unsub;
  }, []);

  return remoteConfig;
}

export function useConfigString(path, fallback = '') {
  const [v, setV] = useState(() => remoteConfig.getString(path, fallback));
  useEffect(() => {
    const unsub = remoteConfig.subscribe(() => setV(remoteConfig.getString(path, fallback)));
    return unsub;
  }, [path, fallback]);
  return v;
}

export function useConfigBool(path, fallback = false) {
  const [v, setV] = useState(() => remoteConfig.getBool(path, fallback));
  useEffect(() => {
    const unsub = remoteConfig.subscribe(() => setV(remoteConfig.getBool(path, fallback)));
    return unsub;
  }, [path, fallback]);
  return v;
}

export function useConfigNumber(path, fallback = 0) {
  const [v, setV] = useState(() => remoteConfig.getNumber(path, fallback));
  useEffect(() => {
    const unsub = remoteConfig.subscribe(() => setV(remoteConfig.getNumber(path, fallback)));
    return unsub;
  }, [path, fallback]);
  return v;
}

export function useConfigJson(path, fallback = null) {
  const [v, setV] = useState(() => remoteConfig.getJson(path, fallback));
  useEffect(() => {
    const unsub = remoteConfig.subscribe(() => setV(remoteConfig.getJson(path, fallback)));
    return unsub;
  }, [path, fallback]);
  return v;
}

/**
 * useFeatureFlag — convenience for `features.<name>.enabled`.
 * Defaults to `true` so disabling requires a deliberate flip.
 */
export function useFeatureFlag(featureName, defaultEnabled = true) {
  return useConfigBool(`features.${featureName}.enabled`, defaultEnabled);
}
