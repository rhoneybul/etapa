/**
 * PlanPickerScreen — intake flow that asks a few short questions and then
 * hands off to PlanSelectionScreen with a recommended path.
 *
 * Flow (step = 0 is the intake landing, step 1+ are the questions):
 *   0. Intake landing  — "Let's find the right plan for you"
 *   1. Q1 intent         — getting started / event / fitter
 *   2. Q2 cycling type   — road / gravel / mtb / e-bike / mixed
 *   3. Q3 event details  — (event branch) OR longest ride (non-event)
 *   4. Q4 duration       — fixed weeks or open-ended
 *   5. Q5 longest ride   — (event branch only) OR review (non-event)
 *   6. Review            — (event branch only) confirm-and-continue
 *   → navigation.navigate('PlanSelection', { recommendedPath, intake })
 *
 * totalSteps:
 *   non-event = 5 (intent → cycling type → longest ride → duration → review)
 *   event     = 6 (intent → cycling type → event details → duration → longest ride → review)
 *
 * The welcome ("Hey Rob, let's ride") lives on WelcomeScreen which is what
 * HomeScreen renders on empty state; this screen is pushed to via the
 * navigator once the user has tapped Get Started there.
 *
 * Resume behaviour: if route.params.resumeIntake is present, the state is
 * rehydrated from that intake and the user lands directly on the review
 * step. Used when PlanConfig back-navigates here so the user doesn't lose
 * their answers.
 *
 * Deterministic rule-based recommendation — no LLM. See computeRecommendation
 * below for the branches. The recommendation is computed here and passed to
 * PlanSelection as a prop so the selection UI is shared between the
 * intake-recommended flow and the "+ New plan" (no recommendation) flow.
 */
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Keyboard, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily, useBottomInset } from '../theme';
import DatePicker from '../components/DatePicker';
import { setUserPrefs, saveGoal } from '../services/storageService';
import { isSubscribed } from '../services/subscriptionService';
import { lookupRace } from '../services/llmPlanService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

// ── Question answers ────────────────────────────────────────────────────────
const INTENT_OPTIONS = [
  { key: 'getting_started', title: "I'm getting started",              sub: 'New, or coming back after time off' },
  { key: 'event',           title: "I'm training for an event or goal", sub: 'Sportive, race, or a distance by a date' },
  { key: 'fitter',          title: "I want to get fitter",              sub: 'No deadline, just ride more' },
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

function Choice({ title, sub, highlighted, loading, disabled, unavailable, onPress }) {
  // `loading` = this card is the one the user just tapped; we show a small
  // spinner + highlight it so the feedback is instant (otherwise the tap
  // feels dead while state settles and the next step fades in).
  // `disabled` = any sibling card is currently loading; tap is blocked so
  // double-taps can't fire two different option choices.
  // `unavailable` = structurally invalid for the user's situation (e.g.
  // "16 weeks" when their event is 4 weeks away). Greyed out + tap
  // blocked; `sub` usually carries the reason in plain English.
  const inactive = !!disabled || !!unavailable;
  return (
    <TouchableOpacity
      style={[
        s.choiceCard,
        (highlighted || loading) && s.choiceCardHighlighted,
        unavailable && s.choiceCardUnavailable,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={inactive}
    >
      <View style={s.choiceRow}>
        <View style={{ flex: 1 }}>
          <Text style={[s.choiceTitle, unavailable && s.choiceTitleUnavailable]}>{title}</Text>
          {!!sub && (
            <Text style={[s.choiceSub, unavailable && s.choiceSubUnavailable]}>{sub}</Text>
          )}
        </View>
        {loading && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 10 }} />}
      </View>
    </TouchableOpacity>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

const CYCLING_TYPE_OPTIONS = [
  { key: 'road',   label: 'Road',    description: 'Road cycling on tarmac' },
  { key: 'gravel', label: 'Gravel',  description: 'Mixed surface and gravel riding' },
  { key: 'mtb',    label: 'Mountain bike', description: 'Off-road and trail riding' },
  { key: 'ebike',  label: 'E-bike',  description: 'Electric-assisted cycling' },
  { key: 'mixed',  label: 'A bit of everything', description: 'Mixed — whatever the day calls for' },
];

// Human-readable labels for the review screen — kept close to the lookup
// tables they summarise so any changes above show up here automatically.
const INTENT_LABEL = Object.fromEntries(INTENT_OPTIONS.map(o => [o.key, o.title]));
const CYCLING_TYPE_LABEL = Object.fromEntries(CYCLING_TYPE_OPTIONS.map(o => [o.key, o.label]));
const LONGEST_RIDE_LABEL = Object.fromEntries(
  [...LONGEST_RIDE_OPTIONS_FULL, ...LONGEST_RIDE_OPTIONS_GETTING_STARTED].map(o => [o.key, o.title])
);
const DURATION_LABEL = Object.fromEntries(
  [...DURATION_OPTIONS_EVENT, ...DURATION_OPTIONS_NONEVENT].map(o => [o.key, o.title])
);

export default function PlanPickerScreen({ navigation, route }) {
  // Resume intake (from PlanConfig back-nav). When present, state is
  // restored and the user lands directly on the review step so they can
  // tweak any answer without starting over.
  const resumeIntake = route?.params?.resumeIntake || null;

  // step 0 = landing, 1-6 = questions + review (see file header for map).
  const [step, setStep] = useState(0);
  // True while the user is editing a single field from the review screen.
  // Lets each "next step" handler know to return to review instead of
  // marching forward through the rest of the flow.
  const [editingFromReview, setEditingFromReview] = useState(false);
  // Which option card the user is currently tapping — drives the inline
  // spinner + highlight. When set, sibling cards are disabled so a
  // panicked double-tap can't fire two different picks. Reset to null
  // on every step change (see the useEffect below).
  const [pendingKey, setPendingKey] = useState(null);
  // ms the option-tap spinner shows before we actually advance to the next
  // step. Short enough that the flow still feels snappy, long enough that
  // the user registers a tap was received even on a fast render.
  const TAP_ACK_MS = 240;
  // Run a callback after a short visual acknowledgement. Wrapping each
  // pick-handler in this means we get the "hey, we heard you" UX for
  // every option card without repeating boilerplate.
  const ackThen = useCallback((key, cb) => {
    setPendingKey(key);
    const t = setTimeout(() => {
      cb();
      // pendingKey is cleared by the step-change effect below; but if a
      // handler doesn't change step (e.g. "custom km" trigger), we clear
      // here to be safe.
      setPendingKey(null);
    }, TAP_ACK_MS);
    return () => clearTimeout(t);
  }, []);
  // Clear pending state whenever the step actually changes — keeps the
  // next step's cards fresh (no lingering spinner if the user navigates
  // backwards/forwards quickly).
  useEffect(() => { setPendingKey(null); }, [step]);

  const [intent, setIntent]         = useState(null);
  const [longestRide, setLongestRide] = useState(null);
  const [customKm, setCustomKm]     = useState('');
  const [showCustomKm, setShowCustomKm] = useState(false);
  // Cycling type captured on its own dedicated Step 2. Defaults to Mixed
  // so users who skip the flow still land on a sensible value. Used to
  // live on GoalSetup Step 1 and BeginnerProgram bike-type; consolidating
  // it into the intake means every downstream pathway inherits a
  // consistent value rather than re-asking or hardcoding "mixed".
  const [cyclingType, setCyclingType] = useState('mixed');
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
        // Auto-fill the race date from the lookup — saves the user
        // figuring out the calendar for big known events (Traka 200,
        // Gran Fondo, etc.). Only fills if the field is currently empty
        // so we don't stomp on what the user already picked. Still
        // fully editable via the date picker below.
        if (result.eventDate && !eventDate) {
          setEventDate(result.eventDate);
        }
      } else {
        setRaceResult({ found: false });
      }
    } catch {
      setRaceResult({ found: false });
    }
    setRaceLooking(false);
  };

  const isEvent = intent === 'event';
  const totalSteps = isEvent ? 6 : 5;
  // Step number where the review screen lives. Diverges by branch because
  // event users have an extra step (longest ride is asked after duration).
  const reviewStep = isEvent ? 6 : 5;

  // Whole weeks between today and the event. Rounds DOWN — a 27-day window
  // can't fit a "4 weeks" plan even though 27/7 ≈ 3.86. Returns null when
  // there's no usable date (non-event flow, user tapped "not sure yet",
  // or the date is in the past somehow). Consumers treat null as
  // "no constraint — show every option".
  const weeksUntilEvent = useMemo(() => {
    if (!isEvent || !eventDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(eventDate);
    if (isNaN(target.getTime())) return null;
    target.setHours(0, 0, 0, 0);
    const days = Math.floor((target - today) / (24 * 60 * 60 * 1000));
    if (days <= 0) return 0;
    return Math.floor(days / 7);
  }, [isEvent, eventDate]);

  // Is this duration option viable given the event date? Non-numeric keys
  // (`to_date`, `ongoing`) are always viable — `to_date` literally means
  // "fill the time I have" and `ongoing` only appears in the non-event
  // flow where weeksUntilEvent is null. When there's no event date the
  // function returns true for everything.
  const durationFitsEvent = useCallback((key) => {
    const weeks = Number(key);
    if (!isFinite(weeks) || weeks <= 0) return true;
    if (weeksUntilEvent == null) return true;
    return weeksUntilEvent >= weeks;
  }, [weeksUntilEvent]);

  // Clear a previously-picked duration if editing the event date made it
  // invalid — otherwise the review screen would show a trainingLength the
  // plan generator can't actually honour. Only fires when the user goes
  // back and changes the date after already answering the duration step.
  useEffect(() => {
    if (!trainingLen) return;
    if (trainingLen === 'to_date' || trainingLen === 'ongoing') return;
    if (durationFitsEvent(trainingLen)) return;
    setTrainingLen(null);
  }, [trainingLen, durationFitsEvent]);

  // ── Step advance helpers ────────────────────────────────────────────────
  // Flow differs by intent:
  //   Event     : 1 intent → 2 cycling → 3 event details → 4 duration → 5 longest ride → 6 review → route
  //   Non-event : 1 intent → 2 cycling → 3 longest ride → 4 duration → 5 review → route
  // Longest ride sits after duration in the event branch because it's the
  // weakest signal once we know the user has a real event + timeline —
  // asking it upfront would feel out of order.

  // Helper: advance to `nextStep` after answering, unless the user was
  // editing a single field from the review screen — in which case jump
  // back to review so they don't have to re-march through the rest.
  const advanceOrReturn = (nextStep) => {
    if (editingFromReview) {
      setEditingFromReview(false);
      setStep(intent === 'event' ? 6 : 5);
      return;
    }
    setStep(nextStep);
  };

  const onPickIntent = (key) => {
    setIntent(key);
    analytics.events.planPickerAnswered?.({ question: 'intent', choice: key });
    ackThen(key, () => {
      if (editingFromReview) {
        // Edge case: user changed intent on review. Flow is completely
        // different between branches (event adds a step), so rather than
        // risk stale answers, reset to step 2 and let them walk through
        // the rest normally.
        setEditingFromReview(false);
      }
      setStep(2);
    });
  };

  const onPickCyclingType = (key) => {
    setCyclingType(key);
    analytics.events.planPickerAnswered?.({ question: 'cycling_type', choice: key });
    ackThen(key, () => advanceOrReturn(3));
  };

  // Longest ride lives at step 3 for non-event, step 5 for event. Either
  // way, answering it advances to the next step — which is duration for
  // non-event, review for event.
  const onPickLongestRide = (key) => {
    if (key === 'custom') {
      // "Enter exact" expands the input inline — no advance, so no
      // spinner. The highlight state is handled by showCustomKm.
      setShowCustomKm(true);
      setLongestRide(null);
      return;
    }
    setShowCustomKm(false);
    setCustomKm('');
    setLongestRide(key);
    analytics.events.planPickerAnswered?.({ question: 'longest_ride', choice: key });
    ackThen(key, () => {
      if (intent === 'event') {
        // Event: longest ride is the last question → review.
        advanceOrReturn(6);
        return;
      }
      advanceOrReturn(4);
    });
  };

  const onConfirmCustomKm = () => {
    const n = Number(String(customKm).trim());
    if (!isFinite(n) || n < 0 || n > 500) return;
    const derivedBucket = bucketFromKm(n);
    setLongestRide(derivedBucket);
    analytics.events.planPickerAnswered?.({ question: 'longest_ride', choice: 'custom', km: n });
    Keyboard.dismiss();
    if (intent === 'event') {
      advanceOrReturn(6);
      return;
    }
    advanceOrReturn(4);
  };

  const onPickEventDate = (iso) => {
    // DatePicker fires onChange on every tap — just store, don't advance.
    setEventDate(iso);
  };

  // At least one of name / distance / date must be set to advance —
  // anything less is just an empty form. Users building toward an
  // unnamed goal (e.g. "100 km by July") can skip the event name.
  const canAdvanceEventStep =
    !!eventName.trim() || !!targetDistance.trim() || !!eventDate;

  // Ref to the outer ScrollView so we can auto-scroll to the Continue
  // button the moment the form becomes valid. Saves users hunting for
  // the button below the keyboard / date picker.
  const scrollRef = useRef(null);
  // Stronger "is the form filled out" signal than canAdvanceEventStep —
  // fires when the user has EVERYTHING they need (name + distance +
  // date) rather than the looser "at least one field" gate. That's the
  // right trigger for auto-scrolling: we're not nagging them after the
  // first field, we're helpfully scrolling once they've finished.
  const formFullyFilled = isEvent
    ? (!!eventName.trim() && !!targetDistance.trim() && !!eventDate)
    : canAdvanceEventStep;
  useEffect(() => {
    if (formFullyFilled && scrollRef.current) {
      // Small delay lets any keyboard-dismiss layout settle before we
      // measure scroll extents — otherwise scrollToEnd stops at the
      // pre-dismiss height.
      const t = setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 150);
      return () => clearTimeout(t);
    }
  }, [formFullyFilled]);

  const onContinueFromEventDate = () => {
    if (!canAdvanceEventStep) return;
    analytics.events.planPickerAnswered?.({
      question: 'event_details',
      hasName: !!eventName.trim(),
      hasDate: !!eventDate,
      hasDistance: !!targetDistance,
      hasElevation: !!targetElevation,
      hasTime: !!targetTime,
    });
    advanceOrReturn(4);
  };

  // Duration lives at step 4 for both branches. Next step diverges:
  //   event     → step 5 (longest ride)
  //   non-event → step 5 (review)
  const onPickDuration = (key) => {
    setTrainingLen(key);
    analytics.events.planPickerAnswered?.({ question: 'training_length', choice: key });
    ackThen(key, () => advanceOrReturn(5));
  };

  const onBack = () => {
    if (step === 0) { navigation.goBack(); return; }
    // Linear back-stepping; content varies by branch but the step numbers
    // are consistent so a simple decrement works for every step 1-6.
    setStep(step - 1);
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
      // Cycling type (road / gravel / mtb / ebike / mixed). Answered on
      // Step 2 of this screen; downstream pathways (event / beginner /
      // quick) all read this instead of re-asking on GoalSetup or
      // BeginnerProgram.
      cyclingType,
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
        // Save the goal directly and skip straight to PlanConfig —
        // GoalSetup would otherwise re-ask everything we already have
        // in the intake (cycling type on step 1, goal type on step 2,
        // event name/distance/date on step 3) and then auto-continue.
        // Those three redundant screens confuse users; the
        // Traka-style "I already told you all this" reaction was
        // flagged in testing. We only fall back to GoalSetup if the
        // saveGoal call fails so the user still gets somewhere usable.
        const weeks = finalTrainingLen && finalTrainingLen !== 'ongoing' && finalTrainingLen !== 'to_date'
          ? Number(finalTrainingLen) : null;
        try {
          const goal = await saveGoal({
            cyclingType: intake.cyclingType || 'mixed',
            goalType: 'race',
            targetDistance: intake.targetDistance ?? null,
            targetElevation: intake.targetElevation ?? null,
            targetTime: intake.targetTime ?? null,
            targetDate: intake.eventDate || null,
            eventName: intake.eventName || null,
            // Mirrors GoalSetup's autoName: race name when we have
            // one, else a generic fallback. Downstream screens show
            // this string as the plan's title.
            planName: intake.eventName || 'Race Plan',
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
          navigation.replace('GoalSetup', { requirePaywall, intake });
        }
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
          // Use the picked cycling type instead of hardcoded mixed — the
          // user just told us which discipline they ride on Step 2, and
          // the plan-gen prompt reads this to phrase session descriptions.
          cyclingType: cyclingType || 'mixed',
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
  }, [intent, cyclingType, longestRide, customKm, eventDate, eventName, targetDistance, targetElevation, targetTime, trainingLen, navigation]);

  // ── Track funnel start once we leave the landing ────────────────────────
  const startedRef = React.useRef(false);
  useEffect(() => {
    if (step >= 1 && !startedRef.current) {
      startedRef.current = true;
      analytics.events.planPickerStarted?.();
    }
  }, [step]);

  // ── Resume from PlanConfig back-nav ─────────────────────────────────────
  // When PlanConfig sends the user back here (via navigation.replace with
  // resumeIntake), rehydrate the saved answers and land directly on the
  // review step so they can tweak anything without redoing the flow.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!resumeIntake || resumedRef.current) return;
    resumedRef.current = true;
    if (resumeIntake.intent) setIntent(resumeIntake.intent);
    if (resumeIntake.cyclingType) setCyclingType(resumeIntake.cyclingType);
    if (resumeIntake.longestRide) setLongestRide(resumeIntake.longestRide);
    if (resumeIntake.longestRideIsExact && resumeIntake.longestRideKm != null) {
      setCustomKm(String(resumeIntake.longestRideKm));
    }
    if (resumeIntake.eventDate) setEventDate(resumeIntake.eventDate);
    if (resumeIntake.eventName) setEventName(resumeIntake.eventName);
    if (resumeIntake.targetDistance != null) setTargetDistance(String(resumeIntake.targetDistance));
    if (resumeIntake.targetElevation != null) setTargetElevation(String(resumeIntake.targetElevation));
    if (resumeIntake.targetTime != null) setTargetTime(String(resumeIntake.targetTime));
    if (resumeIntake.trainingLength) setTrainingLen(resumeIntake.trainingLength);
    setStep(resumeIntake.intent === 'event' ? 6 : 5);
  }, [resumeIntake]);

  // ── Review screen helpers ───────────────────────────────────────────────
  // The review step is styled as a "here's our recommendation" reveal,
  // not a dry form summary. It computes the recommended plan from the
  // intake (same logic as completeAndRoute's routing), then pitches it
  // upbeat + warm. Edit affordance tucked below so the hero is the pitch.
  const editStepForField = (field) => {
    if (field === 'intent') return 1;
    if (field === 'cyclingType') return 2;
    if (field === 'event') return 3;          // event branch only
    if (field === 'longestRide') return isEvent ? 5 : 3;
    if (field === 'trainingLength') return 4;
    return reviewStep;
  };

  const reviewCanContinue =
    !!intent &&
    !!cyclingType &&
    !!trainingLen &&
    (
      isEvent
        ? (!!eventName.trim() || !!targetDistance.trim() || !!eventDate)
        : true
    ) &&
    (!!longestRide || isFinite(Number(customKm)));

  // Submit state for the big primary CTA on the review screen. The
  // completeAndRoute call does real async work (isSubscribed, saveGoal,
  // navigation.replace into a new stack) — without a spinner the button
  // feels dead for a beat.
  const [submitting, setSubmitting] = useState(false);
  const onConfirmReview = async () => {
    if (submitting) return;
    setSubmitting(true);
    analytics.events.planPickerAnswered?.({ question: 'review_confirmed' });
    try {
      await completeAndRoute();
    } finally {
      // Reset if we're still mounted (navigation.replace unmounts us,
      // so this only fires if routing failed — the user can retry).
      setSubmitting(false);
    }
  };

  // Compute the recommendation pitch (title, plan name, body, target).
  // Mirrors the branching in completeAndRoute so the user sees exactly
  // the same plan they'll get when they hit Confirm. Target distance is
  // surfaced because "you're aiming for 50 km" is the most concrete
  // thing we can say — more motivating than "a plan".
  const getRecommendationPitch = () => {
    const rec = computeRecommendation({ intent, longestRide });
    const longestKm = Number(String(customKm).trim());
    const userKm = isFinite(longestKm) && longestKm > 0
      ? Math.round(longestKm)
      : (BUCKET_TO_KM[longestRide] ?? 0);

    if (rec === 'event') {
      const name = eventName.trim() || 'your event';
      const dist = targetDistance ? Number(targetDistance) : null;
      const lenKey = trainingLen;
      const weeks = lenKey && lenKey !== 'to_date' ? lenKey : null;
      const weeksLine = weeks ? `${weeks}-week build` : 'full build from today';
      return {
        planName: name === 'your event' ? 'Event Plan' : name,
        title: `Let's get you ready for ${name}.`,
        pitch: dist
          ? `We're building a **${weeksLine}** to get you across the ${dist} km line — peaking right when race day hits.`
          : `We're building a **${weeksLine}** with your event at the centre — everything counts down to the date.`,
        why: 'Structured ride build, a proper taper in the final weeks, and a coach who knows exactly what you\'re training for.',
        targetLine: dist ? `Target: ${dist} km` : null,
      };
    }

    if (rec === 'beginner') {
      // Beginner programme always targets 50 km across 12 weeks — the
      // default shape of BeginnerProgramScreen. Keep it concrete: users
      // respond better to "we'll build you up to 50 km" than "a
      // beginner plan".
      const fromLine = userKm > 0
        ? `from your ${userKm} km longest ride`
        : 'from standing start';
      return {
        planName: 'Get Into Cycling',
        title: "Nice — we've got just the plan for you.",
        pitch: `Our **Get Into Cycling** programme: a warm, patient 12-week build ${fromLine} up to a confident **50 km**.`,
        why: 'Short, enjoyable rides at first. Longer ones week by week. Rest days built in. And a coach in your pocket for the wobbles.',
        targetLine: 'Target: 50 km in 12 weeks',
      };
    }

    // 'quick' — ongoing improvement plan. Mention the duration only when
    // it's a fixed-length block; ongoing plans read cleanest without a
    // length clause inside the headline pitch.
    const lenKey = trainingLen;
    const hasFixedLength = lenKey && lenKey !== 'ongoing' && lenKey !== 'to_date';
    const lengthClause = hasFixedLength ? `${lenKey}-week ` : '';
    const baseLine = userKm > 0
      ? `You've already got a ${userKm} km base`
      : "You're already riding";
    return {
      planName: 'Keep Improving',
      title: "You're set up beautifully.",
      pitch: `${baseLine} — we're putting you on **Keep Improving**, our ${lengthClause}plan that meets you where you are and keeps building.`,
      why: 'A sustainable mix of endurance, quality, and recovery. No burnout. No guesswork.',
      targetLine: hasFixedLength ? `${lenKey} weeks` : 'Ongoing — no fixed end',
    };
  };

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
            loading={pendingKey === o.key}
            disabled={pendingKey !== null && pendingKey !== o.key}
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

  // Bottom inset so the landing "Get started" CTA clears Android's
  // 3-button nav bar / gesture pill. iOS reports 0 for older devices
  // without a home indicator, and ~34pt for modern iPhones; the
  // useBottomInset hook handles both platforms (see theme/index.js).
  // On Android this returns at least 48pt so the button never sits
  // behind the nav chrome regardless of device.
  //
  // The Math.max floors preserve pre-fix spacing on devices with a
  // zero inset (iPhone SE etc.) so the button doesn't jump up
  // compared to what was shipping before — purely additive on Android
  // and on modern iPhones.
  const bottomInset = useBottomInset(12);
  const landingBottom = Math.max(28, bottomInset + 16);
  const questionBottom = Math.max(60, bottomInset + 40);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          step === 0 ? s.landingScrollWrap : s.scrollWrap,
          { paddingBottom: step === 0 ? landingBottom : questionBottom },
        ]}
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
              {/* "30 seconds · 3 questions" bullet removed — it duplicated
                  "Three quick questions" on the line above. The 30-second
                  reassurance is folded into the body copy so the info is
                  still there without the extra meta row. */}
              <Text style={s.landingBody}>
                Three quick questions, about 30 seconds — we&apos;ll point you at the kind of plan that fits.
                You can always switch later.
              </Text>
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
                <Choice
                  key={o.key}
                  title={o.title}
                  sub={o.sub}
                  loading={pendingKey === o.key}
                  disabled={pendingKey !== null && pendingKey !== o.key}
                  onPress={() => onPickIntent(o.key)}
                />
              ))}
            </View>
          </>
        )}

        {/* Q2 — cycling type. Dedicated step so it doesn't crowd the
            intent question. Previously lived as an afterthought chip row
            on Step 1, but it deserves its own question because it
            changes how we describe sessions (road vs gravel vs MTB). */}
        {step === 2 && (
          <>
            {renderQuestionHeader()}
            <Text style={s.title}>What kind of cycling?</Text>
            <Text style={s.subtitle}>Pick whatever you ride most. Shapes how we describe your sessions.</Text>
            <View style={s.choiceGroup}>
              {CYCLING_TYPE_OPTIONS.map(o => (
                <Choice
                  key={o.key}
                  title={o.label}
                  sub={o.description}
                  highlighted={cyclingType === o.key && pendingKey === null}
                  loading={pendingKey === o.key}
                  disabled={pendingKey !== null && pendingKey !== o.key}
                  onPress={() => onPickCyclingType(o.key)}
                />
              ))}
            </View>
          </>
        )}

        {/* Step 3 — event details (event branch) OR longest ride (non-event)
            The event form used to live on GoalSetup step 3; rolling it up
            here means the user enters race specifics once, not twice. */}
        {step === 3 && isEvent && (
          <>
            {renderQuestionHeader()}
            <Text style={s.title}>Tell us about your event or goal</Text>
            <Text style={s.subtitle}>Give us at least a name, a distance, or a date — whatever you&apos;ve got.</Text>

            <Text style={s.fieldLabel}>Event name (optional)</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Traka 360, London to Brighton, or leave blank"
              placeholderTextColor={colors.textFaint}
              value={eventName}
              onChangeText={setEventName}
              returnKeyType="search"
              onSubmitEditing={handleRaceLookup}
            />
            <TouchableOpacity
              style={[s.lookupBtn, !eventName.trim() && s.lookupBtnDisabled]}
              onPress={handleRaceLookup}
              disabled={!eventName.trim() || raceLooking}
              activeOpacity={0.8}
            >
              <Text style={s.lookupBtnText}>
                {raceLooking ? 'Looking up…' : 'Look up race details'}
              </Text>
            </TouchableOpacity>
            {raceResult && !raceResult.found && (
              <Text style={s.lookupMissText}>
                Couldn&apos;t find that race — fill the fields in manually.
              </Text>
            )}
            {raceResult?.found && (() => {
              // Call out which fields we filled in so users know the
              // date came from the lookup too (not just distance +
              // elevation). Keeps expectations honest when the LLM
              // returns a best-guess date — user can override anything
              // that looks off.
              const filled = [];
              if (raceResult.distanceKm) filled.push('distance');
              if (raceResult.elevationM) filled.push('elevation');
              if (raceResult.eventDate)  filled.push('race date');
              const list =
                filled.length === 0 ? null :
                filled.length === 1 ? filled[0] :
                filled.length === 2 ? `${filled[0]} and ${filled[1]}` :
                `${filled.slice(0, -1).join(', ')} and ${filled[filled.length - 1]}`;
              return (
                <Text style={s.lookupHitText}>
                  {list
                    ? `Found it — filled in ${list}. Double-check below.`
                    : 'Found it. Double-check the fields below.'}
                </Text>
              );
            })()}

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
              style={[s.primaryBtn, !canAdvanceEventStep && s.primaryBtnDisabled, { marginTop: 20 }]}
              onPress={onContinueFromEventDate}
              disabled={!canAdvanceEventStep}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          </>
        )}
        {step === 3 && !isEvent && renderLongestRide()}

        {/* Step 4 — duration */}
        {step === 4 && (() => {
          const opts = isEvent ? DURATION_OPTIONS_EVENT : DURATION_OPTIONS_NONEVENT;
          // Move the "Recommended" flag to the longest viable fixed
          // option when the event is closer than 12 weeks away. Without
          // this, "12 weeks — Recommended" sits greyed out while a
          // shorter plan is the actual sensible pick. Falls back to 12
          // (the default recommendation) when the event is far enough
          // away OR there's no event date.
          const recommendedKey = (() => {
            if (!isEvent || weeksUntilEvent == null) return '12';
            for (const k of ['12', '8', '4']) {
              if (weeksUntilEvent >= Number(k)) return k;
            }
            return 'to_date';
          })();
          return (
          <>
            {renderQuestionHeader()}
            <Text style={s.title}>
              {isEvent ? 'How long do you want to train?' : 'How long are you committing to?'}
            </Text>
            <Text style={s.subtitle}>
              {isEvent
                ? (weeksUntilEvent != null
                    ? `Your event is ${weeksUntilEvent} week${weeksUntilEvent === 1 ? '' : 's'} away — we'll work backwards from there.`
                    : "We'll work backwards from your event date.")
                : "Pick a horizon — you can always extend it."}
            </Text>
            <View style={s.choiceGroup}>
              {opts.map(o => {
                const fits = durationFitsEvent(o.key);
                // Swap the descriptive sub for a plain-English reason
                // when the option won't fit the event date. Keeps the
                // "why is this greyed out" answer visible on the card
                // itself instead of forcing users to guess.
                const sub = !fits
                  ? 'Event is sooner than this'
                  : (o.key === recommendedKey ? 'Recommended' : o.sub);
                return (
                  <Choice
                    key={o.key}
                    title={o.title}
                    sub={sub}
                    loading={pendingKey === o.key}
                    disabled={pendingKey !== null && pendingKey !== o.key}
                    unavailable={!fits}
                    onPress={() => onPickDuration(o.key)}
                  />
                );
              })}
            </View>
          </>
          );
        })()}

        {/* Step 5 — longest ride (event branch) OR review (non-event) */}
        {step === 5 && isEvent && renderLongestRide()}
        {step === 5 && !isEvent && renderReview()}

        {/* Step 6 — review (event branch only) */}
        {step === 6 && isEvent && renderReview()}

      </ScrollView>
    </SafeAreaView>
  );

  // ── Review renderer ─────────────────────────────────────────────────────
  // Framed as a "here's our recommendation" reveal instead of a dry form
  // summary. Structure:
  //   1. Eyebrow + warm title tailored to the chosen pathway
  //   2. Pitch paragraph naming the plan + target distance (where relevant)
  //   3. "Why it fits" — confidence-builder for the recommendation
  //   4. "Your answers" pill row for transparency, each pill tappable to edit
  //   5. Primary "Sounds good — build my plan" CTA
  function renderReview() {
    const pitch = getRecommendationPitch();
    const effectiveCyclingType = cyclingType || 'mixed';
    const longestKm = Number(String(customKm).trim());
    const longestLabel = isFinite(longestKm) && longestKm > 0
      ? `${Math.round(longestKm)} km`
      : (LONGEST_RIDE_LABEL[longestRide] || '—');

    // Build the answer pills. Order mirrors the step order so editing
    // "kind of cycling" feels spatially close to where it was answered.
    const answerPills = [
      { field: 'intent',        label: INTENT_LABEL[intent] || 'Not set' },
      { field: 'cyclingType',   label: CYCLING_TYPE_LABEL[effectiveCyclingType] || 'Mixed' },
      ...(isEvent && (eventName.trim() || targetDistance || eventDate)
        ? [{
            field: 'event',
            label: [eventName.trim(), targetDistance ? `${targetDistance} km` : null]
              .filter(Boolean).join(' · ') || 'Event details',
          }]
        : []),
      { field: 'longestRide',   label: `Longest: ${longestLabel}` },
      { field: 'trainingLength', label: DURATION_LABEL[trainingLen] || 'Duration' },
    ];

    return (
      <>
        {renderQuestionHeader()}

        <View style={s.recHero}>
          <Text style={s.recEyebrow}>YOUR PLAN</Text>
          <Text style={s.recTitle}>{pitch.title}</Text>

          {/* Pitch — render bold segments by splitting on ** markers. Keeps
              the copy authorable as plain strings without bringing in a
              full markdown parser for one style. */}
          <Text style={s.recPitch}>{renderEmphasised(pitch.pitch)}</Text>

          {pitch.targetLine && (
            <View style={s.recTargetChip}>
              <Text style={s.recTargetText}>{pitch.targetLine}</Text>
            </View>
          )}

          <Text style={s.recWhy}>{pitch.why}</Text>
        </View>

        <Text style={s.recAnswersLabel}>Based on your answers</Text>
        <View style={s.pillRow}>
          {answerPills.map(p => (
            <TouchableOpacity
              key={p.field}
              style={s.pill}
              onPress={() => setStep(editStepForField(p.field))}
              activeOpacity={0.75}
            >
              <Text style={s.pillText}>{p.label}</Text>
              <Text style={s.pillEdit}>Edit</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[s.primaryBtn, (!reviewCanContinue || submitting) && s.primaryBtnDisabled, { marginTop: 24 }]}
          onPress={onConfirmReview}
          disabled={!reviewCanContinue || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={s.primaryBtnText}>Building your plan…</Text>
            </View>
          ) : (
            <Text style={s.primaryBtnText}>Sounds good — let's go</Text>
          )}
        </TouchableOpacity>
      </>
    );
  }
}

// Render a string with **bold** markers, returning a Text tree. Scoped to
// this file — we don't need full markdown anywhere else on this screen.
function renderEmphasised(src) {
  const parts = String(src).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <Text key={i} style={{ fontFamily: fontFamily.semibold, color: colors.primary }}>{p.slice(2, -2)}</Text>;
    }
    return <Text key={i}>{p}</Text>;
  });
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
  // Unavailable (structurally invalid for the user's situation — e.g.
  // "16 weeks" when their event is 4 weeks away). Kept softer than a
  // full disabled state so the option is still legible — users need
  // to see what's in the list to understand why we chose to recommend
  // the option we did.
  choiceCardUnavailable: { opacity: 0.45 },
  choiceTitleUnavailable: { color: colors.textMid },
  choiceSubUnavailable: { color: colors.textFaint },
  choiceRow: { flexDirection: 'row', alignItems: 'center' },
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

  // Recommendation hero (review step) — the "here's your plan" reveal.
  // Single pink-tinted card that acts as a visual full-stop before the
  // intake flow ends. Bigger type than a normal question body so it
  // reads as a distinct moment, not another form.
  recHero: {
    backgroundColor: 'rgba(232,69,139,0.06)',
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.22)',
    borderRadius: 18, padding: 18, marginBottom: 18,
  },
  recEyebrow: {
    fontSize: 11, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.primary, letterSpacing: 1.4, textTransform: 'uppercase',
    marginBottom: 10,
  },
  recTitle: {
    fontSize: 22, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.text, lineHeight: 28, marginBottom: 10,
  },
  recPitch: {
    fontSize: 15, fontFamily: FF.regular, color: colors.text,
    lineHeight: 22, marginBottom: 12,
  },
  // Distinct chip for the concrete target ("Target: 50 km in 12 weeks") —
  // raised out of the pitch paragraph so it's the first thing the eye
  // catches. Works as a visual anchor on the screen.
  recTargetChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 100, marginBottom: 12,
  },
  recTargetText: {
    fontSize: 13, color: '#fff', fontFamily: FF.semibold, fontWeight: '600',
    letterSpacing: 0.2,
  },
  recWhy: {
    fontSize: 13, fontFamily: FF.regular, color: colors.textMid,
    lineHeight: 19,
  },

  // "Based on your answers" pill row — transparent summary with edit
  // affordance per pill. Smaller than the old full-card rows because the
  // hero above carries the narrative weight; this is just for tweaking.
  recAnswersLabel: {
    fontSize: 11, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase',
    marginBottom: 10,
  },
  pillRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 100, paddingHorizontal: 12, paddingVertical: 8,
  },
  pillText: { fontSize: 13, color: colors.text, fontFamily: FF.medium, fontWeight: '500' },
  pillEdit: { fontSize: 12, color: colors.primary, fontFamily: FF.medium, fontWeight: '500' },

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
