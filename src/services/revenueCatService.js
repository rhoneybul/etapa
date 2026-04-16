/**
 * RevenueCat service — wraps react-native-purchases for native IAP.
 *
 * RevenueCat is the source of truth for subscription status on native (iOS/Android).
 * On web, we fall back to Stripe Checkout (handled in subscriptionService.js).
 *
 * Product identifiers (update these in RevenueCat dashboard):
 *   Entitlement: "pro"
 *   Packages: "$rc_monthly", "$rc_annual", "lifetime"
 */
import { Platform } from 'react-native';

// RevenueCat SDK — only available on native
let Purchases = null;
let PURCHASES_AVAILABLE = false;

if (Platform.OS !== 'web') {
  try {
    Purchases = require('react-native-purchases').default;
    PURCHASES_AVAILABLE = true;
  } catch {
    console.warn('[RevenueCat] react-native-purchases not available');
  }
}

// ── Configuration ──────────────────────────────────────────────────────────────

const RC_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || 'test_DqQuhwGTMtAqxndAxlWKFSzvDYH';
const RC_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || 'YOUR_GOOGLE_PLAY_RC_KEY';
const ENTITLEMENT_ID = 'pro';

let isConfigured = false;

/**
 * Initialise RevenueCat. Call once at app startup (e.g. in App.js).
 * @param {string|null} userId - Supabase user ID for cross-platform identity.
 */
export async function configureRevenueCat(userId) {
  if (!PURCHASES_AVAILABLE || isConfigured) return;

  try {
    const apiKey = Platform.OS === 'ios' ? RC_IOS_API_KEY : RC_ANDROID_API_KEY;
    Purchases.configure({ apiKey, appUserID: userId || null });
    isConfigured = true;
    console.log('[RevenueCat] Configured for', Platform.OS);
  } catch (err) {
    console.error('[RevenueCat] Configuration error:', err);
  }
}

/**
 * Log in / identify the user after auth.
 * Links RevenueCat anonymous ID to your Supabase user ID.
 */
export async function loginRevenueCat(userId) {
  if (!PURCHASES_AVAILABLE || !isConfigured || !userId) return;
  try {
    const { customerInfo } = await Purchases.logIn(userId);
    return customerInfo;
  } catch (err) {
    console.error('[RevenueCat] Login error:', err);
    return null;
  }
}

/**
 * Log out the user (resets to anonymous) and invalidate cached entitlements.
 * Call this on sign-out AND account deletion so the next login starts clean.
 */
export async function logoutRevenueCat() {
  if (!PURCHASES_AVAILABLE || !isConfigured) return;
  try {
    await Purchases.logOut();
  } catch (err) {
    console.error('[RevenueCat] Logout error:', err);
  }
  // Force the next getCustomerInfo / checkEntitlement to hit the server
  // rather than returning stale cached data.
  try {
    await Purchases.invalidateCustomerInfoCache();
  } catch (err) {
    // invalidateCustomerInfoCache may not exist on older SDK versions
    console.warn('[RevenueCat] Could not invalidate cache:', err);
  }
}

// ── Entitlement checks ─────────────────────────────────────────────────────────

/**
 * Check if the user has the "pro" entitlement (active subscription or lifetime).
 * Returns { active, plan, expirationDate } or { active: false }.
 */
export async function checkEntitlement() {
  if (!PURCHASES_AVAILABLE || !isConfigured) {
    return { active: false, reason: 'not_available' };
  }

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];

    if (!entitlement) {
      return { active: false };
    }

    return {
      active: true,
      plan: identifyPlan(entitlement.productIdentifier),
      expirationDate: entitlement.expirationDate,  // null for lifetime
      isLifetime: entitlement.expirationDate === null,
      willRenew: entitlement.willRenew,
      productIdentifier: entitlement.productIdentifier,
      store: entitlement.store,  // 'app_store', 'play_store', 'stripe'
    };
  } catch (err) {
    console.error('[RevenueCat] Check entitlement error:', err);
    return { active: false, reason: 'error' };
  }
}

/**
 * Map a product identifier to a plan name.
 */
function identifyPlan(productId) {
  if (!productId) return 'unknown';
  const id = productId.toLowerCase();
  if (id.includes('lifetime')) return 'lifetime';
  if (id.includes('annual') || id.includes('yearly')) return 'annual';
  if (id.includes('monthly')) return 'monthly';
  if (id.includes('starter')) return 'starter';
  return 'unknown';
}

// ── Offerings & Purchases ──────────────────────────────────────────────────────

/**
 * Fetch current offerings (products + prices) from RevenueCat.
 * Returns the "default" offering's packages, or null.
 */
export async function getOfferings() {
  if (!PURCHASES_AVAILABLE || !isConfigured) return null;

  try {
    const offerings = await Purchases.getOfferings();
    if (!offerings.current) return null;

    return {
      identifier: offerings.current.identifier,
      packages: offerings.current.availablePackages.map(pkg => ({
        identifier: pkg.identifier,
        productId: pkg.product.identifier,
        title: pkg.product.title,
        description: pkg.product.description,
        price: pkg.product.price,
        priceString: pkg.product.priceString,
        currencyCode: pkg.product.currencyCode,
        // For subscriptions
        introPrice: pkg.product.introPrice,
        // Raw package for purchasing
        _package: pkg,
      })),
    };
  } catch (err) {
    console.error('[RevenueCat] Get offerings error:', err);
    return null;
  }
}

/**
 * Purchase a specific package.
 * @param {object} pkg - A package object from getOfferings() (the _package field).
 * @returns {{ success: boolean, customerInfo?: object, error?: string }}
 */
export async function purchasePackage(pkg) {
  if (!PURCHASES_AVAILABLE || !isConfigured) {
    return { success: false, error: 'RevenueCat not available' };
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];

    if (entitlement) {
      return { success: true, customerInfo };
    }

    return { success: false, error: 'Purchase completed but entitlement not found' };
  } catch (err) {
    // User cancelled
    if (err.userCancelled) {
      return { success: false, cancelled: true };
    }
    console.error('[RevenueCat] Purchase error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Restore purchases (e.g. after reinstall or device switch).
 * @returns {{ success: boolean, active: boolean }}
 */
export async function restorePurchases() {
  if (!PURCHASES_AVAILABLE || !isConfigured) {
    return { success: false, error: 'RevenueCat not available' };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
    return { success: true, active: !!entitlement };
  } catch (err) {
    console.error('[RevenueCat] Restore purchases error:', err);
    return { success: false, error: err.message };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/**
 * Returns true if RevenueCat is available (native platform + SDK loaded).
 */
export function isRevenueCatAvailable() {
  return PURCHASES_AVAILABLE;
}

/**
 * Returns true if RevenueCat is configured and ready.
 */
export function isRevenueCatConfigured() {
  return PURCHASES_AVAILABLE && isConfigured;
}
