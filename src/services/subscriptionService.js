/**
 * Subscription service — unified interface for RevenueCat (native) and Stripe (web).
 *
 * On iOS/Android: RevenueCat handles purchases and entitlement checks via App Store / Play Store.
 * On web: Stripe Checkout handles purchases, server checks entitlements via Supabase.
 *
 * RevenueCat is configured as a wrapper over Stripe, so both native IAP and Stripe
 * web purchases are tracked in RevenueCat's dashboard.
 */
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { getSession } from './authService';
import {
  isRevenueCatAvailable,
  checkEntitlement,
  getOfferings,
  purchasePackage,
  restorePurchases as rcRestore,
  showManageSubscriptions as rcShowManageSubscriptions,
} from './revenueCatService';

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

// ── Prices ──────────────────────────────────────────────────────────────────────

let _pricesCache = null;
let _pricesCacheTime = 0;
const PRICES_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetch live prices from the server (app-configured pricing).
 * Cached for 1 hour in memory.
 * Returns { monthly, annual, lifetime, starter } with amount, formatted, etc.
 */
export async function getPrices(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _pricesCache && (now - _pricesCacheTime) < PRICES_CACHE_TTL) {
    return _pricesCache;
  }

  // Public endpoint so pricing does not depend on Stripe.
  // Sourced from app_config.pricing_config (server-side), with sensible defaults.
  const data = await authRequest('GET', '/api/public/prices');
  if (data && !data.error) {
    _pricesCache = data;
    _pricesCacheTime = now;
    return data;
  }

  // Return cached data if available, even if stale
  if (_pricesCache) return _pricesCache;

  // Offline/error fallback
  return null;
}

/**
 * Validate a promo code and get discount info.
 * @param {string} code - promo code string or promo ID (promo_xxx)
 * @param {string} [plan] - optional plan to calculate discounted price
 * @returns {{ valid, promoId, label, discountedFormatted, ... } | null}
 */
export async function validatePromo(code, plan) {
  const data = await authRequest('POST', '/api/stripe/validate-promo', { code, plan });
  return data;
}

// ── Subscription status ─────────────────────────────────────────────────────────

/**
 * Returns subscription status.
 * Native: checks RevenueCat entitlements first, falls back to server.
 * Web: checks server (Stripe via Supabase).
 */
export async function getSubscriptionStatus() {
  // On native, try RevenueCat first
  if (isRevenueCatAvailable()) {
    try {
      const rc = await checkEntitlement();
      if (rc.active) {
        return {
          active: true,
          status: rc.isLifetime ? 'paid' : 'active',
          plan: rc.plan,
          currentPeriodEnd: rc.expirationDate,
          store: rc.store,
          source: 'revenuecat',
        };
      }
    } catch {
      // Fall through to server check
    }
  }

  // Fall back to server (Stripe/Supabase)
  const data = await authRequest('GET', '/api/stripe/subscription-status');
  return data ? { ...data, source: 'stripe' } : { active: false };
}

/**
 * Returns true if the user has an active or trialing subscription.
 * Set EXPO_PUBLIC_PAYWALL_DISABLED=true to bypass in development.
 */
export async function isSubscribed() {
  if (process.env.EXPO_PUBLIC_PAYWALL_DISABLED === 'true') return true;
  const status = await getSubscriptionStatus();
  return status.active === true;
}

// ── Purchases ───────────────────────────────────────────────────────────────────

/**
 * Get available subscription offerings.
 * Native: returns RevenueCat offerings (real App Store / Play Store prices).
 * Web: returns null (web uses hardcoded prices in PaywallScreen).
 */
export async function getSubscriptionOfferings() {
  if (!isRevenueCatAvailable()) return null;
  return getOfferings();
}

/**
 * Purchase a subscription or lifetime access.
 *
 * On native (iOS/Android): uses RevenueCat to trigger native IAP.
 * On web: opens Stripe Checkout in a browser.
 *
 * @param {string} plan - 'monthly' | 'annual' | 'lifetime' | 'starter'
 * @param {object|null} rcPackage - RevenueCat package object (native only, from getSubscriptionOfferings)
 * @param {string|null} promoCode - optional Stripe promo code ID or code string
 * @returns {{ success: boolean, cancelled?: boolean, error?: string }}
 */
export async function openCheckout(plan, rcPackage = null, promoCode = null) {
  // ── Native (iOS & Android): use RevenueCat / App Store / Play Store IAP ──
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    if (!isRevenueCatAvailable()) {
      return { success: false, error: 'In-app purchases are temporarily unavailable. Please check your connection and try again.' };
    }
    if (!rcPackage) {
      return { success: false, error: 'Subscription products are loading. Please wait a moment and try again.' };
    }
    const result = await purchasePackage(rcPackage);
    return result;
  }

  // ── Web: use Stripe Checkout ──────────────────────────────────────────────
  const redirectBase = `${window.location.origin}/stripe`;

  const data = await authRequest('POST', '/api/stripe/create-checkout-session', { plan, redirectBase, promoCode });
  if (!data?.url) throw new Error('Could not create checkout session. Please try again.');

  window.location.href = data.url;
  return { success: false }; // App will detect return via checkStripeReturn()
}

/**
 * Restore purchases (native only — triggers RevenueCat restore).
 * On web, this is a no-op.
 */
export async function restorePurchases() {
  if (!isRevenueCatAvailable()) {
    return { success: false, error: 'Not available on web' };
  }
  return rcRestore();
}

// ── Free trial ────────────────────────────────────────────────────────────────────

/**
 * Start a 7-day free trial without requiring payment upfront.
 * The server creates a subscription record with status 'trialing'.
 * @returns {{ success: boolean, trialEnd?: string, error?: string }}
 */
export async function startFreeTrial() {
  const data = await authRequest('POST', '/api/stripe/start-trial');
  if (!data) return { success: false, error: 'Could not start trial. Please try again.' };
  return data;
}

// ── Coupon redemption ───────────────────────────────────────────────────────────

/**
 * Validate a coupon code against the backend (no side effects).
 * @returns {{ valid: boolean, plan?: string, message: string }}
 */
export async function validateCoupon(code) {
  const data = await authRequest('POST', '/api/coupons/validate', { code });
  return data || { valid: false, message: 'Could not validate code' };
}

/**
 * Redeem a coupon code — grants access and records the redemption.
 * @returns {{ success: boolean, plan?: string, error?: string }}
 */
export async function redeemCoupon(code) {
  const data = await authRequest('POST', '/api/coupons/redeem', { code });
  return data || { success: false, error: 'Could not redeem coupon' };
}

// ── Starter plan flows ──────────────────────────────────────────────────────────

/**
 * Upgrades a starter plan to annual — issues pro-rata refund and opens checkout with 50% off.
 * Returns { success, refundAmount, daysRemaining } on success, { success: false } on cancel.
 */
export async function upgradeStarter() {
  const isNative = Platform.OS !== 'web';

  // On native, upgrade must go through IAP — direct to App Store subscriptions
  if (isNative) {
    const { Linking } = require('react-native');
    if (Platform.OS === 'ios') {
      await Linking.openURL('https://apps.apple.com/account/subscriptions');
    } else {
      await Linking.openURL('https://play.google.com/store/account/subscriptions');
    }
    return { success: false };
  }

  // On web, use Stripe
  const redirectBase = `${window.location.origin}/stripe`;
  const data = await authRequest('POST', '/api/stripe/upgrade-starter', { redirectBase });
  if (!data?.url) throw new Error('Could not start upgrade. Please try again.');

  window.location.href = data.url;
  return { success: false };
}

/**
 * Requests a full refund for the starter plan.
 * Only available within 16 days of the plan start date.
 * Returns { ok, refundedAmount } on success.
 */
export async function refundStarter(planStartDate) {
  const data = await authRequest('POST', '/api/stripe/refund-starter', { planStartDate });
  if (!data) throw new Error('Could not process refund. Please try again.');
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Requests a full refund for the lifetime plan.
 * Only available within 16 days of purchase.
 * Returns { ok, refundedAmount } on success.
 */
export async function refundLifetime() {
  const data = await authRequest('POST', '/api/stripe/refund-lifetime');
  if (!data) throw new Error('Could not process refund. Please try again.');
  if (data.error) throw new Error(data.error);
  return data;
}

// ── Billing portal ──────────────────────────────────────────────────────────────

/**
 * Opens the subscription management UI so the user can cancel or modify their subscription.
 *
 * On iOS/Android: uses RevenueCat's showManageSubscriptions(), which presents a native
 * in-app sheet on iOS 15+ (user never leaves the app), or falls back to the App Store /
 * Play Store subscriptions page on older OS versions.
 *
 * On web: opens the Stripe Customer Portal.
 */
export async function openBillingPortal() {
  const isNative = Platform.OS !== 'web';

  // On native, use RevenueCat's native subscription management sheet
  if (isNative) {
    await rcShowManageSubscriptions();
    return;
  }

  // On web, open Stripe billing portal
  const returnUrl = `${window.location.origin}`;
  const data = await authRequest('POST', '/api/stripe/create-portal-session', { returnUrl });
  if (!data?.url) throw new Error('Could not open billing portal. Please try again.');
  window.location.href = data.url;
}

// ── Web return handler ──────────────────────────────────────────────────────────

/**
 * On web, call this on app startup to detect if the user just returned from
 * Stripe Checkout. Returns the verified session_id if successful, else null.
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
