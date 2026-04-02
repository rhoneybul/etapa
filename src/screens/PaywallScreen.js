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
import { colors, fontFamily } from '../theme';
import { openCheckout, getSubscriptionOfferings, restorePurchases } from '../services/subscriptionService';
import { isRevenueCatAvailable } from '../services/revenueCatService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

const PLANS = {
  lifetime: {
    id: 'lifetime',
    label: 'Lifetime',
    price: '$149',
    per: '',
    sub: 'One-time payment · Forever yours',
    badge: 'LAUNCH SPECIAL',
    trialLine: '7-day money-back guarantee',
    originalPrice: '$249',
    isLifetime: true,
  },
  annual: {
    id: 'annual',
    label: 'Annual',
    price: '$8.25',
    per: '/mo',
    sub: 'Billed $99/year',
    badge: 'MOST POPULAR',
    trialLine: 'then $99/year',
  },
  monthly: {
    id: 'monthly',
    label: 'Monthly',
    price: '$9.99',
    per: '/mo',
    sub: 'Billed monthly',
    badge: null,
    trialLine: 'then $9.99/month',
  },
};

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

  const isNative = Platform.OS !== 'web';
  const hasRevenueCat = isNative && isRevenueCatAvailable();

  // Where to go after successful subscription (default: Home)
  const nextScreen = route?.params?.nextScreen || 'Home';
  const nextParams = route?.params?.nextParams || {};
  // fromHome = user has plans but no subscription
  const fromHome = route?.params?.fromHome === true;
  const [showHolding, setShowHolding] = useState(false);

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
      navigation.goBack();
    }
  };

  const plan = PLANS[selected];

  // Holding screen — shown when user dismisses the paywall but has no subscription
  if (showHolding) {
    return (
      <View style={s.container}>
        {/* Blurred plan background */}
        <View style={s.holdingBg}>
          {/* Fake plan rows to simulate a blurred-out training plan */}
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={s.holdingBgRow}>
              <View style={[s.holdingBgDot, { width: 8, height: 8, borderRadius: 4, backgroundColor: i % 3 === 0 ? colors.primary : i % 3 === 1 ? '#8B5CF6' : '#3B82F6', opacity: 0.25 }]} />
              <View style={[s.holdingBgBar, { width: `${50 + (i * 7) % 35}%`, backgroundColor: colors.border, opacity: 0.35 }]} />
              <View style={[s.holdingBgBarSmall, { width: 48, backgroundColor: colors.border, opacity: 0.25 }]} />
            </View>
          ))}
        </View>
        {/* Gradient overlay */}
        <View style={s.holdingOverlay} />

        <SafeAreaView style={s.holdingContent}>
          {/* Logo */}
          <Image
            source={require('../../assets/icon.png')}
            style={s.holdingLogo}
            resizeMode="contain"
          />

          <Text style={s.holdingTitle}>Your plan is waiting</Text>
          <Text style={s.holdingSubtitle}>
            Unlock AI-powered training plans, coach chat,{'\n'}and progress tracking.
          </Text>

          {/* Lifetime callout */}
          <View style={s.holdingLifetimeBadge}>
            <Text style={s.holdingLifetimeText}>🚀 Lifetime access from $149 · 7-day money-back guarantee</Text>
          </View>

          {/* Primary CTA */}
          <TouchableOpacity
            style={s.holdingPrimaryBtn}
            onPress={() => setShowHolding(false)}
            activeOpacity={0.85}
          >
            <Text style={s.holdingPrimaryBtnText}>Join the Peloton</Text>
            <Text style={s.holdingPrimaryBtnSub}>Start your free trial</Text>
          </TouchableOpacity>

          {/* Secondary CTA */}
          <TouchableOpacity
            style={s.holdingSecondaryBtn}
            onPress={() => {
              setShowHolding(false);
              // Navigate to plan creation for newcomers
              navigation.navigate('GoalSetup');
            }}
            activeOpacity={0.8}
          >
            <Text style={s.holdingSecondaryBtnText}>New to cycling?</Text>
            <Text style={s.holdingSecondaryBtnSub}>Create your first training plan</Text>
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
      {/* Close button — always visible */}
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
          {Object.values(PLANS).map(p => {
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
            <Text style={s.guaranteeIcon}>{'\u{1F6E1}\uFE0F'}</Text>
            <View style={s.guaranteeTextWrap}>
              <Text style={s.guaranteeTitle}>30-Day Money-Back Guarantee</Text>
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
    position: 'absolute', top: 120, left: 24, right: 24,
    gap: 18, opacity: 0.6,
  },
  holdingBgRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  holdingBgDot: {},
  holdingBgBar: { height: 10, borderRadius: 5 },
  holdingBgBarSmall: { height: 10, borderRadius: 5 },
  holdingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  holdingContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  holdingLogo: {
    width: 72, height: 72, borderRadius: 16, marginBottom: 24,
  },
  holdingTitle: {
    fontSize: 24,
    fontFamily: FF.semibold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  holdingSubtitle: {
    fontSize: 15,
    fontFamily: FF.regular,
    color: colors.textMid,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 36,
  },
  holdingLifetimeBadge: {
    backgroundColor: 'rgba(124,58,237,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.3)',
    borderRadius: 100,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 28,
  },
  holdingLifetimeText: {
    fontSize: 13,
    fontFamily: FF.medium,
    color: '#9b5de5',
  },
  holdingPrimaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 48,
    alignItems: 'center',
    width: '100%',
    marginBottom: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
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
  holdingSecondaryBtn: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    width: '100%',
    marginBottom: 40,
  },
  holdingSecondaryBtnText: {
    fontSize: 16,
    fontFamily: FF.semibold,
    color: colors.text,
  },
  holdingSecondaryBtnSub: {
    fontSize: 12,
    fontFamily: FF.light,
    color: colors.textMid,
    marginTop: 3,
  },
  holdingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  holdingFooterLink: {
    fontSize: 14,
    fontFamily: FF.medium,
    color: colors.textMid,
  },
  holdingFooterDot: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
