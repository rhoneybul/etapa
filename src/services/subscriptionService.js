/**
 * Subscription service — unified interface for RevenueCat (native IAP).
 *
 * On iOS/Android: RevenueCat handles purchases and entitlement checks via App Store / Play Store.
 * Server-side subscription records are synced via RevenueCat webhooks to Supabase.
 */
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

  // Public endpoint — prices do not require auth.
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

// ── Subscription status ─────────────────────────────────────────────────────────

/**
 * Returns subscription status.
 *
 * The server (Supabase) is always the authoritative source — it is checked
 * first on every platform. RevenueCat is checked afterwards ONLY as a positive
 * supplement: if the server says inactive but RC says active, the user likely
 * just made an in-app purchase whose webhook hasn't reached the server yet.
 */
export async function getSubscriptionStatus() {
  // ── 1. Server check (always authoritative) ──────────────────────────────────
  const serverData = await authRequest('GET', '/api/subscription/status');

  if (serverData?.active) {
    return { ...serverData, source: 'server' };
  }

  // ── 2. RevenueCat fallback (native only, handles very-recent IAP) ───────────
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
      // Ignore RC errors — server result is our ground truth
    }
  }

  return serverData ? { ...serverData, source: 'server' } : { active: false };
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
 * Returns RevenueCat offerings (real App Store / Play Store prices).
 */
export async function getSubscriptionOfferings() {
  if (!isRevenueCatAvailable()) return null;
  return getOfferings();
}

/**
 * Purchase a subscription or lifetime access via RevenueCat / App Store / Play Store.
 *
 * @param {string} plan - 'monthly' | 'annual' | 'lifetime' | 'starter'
 * @param {object|null} rcPackage - RevenueCat package object (from getSubscriptionOfferings)
 * @returns {{ success: boolean, cancelled?: boolean, error?: string }}
 */
export async function openCheckout(plan, rcPackage = null) {
  if (!isRevenueCatAvailable()) {
    return { success: false, error: 'In-app purchases are temporarily unavailable. Please check your connection and try again.' };
  }
  if (!rcPackage) {
    return { success: false, error: 'Subscription products are loading. Please wait a moment and try again.' };
  }
  return purchasePackage(rcPackage);
}

/**
 * Restore purchases (triggers RevenueCat restore).
 */
export async function restorePurchases() {
  if (!isRevenueCatAvailable()) {
    return { success: false, error: 'Not available' };
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
  const data = await authRequest('POST', '/api/subscription/start-trial');
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

// ── Billing / subscription management ───────────────────────────────────────────

/**
 * Opens the native subscription management UI so the user can cancel or modify.
 *
 * iOS 15+: native in-app sheet (user never leaves the app).
 * Android: opens Play Store subscription management.
 * Fallback: opens App Store / Play Store subscriptions page.
 */
export async function openBillingPortal() {
  await rcShowManageSubscriptions();
}
