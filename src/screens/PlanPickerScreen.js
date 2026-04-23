/**
 * PlanPickerScreen — intake flow that asks a few short questions and then
 * hands off to PlanSelectionScreen with a recommended path.
 *
 * Flow (step = 0 is the intake landing, step 1+ are the questions):
 *   0. Intake landing  — "Let's find the right plan for you"
 *   1. Q1 intent       — getting started / event / fitter
 *   2. Q2 longest ride — bucket or exact km
 *   3. Q3 event date   — bucket (event branch only)
 *   4. Q4 duration     — fixed weeks or open-ended
 *   → navigation.navigate('PlanSelection', { recommendedPath, intake })
 *
 * The welcome ("Hey Rob, let's ride") lives on WelcomeScreen which is what
 * HomeScreen renders on empty state; this screen is pushed to via the
 * navigator once the user has tapped Get Started there.
 *
 * Deterministic rule-based recommendation — no LLM. See computeRecommendation
 * below for the branches. The recommendation is computed here and passed to
 * PlanSelection as a prop so the selection UI is shared between the
 * intake-recommended flow and the "+ New plan" (no recommendation) flow.
 */
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { setUserPrefs } from '../services/storageService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

// ── Question answers ────────────────────────────────────────────────────────
const INTENT_OPTIONS = [
  { key: 'getting_started', title: "I'm getting started",       sub: 'New, or coming back after time off' },
  { key: 'event',           title: "I'm training for an event", sub: 'Sportive, race, first 100 km' },
  { key: 'fitter',          title: "I want to get fitter",       sub: 'No deadline, just ride more' },
];

const LONGEST_RIDE_OPTIONS = [
  { key: 'none',      title: "Haven't ridden yet" },
  { key: 'under_15',  title: 'Under 15 km' },
  { key: '15_30',     title: '15–30 km' },
  { key: '30_60',     title: '30–60 km' },
  { key: '60_100',    title: '60–100 km' },
  { key: '100_160',   title: '100–160 km' },
  { key: 'over_160',  title: 'Over 160 km' },
  { key: 'custom',    title: 'Enter exact distance' },
];

const BUCKET_TO_KM = {
  none: 0, under_15: 10, '15_30': 22, '30_60': 45,
  '60_100': 80, '100_160': 130, over_160: 180,
};

// Event-date buckets. Real date is captured properly later in GoalSetup —
// the intake only needs rough timing to shape the recommendation.
const EVENT_DATE_OPTIONS = [
  { key: 'within_6w', title: 'Within 6 weeks',   sub: 'Tight — we\'ll focus on finishing' },
  { key: '6_12w',     title: '6–12 weeks away',  sub: 'Sweet spot' },
  { key: '3_6m',      title: '3–6 months away',  sub: 'Plenty of time to build' },
  { key: '6m_plus',   title: '6+ months away' },
  { key: 'not_sure',  title: 'Not sure yet' },
];

const DURATION_OPTIONS_EVENT = [
  { key: '4',       title: '4 weeks',  sub: 'Short, focused block' },
  { key: '8',       title: '8 weeks',  sub: 'Solid build' },
  { key: '12',      title: '12 weeks', sub: 'Recommended' },
  { key: '16',      title: '16 weeks', sub: 'Long build for bigger events' },
  { key: 'to_date', title: 'All the way from today', sub: "We'll fill the time you have" },
];
const DURATION_OPTIONS_NONEVENT = [
  { key: '4',       title: '4 weeks',  sub: 'Dip my toe in' },
  { key: '8',       title: '8 weeks' },
  { key: '12',      title: '12 weeks', sub: 'Recommended' },
  { key: '16',      title: '16 weeks' },
  { key: 'ongoing', title: 'No fixed end', sub: 'Keep going week on week' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function levelFromLongestRide(key) {
  if (key === 'none' || key === 'under_15') return 'beginner';
  if (key === '15_30' || key === '30_60')    return 'intermediate';
  return 'advanced';
}

function levelFromKm(km) {
  if (km == null || km < 15) return 'beginner';
  if (km < 60) return 'intermediate';
  return 'advanced';
}

function bucketFromKm(km) {
  if (km == null || km <= 0)   return 'none';
  if (km < 15)                 return 'under_15';
  if (km < 30)                 return '15_30';
  if (km < 60)                 return '30_60';
  if (km < 100)                return '60_100';
  if (km < 160)                return '100_160';
  return 'over_160';
}

/** Deterministic plan recommendation. */
function computeRecommendation({ intent, longestRide }) {
  if (intent === 'event') return 'event';

  if (intent === 'getting_started') {
    return (longestRide === '30_60' || longestRide === '60_100' ||
            longestRide === '100_160' || longestRide === 'over_160')
      ? 'quick'
      : 'beginner';
  }
  // 'fitter'
  if (longestRide === 'none' || longestRide === 'under_15') return 'beginner';
  return 'quick';
}

// ── Small UI blocks ────────────────────────────────────────────────────────

function ProgressDots({ step, total }) {
  return (
    <View style={s.progressRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[s.progressBar, i < step ? s.progressBarActive : null]} />
      ))}
    </View>
  );
}

function Choice({ title, sub, highlighted, onPress }) {
  return (
    <TouchableOpacity
      style={[s.choiceCard, highlighted && s.choiceCardHighlighted]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={s.choiceTitle}>{title}</Text>
      {!!sub && <Text style={s.choiceSub}>{sub}</Text>}
    </TouchableOpacity>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function PlanPickerScreen({ navigation }) {
  // step 0 = landing, 1-4 = questions (with 3 being the event-only date bucket).
  const [step, setStep] = useState(0);

  const [intent, setIntent]         = useState(null);
  const [longestRide, setLongestRide] = useState(null);
  const [customKm, setCustomKm]     = useState('');
  const [showCustomKm, setShowCustomKm] = useState(false);
  const [eventBucket, setEventBucket] = useState(null);  // new: bucket key instead of date
  const [trainingLen, setTrainingLen] = useState(null);

  const isEvent = intent === 'event';
  const totalSteps = isEvent ? 4 : 3;

  // ── Step advance helpers ────────────────────────────────────────────────
  const onPickIntent = (key) => {
    setIntent(key);
    analytics.events.planPickerAnswered?.({ question: 'intent', choice: key });
    setStep(2);
  };

  const onPickLongestRide = (key) => {
    if (key === 'custom') {
      setShowCustomKm(true);
      setLongestRide(null);
      return;
    }
    setShowCustomKm(false);
    setCustomKm('');
    setLongestRide(key);
    analytics.events.planPickerAnswered?.({ question: 'longest_ride', choice: key });
    // event branch → date step, others → straight to duration
    setStep(intent === 'event' ? 3 : 4);
  };

  const onConfirmCustomKm = () => {
    const n = Number(String(customKm).trim());
    if (!isFinite(n) || n < 0 || n > 500) return;
    setLongestRide(bucketFromKm(n));
    analytics.events.planPickerAnswered?.({ question: 'longest_ride', choice: 'custom', km: n });
    Keyboard.dismiss();
    setStep(intent === 'event' ? 3 : 4);
  };

  const onPickEventDate = (key) => {
    setEventBucket(key);
    analytics.events.planPickerAnswered?.({ question: 'event_date', choice: key });
    setStep(4);
  };

  const onPickDuration = async (key) => {
    setTrainingLen(key);
    analytics.events.planPickerAnswered?.({ question: 'training_length', choice: key });
    await completeAndRoute(key);
  };

  const onBack = () => {
    if (step === 0) { navigation.goBack(); return; }
    if (step === 1) { setStep(0); return; }
    if (step === 2) { setStep(1); return; }
    if (step === 3) { setStep(2); return; }
    if (step === 4) { setStep(isEvent ? 3 : 2); return; }
  };

  const onSkip = () => {
    analytics.events.planPickerSkipped?.({ atStep: step });
    // Skip from anywhere inside the questions drops to PlanSelection with
    // no recommendation. The user has effectively given up on the intake.
    navigation.replace('PlanSelection');
  };

  // ── Build intake + route to PlanSelection with recommendation ───────────
  const buildIntake = useCallback(() => {
    const customKmNum = Number(String(customKm).trim());
    const km = isFinite(customKmNum) && customKmNum > 0
      ? Math.round(customKmNum)
      : (BUCKET_TO_KM[longestRide] ?? null);
    return {
      version: 1,
      answeredAt: new Date().toISOString(),
      intent,
      longestRide,
      longestRideKm: km,
      longestRideIsExact: isFinite(customKmNum) && customKmNum > 0,
      eventBucket,
      trainingLength: trainingLen,
      userLevel: km != null ? levelFromKm(km) : levelFromLongestRide(longestRide),
    };
  }, [intent, longestRide, customKm, eventBucket, trainingLen]);

  const completeAndRoute = useCallback(async (finalTrainingLen) => {
    const intake = {
      ...buildIntake(),
      trainingLength: finalTrainingLen,
    };
    const recommendedPath = computeRecommendation({ intent, longestRide });
    intake.recommendedPath = recommendedPath;

    try { await setUserPrefs({ skillIntake: intake }); } catch {}
    analytics.events.planPickerRecommended?.({ path: recommendedPath });

    navigation.replace('PlanSelection', { recommendedPath, intake });
  }, [buildIntake, intent, longestRide, navigation]);

  // ── Track funnel start once we leave the landing ────────────────────────
  const startedRef = React.useRef(false);
  useEffect(() => {
    if (step >= 1 && !startedRef.current) {
      startedRef.current = true;
      analytics.events.planPickerStarted?.();
    }
  }, [step]);

  // ── Render ──────────────────────────────────────────────────────────────
  const renderQuestionHeader = () => (
    <View style={s.headerRow}>
      <TouchableOpacity onPress={onBack} style={s.headerBtn} hitSlop={HIT}>
        <Text style={s.headerBtnText}>{step === 0 ? '' : '‹ Back'}</Text>
      </TouchableOpacity>
      <ProgressDots step={Math.min(step, totalSteps)} total={totalSteps} />
      <TouchableOpacity onPress={onSkip} style={s.headerBtn} hitSlop={HIT}>
        <Text style={s.headerSkip}>Skip</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={step === 0 ? s.landingScrollWrap : s.scrollWrap}
        showsVerticalScrollIndicator={false}
      >

        {/* Step 0 — intake landing */}
        {step === 0 && (
          <View style={s.landingWrap}>
            <View style={s.landingTop}>
              <View style={s.landingHeader}>
                <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
                  <Text style={s.headerBtnText}>‹ Back</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.landingEyebrow}>Let's go</Text>
              <Text style={s.landingTitle}>Let&apos;s find the right plan for you</Text>
              <Text style={s.landingBody}>
                Three quick questions — we&apos;ll point you at the kind of plan that fits.
                You can always switch later.
              </Text>
              <View style={s.landingMetaRow}>
                <View style={s.landingMetaDot} />
                <Text style={s.landingMetaText}>30 seconds &middot; 3 questions</Text>
              </View>
            </View>
            <View style={s.landingActions}>
              <TouchableOpacity style={s.primaryBtn} onPress={() => setStep(1)} activeOpacity={0.88}>
                <Text style={s.primaryBtnText}>Get started</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Q1 — intent */}
        {step === 1 && (
          <>
            {renderQuestionHeader()}
            <Text style={s.title}>What brings you here?</Text>
            <Text style={s.subtitle}>Tell us what you&apos;re after and we&apos;ll help you pick the right plan.</Text>
            <View style={s.choiceGroup}>
              {INTENT_OPTIONS.map(o => (
                <Choice key={o.key} title={o.title} sub={o.sub} onPress={() => onPickIntent(o.key)} />
              ))}
            </View>
          </>
        )}

        {/* Q2 — longest ride */}
        {step === 2 && (
          <>
            {renderQuestionHeader()}
            <Text style={s.title}>Your longest recent ride?</Text>
            <Text style={s.subtitle}>Honest answer — we&apos;ll pitch the plan to match.</Text>
            <View style={s.choiceGroup}>
              {LONGEST_RIDE_OPTIONS.map(o => (
                <Choice
                  key={o.key}
                  title={o.title}
                  highlighted={o.key === 'custom' && showCustomKm}
                  onPress={() => onPickLongestRide(o.key)}
                />
              ))}
            </View>
            {showCustomKm && (
              <View style={s.customKmWrap}>
                <Text style={s.customKmLabel}>How many kilometres?</Text>
                <View style={s.customKmRow}>
                  <TextInput
                    style={s.customKmInput}
                    value={customKm}
                    onChangeText={setCustomKm}
                    placeholder="e.g. 42"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="numeric"
                    returnKeyType="done"
                    onSubmitEditing={onConfirmCustomKm}
                    autoFocus
                    maxLength={3}
                  />
                  <Text style={s.customKmUnit}>km</Text>
                  <TouchableOpacity
                    style={[s.customKmBtn, (!customKm || !isFinite(Number(customKm)) || Number(customKm) <= 0) && s.customKmBtnDisabled]}
                    onPress={onConfirmCustomKm}
                    disabled={!customKm || !isFinite(Number(customKm)) || Number(customKm) <= 0}
                    activeOpacity={0.8}
                  >
                    <Text style={s.customKmBtnText}>Continue</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}

        {/* Q3 — event date (bucket) */}
        {step === 3 && isEvent && (
          <>
            {renderQuestionHeader()}
            <Text style={s.title}>When&apos;s your event?</Text>
            <Text style={s.subtitle}>Tight timelines change the approach. We&apos;ll capture the exact date in a moment.</Text>
            <View style={s.choiceGroup}>
              {EVENT_DATE_OPTIONS.map(o => (
                <Choice key={o.key} title={o.title} sub={o.sub} onPress={() => onPickEventDate(o.key)} />
              ))}
            </View>
          </>
        )}

        {/* Q4 — duration */}
        {step === 4 && (
          <>
            {renderQuestionHeader()}
            <Text style={s.title}>
              {isEvent ? 'How long do you want to train?' : 'How long are you committing to?'}
            </Text>
            <Text style={s.subtitle}>
              {isEvent
                ? "We'll work backwards from your event date."
                : "Pick a horizon — you can always extend it."}
            </Text>
            <View style={s.choiceGroup}>
              {(isEvent ? DURATION_OPTIONS_EVENT : DURATION_OPTIONS_NONEVENT).map(o => (
                <Choice key={o.key} title={o.title} sub={o.sub} onPress={() => onPickDuration(o.key)} />
              ))}
            </View>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollWrap: { padding: 20, paddingBottom: 60 },

  // Landing (step 0) — flex-grow + space-between so CTA anchors to bottom
  landingScrollWrap: { flexGrow: 1, padding: 24, paddingBottom: 28, justifyContent: 'space-between' },
  landingWrap: { flex: 1, justifyContent: 'space-between' },
  landingTop: { paddingTop: 10 },
  landingHeader: { marginBottom: 24 },
  landingEyebrow: {
    fontSize: 11, color: colors.primary, fontFamily: FF.semibold, fontWeight: '500',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12,
  },
  landingTitle: {
    fontSize: 28, fontFamily: FF.semibold, fontWeight: '500',
    color: colors.text, lineHeight: 34, marginBottom: 14,
  },
  landingBody: {
    fontSize: 15, fontFamily: FF.regular, color: colors.textMid,
    lineHeight: 22, marginBottom: 22,
  },
  landingMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  landingMetaDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.secondary },
  landingMetaText: { fontSize: 12, color: colors.textMuted, fontFamily: FF.regular },
  landingActions: { paddingBottom: 12 },

  // Question header
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  headerBtn: { minWidth: 48 },
  headerBtnText: { fontSize: 14, color: colors.textMid, fontFamily: FF.regular },
  headerSkip: { fontSize: 14, color: colors.primary, fontFamily: FF.medium, fontWeight: '500', textAlign: 'right' },
  progressRow: { flexDirection: 'row', flex: 1, gap: 6, marginHorizontal: 12 },
  progressBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.border },
  progressBarActive: { backgroundColor: colors.primary },

  // Question body
  title: {
    fontSize: 22, fontFamily: FF.semibold, fontWeight: '500',
    color: colors.text, lineHeight: 28, marginBottom: 6,
  },
  subtitle: {
    fontSize: 14, fontFamily: FF.regular,
    color: colors.textMid, lineHeight: 20, marginBottom: 20,
  },

  choiceGroup: { gap: 10 },
  choiceCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 14,
  },
  choiceCardHighlighted: {
    borderColor: colors.primary, backgroundColor: colors.primaryLight,
  },
  choiceTitle: { fontSize: 15, color: colors.text, fontFamily: FF.semibold, fontWeight: '500' },
  choiceSub: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, marginTop: 2 },

  // Custom km input
  customKmWrap: { marginTop: 16 },
  customKmLabel: {
    fontSize: 12, color: colors.textMid, fontFamily: FF.medium, fontWeight: '500',
    marginBottom: 8, letterSpacing: 0.3,
  },
  customKmRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customKmInput: {
    flex: 1, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontFamily: FF.regular, fontSize: 16,
  },
  customKmUnit: { color: colors.textMid, fontFamily: FF.regular, fontSize: 14 },
  customKmBtn: {
    backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12,
  },
  customKmBtnDisabled: { opacity: 0.35 },
  customKmBtnText: { color: '#fff', fontFamily: FF.semibold, fontWeight: '500', fontSize: 13 },

  // Primary CTA (landing)
  primaryBtn: {
    backgroundColor: colors.primary, paddingVertical: 14,
    borderRadius: 14, alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontFamily: FF.semibold, fontWeight: '500' },
});
