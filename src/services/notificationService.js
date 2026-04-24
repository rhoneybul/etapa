/**
 * Push notification service — handles Expo push token registration,
 * permission requests, and notification listeners.
 *
 * Uses expo-notifications (Expo SDK 55).
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { api } from './api';
import analytics from './analyticsService';

// ── Foreground-focus gate ─────────────────────────────────────────────────
// Screens can set this to their route name while mounted; when a push
// arrives we drop the banner if the screen that owns that notification
// type is already on screen. Prevents the "your coach replied" push from
// appearing on top of the chat you're literally looking at. Kept simple —
// `null` means "not on any silenced screen".
let focusedScreen = null;
export function setFocusedScreen(name) { focusedScreen = name; }

// Configure how notifications appear when the app is in the foreground.
// Drops the banner when the user is already viewing the screen that owns
// this notification type — e.g. `coach_reply` on the CoachChat screen.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification?.request?.content?.data;
    const type = data?.type;
    // Silent-in-context rules:
    //   coach_reply → don't interrupt if already in CoachChat
    //   coach_checkin → same (already talking to the coach)
    //   support_reply / admin_reply → don't interrupt if in SupportChat
    const silent = (
      (type === 'coach_reply' && focusedScreen === 'CoachChat') ||
      (type === 'coach_checkin' && focusedScreen === 'CoachChat') ||
      ((type === 'support_reply' || type === 'admin_reply') && focusedScreen === 'SupportChat')
    );
    return {
      shouldShowAlert: !silent,
      shouldPlaySound: !silent,
      shouldSetBadge: true,
    };
  },
});

/**
 * Register for push notifications:
 * 1. Check if physical device
 * 2. Request permission
 * 3. Get Expo push token
 * 4. Send to server
 */
export async function registerForPushNotifications() {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('[notifications] Not a physical device — skipping push registration');
    analytics.capture?.('push_registration_outcome', { outcome: 'not_device' });
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[notifications] Push notification permission denied');
    analytics.capture?.('push_registration_outcome', { outcome: 'permission_denied' });
    return null;
  }

  // Get Expo push token
  let token = null;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    token = tokenData.data;
    console.log('[notifications] Expo push token:', token);
  } catch (err) {
    console.warn('[notifications] Failed to get push token:', err);
    // Telemetry so we can see silent Expo-side token-fetch failures
    // server-side (previously these went to console with no signal).
    analytics.capture?.('push_registration_outcome', {
      outcome: 'expo_token_fetch_failed',
      error: err?.message || String(err),
    });
    return null;
  }

  // Register token with our server. Split out from the fetch so we can
  // distinguish "Expo gave us a token but our server wouldn't accept it"
  // (diagnostic gold) from "couldn't even get a token from Expo".
  try {
    await api.notifications.registerToken({
      token,
      platform: Platform.OS,
    });
    analytics.capture?.('push_registration_outcome', { outcome: 'registered' });
    return token;
  } catch (err) {
    console.warn('[notifications] Server token-register failed:', err);
    analytics.capture?.('push_registration_outcome', {
      outcome: 'server_register_failed',
      error: err?.message || String(err),
    });
    return null;
  }
}

/**
 * Snapshot of the device's push-notification readiness — used by the
 * Settings debug row so a user can self-check whether they'd receive a
 * coach reply push right now. Doesn't mutate anything; returns the same
 * data for display that `registerForPushNotifications` uses internally.
 */
export async function getPushStatus() {
  const status = {
    isDevice: !!Device.isDevice,
    permission: null,
    hasToken: false,
    projectId: null,
  };
  try {
    const perm = await Notifications.getPermissionsAsync();
    status.permission = perm?.status || 'unknown';
  } catch {}
  status.projectId = Constants.expoConfig?.extra?.eas?.projectId || null;
  if (status.isDevice && status.permission === 'granted' && status.projectId) {
    try {
      const t = await Notifications.getExpoPushTokenAsync({ projectId: status.projectId });
      status.hasToken = !!t?.data;
      status.tokenPreview = t?.data ? `${t.data.slice(0, 20)}…` : null;
    } catch (err) {
      status.tokenError = err?.message || String(err);
    }
  }
  return status;
}

/**
 * Add a listener for when a notification is received while the app is open.
 */
export function addNotificationReceivedListener(callback) {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add a listener for when the user taps on a notification.
 */
export function addNotificationResponseListener(callback) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Get the badge count.
 */
export async function getBadgeCount() {
  return Notifications.getBadgeCountAsync();
}

/**
 * Set the badge count.
 */
export async function setBadgeCount(count) {
  return Notifications.setBadgeCountAsync(count);
}
