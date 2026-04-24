/**
 * Paywall screen — shown before plan generation.
 * Monthly: £7.99/mo · Annual: £49.99/yr (= £4.17/mo) · Lifetime: £99.99 · 1 week free trial.
 *
 * Purchases are handled via RevenueCat (Apple IAP / Google Play).
 * Display prices are fetched from the server (admin console); hardcoded defaults
 * are only used as a last-resort offline fallback.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Image, Platform, TextInput, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import useScreenGuard from '../hooks/useScreenGuard';
// validateCoupon / redeemCoupon intentionally NOT imported here. The
// in-app "Enter coupon code" UI was removed (April 2026) to comply with
// App Store Review Guideline 3.1.1 — Apple disallows unlocking paid
// functionality through any non-IAP mechanism from inside the app.
// The server-side coupon endpoints remain so pre-signup grants keep
// auto-redeeming silently on signup, but the user-facing code-entry
// surface has been removed. See server/src/routes/coupons.js.
import { openCheckout, getSubscriptionOfferings, restorePurchases, getPrices, startFreeTrial } from '../services/subscriptionService';
import { isRevenueCatAvailable } from '../services/revenueCatService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

// Plan display metadata — prices come from the server (admin console).
// The defaultPrice / defaultSub / defaultTrialLine values are only used
// as an offline fallback if the server can't be reached.
const PLAN_META = {
  starter: {
    id: 'starter',
    label: 'Starter',
    defaultPrice: '£14.99',
    per: '',
    defaultSub: 'One-time payment · 3 months access',
    badge: null,
    defaultTrialLine: 'One-time payment · No recurring charges',
    isStarter: true,
  },
  lifetime: {
    id: 'lifetime',
    label: 'Lifetime',
    defaultPrice: '£99.99',
    per: '',
    defaultSub: 'One-time payment · Forever yours',
    badge: 'LAUNCH SPECIAL',
    defaultTrialLine: '7-day full refund guarantee',
    isLifetime: true,
  },
  annual: {
    id: 'annual',
    label: 'Annual',
    defaultPrice: '£49.99',
    per: '/yr',
    defaultSub: '£4.17/mo',
    badge: 'MOST POPULAR',
    defaultTrialLine: '7-day free trial, then £49.99/year',
  },
  monthly: {
    id: 'monthly',
    label: 'Monthly',
    defaultPrice: '£7.99',
    per: '/mo',
    defaultSub: 'Billed monthly',
    badge: null,
    defaultTrialLine: '7-day free trial, then £7.99/month',
  },
};

/** Format a trial period from RevenueCat's introPrice into a human-readable string.
 *  Returns e.g. "7-day free trial" or "1-week free trial". */
function formatTrialPeriod(introPrice) {
  if (!introPrice || introPrice.price !== 0) return null; // not a free trial
  const n = introPrice.periodNumberOfUnits || 0;
  const unit = (introPrice.periodUnit || '').toLowerCase();
  if (!n || !unit) return '7-day free trial';
  if (unit === 'day')   return `${n}-day free trial`;
  if (unit === 'week')  return n === 1 ? '1-week free trial' : `${n}-week free trial`;
  if (unit === 'month') return n === 1 ? '1-month free trial' : `${n}-month free trial`;
  return '7-day free trial';
}

/** Build display plans from RevenueCat offerings (native only).
 *  Uses the App Store / Play Store priceString — always accurate and localised.
 *  Also reads introPrice to show the correct trial period.
 *  Falls back to hardcoded defaults for any plan not found in the offering. */
function buildPlansFromRC(rcPackages) {
  const findPkg = (key) => rcPackages?.find(p => {
    const id = (p.identifier || '').toLowerCase();
    const productId = (p.productId || '').toLowerCase();
    if (key === 'monthly') return id === '$rc_monthly' || productId.includes('monthly');
    if (key === 'annual') return id === '$rc_annual' || productId.includes('annual') || productId.includes('yearly');
    if (key === 'lifetime') return id === 'lifetime' || id === '$rc_lifetime' || productId.includes('lifetime');
    if (key === 'starter') return id === 'starter' || id === '$rc_starter' || productId.includes('starter');
    return false;
  });

  const plans = {};
  for (const [key, meta] of Object.entries(PLAN_META)) {
    const pkg = findPkg(key);
    if (pkg) {
      const trial = formatTrialPeriod(pkg.introPrice);
      let sub = meta.defaultSub;
      let trialLine = meta.defaultTrialLine;

      if (key === 'annual') {
        const monthlyAmount = pkg.price / 12;
        const currencySymbol = (pkg.priceString || '').replace(/[\d.,\s]/g, '')[0] || '';
        const monthlyStr = `${currencySymbol}${monthlyAmount.toFixed(2)}`;
        sub = `${monthlyStr}/mo`;
        trialLine = trial ? `${trial}, then ${pkg.priceString}/year` : `then ${pkg.priceString}/year`;
      } else if (key === 'monthly') {
        sub = 'Billed monthly';
        trialLine = trial ? `${trial}, then ${pkg.priceString}/month` : `then ${pkg.priceString}/month`;
      } else if (key === 'starter') {
        sub = `One-time payment · 3 months access`;
        trialLine = `One-time payment · No recurring charges`;
      }

      plans[key] = { ...meta, price: pkg.priceString, per: meta.per, sub, trialLine };
    } else {
      plans[key] = { ...meta, price: meta.defaultPrice, sub: meta.defaultSub, trialLine: meta.defaultTrialLine };
    }
  }
  return plans;
}

/** Build display plans from server prices (admin-configured), with offline defaults.
 *  Apple requires the billed amount to be the most prominent pricing element,
 *  so annual shows £79.99/yr as the main price with £6.67/mo as the subtitle. */
function buildPlans(serverPrices) {
  const plans = {};
  for (const [key, meta] of Object.entries(PLAN_META)) {
    const sp = serverPrices?.[key];
    if (sp) {
      // For annual: main price = billed amount, sub = per-month equivalent
      const price = sp.interval === 'year' ? sp.formatted : (sp.perMonth || sp.formatted);
      const per = sp.interval === 'year' ? '/yr' : meta.per;
      const sub = sp.interval === 'year' && sp.perMonth
        ? `${sp.perMonth}/mo`
        : (sp.billedLabel || meta.defaultSub);

      plans[key] = {
        ...meta,
        price,
        per,
        sub,
        trialLine: meta.isLifetime
          ? '7-day full refund guarantee'
          : sp.interval === 'year'
            ? `then ${sp.formatted}/year`
            : sp.interval === 'month'
              ? `then ${sp.formatted}/month`
              : meta.defaultTrialLine,
      };
    } else {
      plans[key] = { ...meta, price: meta.defaultPrice, sub: meta.defaultSub, trialLine: meta.defaultTrialLine };
    }
  }
  return plans;
}

const FEATURES = [
  'AI-generated training plans',
  'Coach chat & real-time edits',
  'Progress tracking & calendar',
  'Multiple coaches to choose from',
];

export default function PaywallScreen({ navigation, route }) {
  const _screenGuard = useScreenGuard('PaywallScreen', navigation);
  const [selected, setSelected] = useState(route?.params?.defaultPlan || 'lifetime');
  const [loading, setLoading] = useState(false);
  const [rcOfferings, setRcOfferings] = useState(null); // RevenueCat packages (native only)
  const [restoring, setRestoring] = useState(false);
  const [plans, setPlans] = useState(() => buildPlans(null));
  const [serverPrices, setServerPrices] = useState(null);
  // Coupon state removed — see the import block above. Any future
  // discount / grant flow has to go through Apple's Offer Codes API or
  // a silent pre-signup grant (see server/src/routes/users.js).

  // RevenueCat handles all purchases via App Store / Play Store
  const hasRevenueCat = isRevenueCatAvailable();

  // Where to go after successful subscription (default: Home)
  const nextScreen = route?.params?.nextScreen || 'Home';
  const nextParams = route?.params?.nextParams || {};

  // The entry point that brought the user to the paywall — essential for
  // segmenting paywall conversion rate by source (onboarding, settings,
  // feature gate, etc).
  const paywallSource = route?.params?.source || 'unknown';
  // Track whether the user actually completed a purchase — used by the
  // dismissal event to distinguish "bailed" from "completed".
  const purchasedRef = useRef(false);

  // paywall_viewed — single highest-value event on this screen. Fires once
  // per mount with the entry source and the default tier selected.
  useEffect(() => {
    analytics.events.paywallViewed({
      source: paywallSource,
      defaultTier: route?.params?.defaultPlan || 'lifetime',
    });
    // When the screen unmounts, if the user didn't purchase, it's a dismissal.
    return () => {
      if (!purchasedRef.current) {
        analytics.events.paywallDismissed({
          source: paywallSource,
          tierAtExit: selectedRef.current,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the latest selected tier in a ref so the unmount cleanup above
  // can access the current value (useEffect cleanups close over initial state).
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Fetch live prices from server on mount.
  // Server prices (GBP, admin-configured) are used for display.
  // RevenueCat packages are fetched separately for the purchase transaction.
  useEffect(() => {
    getPrices().then(prices => {
      if (prices) {
        setServerPrices(prices);
        setPlans(buildPlans(prices));
      }
    }).catch(() => {});
  }, []);

  // Fetch RevenueCat offerings on mount.
  // RC packages are needed for the purchase transaction (openCheckout),
  // display prices come from the server so they always show in GBP.
  useEffect(() => {
    if (!hasRevenueCat) return;
    getSubscriptionOfferings().then(offerings => {
      if (offerings?.packages) {
        setRcOfferings(offerings.packages);
      }
    }).catch(() => {});
  }, [hasRevenueCat]);

  /**
   * Find the RevenueCat package matching the selected plan.
   * Matches on package identifier or product ID.
   */
  const findRcPackage = (planId) => {
    if (!rcOfferings) return null;
    return rcOfferings.find(pkg => {
      const id = (pkg.identifier || '').toLowerCase();
      const productId = (pkg.productId || '').toLowerCase();
      if (planId === 'monthly') return id === '$rc_monthly' || productId.includes('monthly');
      if (planId === 'annual') return id === '$rc_annual' || productId.includes('annual') || productId.includes('yearly');
      if (planId === 'lifetime') return id === 'lifetime' || id === '$rc_lifetime' || productId.includes('lifetime');
      if (planId === 'starter') return id === 'starter' || id === '$rc_starter' || productId.includes('starter');
      return false;
    });
  };

  // handleCouponValidate / handleCouponRedeem removed — the coupon UI
  // was pulled to satisfy App Store Review 3.1.1. Any future "redeem a
  // code" flow must go through Apple Offer Codes (Purchases.present-
  // CodeRedemptionSheet), not a custom input box.

  const handleSubscribe = async () => {
    setLoading(true);
    analytics.capture?.('paywall_subscribe_tapped', {
      plan: selected,
      source: 'revenuecat',
    });

    try {
      // Use RevenueCat package for the purchase.
      // If offerings haven't loaded yet, retry fetching them before giving up.
      let rcPkg = findRcPackage(selected);
      if (!rcPkg) {
        try {
          const offerings = await getSubscriptionOfferings();
          if (offerings?.packages) {
            setRcOfferings(offerings.packages);
            rcPkg = offerings.packages.find(pkg => {
              const id = (pkg.identifier || '').toLowerCase();
              const productId = (pkg.productId || '').toLowerCase();
              if (selected === 'monthly') return id === '$rc_monthly' || productId.includes('monthly');
              if (selected === 'annual') return id === '$rc_annual' || productId.includes('annual') || productId.includes('yearly');
              if (selected === 'lifetime') return id === 'lifetime' || id === '$rc_lifetime' || productId.includes('lifetime');
              if (selected === 'starter') return id === 'starter' || id === '$rc_starter' || productId.includes('starter');
              return false;
            });
          }
        } catch { /* proceed with rcPkg = null */ }
      }
      const result = await openCheckout(selected, rcPkg?._package || null);

      if (result.cancelled) {
        // User cancelled the Apple/Google sheet — stay on paywall silently.
        // Still track the cancel so we can see how often users back out of checkout.
        analytics.events.purchaseCancelled({
          plan: selected, source: 'revenuecat', paywallSource,
        });
      } else if (result.success) {
        analytics.capture('subscription_started', { plan: selected, source: 'revenuecat' });
        analytics.events.purchaseCompleted({
          plan: selected, source: 'revenuecat', paywallSource,
        });
        purchasedRef.current = true;
        navigation.replace(nextScreen, nextParams);
      } else if (result.error) {
        analytics.events.purchaseFailed({
          plan: selected, source: 'revenuecat', reason: result.error, paywallSource,
        });
        Alert.alert('Something went wrong', result.error);
      }
    } catch (err) {
      analytics.events.purchaseFailed({
        plan: selected, source: 'revenuecat', reason: err?.message || 'exception', paywallSource,
      });
      Alert.alert('Something went wrong', err.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.active) {
        analytics.capture('purchases_restored', { paywallSource });
        purchasedRef.current = true; // Don't count this as a dismissal.
        Alert.alert('Purchases restored', 'Welcome back! Your subscription is active.', [
          { text: 'Continue', onPress: () => navigation.replace(nextScreen, nextParams) },
        ]);
      } else {
        Alert.alert('No purchases found', 'We couldn\'t find any previous purchases for this account.');
      }
    } catch {
      Alert.alert('Restore failed', 'Something went wrong. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const handleClose = () => {
    // If we can go back, just go back.
    // Otherwise dismiss the paywall and start the free preview.
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace(nextScreen, { ...nextParams, freePreview: true });
    }
  };

  const [skipping, setSkipping] = useState(false);

  const handleSkipTrial = async () => {
    setSkipping(true);
    try {
      const result = await startFreeTrial();
      if (result.success || result.alreadyActive) {
        analytics.capture('free_trial_started', { source: 'paywall_skip', paywallSource });
        purchasedRef.current = true; // Free trial start = paywall converted, not dismissed.
        navigation.replace(nextScreen, nextParams);
      } else {
        Alert.alert('Could not start trial', result.error || 'Please try again.');
      }
    } catch {
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setSkipping(false);
    }
  };

  const plan = plans[selected];

  if (_screenGuard.blocked) return _screenGuard.render();

  return (
    <SafeAreaView style={s.container}>
      {/* Back button */}
      <TouchableOpacity style={s.backBtn} onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={s.backBtnText}>{'\u2190'}</Text>
      </TouchableOpacity>
      {/* Close button */}
      <TouchableOpacity style={s.closeBtn} onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={s.closeBtnText}>✕</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.eyebrow}>ETAPA PELOTON</Text>
          <Text style={s.title}>{plans[selected]?.isStarter ? 'Get into cycling' : 'Train smarter,'}{'\n'}{plans[selected]?.isStarter ? 'with Etapa.' : 'start free.'}</Text>
          <Text style={s.subtitle}>{plans[selected]?.isStarter ? '3 months access · One-time payment' : '7-day free trial · No charge today'}</Text>
        </View>

        {/* Plan cards — filter based on entry flow */}
        <View style={s.plans}>
          {Object.values(plans).filter(p => {
            const dp = route?.params?.defaultPlan;
            // Beginner flow: show only the starter plan
            if (dp === 'starter') return p.id === 'starter';
            // Normal flow: hide starter (it's a beginner-specific plan)
            return p.id !== 'starter';
          }).map(p => {
            const isSelected = selected === p.id;
            // Use hardcoded/server price for display; rcPkg is used only for the purchase transaction.
            // (Previously had a `couponMakesFree` branch that swapped the price to £0.00 when a
            // coupon matched — removed along with the rest of the in-app coupon flow.)
            const rcPkg = findRcPackage(p.id);
            const displayPrice = p.price;
            const displayPer = p.per;

            return (
              <TouchableOpacity
                key={p.id}
                style={[s.planCard, isSelected && s.planCardSelected]}
                onPress={() => {
                  // Don't spam the event if the user taps the already-selected tier.
                  if (selected !== p.id) {
                    analytics.events.paywallTierSelected(p.id, selected);
                  }
                  setSelected(p.id);
                }}
                activeOpacity={0.8}
              >
                {/* Badge */}
                {p.badge && (
                  <View style={s.badgeWrap}>
                    <View style={[s.badge, p.isLifetime && s.badgeLifetime]}>
                      <Text style={s.badgeText}>{p.badge}</Text>
                    </View>
                  </View>
                )}

                <View style={s.planRow}>
                  {/* Radio */}
                  <View style={[s.radio, isSelected && s.radioSelected]}>
                    {isSelected && <View style={s.radioDot} />}
                  </View>

                  {/* Labels */}
                  <View style={s.planLabels}>
                    <Text style={[s.planName, isSelected && s.planNameSelected]}>{p.label}</Text>
                    <Text style={s.planSub}>{p.sub}</Text>
                  </View>

                  {/* Price */}
                  <View style={s.priceWrap}>
                    <Text style={[s.priceMain, isSelected && s.priceMainSelected]}>{displayPrice}</Text>
                    {!rcPkg && displayPer ? <Text style={s.pricePer}>{displayPer}</Text> : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Features */}
        <View style={s.features}>
          {FEATURES.map(f => (
            <View key={f} style={s.featureRow}>
              <Text style={s.featureTick}>✓</Text>
              <Text style={s.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[s.cta, loading && s.ctaLoading]}
          onPress={handleSubscribe}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={s.ctaText}>
                {plan.isLifetime ? 'Get lifetime access' : plan.isStarter ? 'Pay now and get started' : 'Start 7-day free trial'}
              </Text>
              <Text style={s.ctaSub}>{plan.trialLine}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Skip — start free trial */}
        <TouchableOpacity
          style={s.skipBtn}
          onPress={handleSkipTrial}
          disabled={skipping}
          activeOpacity={0.7}
        >
          <Text style={s.skipText}>
            {skipping ? 'Starting trial...' : 'Skip \u2014 try free for 7 days'}
          </Text>
        </TouchableOpacity>

        <View style={s.guaranteeBadge}>
          <View style={s.guaranteeTextWrap}>
            <Text style={s.guaranteeTitle}>7-Day Full Refund Guarantee</Text>
            <Text style={s.guaranteeSub}>Not for you? Request a full refund within 7 days of purchase, no questions asked.</Text>
          </View>
        </View>

        {/* Coupon code entry UI removed (April 2026) — unlocking paid
            functionality through any non-IAP mechanism is disallowed
            by App Store Review Guideline 3.1.1. Pre-signup grants are
            still honoured silently at signup time via the server — no
            in-app code entry required, which is what keeps that flow
            compliant. Any future "redeem a code" UX must use Apple's
            Offer Codes (Purchases.presentCodeRedemptionSheet) instead. */}

        <Text style={s.legal}>
          {plan.isLifetime
            ? 'Lifetime access is a one-time purchase with no recurring charges.\n'
            : plan.isStarter
              ? 'Starter is a one-time payment for 3 months of access. No recurring charges.\n'
              : 'Cancel anytime before your 7-day free trial ends and you won\'t be charged.\n'}
          7-day full refund on all purchases. Prices in GBP.
        </Text>

        <View style={s.legalLinks}>
          <TouchableOpacity onPress={() => Linking.openURL('https://getetapa.com/terms.html')}>
            <Text style={s.legalLink}>Terms of Use</Text>
          </TouchableOpacity>
          <Text style={s.legalLinkDot}> · </Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://getetapa.com/privacy.html')}>
            <Text style={s.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>

        {hasRevenueCat && (
          <TouchableOpacity onPress={handleRestore} disabled={restoring} style={s.restoreBtn}>
            <Text style={s.restoreText}>
              {restoring ? 'Restoring...' : 'Restore Purchases'}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={s.aiDisclosure}>
          All training plans and coaching are powered by AI (Anthropic Claude), drawing on established cycling training science. This is not medical advice — consult a doctor before starting any exercise programme.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  backBtn: {
    position: 'absolute',
    top: 56,
    left: 20,
    zIndex: 10,
    padding: 8,
  },
  backBtnText: {
    color: colors.textMid,
    fontSize: 22,
    fontFamily: FF.regular,
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  closeBtnText: {
    color: colors.textMid,
    fontSize: 18,
    fontFamily: FF.regular,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 40,
  },

  // Header
  header: {
    marginBottom: 32,
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: FF.semibold,
    color: colors.primary,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  title: {
    fontSize: 32,
    fontFamily: FF.semibold,
    color: colors.text,
    lineHeight: 40,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: FF.light,
    color: colors.textMid,
  },

  // Plans
  plans: {
    gap: 12,
    marginBottom: 28,
  },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 18,
  },
  planCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  badgeWrap: {
    marginBottom: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: FF.semibold,
    letterSpacing: 0.8,
  },
  badgeLifetime: {
    backgroundColor: '#7C3AED',
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textMid,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  planLabels: {
    flex: 1,
  },
  planName: {
    fontSize: 16,
    fontFamily: FF.semibold,
    color: colors.text,
  },
  planNameSelected: {
    color: colors.primary,
  },
  planSub: {
    fontSize: 12,
    fontFamily: FF.light,
    color: colors.textMid,
    marginTop: 2,
  },
  priceWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  priceOriginal: {
    fontSize: 14,
    fontFamily: FF.light,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
    marginRight: 6,
    marginBottom: 3,
  },
  priceMain: {
    fontSize: 24,
    fontFamily: FF.semibold,
    color: colors.text,
  },
  priceMainSelected: {
    color: colors.primary,
  },
  pricePer: {
    fontSize: 12,
    fontFamily: FF.light,
    color: colors.textMid,
    marginBottom: 3,
    marginLeft: 2,
  },

  // Features
  features: {
    marginBottom: 28,
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureTick: {
    color: colors.good,
    fontSize: 14,
    fontFamily: FF.semibold,
    marginRight: 12,
    width: 16,
  },
  featureText: {
    color: colors.textMid,
    fontSize: 14,
    fontFamily: FF.regular,
  },

  // CTA
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  ctaLoading: {
    opacity: 0.7,
  },
  ctaText: {
    fontSize: 17,
    fontFamily: FF.semibold,
    color: '#fff',
  },
  ctaSub: {
    fontSize: 12,
    fontFamily: FF.light,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 3,
  },

  // Skip / free trial
  skipBtn: {
    alignSelf: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  skipText: {
    fontSize: 14,
    fontFamily: FF.medium,
    color: colors.textMid,
    textDecorationLine: 'underline',
  },

  // Legal
  legal: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: FF.light,
    color: colors.textMuted,
    lineHeight: 17,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  legalLink: {
    fontSize: 11,
    fontFamily: FF.regular,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  legalLinkDot: {
    fontSize: 11,
    color: colors.textMuted,
  },
  guaranteeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232,69,139,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(232,69,139,0.2)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  guaranteeIcon: {
    fontSize: 24,
  },
  guaranteeTextWrap: {
    flex: 1,
  },
  guaranteeTitle: {
    fontSize: 14,
    fontFamily: FF.semibold,
    color: '#22c55e',
    marginBottom: 2,
  },
  guaranteeSub: {
    fontSize: 12,
    fontFamily: FF.light,
    color: '#86efac',
    lineHeight: 17,
  },
  couponWrap: {
    marginBottom: 16,
  },
  couponLabel: {
    fontSize: 12,
    fontFamily: FF.medium,
    color: colors.textMuted,
    marginBottom: 8,
    textAlign: 'center',
  },
  couponRow: {
    flexDirection: 'row',
    gap: 8,
  },
  couponInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: FF.medium,
    color: colors.text,
    letterSpacing: 1,
  },
  couponBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  couponBtnDisabled: {
    opacity: 0.4,
  },
  couponBtnText: {
    fontSize: 14,
    fontFamily: FF.semibold,
    color: '#fff',
  },
  couponMessage: {
    fontSize: 12,
    fontFamily: FF.regular,
    marginTop: 6,
    textAlign: 'center',
  },
  couponMessageValid: {
    color: colors.good,
  },
  couponMessageInvalid: {
    color: '#EF4444',
  },
  restoreBtn: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  restoreText: {
    fontSize: 13,
    fontFamily: FF.medium,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  aiDisclosure: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: FF.light,
    color: colors.textFaint,
    lineHeight: 17,
    marginTop: 16,
    paddingHorizontal: 8,
  },
});
