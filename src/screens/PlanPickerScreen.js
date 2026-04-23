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
import DatePicker from '../components/DatePicker';
import { setUserPrefs, saveGoal } from '../services/storageService';
import { isSubscribed } from '../services/subscriptionService';
import { lookupRace } from '../services/llmPlanService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

// ── Question answers ────────────────────────────────────────────────────────
const INTENT_OPTIONS = [
  { key: 'getting_started', title: "I'm getting started",       sub: 'New, or coming back after time off' },
  { key: 'event',           title: "I'm training for an event", sub: 'Sportive, race, first 100 km' },
  { key: 'fitter',          title: "I want to get fitter",       sub: 'No deadline, just ride more' },
];

// Longest-ride options. Full set used for event + fitter branches; a
// trimmed set is used for the "getting started" branch since options above
// 50 km are out of place for someone saying they're new — if a self-
// described beginner has actually ridden further, Enter exact distance
// catches the edge case without cluttering the primary list.
const LONGEST_RIDE_OPTIONS_FULL = [
  { key: 'none',      title: "Haven't ridden yet" },
  { key: 'under_15',  title: 'Under 15 km' },
  { key: '15_30',     title: '15–30 km' },
  { key: '30_60',     title: '30–60 km' },
  { key: '60_100',    title: '60–100 km' },
  { key: '100_160',   title: '100–160 km' },
  { key: 'over_160',  title: 'Over 160 km' },
  { key: 'custom',    title: 'Enter exact distance' },
];

const LONGEST_RIDE_OPTIONS_GETTING_STARTED = [
  { key: 'none',      title: "Haven't ridden yet" },
  { key: 'under_15',  title: 'Under 15 km' },
  { key: '15_30',     title: '15–30 km' },
  { key: '30_50',     title: '30–50 km' },
  { key: 'custom',    title: 'Enter exact distance' },
];

function getLongestRideOptions(intent) {
  return intent === 'getting_started'
    ? LONGEST_RIDE_OPTIONS_GETTING_STARTED
    : LONGEST_RIDE_OPTIONS_FULL;
}

const BUCKET_TO_KM = {
  none: 0, under_15: 10, '15_30': 22, '30_50': 40, '30_60': 45,
  '60_100': 80, '100_160': 130, over_160: 180,
};

// Event date is captured as a real date picker here rather than a bucket.
// We pass it straight through to GoalSetup so the user doesn't have to
// re-enter it. A "not sure yet" escape hatch lives below the picker for
// users who don't have a date locked in.

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
  if (key === '15_30' || key === '30_50' || key === '30_60') return 'intermediate';
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
    // Anything 30 km+ means the user already has a base — ongoing plan
    // suits them better than the rigid 12-week beginner programme.
    const hasBase = ['30_50', '30_60', '60_100', '100_160', 'over_160'].includes(longestRide);
    return hasBase ? 'quick' : 'beginner';
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
  // Real ISO date string (yyyy-mm-dd) when the user picks from the
  // DatePicker; null when they tap "Not sure yet". Either value advances.
  const [eventDate, setEventDate] = useState('');
  // Full event details captured on the same step as the date — rolled up
  // from what used to live on GoalSetup step 3 so the user doesn't fill
  // almost the same form twice.
  const [eventName, setEventName] = useState('');
  const [targetDistance, setTargetDistance] = useState('');
  const [targetElevation, setTargetElevation] = useState('');
  const [targetTime, setTargetTime] = useState('');
  const [raceLooking, setRaceLooking] = useState(false);
  const [raceResult, setRaceResult] = useState(null);
  const [trainingLen, setTrainingLen] = useState(null);

  const handleRaceLookup = async () => {
    const q = eventName.trim();
    if (!q) return;
    setRaceLooking(true);
    setRaceResult(null);
    // Clear previous distance/elevation so the new lookup doesn't clash
    // with a stale value (same fix that GoalSetup shipped a while back).
    setTargetDistance('');
    setTargetElevation('');
    try {
      const result = await lookupRace(q);
      if (result?.found) {
        setRaceResult(result);
        if (result.distanceKm) setTargetDistance(String(result.distanceKm));
        if (result.elevationM) setTargetElevation(String(result.elevationM));
      } else {
        setRaceResult({ found: false });
      }
    } catch {
      setRaceResult({ found: false });
    }
    setRaceLooking(false);
  };

  const isEvent = intent === 'event';
  const totalSteps = isEvent ? 4 : 3;

  // ── Step advance helpers ────────────────────────────────────────────────
  // Flow differs by intent:
  //   Event     : 1 intent → 2 event date → 3 duration → 4 longest ride → route
  //   Non-event : 1 intent → 2 longest ride → 3 duration → route
  // Longest ride is last in the event branch because it's the weakest
  // signal once we know the user has a real event + timeline — asking it
  // upfront would feel out of order.

  const onPickIntent = (key) => {
    setIntent(key);
    analytics.events.planPickerAnswered?.({ question: 'intent', choice: key });
    setStep(2);
  };

  // Non-event step 2 OR event step 4 → longest ride. For event, answering
  // this completes the flow. For non-event, advance to duration.
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
    if (intent === 'event') {
      // Event branch — longest ride is the last question, route now.
      completeAndRoute({ ride: key });
      return;
    }
    setStep(3);
  };

  const onConfirmCustomKm = () => {
    const n = Number(String(customKm).trim());
    if (!isFinite(n) || n < 0 || n > 500) return;
    const derivedBucket = bucketFromKm(n);
    setLongestRide(derivedBucket);
    analytics.events.planPickerAnswered?.({ question: 'longest_ride', choice: 'custom', km: n });
    Keyboard.dismiss();
    if (intent === 'event') {
      completeAndRoute({ ride: derivedBucket, km: Math.round(n) });
      return;
    }
    setStep(3);
  };

  const onPickEventDate = (iso) => {
    // DatePicker fires onChange on every tap — just store, don't advance.
    setEventDate(iso);
  };

  const onContinueFromEventDate = () => {
    // Event name is required to advance — everything else (date, distance,
    // elevation, time) is optional. User can refine later.
    if (!eventName.trim()) return;
    analytics.events.planPickerAnswered?.({
      question: 'event_details',
      hasDate: !!eventDate,
      hasDistance: !!targetDistance,
      hasElevation: !!targetElevation,
      hasTime: !!targetTime,
    });
    setStep(3);
  };

  // Event step 3 → duration → then longest ride (step 4).
  // Non-event step 3 → duration → route.
  const onPickDuration = async (key) => {
    setTrainingLen(key);
    analytics.events.planPickerAnswered?.({ question: 'training_length', choice: key });
    if (intent === 'event') {
      setStep(4);
      return;
    }
    await completeAndRoute({ trainingLen: key });
  };

  const onBack = () => {
    if (step === 0) { navigation.goBack(); return; }
    if (step === 1) { setStep(0); return; }
    if (step === 2) { setStep(1); return; }
    // step 3: both branches come here after step 2.
    if (step === 3) { setStep(2); return; }
    // step 4: event-only longest ride, goes back to duration.
    if (step === 4) { setStep(3); return; }
  };

  const onSkip = () => {
    analytics.events.planPickerSkipped?.({ atStep: step });
    // Skip from anywhere inside the questions drops to PlanSelection with
    // no recommendation. The user has effectively given up on the intake.
    navigation.replace('PlanSelection');
  };

  // ── Build intake + route to PlanSelection with recommendation ───────────
  // Accepts overrides so the caller can pass values that were just set via
  // setState (which won't be visible in this closure yet). `ride`, `km`, and
  // `trainingLen` all fall back to current state if not overridden.
  const completeAndRoute = useCallback(async (overrides = {}) => {
    const customKmNum = Number(String(customKm).trim());
    const rideKey = overrides.ride ?? longestRide;
    const km = overrides.km != null
      ? overrides.km
      : isFinite(customKmNum) && customKmNum > 0
        ? Math.round(customKmNum)
        : (BUCKET_TO_KM[rideKey] ?? null);
    const finalTrainingLen = overrides.trainingLen ?? trainingLen;

    const intake = {
      version: 1,
      answeredAt: new Date().toISOString(),
      intent,
      longestRide: rideKey,
      longestRideKm: km,
      longestRideIsExact: isFinite(customKmNum) && customKmNum > 0,
      eventDate: eventDate || null,
      // Event details, captured in the intake instead of on GoalSetup.
      eventName: eventName.trim() || null,
      targetDistance: targetDistance ? Number(targetDistance) : null,
      targetElevation: targetElevation ? Number(targetElevation) : null,
      targetTime: targetTime ? Number(targetTime) : null,
      trainingLength: finalTrainingLen,
      userLevel: km != null ? levelFromKm(km) : levelFromLongestRide(rideKey),
    };
    const recommendedPath = computeRecommendation({ intent, longestRide: rideKey });
    intake.recommendedPath = recommendedPath;

    try { await setUserPrefs({ skillIntake: intake }); } catch {}
    analytics.events.planPickerRecommended?.({ path: recommendedPath });

    // Skip the PlanSelection confirmation when the recommendation matches
    // what the user already told us they wanted. The confirmation screen
    // only earns its place when there's a *surprise* — e.g. user said
    // "getting started" but we're routing them to the ongoing plan because
    // they already have a 60 km base. Otherwise it's a redundant tap.
    //
    //   intent=event            → always matches → skip
    //   intent=fitter + quick   → matches → skip
    //   intent=getting_started + beginner → matches → skip
    //   any other combination   → show PlanSelection with rationale
    const intentMatchesRecommendation =
      (intent === 'event' && recommendedPath === 'event') ||
      (intent === 'fitter' && recommendedPath === 'quick') ||
      (intent === 'getting_started' && recommendedPath === 'beginner');

    if (intentMatchesRecommendation) {
      const subscribed = __DEV__ ? false : await isSubscribed();
      const requirePaywall = !subscribed;

      if (recommendedPath === 'event') {
        navigation.replace('GoalSetup', { requirePaywall, intake });
        return;
      }
      if (recommendedPath === 'beginner') {
        navigation.replace('BeginnerProgram', { intake });
        return;
      }
      // 'quick' — save an improve-goal and route straight to PlanConfig.
      // Mirrors PlanSelectionScreen.onChoose so downstream behaviour is
      // identical whether the user went through the confirmation or not.
      const weeks = finalTrainingLen && finalTrainingLen !== 'ongoing' && finalTrainingLen !== 'to_date'
        ? Number(finalTrainingLen) : null;
      try {
        const goal = await saveGoal({
          cyclingType: 'mixed',
          goalType: 'improve',
          planName: 'Keep improving',
          targetDistance: null,
          targetElevation: null,
          targetTime: null,
          targetDate: null,
          eventName: null,
        });
        navigation.replace('PlanConfig', {
          goal,
          requirePaywall,
          intake,
          prefillWeeks: weeks,
          prefillLevel: intake.userLevel,
          prefillLongestRideKm: intake.longestRideKm,
        });
      } catch {
        navigation.replace('QuickPlan', { requirePaywall, intake });
      }
      return;
    }

    navigation.replace('PlanSelection', { recommendedPath, intake });
  }, [intent, longestRide, customKm, eventDate, eventName, targetDistance, targetElevation, targetTime, trainingLen, navigation]);

  // ── Track funnel start once we leave the landing ────────────────────────
  const startedRef = React.useRef(false);
  useEffect(() => {
    if (step >= 1 && !startedRef.current) {
      startedRef.current = true;
      analytics.events.planPickerStarted?.();
    }
  }, [step]);

  // ── Render ──────────────────────────────────────────────────────────────
  // Longest-ride question body — factored out because it renders at step 2
  // (non-event branch) AND step 4 (event branch, as the final question).
  const renderLongestRide = () => (
    <>
      {renderQuestionHeader()}
      <Text style={s.title}>Your longest recent ride?</Text>
      <Text style={s.subtitle}>Honest answer — we&apos;ll pitch the plan to match.</Text>
      <View style={s.choiceGroup}>
        {getLongestRideOptions(intent).map(o => (
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
  );

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

        {/* Step 2 — event details (event branch) OR longest ride (non-event)
            The event form used to live on GoalSetup step 3; rolling it up
            here means the user enters race specifics once, not twice. */}
        {step === 2 && isEvent && (
          <>
            {renderQuestionHeader()}
            <Text style={s.title}>Tell us about your event</Text>
            <Text style={s.subtitle}>Name is required — everything else can be filled in later.</Text>

            <Text style={s.fieldLabel}>Race / event name</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Traka 360, London to Brighton"
              placeholderTextColor={colors.textFaint}
              value={eventName}
              onChangeText={setEventName}
              returnKeyType="search"
              onSubmitEditing={handleRaceLookup}
              autoFocus
            />
            <TouchableOpacity
              style={[s.lookupBtn, !eventName.trim() && s.lookupBtnDisabled]}
              onPress={handleRaceLookup}
              disabled={!eventName.trim() || raceLooking}
              activeOpacity={0.8}
            >
              <Text style={s.lookupBtnText}>
                {raceLooking ? 'Looking up…' : 'Look up distance & elevation'}
              </Text>
            </TouchableOpacity>
            {raceResult && !raceResult.found && (
              <Text style={s.lookupMissText}>
                Couldn&apos;t find that race — fill the fields in manually.
              </Text>
            )}
            {raceResult?.found && (
              <Text style={s.lookupHitText}>
                Found it. Check the numbers below are right.
              </Text>
            )}

            <Text style={s.fieldLabel}>Distance (km, optional)</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. 100"
              placeholderTextColor={colors.textFaint}
              value={targetDistance}
              onChangeText={setTargetDistance}
              keyboardType="numeric"
              returnKeyType="next"
            />

            <Text style={s.fieldLabel}>Elevation gain (m, optional)</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. 2500"
              placeholderTextColor={colors.textFaint}
              value={targetElevation}
              onChangeText={setTargetElevation}
              keyboardType="numeric"
              returnKeyType="next"
            />

            <Text style={s.fieldLabel}>Target time (hours, optional)</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. 5.5"
              placeholderTextColor={colors.textFaint}
              value={targetTime}
              onChangeText={setTargetTime}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />

            <Text style={s.fieldLabel}>Race date (optional)</Text>
            <DatePicker
              value={eventDate}
              onChange={onPickEventDate}
              minDate={new Date().toISOString().slice(0, 10)}
            />

            <TouchableOpacity
              style={[s.primaryBtn, !eventName.trim() && s.primaryBtnDisabled, { marginTop: 20 }]}
              onPress={onContinueFromEventDate}
              disabled={!eventName.trim()}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          </>
        )}
        {step === 2 && !isEvent && renderLongestRide()}

        {/* Step 3 — duration */}
        {step === 3 && (
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

        {/* Step 4 — longest ride (event branch only) */}
        {step === 4 && isEvent && renderLongestRide()}

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

  // Primary CTA (landing + date-picker continue)
  primaryBtn: {
    backgroundColor: colors.primary, paddingVertical: 14,
    borderRadius: 14, alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.35 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontFamily: FF.semibold, fontWeight: '500' },

  // Event-details form (step 2, event branch)
  fieldLabel: {
    fontSize: 13, color: colors.textMid, fontFamily: FF.medium, fontWeight: '500',
    marginTop: 16, marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontFamily: FF.regular, fontSize: 15,
  },
  lookupBtn: {
    marginTop: 10, paddingVertical: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.35)',
    borderRadius: 12, backgroundColor: 'rgba(232,69,139,0.08)',
  },
  lookupBtnDisabled: { opacity: 0.4 },
  lookupBtnText: { color: colors.primary, fontSize: 13, fontFamily: FF.semibold, fontWeight: '500' },
  lookupMissText: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, marginTop: 8 },
  lookupHitText: { fontSize: 12, color: colors.primary, fontFamily: FF.medium, fontWeight: '500', marginTop: 8 },
});
