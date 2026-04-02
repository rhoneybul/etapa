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

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
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
    return null;
  }

  // Get Expo push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = tokenData.data;
    console.log('[notifications] Expo push token:', token);

    // Register token with our server
    await api.notifications.registerToken({
      token,
      platform: Platform.OS,
    });

    return token;
  } catch (err) {
    console.warn('[notifications] Failed to get push token:', err);
    return null;
  }
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
