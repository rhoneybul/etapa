/**
 * Paywall screen — shown before plan generation.
 * Monthly: £7.99/mo · Annual: £49.99/yr (= £4.17/mo) · Lifetime: £99.99 · Starter: £14.99 · 1 week free trial.
 *
 * Prices are fetched from the server (configured via the admin console).
 * Hardcoded defaults below are only used as a last-resort offline fallback.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Image, Platform, TextInput, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { openCheckout, getSubscriptionOfferings, restorePurchases, getPrices, validateCoupon, redeemCoupon } from '../services/subscriptionService';
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
    defaultTrialLine: '16-day full refund guarantee',
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
          ? '16-day full refund guarantee'
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
  const [selected, setSelected] = useState('lifetime');
  const [loading, setLoading] = useState(false);
  const [rcOfferings, setRcOfferings] = useState(null); // RevenueCat packages (native only)
  const [restoring, setRestoring] = useState(false);
  const [plans, setPlans] = useState(() => buildPlans(null));
  const [serverPrices, setServerPrices] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponState, setCouponState] = useState(null); // null | { valid, plan, message }
  const [couponLoading, setCouponLoading] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const isNative = Platform.OS !== 'web';
  // RevenueCat handles native purchases on both iOS and Android
  const hasRevenueCat = isNative && isRevenueCatAvailable();

  // Where to go after successful subscription (default: Home)
  const nextScreen = route?.params?.nextScreen || 'Home';
  const nextParams = route?.params?.nextParams || {};

  // Fetch live prices from server on mount.
  // On native, RevenueCat prices take priority for display — server prices are
  // only stored here for coupon/promo calculations (e.g. showing the original price).
  useEffect(() => {
    getPrices().then(prices => {
      if (prices) {
        setServerPrices(prices);
        // Only drive the plan display from server prices on web (no RevenueCat)
        if (!hasRevenueCat) {
          setPlans(buildPlans(prices));
        }
      }
    }).catch(() => {});
  }, [hasRevenueCat]);

  // Fetch RevenueCat offerings on mount (native only).
  // RC is the source of truth for displayed prices on native — prices come
  // directly from the App Store / Play Store and are already localised.
  useEffect(() => {
    if (!hasRevenueCat) return;
    getSubscriptionOfferings().then(offerings => {
      if (offerings?.packages) {
        setRcOfferings(offerings.packages);
        setPlans(buildPlansFromRC(offerings.packages));
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
      return false;
    });
  };

  const handleCouponValidate = async (code) => {
    if (!code.trim()) { setCouponState(null); return; }
    setCouponLoading(true);
    try {
      const result = await validateCoupon(code.trim());
      setCouponState(result);
    } catch {
      setCouponState({ valid: false, message: 'Could not validate code' });
    } finally {
      setCouponLoading(false);
    }
  };

  const handleCouponRedeem = async () => {
    if (!couponState?.valid) return;
    setRedeeming(true);
    try {
      const result = await redeemCoupon(couponCode.trim());
      if (result.success) {
        analytics.capture?.('coupon_redeemed', { plan: result.plan, code: couponCode.trim().toUpperCase() });
        Alert.alert(
          'Access granted!',
          result.plan === 'lifetime'
            ? 'You now have lifetime access to Etapa. Enjoy!'
            : 'You now have 3 months of Starter access. Enjoy!',
          [{ text: 'Get started', onPress: () => navigation.replace(nextScreen, nextParams) }],
        );
      } else {
        Alert.alert('Could not redeem', result.error || 'Please try again.');
      }
    } catch {
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setRedeeming(false);
    }
  };

  const handleSubscribe = async () => {
    const couponAppliesToSelected = couponState?.valid && couponState.plan === selected;
    setLoading(true);
    analytics.capture?.('paywall_subscribe_tapped', {
      plan: selected,
      source: couponAppliesToSelected ? 'coupon' : (hasRevenueCat ? 'revenuecat' : 'stripe'),
    });

    try {
      // If a coupon grants this exact plan for free, don't open Stripe/RevenueCat at all.
      if (couponAppliesToSelected) {
        const result = await redeemCoupon(couponCode.trim());
        if (result?.success) {
          analytics.capture?.('subscription_started', { plan: selected, source: 'coupon' });
          navigation.replace(nextScreen, nextParams);
        } else {
          Alert.alert('Could not apply code', result?.error || 'Please try again.');
        }
        return;
      }

      // On native iOS, use RevenueCat package for the purchase.
      // If offerings haven't loaded yet, retry fetching them before giving up.
      let rcPkg = hasRevenueCat ? findRcPackage(selected) : null;
      if (hasRevenueCat && !rcPkg) {
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
              return false;
            });
          }
        } catch { /* proceed with rcPkg = null */ }
      }
      const result = await openCheckout(selected, rcPkg?._package || null);

      if (result.cancelled) {
        // User cancelled — stay on paywall silently
      } else if (result.success) {
        analytics.capture?.('subscription_started', { plan: selected, source: hasRevenueCat ? 'revenuecat' : 'stripe' });
        navigation.replace(nextScreen, nextParams);
      } else if (result.error) {
        Alert.alert('Something went wrong', result.error);
      }
    } catch (err) {
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
        analytics.capture?.('purchases_restored');
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
    // Dismiss the paywall and start the 7-day free preview.
    // Navigate to the next screen (plan/Home) so the user can explore the app.
    navigation.replace(nextScreen, { ...nextParams, freePreview: true });
  };

  const plan = plans[selected];

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
          <Text style={s.title}>Train smarter,{'\n'}start free.</Text>
          <Text style={s.subtitle}>7-day free trial · No charge today</Text>
        </View>

        {/* Plan cards */}
        <View style={s.plans}>
          {Object.values(plans).map(p => {
            const isSelected = selected === p.id;
            // Use hardcoded/server price for display; rcPkg is used only for the purchase transaction
            const rcPkg = hasRevenueCat ? findRcPackage(p.id) : null;
            const couponMakesFree = couponState?.valid && couponState.plan === p.id;
            const originalPrice = serverPrices?.[p.id]?.formatted || p.defaultPrice || p.price;
            const displayPrice = couponMakesFree ? '£0.00' : p.price;
            const displayPer = couponMakesFree ? null : p.per;

            return (
              <TouchableOpacity
                key={p.id}
                style={[s.planCard, isSelected && s.planCardSelected]}
                onPress={() => setSelected(p.id)}
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
                    {couponMakesFree && !rcPkg && (
                      <Text style={s.priceOriginal}>{originalPrice}</Text>
                    )}
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
                {plan.isLifetime ? 'Get lifetime access' : 'Start 7-day free trial'}
              </Text>
              <Text style={s.ctaSub}>{plan.trialLine}</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={s.guaranteeBadge}>
          <View style={s.guaranteeTextWrap}>
            <Text style={s.guaranteeTitle}>16-Day Full Refund Guarantee</Text>
            <Text style={s.guaranteeSub}>Not for you? Get a full refund within 16 days of purchase, no questions asked.</Text>
          </View>
        </View>

        {/* Coupon code */}
        <View style={s.couponWrap}>
          <Text style={s.couponLabel}>Have a coupon code?</Text>
          <View style={s.couponRow}>
            <TextInput
              style={s.couponInput}
              value={couponCode}
              onChangeText={(t) => {
                setCouponCode(t);
                setCouponState(null);
              }}
              onBlur={() => handleCouponValidate(couponCode)}
              placeholder="Enter code"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[s.couponBtn, (!couponState?.valid || redeeming) && s.couponBtnDisabled]}
              onPress={() => {
                if (!couponState?.valid) return;
                if (couponState.plan && couponState.plan !== selected) {
                  const planLabel = couponState.plan === 'lifetime' ? 'Lifetime' : 'Starter';
                  Alert.alert('Code valid', `This code applies to the ${planLabel} plan. Select it above to continue.`);
                  return;
                }
                handleSubscribe();
              }}
              disabled={!couponState?.valid || redeeming}
              activeOpacity={0.8}
            >
              <Text style={s.couponBtnText}>
                {redeeming ? 'Applying...' : couponLoading ? '...' : 'Apply'}
              </Text>
            </TouchableOpacity>
          </View>
          {couponState && (
            <Text style={[s.couponMessage, couponState.valid ? s.couponMessageValid : s.couponMessageInvalid]}>
              {couponState.message}
            </Text>
          )}
        </View>

        <Text style={s.legal}>
          {plan.isLifetime
            ? 'Lifetime access is a one-time purchase with no recurring charges.\n'
            : 'Cancel anytime before your 7-day free trial ends and you won\'t be charged.\n'}
          16-day full refund on all purchases. Prices in GBP.
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
