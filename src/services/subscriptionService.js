/**
 * Subscription service — checks Stripe subscription status and opens checkout.
 * Uses Stripe Checkout (hosted) via expo-web-browser, same pattern as OAuth.
 */
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { getSession } from './authService';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

async function authRequest(method, path, body) {
  try {
    const session = await getSession();
    const token = session?.access_token;
    if (!token) return null;

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Returns subscription status from the server.
 * Returns { active: true } in dev mode when Stripe is not configured.
 */
export async function getSubscriptionStatus() {
  const data = await authRequest('GET', '/api/stripe/subscription-status');
  return data || { active: false };
}

/**
 * Returns true if the user has an active or trialing subscription.
 */
export async function isSubscribed() {
  const status = await getSubscriptionStatus();
  return status.active === true;
}

/**
 * Opens Stripe Checkout in an in-app browser.
 * plan: 'monthly' | 'annual'
 * Returns { success: true } if the user completed payment, { success: false } if they cancelled.
 */
export async function openCheckout(plan) {
  const isWeb = Platform.OS === 'web';

  // On web, redirect back to the current origin so the browser can handle it.
  // On native, use the app deep-link scheme.
  const redirectBase = isWeb
    ? `${window.location.origin}/stripe`
    : 'etapa://stripe';

  const data = await authRequest('POST', '/api/stripe/create-checkout-session', { plan, redirectBase });
  if (!data?.url) throw new Error('Could not create checkout session. Please try again.');

  if (isWeb) {
    // On web, navigate the tab directly to Stripe Checkout.
    // The success URL will bring the user back to /stripe/success?session_id=xxx
    // which is handled by checkStripeReturn() below.
    window.location.href = data.url;
    return { success: false }; // App will detect return via checkStripeReturn()
  }

  // On native, open in-app browser and watch for the deep-link redirect
  const result = await WebBrowser.openAuthSessionAsync(data.url, 'etapa://stripe');

  if (result.type === 'success' && result.url?.includes('stripe/success')) {
    const params = new URLSearchParams(result.url.split('?')[1] || '');
    const sessionId = params.get('session_id');
    if (sessionId) {
      await authRequest('POST', '/api/stripe/verify-session', { sessionId });
    }
    return { success: true };
  }

  return { success: false };
}

/**
 * On web, call this on app startup to detect if the user just returned from
 * Stripe Checkout. Returns the verified session_id if successful, else null.
 *
 * Usage in App.js (web only):
 *   const sessionId = await checkStripeReturn();
 *   if (sessionId) { ... navigate to GoalSetup ... }
 */
export async function checkStripeReturn() {
  if (Platform.OS !== 'web') return null;

  const url = window.location.href;
  if (!url.includes('/stripe/success')) return null;

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  if (!sessionId) return null;

  // Clean the URL so a refresh doesn't re-trigger this
  window.history.replaceState({}, '', '/');

  await authRequest('POST', '/api/stripe/verify-session', { sessionId });
  return sessionId;
}
