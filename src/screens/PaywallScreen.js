/**
 * Paywall screen — shown before plan generation.
 * Monthly: $9.99/mo · Annual: $99/yr (= $8.25/mo) · 1 month free trial.
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { openCheckout } from '../services/subscriptionService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

const PLANS = {
  annual: {
    id: 'annual',
    label: 'Annual',
    price: '$8.25',
    per: '/mo',
    sub: 'Billed $99/year',
    badge: 'BEST VALUE',
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
  const [selected, setSelected] = useState('annual');
  const [loading, setLoading] = useState(false);

  // Where to go after successful subscription (default: GoalSetup)
  const nextScreen = route?.params?.nextScreen || 'GoalSetup';
  const nextParams = route?.params?.nextParams || {};

  const handleSubscribe = async () => {
    setLoading(true);
    analytics.capture?.('paywall_subscribe_tapped', { plan: selected });

    try {
      const result = await openCheckout(selected);
      if (result.success) {
        analytics.capture?.('subscription_started', { plan: selected });
        navigation.replace(nextScreen, nextParams);
      }
      // If cancelled, user stays on paywall — no error shown
    } catch (err) {
      Alert.alert('Something went wrong', err.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    navigation.goBack();
  };

  const plan = PLANS[selected];

  return (
    <SafeAreaView style={s.container}>
      {/* Close button */}
      <TouchableOpacity style={s.closeBtn} onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={s.closeBtnText}>✕</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.eyebrow}>ETAPA PREMIUM</Text>
          <Text style={s.title}>Train smarter,{'\n'}start free.</Text>
          <Text style={s.subtitle}>1 month free trial · No charge today</Text>
        </View>

        {/* Plan cards */}
        <View style={s.plans}>
          {Object.values(PLANS).map(p => {
            const isSelected = selected === p.id;
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
                    <View style={s.badge}>
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
                    <Text style={[s.priceMain, isSelected && s.priceMainSelected]}>{p.price}</Text>
                    <Text style={s.pricePer}>{p.per}</Text>
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
              <Text style={s.ctaText}>Try free for 1 month</Text>
              <Text style={s.ctaSub}>{plan.trialLine}</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={s.legal}>
          Cancel anytime before your free trial ends and you won't be charged.{'\n'}
          Prices in USD.
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
});
