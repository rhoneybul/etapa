/**
 * useScreenGuard — server-driven screen-level workflow control.
 *
 * Reads `workflows.screens.<screenName>` from remote config and enforces:
 *   - `disabled: true`      → the screen shows a "not available" panel and
 *                             provides a bail-out button (back or home).
 *   - `redirectTo: 'Name'`  → the guard auto-navigates away on mount.
 *   - `disabledCopy`        → message shown when disabled.
 *
 * Every user-facing screen SHOULD call this hook at the top so a broken
 * screen can be neutralised from the admin dashboard without a new build.
 *
 * Usage:
 *
 *   import useScreenGuard from '../hooks/useScreenGuard';
 *
 *   function PlanLoadingScreen({ navigation }) {
 *     const guard = useScreenGuard('PlanLoadingScreen', navigation);
 *     if (guard.blocked) return guard.render();   // disabled-state UI
 *     // ...normal render
 *   }
 *
 * The guard makes three promises:
 *   1. If remote config is unreachable, `blocked` is false (screen renders
 *      normally — never lock users out because of a network blip).
 *   2. If `redirectTo` points at a non-existent screen, the navigation
 *      call is silently dropped (React Navigation logs a warning) so the
 *      user is not stuck.
 *   3. The hook is cheap — it only reads from remoteConfig, subscribes to
 *      changes, and wraps a small render function. No extra fetches.
 *
 * Admin control lives at /dashboard/config → workflows → screens.
 */

import { useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import remoteConfig from '../services/remoteConfig';
import { useRemoteJson } from './useRemoteText';
import { colors, fontFamily } from '../theme';

const DEFAULT_DISABLED_COPY =
  "This feature is temporarily unavailable. We're looking into it — please try again later.";

/**
 * @param {string} screenName  Logical name matching the key in remote config
 * @param {object} navigation  React Navigation prop (for redirect + bail-out)
 * @returns {{
 *   blocked: boolean,
 *   reason: 'disabled' | 'redirect' | null,
 *   redirectTarget: string | null,
 *   render: () => React.ReactNode,
 * }}
 */
export default function useScreenGuard(screenName, navigation) {
  const screens = useRemoteJson('workflows.screens', {});
  const entry = (screens && screens[screenName]) || null;

  const disabled = entry?.disabled === true;
  const redirectTarget = typeof entry?.redirectTo === 'string' && entry.redirectTo
    ? entry.redirectTo
    : null;
  const disabledCopy = typeof entry?.disabledCopy === 'string' && entry.disabledCopy
    ? entry.disabledCopy
    : DEFAULT_DISABLED_COPY;

  // Redirect: fire-and-forget on mount. Guarded by a try/catch so a typo
  // in the config doesn't crash the app.
  useEffect(() => {
    if (!redirectTarget || !navigation?.replace) return;
    try {
      navigation.replace(redirectTarget);
    } catch (err) {
      // Let the screen render normally if the redirect target is bogus —
      // locking the user on a blank screen is worse than ignoring the config.
      console.warn(`[useScreenGuard] redirect to "${redirectTarget}" failed:`, err?.message);
    }
  }, [redirectTarget, navigation]);

  const goHome = useCallback(() => {
    try {
      navigation?.canGoBack?.() ? navigation.goBack() : navigation?.navigate?.('Home');
    } catch { /* last-resort no-op */ }
  }, [navigation]);

  const render = useCallback(() => (
    <View style={s.wrap}>
      <Text style={s.title}>Taking a break</Text>
      <Text style={s.body}>{disabledCopy}</Text>
      <TouchableOpacity style={s.btn} onPress={goHome} activeOpacity={0.8}>
        <Text style={s.btnText}>Back</Text>
      </TouchableOpacity>
    </View>
  ), [disabledCopy, goHome]);

  return useMemo(() => ({
    blocked: disabled || !!redirectTarget,
    reason: disabled ? 'disabled' : (redirectTarget ? 'redirect' : null),
    redirectTarget,
    render,
  }), [disabled, redirectTarget, render]);
}

// Minimal styles — keep in-hook so one import covers the disabled-state UI
// on every screen without forcing each screen to ship its own styling.
const s = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: fontFamily.semibold,
    color: colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: fontFamily.regular,
    color: colors.textMid,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 320,
  },
  btn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 999,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fontFamily.semibold,
    color: '#fff',
  },
});

/**
 * Remote config shape expected:
 *
 *   {
 *     "workflows": {
 *       "screens": {
 *         "PlanLoadingScreen": {
 *           "disabled": false,
 *           "redirectTo": null,
 *           "disabledCopy": "Plan generation is paused while we investigate an issue. Back in a few minutes."
 *         },
 *         "BeginnerProgramScreen": {
 *           "disabled": true,
 *           "disabledCopy": "Beginner programme is being updated. It'll be back tomorrow."
 *         },
 *         "ChangeCoachScreen": {
 *           "redirectTo": "Home"
 *         }
 *       }
 *     }
 *   }
 *
 * No entry = screen renders normally. Old clients without this hook simply
 * ignore the whole workflows section; this is a purely additive config key.
 */
