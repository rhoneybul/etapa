/**
 * useRemoteText — one-liner hook for remote-driven copy.
 *
 * Replaces a hard-coded string in a component with a remote-overridable
 * copy value PLUS the bundled fallback, so:
 *   - If the server has an override for this key, the component uses it.
 *   - If it doesn't, the bundled fallback shipped in this build is used.
 *   - The component re-renders automatically when remote config changes
 *     (admin edits a string → next config fetch → live for all users).
 *
 * Usage:
 *
 *   import useRemoteText from '../hooks/useRemoteText';
 *
 *   function SignInScreen() {
 *     const title    = useRemoteText('copy.signIn.title',    'Welcome to Etapa');
 *     const subtitle = useRemoteText('copy.signIn.subtitle', 'Your AI cycling coach');
 *     return (
 *       <>
 *         <Text style={styles.title}>{title}</Text>
 *         <Text style={styles.sub}>{subtitle}</Text>
 *       </>
 *     );
 *   }
 *
 * The `copy.` prefix is optional — both `copy.signIn.title` and
 * `signIn.title` resolve to the same key.
 *
 * For bulk reads (many strings on one screen), use useRemoteTextBulk:
 *
 *   const text = useRemoteTextBulk({
 *     title:    ['copy.home.title',    'Etapa'],
 *     greeting: ['copy.home.greeting', 'Hello there'],
 *   });
 *   // text.title, text.greeting
 *
 * The hook subscribes to remoteConfig changes. A single admin edit to the
 * `copy` section will re-render every screen that uses this hook as soon
 * as the next fetch completes (TTL 5 min, or an explicit refresh).
 */

import { useEffect, useState, useMemo } from 'react';
import remoteConfig from '../services/remoteConfig';

/**
 * Read a single copy key. The hook re-renders the component when the
 * underlying remote config changes.
 */
export default function useRemoteText(key, fallback = '') {
  const [value, setValue] = useState(() => remoteConfig.t(key, fallback));

  useEffect(() => {
    // Recompute immediately in case the cache loaded between render + effect.
    setValue(remoteConfig.t(key, fallback));
    const unsub = remoteConfig.subscribe(() => {
      setValue(remoteConfig.t(key, fallback));
    });
    return unsub;
  }, [key, fallback]);

  return value;
}

/**
 * Read many copy keys in one shot. `spec` is an object mapping local
 * names to [key, fallback] tuples. Returns an object with the resolved
 * strings keyed by the local name.
 *
 * Why a bulk hook: calling useRemoteText 20 times on one screen creates
 * 20 subscriptions. This creates one.
 */
export function useRemoteTextBulk(spec) {
  // Stable reference — consumers typically declare `spec` inline, which
  // means new object every render. We freeze the key list from the first
  // render to keep the subscription registration stable.
  const stableKeys = useMemo(() => Object.keys(spec), []); // eslint-disable-line react-hooks/exhaustive-deps

  const compute = () => {
    const out = {};
    for (const name of stableKeys) {
      const [key, fallback = ''] = spec[name] || [];
      out[name] = remoteConfig.t(key, fallback);
    }
    return out;
  };

  const [values, setValues] = useState(compute);

  useEffect(() => {
    setValues(compute());
    const unsub = remoteConfig.subscribe(() => setValues(compute()));
    return unsub;
    // Intentionally only depend on stableKeys — spec is keyed by them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableKeys]);

  return values;
}

/**
 * Pass-through hooks for the other remote-config value types. Same
 * subscription behaviour as useRemoteText — the component re-renders when
 * the underlying value changes (e.g. an admin flips a feature flag).
 */
export function useRemoteBool(key, fallback = false) {
  const [value, setValue] = useState(() => remoteConfig.getBool(key, fallback));
  useEffect(() => {
    setValue(remoteConfig.getBool(key, fallback));
    const unsub = remoteConfig.subscribe(() => {
      setValue(remoteConfig.getBool(key, fallback));
    });
    return unsub;
  }, [key, fallback]);
  return value;
}

export function useRemoteJson(key, fallback = null) {
  const [value, setValue] = useState(() => remoteConfig.getJson(key, fallback));
  useEffect(() => {
    setValue(remoteConfig.getJson(key, fallback));
    const unsub = remoteConfig.subscribe(() => {
      setValue(remoteConfig.getJson(key, fallback));
    });
    return unsub;
  }, [key, fallback]);
  return value;
}
