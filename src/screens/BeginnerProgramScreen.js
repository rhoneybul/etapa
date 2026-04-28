/**
 * Get into Cycling — a friendly beginner program.
 *
 * Stage 1 (this screen): user picks their goal distance and bike type,
 * sees what's included, then taps Continue.
 *
 * Stage 2: PaywallScreen handles the subscription purchase. On success
 * it navigates directly to PlanConfig with the goal pre-populated.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily, BOTTOM_INSET } from '../theme';
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

// ── Pre-pick quiz ──────────────────────────────────────────────────────────
// Two short questions that pre-select the user's goal distance. Skipped
// entirely when the PlanPicker intake already captured longest-ride data.
const RIDE_OPTIONS = [
  { key: 'none',     title: "I haven't really ridden" },
  { key: 'under_10', title: 'Under 10 km' },
  { key: '10_25',    title: '10–25 km' },
  { key: '25_50',    title: '25–50 km' },
  { key: 'over_50',  title: 'Over 50 km' },
];

const ACTIVITY_OPTIONS = [
  { key: 'desk',     title: 'Mostly desk work, not much else right now' },
  { key: 'walking',  title: 'Walking and on my feet a lot, no structured workouts' },
  { key: 'regular',  title: 'I work out 2–3 times a week (gym, running, a class)' },
  { key: 'trained',  title: "I work out 4+ times a week or I'm training for something" },
];

// Lookup matrix → recommended beginner goal key (habit=25 km, endurance=50 km,
// century=100 km). Derived from a coach rubric: current riding tier anchors
// the choice; non-cycling cardio bumps it up when the user has fitness we
// can lean on.
const SUGGESTION_MATRIX = {
  none:     { desk: 'habit',     walking: 'habit',     regular: 'endurance', trained: 'endurance' },
  under_10: { desk: 'habit',     walking: 'habit',     regular: 'endurance', trained: 'endurance' },
  '10_25':  { desk: 'endurance', walking: 'endurance', regular: 'endurance', trained: 'century'   },
  '25_50':  { desk: 'endurance', walking: 'century',   regular: 'century',   trained: 'century'   },
  over_50:  { desk: 'century',   walking: 'century',   regular: 'century',   trained: 'century'   },
};

// Map PlanPicker intake's longest-ride bucket → local RIDE_OPTIONS key.
// The intake uses finer buckets; we collapse the upper three into over_50.
const PLANPICKER_RIDE_MAP = {
  none:      'none',
  under_15:  'under_10',
  '15_30':   '10_25',
  '30_50':   '25_50',     // 'getting started'-specific bucket from PlanPicker
  '30_60':   '25_50',
  '60_100':  'over_50',
  '100_160': 'over_50',
  over_160:  'over_50',
};

function suggestGoalKey(rideKey, activityKey) {
  const row = SUGGESTION_MATRIX[rideKey];
  if (!row) return 'endurance';
  return row[activityKey] || 'endurance';
}

export default function BeginnerProgramScreen({ navigation, route }) {
  // Pre-pick quiz REMOVED. The old flow asked two questions here:
  //   Q1 "What's your longest recent ride?"
  //   Q2 "What does a typical week of movement look like?"
  // Both are either redundant (Q1 duplicates the PlanPicker intake
  // bucket) or pointlessly thrown away (Q2 nudged the suggestion but
  // was never passed to plan-gen). Every user arrives here via the
  // PlanPicker intake, so we now derive the goal suggestion directly
  // from `intake.longestRide` and default activity to 'walking' (the
  // neutral midpoint). Users reaching this screen without intake data
  // (deep link / legacy path) fall back to 'none' / 'walking' which
  // suggests the Habit plan — a safe default for an unknown rider.
  //
  // `phase`
  // drives what renders: q1 → q2 → calculating → done (main screen visible).
  const intake = route?.params?.intake || null;
  const hasIntakeRide = !!intake?.longestRide && PLANPICKER_RIDE_MAP[intake.longestRide];
  // Always start in 'calculating' now that the pre-quiz is gone. The
  // ~1400ms pause before landing on 'done' still gives the user a
  // "something is happening" moment without making them answer anything.
  const [phase, setPhase] = useState('calculating');
  // Seed the ride bucket from intake (mapped via PLANPICKER_RIDE_MAP) or
  // fall back to 'none' for the rare no-intake case.
  const [rideAnswer, setRideAnswer] = useState(
    hasIntakeRide ? PLANPICKER_RIDE_MAP[intake.longestRide] : 'none'
  );
  const [activityAnswer, setActivityAnswer] = useState(null);
  // Whether the currently-selected goalOption came from the quiz (as opposed
  // to a manual tap). Drives the "Based on your answers…" banner.
  const [autoSuggested, setAutoSuggested] = useState(false);

  const [goalOption, setGoalOption] = useState(null);
  // Bike / cycling type — now sourced from the PlanPicker intake. The
  // old in-screen bike-type picker was removed because (a) it duplicated
  // the question already asked on PlanPickerScreen and (b) its value
  // was actually read by plan-gen as `cyclingType`, while the intake
  // value was being thrown away. Fall back to 'mixed' if somehow we
  // reach this screen without an intake.
  //
  // Multi-bike awareness: prefer the new `cyclingTypes` array when
  // present so the goal carries the full menu through to plan-gen. The
  // legacy single `cyclingType` field is still derived for back-compat.
  const cyclingTypesFromIntake = Array.isArray(intake?.cyclingTypes) && intake.cyclingTypes.length > 0
    ? intake.cyclingTypes
    : (intake?.cyclingType ? [intake.cyclingType] : []);
  const bikeType = cyclingTypesFromIntake.length > 1
    ? 'mixed'
    : (cyclingTypesFromIntake[0] || intake?.cyclingType || 'mixed');
  const [showTips, setShowTips] = useState(false);
  const [continuing, setContinuing] = useState(false);

  // When we land in the 'calculating' phase, pause ~1400ms so the user feels
  // something is happening — then flip to 'done' with the suggestion
  // pre-selected. Activity answer defaults to 'walking' (neutral midpoint)
  // when we came in via the intake path where we didn't ask Q2.
  useEffect(() => {
    if (phase !== 'calculating') return undefined;
    const t = setTimeout(() => {
      const ride = rideAnswer;
      const activity = activityAnswer || 'walking';
      const key = suggestGoalKey(ride, activity);
      setGoalOption(key);
      setAutoSuggested(true);
      setPhase('done');
      analytics.capture?.('beginner_quiz_completed', {
        ride, activity: activityAnswer || null, suggestion: key,
        source: hasIntakeRide ? 'intake' : 'quiz',
      });
    }, 1400);
    return () => clearTimeout(t);
  }, [phase, rideAnswer, activityAnswer, hasIntakeRide]);

  /** Save goal then hand off to Paywall (or directly to PlanConfig if already subscribed) */
  const handleContinue = async () => {
    setContinuing(true);
    try {
      const chosen = GOAL_OPTIONS.find(g => g.key === goalOption) || GOAL_OPTIONS[1];
      const goal = await saveGoal({
        cyclingType: bikeType,
        // Pass the full array so plan-gen and downstream readers can
        // schedule across bikes. saveGoal ignores unknown fields so this
        // is safe even before the server-side persistence lands.
        cyclingTypes: cyclingTypesFromIntake,
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

      // Check subscription — if already subscribed, go straight to PlanConfig.
      // Otherwise, let them configure & generate the plan first, then show
      // the paywall on PlanReady so they can see what they're paying for.
      // TODO: remove __DEV__ bypass before release
      const subscribed = __DEV__ ? false : await isSubscribed();
      navigation.replace('PlanConfig', {
        ...planConfig,
        requirePaywall: !subscribed,
        defaultPlan: 'starter',
      });
    } finally {
      setContinuing(false);
    }
  };

  // ── Calculating phase ───────────────────────────────────────────────────
  // The q1 and q2 pre-quiz phases were removed — see the comment on the
  // `phase` state declaration above. QuizShell / RIDE_OPTIONS /
  // ACTIVITY_OPTIONS are retained in the module in case a future flow
  // wants to resurrect the in-screen quiz; they're just not reachable
  // from the main component anymore.
  if (phase === 'calculating') {
    return <CalculatingShell />;
  }

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
            {autoSuggested && goalOption && (
              // Small banner above the three cards — shows when the quiz
              // pre-selected a distance. Dismisses itself once the user
              // taps a different option (they've overridden us).
              <View style={s.suggestionBanner}>
                <Text style={s.suggestionBannerText}>
                  <Text style={s.suggestionBannerStrong}>Based on your answers, </Text>
                  we&apos;d start you at{' '}
                  <Text style={s.suggestionBannerStrong}>
                    {(GOAL_OPTIONS.find(g => g.key === goalOption) || {}).distance} km
                  </Text>
                  . Change it if you want.
                </Text>
              </View>
            )}
            <View style={s.daysOptions}>
              {GOAL_OPTIONS.map(opt => {
                const isSelected = goalOption === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.dayCard, isSelected && s.dayCardSelected]}
                    onPress={() => {
                      if (goalOption !== opt.key) setAutoSuggested(false);
                      setGoalOption(opt.key);
                    }}
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

          {/* Bike-type selector removed — cyclingType now comes from the
              PlanPicker intake (Step 1). Removing the duplicate question
              shortens this screen and fixes the bug where this screen's
              value was being thrown away in favour of a hardcoded
              default later in the flow. See BIKE_TYPES constant (dead
              code, kept for the rare case of a legacy deep link that
              somehow skipped the intake). */}

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

// ── Quiz shells ────────────────────────────────────────────────────────────
// Shared shape for the two quiz screens — header, progress dots, question,
// tap-card options. Kept local because they're only used here and the style
// intentionally mirrors the rest of BeginnerProgramScreen so the transition
// between quiz and main screen feels continuous.
function QuizShell({ navigation, step, title, subtitle, options, onPick }) {
  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          <View style={s.progressRow}>
            <View style={[s.progressDot, step >= 1 && s.progressDotActive]} />
            <View style={[s.progressDot, step >= 2 && s.progressDotActive]} />
          </View>
          <Text style={s.quizTitle}>{title}</Text>
          <Text style={s.quizSubtitle}>{subtitle}</Text>
          <View style={s.quizOptions}>
            {options.map(o => (
              <TouchableOpacity
                key={o.key}
                style={s.quizOption}
                onPress={() => onPick(o.key)}
                activeOpacity={0.85}
              >
                <Text style={s.quizOptionText}>{o.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// Short calculating screen between the last answer and the main screen. The
// work is actually instant — this is a deliberate pause so the user feels
// the answers are being processed. ~1400 ms is long enough to read
// "Building your recommendation…" and short enough to not annoy.
function CalculatingShell() {
  const [dots, setDots] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setDots(d => (d % 3) + 1), 420);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={s.container}>
      <SafeAreaView style={[s.safe, s.calcSafe]}>
        <ActivityIndicator size="large" color="#E8458B" />
        <Text style={s.calcText}>
          Building your recommendation{'.'.repeat(dots)}
        </Text>
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

  // Quiz
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 22 },
  progressDot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.border },
  progressDotActive: { backgroundColor: '#E8458B' },
  quizTitle: {
    fontSize: 24, fontFamily: FF.semibold, color: colors.text, lineHeight: 30,
    marginBottom: 8,
  },
  quizSubtitle: {
    fontSize: 14, fontFamily: FF.regular, color: colors.textMid, lineHeight: 21,
    marginBottom: 22,
  },
  quizOptions: { gap: 10 },
  quizOption: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  quizOptionText: { fontSize: 15, fontFamily: FF.medium, color: colors.text, lineHeight: 20 },

  // Calculating
  calcSafe: { alignItems: 'center', justifyContent: 'center' },
  calcText: {
    fontSize: 14, fontFamily: FF.medium, color: colors.textMid,
    marginTop: 16, letterSpacing: 0.3,
  },

  // "Based on your answers" banner
  suggestionBanner: {
    backgroundColor: 'rgba(232,69,139,0.08)',
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.25)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 12,
  },
  suggestionBannerText: {
    fontSize: 13, fontFamily: FF.regular, color: colors.textMid, lineHeight: 18,
  },
  suggestionBannerStrong: {
    fontFamily: FF.semibold, color: '#E8458B',
  },

  // CTAs
  ctaWrap: { paddingHorizontal: 24, paddingBottom: 16 + BOTTOM_INSET, paddingTop: 8, gap: 10 },
  ctaBtn: {
    backgroundColor: '#E8458B', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center',
  },
  ctaBtnDisabled: { opacity: 0.4 },
  ctaText: { fontSize: 16, fontFamily: FF.semibold, color: '#fff' },
});
