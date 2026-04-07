/**
 * Get into Cycling — a friendly beginner program.
 * Simple setup: how many days per week do you want to ride?
 * Generates a 12-week beginner-friendly plan with tips on nutrition,
 * bike setup, gear, and building confidence.
 *
 * Payment options:
 *   - Pay now (price fetched from Stripe) → full access immediately
 *   - Pay when it starts → plan is generated but locked until payment
 * Supports Stripe promo/discount codes.
 * Full refund available within first 2 weeks of plan start date.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { saveGoal } from '../services/storageService';
import { isSubscribed, openCheckout, getPrices, validatePromo } from '../services/subscriptionService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

const DAYS_OPTIONS = [
  { key: 2, label: '2 days', sub: 'Perfect to start. Easy and manageable.' },
  { key: 3, label: '3 days', sub: 'A great balance of riding and rest.' },
  { key: 4, label: '4 days', sub: 'For those who want to build quickly.' },
];

const TIPS = [
  {
    title: 'What to expect',
    body: "You don't need to be fit to start cycling — that's what the plan is for. We'll ease you in gently, building up distance and confidence week by week. Every ride counts, even the short ones.",
  },
  {
    title: 'Nutrition basics',
    body: "For rides under an hour, water is all you need. For longer rides, bring a banana or an energy bar. Eat a light meal 1–2 hours before riding. After your ride, aim for some protein and carbs within 30 minutes — a smoothie, toast with peanut butter, or a simple meal.",
  },
  {
    title: 'Hydration',
    body: "Drink little and often — don't wait until you're thirsty. A good rule: one bottle per hour of riding. On hot days, add an electrolyte tablet to your water.",
  },
  {
    title: 'What to wear',
    body: "You don't need lycra to start! Comfortable activewear works. Padded cycling shorts make a big difference on longer rides though. Dress in layers — you'll warm up quickly.",
  },
  {
    title: 'Bike setup',
    body: "Make sure your saddle height is right — when seated, your leg should be almost fully extended at the bottom of the pedal stroke. Keep your tyres pumped up (check the sidewall for the recommended pressure). A quick safety check before each ride: brakes, tyres, chain.",
  },
  {
    title: 'Rest is part of training',
    body: "Your body gets stronger on rest days, not riding days. Don't skip them! If you feel tired or sore, it's OK to take an extra day off. Consistency over time beats pushing through fatigue.",
  },
];

const BIKE_TYPES = [
  { key: 'road',  label: 'Road bike' },
  { key: 'ebike', label: 'E-Bike' },
  { key: 'mtb',   label: 'Mountain bike' },
  { key: 'gravel',label: 'Gravel bike' },
];

export default function BeginnerProgramScreen({ navigation }) {
  const [daysPerWeek, setDaysPerWeek] = useState(null);
  const [bikeType, setBikeType] = useState('road');
  const [showTips, setShowTips] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  // Dynamic pricing
  const [starterPrice, setStarterPrice] = useState({ formatted: '$39.99', amount: 3999 });
  const [promoInput, setPromoInput] = useState('');
  const [promoResult, setPromoResult] = useState(null); // { valid, promoId, label, discountedFormatted, ... }
  const [validatingPromo, setValidatingPromo] = useState(false);

  // Default promo code for the starter plan (auto-applied)
  const DEFAULT_STARTER_PROMO = 'promo_1TI5VkAmoVZFfAwUakin4FXz';

  // Fetch live starter price + auto-apply default promo on mount
  useEffect(() => {
    getPrices().then(prices => {
      if (prices?.starter) setStarterPrice(prices.starter);
    }).catch(() => {});

    // Auto-apply the default promo code
    validatePromo(DEFAULT_STARTER_PROMO, 'starter').then(result => {
      if (result?.valid) setPromoResult(result);
    }).catch(() => {});
  }, []);

  const displayPrice = promoResult?.valid ? promoResult.discountedFormatted : starterPrice.formatted;
  const hasDiscount = promoResult?.valid;

  const handleApplyPromo = async () => {
    const code = promoInput.trim();
    if (!code) return;
    setValidatingPromo(true);
    try {
      const result = await validatePromo(code, 'starter');
      setPromoResult(result);
      if (!result?.valid) {
        Alert.alert('Invalid code', result?.message || 'This promo code is not valid.');
      }
    } catch {
      Alert.alert('Error', 'Could not validate promo code. Please try again.');
    } finally {
      setValidatingPromo(false);
    }
  };

  /** Proceed to PlanConfig with an optional paymentStatus flag */
  const proceedToConfig = async (paymentStatus) => {
    const goal = await saveGoal({
      cyclingType: bikeType,
      goalType: 'beginner',
      targetDistance: null,
      targetElevation: null,
      targetTime: null,
      targetDate: null,
      eventName: null,
      planName: 'Get into Cycling',
    });

    analytics.capture?.('beginner_program_started', { daysPerWeek, paymentStatus });

    navigation.replace('PlanConfig', {
      goal,
      beginnerDefaults: {
        fitnessLevel: 'beginner',
        daysPerWeek,
        weeks: 12,
        paymentStatus, // 'paid' | 'pending'
      },
    });
  };

  /** Pay now and proceed */
  const handlePayNow = async () => {
    // If already subscribed, skip payment
    const subscribed = await isSubscribed();
    if (subscribed) {
      proceedToConfig('paid');
      return;
    }

    setPurchasing(true);
    try {
      const promoCode = promoResult?.valid ? promoResult.promoId : null;
      const result = await openCheckout('starter', null, promoCode);
      if (!result.success) {
        setPurchasing(false);
        return; // User cancelled
      }
      setPurchasing(false);
      proceedToConfig('paid');
    } catch (err) {
      setPurchasing(false);
      Alert.alert('Payment failed', 'Something went wrong. Please try again.');
    }
  };

  /** Skip payment — plan will be locked until they pay on start date */
  const handlePayLater = async () => {
    // If already subscribed, treat as paid
    const subscribed = await isSubscribed();
    if (subscribed) {
      proceedToConfig('paid');
      return;
    }
    proceedToConfig('pending');
  };

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          {/* Hero */}
          <View style={s.hero}>
            <View style={s.badge}>
              <Text style={s.badgeText}>BEGINNER FRIENDLY</Text>
            </View>
            <Text style={s.title}>Get into Cycling</Text>
            <Text style={s.subtitle}>
              A 12-week program designed to get you riding regularly and loving it.{'\n'}
              No experience needed — just a bike and some enthusiasm.
            </Text>
          </View>

          {/* Price card */}
          <View style={s.priceCard}>
            {hasDiscount && (
              <Text style={s.priceOriginal}>{starterPrice.formatted}</Text>
            )}
            <Text style={s.priceAmount}>{displayPrice}</Text>
            <Text style={s.priceSub}>one-time · 3 months access</Text>
            {hasDiscount && (
              <View style={s.promoBadge}>
                <Text style={s.promoBadgeText}>{promoResult.label}</Text>
              </View>
            )}
            <Text style={s.priceRefund}>Full refund within 2 weeks of starting</Text>
          </View>

          {/* Promo code */}
          <View style={s.promoSection}>
            <Text style={s.promoLabel}>Have a promo code?</Text>
            <View style={s.promoRow}>
              <TextInput
                style={s.promoInput}
                placeholder="Enter code"
                placeholderTextColor={colors.textMuted}
                value={promoInput}
                onChangeText={(t) => { setPromoInput(t); if (promoResult) setPromoResult(null); }}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!validatingPromo}
              />
              <TouchableOpacity
                style={[s.promoBtn, (!promoInput.trim() || validatingPromo) && { opacity: 0.4 }]}
                onPress={handleApplyPromo}
                disabled={!promoInput.trim() || validatingPromo}
                activeOpacity={0.8}
              >
                {validatingPromo ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.promoBtnText}>Apply</Text>
                )}
              </TouchableOpacity>
            </View>
            {promoResult?.valid && (
              <Text style={s.promoSuccess}>{promoResult.label} applied!</Text>
            )}
          </View>

          {/* What's included */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>What's included</Text>
            <View style={s.featureList}>
              {[
                'A gentle, progressive 12-week plan',
                'Sessions tailored to your available days',
                'Clear ride instructions (no jargon)',
                'Tips on nutrition, hydration & gear',
                'AI coach to answer any questions',
                'Build up to comfortable 40+ km rides',
              ].map((f, i) => (
                <View key={i} style={s.featureRow}>
                  <Text style={s.featureTick}>{'\u2713'}</Text>
                  <Text style={s.featureText}>{f}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Days per week selector */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>How many days can you ride?</Text>
            <Text style={s.sectionSub}>Don't worry — you can always adjust later</Text>
            <View style={s.daysOptions}>
              {DAYS_OPTIONS.map(opt => {
                const isSelected = daysPerWeek === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.dayCard, isSelected && s.dayCardSelected]}
                    onPress={() => setDaysPerWeek(opt.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.dayLabel, isSelected && s.dayLabelSelected]}>{opt.label}</Text>
                    <Text style={[s.daySub, isSelected && s.daySubSelected]}>{opt.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Bike type selector */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>What bike will you ride?</Text>
            <View style={s.bikeTypeRow}>
              {BIKE_TYPES.map(bt => {
                const isSelected = bikeType === bt.key;
                return (
                  <TouchableOpacity
                    key={bt.key}
                    style={[s.bikeTypePill, isSelected && s.bikeTypePillSelected]}
                    onPress={() => setBikeType(bt.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.bikeTypePillText, isSelected && s.bikeTypePillTextSelected]}>{bt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Tips section */}
          <TouchableOpacity
            style={s.tipsToggle}
            onPress={() => setShowTips(!showTips)}
            activeOpacity={0.8}
          >
            <Text style={s.tipsToggleText}>Tips for getting started</Text>
            <Text style={s.tipsToggleArrow}>{showTips ? '\u2303' : '\u2304'}</Text>
          </TouchableOpacity>

          {showTips && (
            <View style={s.tipsSection}>
              {TIPS.map((tip, i) => (
                <View key={i} style={s.tipCard}>
                  <Text style={s.tipTitle}>{tip.title}</Text>
                  <Text style={s.tipBody}>{tip.body}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 140 }} />
        </ScrollView>

        {/* CTAs — two options */}
        <View style={s.ctaWrap}>
          <TouchableOpacity
            style={[s.ctaBtn, (!daysPerWeek || purchasing) && s.ctaBtnDisabled]}
            onPress={handlePayNow}
            disabled={!daysPerWeek || purchasing}
            activeOpacity={0.85}
          >
            {purchasing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={s.ctaText}>Pay now and get started</Text>
                <Text style={s.ctaSub}>{displayPrice} · full access to your plan</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.ctaBtnSecondary, (!daysPerWeek || purchasing) && s.ctaBtnDisabled]}
            onPress={handlePayLater}
            disabled={!daysPerWeek || purchasing}
            activeOpacity={0.8}
          >
            <Text style={s.ctaTextSecondary}>Set up now, pay when it starts</Text>
            <Text style={s.ctaSubSecondary}>Preview your plan first</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  scroll: { paddingHorizontal: 24 },

  // Hero
  hero: { marginBottom: 20, paddingTop: 8 },
  badge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(232,69,139,0.12)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 14,
  },
  badgeText: { fontSize: 10, fontFamily: FF.semibold, color: '#E8458B', letterSpacing: 1 },
  title: { fontSize: 28, fontFamily: FF.semibold, color: colors.text, marginBottom: 10 },
  subtitle: {
    fontSize: 15, fontFamily: FF.regular, color: colors.textMid, lineHeight: 22,
  },

  // Price card
  priceCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 20,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', marginBottom: 28,
  },
  priceAmount: { fontSize: 32, fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  priceOriginal: {
    fontSize: 18, fontFamily: FF.regular, color: colors.textMuted,
    textDecorationLine: 'line-through', marginBottom: 2,
  },
  priceSub: { fontSize: 13, fontFamily: FF.regular, color: colors.textMid, marginBottom: 6 },
  promoBadge: {
    backgroundColor: 'rgba(232,69,139,0.12)', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6,
  },
  promoBadgeText: { fontSize: 11, fontFamily: FF.semibold, color: '#E8458B', letterSpacing: 0.5 },
  priceRefund: { fontSize: 12, fontFamily: FF.regular, color: '#E8458B' },

  // Promo code
  promoSection: { marginBottom: 28 },
  promoLabel: { fontSize: 13, fontFamily: FF.medium, color: colors.textMid, marginBottom: 8 },
  promoRow: { flexDirection: 'row', gap: 10 },
  promoInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 14, fontFamily: FF.medium, color: colors.text,
    letterSpacing: 1,
  },
  promoBtn: {
    backgroundColor: '#E8458B', borderRadius: 10,
    paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center',
  },
  promoBtnText: { fontSize: 14, fontFamily: FF.semibold, color: '#fff' },
  promoSuccess: { fontSize: 12, fontFamily: FF.medium, color: '#E8458B', marginTop: 6 },

  // Sections
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 16, fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  sectionSub: { fontSize: 13, fontFamily: FF.regular, color: colors.textMuted, marginBottom: 14 },

  // Features
  featureList: { gap: 10, marginTop: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  featureTick: { color: '#E8458B', fontSize: 14, fontFamily: FF.semibold, width: 18, marginTop: 1 },
  featureText: { fontSize: 14, fontFamily: FF.regular, color: colors.textMid, flex: 1 },

  // Days selector
  daysOptions: { gap: 10 },
  dayCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 18,
    borderWidth: 1.5, borderColor: colors.border,
  },
  dayCardSelected: { borderColor: '#E8458B', backgroundColor: 'rgba(232,69,139,0.06)' },
  dayLabel: { fontSize: 16, fontFamily: FF.semibold, color: colors.text, marginBottom: 3 },
  dayLabelSelected: { color: '#E8458B' },
  daySub: { fontSize: 13, fontFamily: FF.regular, color: colors.textMuted },
  daySubSelected: { color: 'rgba(232,69,139,0.7)' },

  // Bike type
  bikeTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bikeTypePill: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
  },
  bikeTypePillSelected: { borderColor: '#E8458B', backgroundColor: 'rgba(232,69,139,0.06)' },
  bikeTypePillText: { fontSize: 14, fontFamily: FF.medium, color: colors.textMid },
  bikeTypePillTextSelected: { color: '#E8458B' },

  // Tips
  tipsToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: colors.border, marginBottom: 12,
  },
  tipsToggleText: { fontSize: 15, fontFamily: FF.medium, color: colors.text },
  tipsToggleArrow: { fontSize: 16, color: colors.textMuted },
  tipsSection: { gap: 12, marginBottom: 12 },
  tipCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: colors.border,
  },
  tipTitle: { fontSize: 14, fontFamily: FF.semibold, color: colors.text, marginBottom: 6 },
  tipBody: { fontSize: 13, fontFamily: FF.regular, color: colors.textMid, lineHeight: 20 },

  // CTAs
  ctaWrap: { paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8, gap: 10 },
  ctaBtn: {
    backgroundColor: '#E8458B', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center',
  },
  ctaBtnDisabled: { opacity: 0.4 },
  ctaText: { fontSize: 16, fontFamily: FF.semibold, color: '#fff' },
  ctaSub: { fontSize: 11, fontFamily: FF.light, color: 'rgba(255,255,255,0.65)', marginTop: 2 },

  ctaBtnSecondary: {
    backgroundColor: 'transparent', borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  ctaTextSecondary: { fontSize: 14, fontFamily: FF.medium, color: colors.text },
  ctaSubSecondary: { fontSize: 11, fontFamily: FF.light, color: colors.textMuted, marginTop: 2 },
});
