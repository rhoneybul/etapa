/**
 * Paywall screen — shown before plan generation.
 * Monthly: $9.99/mo · Annual: $99/yr (= $8.25/mo) · Lifetime: $149 · 1 week free trial.
 *
 * On native (iOS/Android): fetches real prices from RevenueCat and purchases via IAP.
 * On web: uses hardcoded prices and Stripe Checkout.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fontFamily } from '../theme';
import { openCheckout, getSubscriptionOfferings, restorePurchases, getPrices } from '../services/subscriptionService';
import { isRevenueCatAvailable } from '../services/revenueCatService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

// Fallback plan metadata (prices will be overwritten by server data)
const PLAN_META = {
  lifetime: {
    id: 'lifetime',
    label: 'Lifetime',
    fallbackPrice: '$149',
    per: '',
    fallbackSub: 'One-time payment · Forever yours',
    badge: 'LAUNCH SPECIAL',
    fallbackTrialLine: '7-day money-back guarantee',
    originalPrice: '$249',
    isLifetime: true,
  },
  annual: {
    id: 'annual',
    label: 'Annual',
    fallbackPrice: '$8.25',
    per: '/mo',
    fallbackSub: 'Billed $99/year',
    badge: 'MOST POPULAR',
    fallbackTrialLine: 'then $99/year',
  },
  monthly: {
    id: 'monthly',
    label: 'Monthly',
    fallbackPrice: '$9.99',
    per: '/mo',
    fallbackSub: 'Billed monthly',
    badge: null,
    fallbackTrialLine: 'then $9.99/month',
  },
};

/** Build display PLANS from server prices + fallback metadata */
function buildPlans(serverPrices) {
  const plans = {};
  for (const [key, meta] of Object.entries(PLAN_META)) {
    const sp = serverPrices?.[key];
    if (sp) {
      plans[key] = {
        ...meta,
        price: sp.perMonth || sp.formatted,
        sub: sp.billedLabel || meta.fallbackSub,
        trialLine: meta.isLifetime
          ? '7-day money-back guarantee'
          : sp.interval === 'year'
            ? `then ${sp.formatted}/year`
            : sp.interval === 'month'
              ? `then ${sp.formatted}/month`
              : meta.fallbackTrialLine,
      };
    } else {
      plans[key] = { ...meta, price: meta.fallbackPrice, sub: meta.fallbackSub, trialLine: meta.fallbackTrialLine };
    }
  }
  return plans;
}

// Dummy plan data for the holding screen background
const DUMMY_PLAN = [
  { day: 'MON', type: 'Easy Ride',   duration: '1h 00m', color: '#22C55E', barWidth: '60%' },
  { day: 'TUE', type: 'Threshold',   duration: '1h 30m', color: '#F59E0B', barWidth: '78%' },
  { day: 'WED', type: 'Rest',        duration: '',       color: '#6B7280', barWidth: '20%' },
  { day: 'THU', type: 'Intervals',   duration: '1h 15m', color: '#EF4444', barWidth: '70%' },
  { day: 'FRI', type: 'Easy Ride',   duration: '45 min', color: '#22C55E', barWidth: '48%' },
  { day: 'SAT', type: 'Long Ride',   duration: '2h 30m', color: '#E8458B', barWidth: '88%' },
  { day: 'SUN', type: 'Rest',        duration: '',       color: '#6B7280', barWidth: '18%' },
];

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

  const isNative = Platform.OS !== 'web';
  const hasRevenueCat = isNative && isRevenueCatAvailable();

  // Where to go after successful subscription (default: Home)
  const nextScreen = route?.params?.nextScreen || 'Home';
  const nextParams = route?.params?.nextParams || {};
  // fromHome = user has plans but no subscription
  const fromHome = route?.params?.fromHome === true;
  const [showHolding, setShowHolding] = useState(false);

  // Fetch live prices from server on mount
  useEffect(() => {
    getPrices().then(prices => {
      if (prices) {
        setServerPrices(prices);
        setPlans(buildPlans(prices));
      }
    }).catch(() => {});
  }, []);

  // Fetch RevenueCat offerings on mount (native only)
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
      return false;
    });
  };

  const handleSubscribe = async () => {
    setLoading(true);
    analytics.capture?.('paywall_subscribe_tapped', { plan: selected, source: hasRevenueCat ? 'revenuecat' : 'stripe' });

    try {
      // On native, try to use RevenueCat package for the purchase
      const rcPkg = hasRevenueCat ? findRcPackage(selected) : null;
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
    if (fromHome) {
      setShowHolding(true);
    } else {
      // Go back to plan preview if we came from PlanReady, otherwise goBack safely.
      // NEVER destroy the plan — the user may have just generated it.
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.replace('Home');
      }
    }
  };

  const plan = plans[selected];

  // Holding screen — shown when user dismisses the paywall but has no subscription
  if (showHolding) {
    return (
      <View style={s.container}>
        {/* Dummy training plan background */}
        <View style={s.holdingBg}>
          {/* Week header */}
          <View style={s.holdingWeekHeader}>
            <View style={s.holdingWeekHeaderDot} />
            <View style={s.holdingWeekHeaderBar} />
            <View style={s.holdingWeekHeaderBadge} />
          </View>
          {/* Session rows */}
          {DUMMY_PLAN.map((session, i) => (
            <View key={i} style={s.holdingBgRow}>
              <View style={s.holdingDayLabel} />
              <View style={[s.holdingSessionPill, { backgroundColor: session.color + '55' }]} />
              <View style={s.holdingBarGroup}>
                <View style={[s.holdingBar, { width: session.barWidth, backgroundColor: session.color + '55' }]} />
                {session.duration ? <View style={s.holdingBarSub} /> : null}
              </View>
              {session.duration ? <View style={s.holdingDurationTag} /> : null}
            </View>
          ))}
        </View>

        {/* Gradient overlay — lighter at top so plan peeks through, dark at bottom */}
        <LinearGradient
          colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.93)', 'rgba(0,0,0,0.98)']}
          locations={[0, 0.3, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />

        <SafeAreaView style={s.holdingContent}>
          <Image
            source={require('../../assets/icon.png')}
            style={s.holdingLogo}
            resizeMode="contain"
          />

          <Text style={s.holdingTitle}>Your plan is waiting</Text>
          <Text style={s.holdingSubtitle}>
            Unlock AI-powered training plans, coach chat,{'\n'}and progress tracking.
          </Text>

          {/* Plan pricing summary */}
          <View style={s.holdingPlansRow}>
            <View style={s.holdingPlanPill}>
              <Text style={s.holdingPlanPillLabel}>Monthly</Text>
              <Text style={s.holdingPlanPillPrice}>{plans.monthly.price}<Text style={s.holdingPlanPillPer}>/mo</Text></Text>
            </View>
            <View style={[s.holdingPlanPill, s.holdingPlanPillHighlight]}>
              <Text style={[s.holdingPlanPillLabel, { color: colors.primary }]}>Annual</Text>
              <Text style={[s.holdingPlanPillPrice, { color: colors.primary }]}>{plans.annual.price}<Text style={s.holdingPlanPillPer}>/mo</Text></Text>
              <View style={s.holdingPlanPillBadge}><Text style={s.holdingPlanPillBadgeText}>POPULAR</Text></View>
            </View>
            <View style={s.holdingPlanPill}>
              <Text style={s.holdingPlanPillLabel}>Lifetime</Text>
              <Text style={s.holdingPlanPillPrice}>{plans.lifetime.price}</Text>
            </View>
          </View>
          <Text style={s.holdingTrialNote}>1 week free trial on all subscription plans</Text>

          {/* Lifetime savings callout — informational, not a button */}
          <View style={s.holdingSavingsRow}>
            <Text style={s.holdingSavingsText}>Lifetime access · {plans.lifetime.price} one-time</Text>
            <View style={s.holdingSavingsBadge}>
              <Text style={s.holdingSavingsBadgeText}>SAVE $100</Text>
            </View>
          </View>

          {/* Primary CTA */}
          <TouchableOpacity
            style={s.holdingPrimaryBtn}
            onPress={() => {
              navigation.replace('GoalSetup', { requirePaywall: true });
            }}
            activeOpacity={0.85}
          >
            <Text style={s.holdingPrimaryBtnText}>Create your plan</Text>
            <Text style={s.holdingPrimaryBtnSub}>Start your free trial</Text>
          </TouchableOpacity>

          {/* New to cycling — prominent warm card */}
          <TouchableOpacity
            style={s.holdingNewCyclistBtn}
            onPress={() => {
              navigation.replace('BeginnerProgram');
            }}
            activeOpacity={0.8}
          >
            <View style={s.holdingNewCyclistInner}>
              <View style={s.holdingNewCyclistAccent} />
              <View style={s.holdingNewCyclistText}>
                <Text style={s.holdingNewCyclistTitle}>New to cycling?</Text>
                <Text style={s.holdingNewCyclistSub}>We'll build your first plan from scratch</Text>
              </View>
              <Text style={s.holdingNewCyclistArrow}>{'\u2192'}</Text>
            </View>
          </TouchableOpacity>

          {/* Footer links */}
          <View style={s.holdingFooter}>
            <TouchableOpacity onPress={() => navigation.navigate('Feedback')} activeOpacity={0.7}>
              <Text style={s.holdingFooterLink}>Send Feedback</Text>
            </TouchableOpacity>
            <Text style={s.holdingFooterDot}> · </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Settings')} activeOpacity={0.7}>
              <Text style={s.holdingFooterLink}>Settings</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

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
          <Text style={s.subtitle}>1 week free trial · No charge today</Text>
        </View>

        {/* Plan cards */}
        <View style={s.plans}>
          {Object.values(plans).map(p => {
            const isSelected = selected === p.id;
            // Use RevenueCat price if available (native)
            const rcPkg = hasRevenueCat ? findRcPackage(p.id) : null;
            const displayPrice = rcPkg?.priceString || p.price;

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
                    {p.originalPrice && !rcPkg && (
                      <Text style={s.priceOriginal}>{p.originalPrice}</Text>
                    )}
                    <Text style={[s.priceMain, isSelected && s.priceMainSelected]}>{displayPrice}</Text>
                    {!rcPkg && p.per ? <Text style={s.pricePer}>{p.per}</Text> : null}
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
                {plan.isLifetime ? 'Get lifetime access' : 'Try free for 1 week'}
              </Text>
              <Text style={s.ctaSub}>{plan.trialLine}</Text>
            </>
          )}
        </TouchableOpacity>

        {plan.isLifetime && (
          <View style={s.guaranteeBadge}>
            <View style={s.guaranteeTextWrap}>
              <Text style={s.guaranteeTitle}>7-Day Money-Back Guarantee</Text>
              <Text style={s.guaranteeSub}>Not for you? Get a full refund within 7 days, no questions asked.</Text>
            </View>
          </View>
        )}

        <Text style={s.legal}>
          {plan.isLifetime
            ? 'Lifetime access is a one-time purchase with no recurring charges. Full refund available within 7 days of purchase.\n'
            : 'Cancel anytime before your free trial ends and you won\'t be charged.\n'}
          Prices in USD.
        </Text>

        {hasRevenueCat && (
          <TouchableOpacity onPress={handleRestore} disabled={restoring} style={s.restoreBtn}>
            <Text style={s.restoreText}>
              {restoring ? 'Restoring...' : 'Restore Purchases'}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={s.aiDisclosure}>
          {'\u2728'} All training plans and coaching are powered by AI (Anthropic Claude), drawing on established cycling training science. This is not medical advice — consult a doctor before starting any exercise programme.
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
  guaranteeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
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

  // Holding screen
  holdingBg: {
    position: 'absolute', top: 80, left: 20, right: 20, gap: 14,
  },
  holdingWeekHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6,
  },
  holdingWeekHeaderDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, opacity: 0.5,
  },
  holdingWeekHeaderBar: {
    height: 10, width: '45%', borderRadius: 5, backgroundColor: colors.primary, opacity: 0.25,
  },
  holdingWeekHeaderBadge: {
    height: 10, width: 56, borderRadius: 5, backgroundColor: colors.border, opacity: 0.35,
  },
  holdingBgRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  holdingDayLabel: {
    width: 32, height: 9, borderRadius: 4, backgroundColor: colors.border, opacity: 0.4,
  },
  holdingSessionPill: {
    height: 22, width: 72, borderRadius: 6,
  },
  holdingBarGroup: {
    flex: 1, gap: 5,
  },
  holdingBar: {
    height: 9, borderRadius: 5,
  },
  holdingBarSub: {
    height: 7, width: '55%', borderRadius: 4, backgroundColor: colors.border, opacity: 0.3,
  },
  holdingDurationTag: {
    width: 44, height: 22, borderRadius: 6, backgroundColor: colors.border, opacity: 0.3,
  },
  holdingContent: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingBottom: 32,
  },
  holdingLogo: {
    width: 64, height: 64, borderRadius: 14, marginBottom: 20,
  },
  holdingTitle: {
    fontSize: 26,
    fontFamily: FF.semibold,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  holdingSubtitle: {
    fontSize: 15,
    fontFamily: FF.regular,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  // Lifetime savings callout — informational, not a button
  holdingSavingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  holdingSavingsText: {
    fontSize: 13,
    fontFamily: FF.medium,
    color: 'rgba(255,255,255,0.7)',
  },
  holdingSavingsBadge: {
    backgroundColor: 'rgba(34,197,94,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.45)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  holdingSavingsBadgeText: {
    fontSize: 10,
    fontFamily: FF.semibold,
    color: '#4ade80',
    letterSpacing: 0.8,
  },
  holdingPrimaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 6,
  },
  holdingPrimaryBtnText: {
    fontSize: 17,
    fontFamily: FF.semibold,
    color: '#fff',
  },
  holdingPrimaryBtnSub: {
    fontSize: 12,
    fontFamily: FF.light,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 3,
  },
  // New to cycling — warm amber card
  holdingNewCyclistBtn: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(232,69,139,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(232,69,139,0.35)',
    marginBottom: 32,
  },
  holdingNewCyclistInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 0,
  },
  holdingNewCyclistAccent: {
    width: 4,
    height: '100%',
    minHeight: 40,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginRight: 14,
  },
  holdingNewCyclistText: {
    flex: 1,
  },
  holdingNewCyclistTitle: {
    fontSize: 16,
    fontFamily: FF.semibold,
    color: colors.primary,
    marginBottom: 2,
  },
  holdingNewCyclistSub: {
    fontSize: 12,
    fontFamily: FF.regular,
    color: 'rgba(255,255,255,0.55)',
  },
  holdingNewCyclistArrow: {
    fontSize: 20,
    color: colors.primary,
    marginLeft: 8,
  },
  holdingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  holdingFooterLink: {
    fontSize: 13,
    fontFamily: FF.medium,
    color: 'rgba(255,255,255,0.4)',
  },
  holdingFooterDot: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.25)',
  },

  // Plan pricing summary pills
  holdingPlansRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    width: '100%',
    justifyContent: 'center',
  },
  holdingPlanPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
  },
  holdingPlanPillHighlight: {
    backgroundColor: 'rgba(232,69,139,0.1)',
    borderColor: 'rgba(232,69,139,0.3)',
  },
  holdingPlanPillLabel: {
    fontSize: 10,
    fontFamily: FF.semibold,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  holdingPlanPillPrice: {
    fontSize: 15,
    fontFamily: FF.semibold,
    color: 'rgba(255,255,255,0.85)',
  },
  holdingPlanPillPer: {
    fontSize: 11,
    fontFamily: FF.regular,
    color: 'rgba(255,255,255,0.45)',
  },
  holdingPlanPillBadge: {
    backgroundColor: 'rgba(232,69,139,0.25)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 2,
  },
  holdingPlanPillBadgeText: {
    fontSize: 8,
    fontFamily: FF.semibold,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  holdingTrialNote: {
    fontSize: 11,
    fontFamily: FF.regular,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 20,
    textAlign: 'center',
  },
});
