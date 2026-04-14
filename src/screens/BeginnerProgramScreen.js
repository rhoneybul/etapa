/**
 * Get into Cycling — a friendly beginner program.
 *
 * Stage 1 (this screen): user picks their goal distance and bike type,
 * sees what's included, then taps Continue.
 *
 * Stage 2: PaywallScreen handles the subscription purchase. On success
 * it navigates directly to PlanConfig with the goal pre-populated.
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { saveGoal } from '../services/storageService';
import { isSubscribed } from '../services/subscriptionService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

const GOAL_OPTIONS = [
  {
    key: 'habit',
    label: 'Build a cycling habit',
    distance: 25,
    time: null,
    sub: "Get out regularly and feel confident on the bike. You'll be riding 20–25 km comfortably by the end.",
  },
  {
    key: 'endurance',
    label: 'Build real endurance',
    distance: 50,
    time: null,
    sub: "Push further and finish the 12 weeks able to ride 40–50 km without stopping.",
  },
  {
    key: 'century',
    label: 'Ride my first 100 km',
    distance: 100,
    time: null,
    sub: "An ambitious target — you'll train consistently and build toward a full century by week 12.",
  },
];

// Suggest days-per-week based on goal distance (used as default on scheduling screen)
const SUGGESTED_DAYS = { habit: 2, endurance: 3, century: 3 };

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
  const [goalOption, setGoalOption] = useState(null);
  const [bikeType, setBikeType] = useState('road');
  const [showTips, setShowTips] = useState(false);
  const [continuing, setContinuing] = useState(false);

  /** Save goal then hand off to Paywall (or directly to PlanConfig if already subscribed) */
  const handleContinue = async () => {
    setContinuing(true);
    try {
      const chosen = GOAL_OPTIONS.find(g => g.key === goalOption) || GOAL_OPTIONS[1];
      const goal = await saveGoal({
        cyclingType: bikeType,
        goalType: 'beginner',
        targetDistance: chosen.distance,
        targetElevation: null,
        targetTime: chosen.time,
        targetDate: null,
        eventName: null,
        planName: `Get into Cycling — ${chosen.label}`,
      });

      const suggestedDays = SUGGESTED_DAYS[goalOption] || 3;
      const planConfig = {
        goal,
        beginnerDefaults: {
          fitnessLevel: 'beginner',
          daysPerWeek: suggestedDays,
          weeks: 12,
        },
      };

      analytics.capture?.('beginner_program_goal_selected', { goalOption });

      // Skip paywall if already subscribed
      const subscribed = await isSubscribed();
      if (subscribed) {
        navigation.replace('PlanConfig', planConfig);
        return;
      }

      // Hand off to the paywall — on success it navigates to PlanConfig
      navigation.navigate('Paywall', {
        nextScreen: 'PlanConfig',
        nextParams: planConfig,
      });
    } finally {
      setContinuing(false);
    }
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
                'Progress toward your chosen goal distance',
              ].map((f, i) => (
                <View key={i} style={s.featureRow}>
                  <Text style={s.featureTick}>{'\u2713'}</Text>
                  <Text style={s.featureText}>{f}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Goal milestone selector */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>What's your goal?</Text>
            <Text style={s.sectionSub}>Pick the milestone you want to work towards</Text>
            <View style={s.daysOptions}>
              {GOAL_OPTIONS.map(opt => {
                const isSelected = goalOption === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.dayCard, isSelected && s.dayCardSelected]}
                    onPress={() => setGoalOption(opt.key)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                      <Text style={[s.dayLabel, isSelected && s.dayLabelSelected]}>{opt.label}</Text>
                      <Text style={[s.goalDistanceBadge, isSelected && s.goalDistanceBadgeSelected]}>{opt.distance} km</Text>
                    </View>
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

        {/* CTA */}
        <View style={s.ctaWrap}>
          <TouchableOpacity
            style={[s.ctaBtn, (!goalOption || continuing) && s.ctaBtnDisabled]}
            onPress={handleContinue}
            disabled={!goalOption || continuing}
            activeOpacity={0.85}
          >
            {continuing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.ctaText}>Continue</Text>
            )}
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

  // Sections
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 16, fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  sectionSub: { fontSize: 13, fontFamily: FF.regular, color: colors.textMuted, marginBottom: 14 },

  // Features
  featureList: { gap: 10, marginTop: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  featureTick: { color: '#E8458B', fontSize: 14, fontFamily: FF.semibold, width: 18, marginTop: 1 },
  featureText: { fontSize: 14, fontFamily: FF.regular, color: colors.textMid, flex: 1 },

  // Goal distance badge
  goalDistanceBadge: {
    fontSize: 12, fontFamily: FF.semibold, color: colors.textMuted,
    backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, overflow: 'hidden',
  },
  goalDistanceBadgeSelected: { color: '#E8458B', backgroundColor: 'rgba(232,69,139,0.1)' },

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
});
