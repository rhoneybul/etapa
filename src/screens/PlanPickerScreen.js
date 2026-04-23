/**
 * PlanPickerScreen — guided intake that asks a few short questions (as a
 * professional cycling coach would) and recommends one of the three plan
 * pathways (beginner programme, goal-driven event plan, ongoing "fitter"
 * plan). Answers are persisted to user prefs as `skillIntake` and passed
 * through as route params so GoalSetup / PlanConfig / BeginnerProgram can
 * pre-fill fields without any changes to plan generation itself.
 *
 * Flow:
 *   Q1 — intent          (all branches)
 *   Q2 — longest ride    (all branches)
 *   Q3 — event date      (event branch only) — real date picker
 *   Q4 — training length (all branches — wording adapts)
 *   -> recommendation card + "or try these" alternatives
 *
 * Kept deterministic (rule-based, no LLM) so the recommendation is fast,
 * testable, and free. The plan generator still does the heavy lifting
 * downstream — this screen only routes + pre-fills.
 */
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import DatePicker from '../components/DatePicker';
import { saveGoal, setUserPrefs } from '../services/storageService';
import analytics from '../services/analyticsService';
import { isSubscribed } from '../services/subscriptionService';

const FF = fontFamily;

// Intake coach — single fixed persona for consistency.
const COACH = { id: 'clara', name: 'Clara', initials: 'CM', role: 'your coach' };

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

/**
 * Mid-bucket km we pass to the plan generator when the user picked a bucket
 * instead of entering a custom number. The generator uses this as "what the
 * athlete can comfortably ride today" — starting volume anchors off this.
 * The 'custom' key uses the user-entered value instead, handled at the call site.
 */
const BUCKET_TO_KM = {
  none: 0, under_15: 10, '15_30': 22, '30_60': 45,
  '60_100': 80, '100_160': 130, over_160: 180,
};

// Training-duration options. Copy adapts based on whether they're training
// for an event or not — the `key` is stable either way.
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

// ── Helpers: recommendation logic + downstream pre-fills ────────────────────

/** Map longest-ride bucket → user fitness level. */
function levelFromLongestRide(key) {
  if (key === 'none' || key === 'under_15') return 'beginner';
  if (key === '15_30' || key === '30_60')    return 'intermediate';
  // over_160 → advanced, everything else bucketed ≥ 60 km → advanced
  return 'advanced';
}

/** Map a raw km number → user fitness level (used for custom entry). */
function levelFromKm(km) {
  if (km == null || km < 15) return 'beginner';
  if (km < 60) return 'intermediate';
  return 'advanced';
}

/** Pick the best bucket key from a raw km number (for analytics consistency). */
function bucketFromKm(km) {
  if (km == null || km <= 0)   return 'none';
  if (km < 15)                 return 'under_15';
  if (km < 30)                 return '15_30';
  if (km < 60)                 return '30_60';
  if (km < 100)                return '60_100';
  if (km < 160)                return '100_160';
  return 'over_160';
}

/** Compute whole weeks between two ISO dates (min 1). */
function weeksBetween(isoA, isoB) {
  const a = new Date(isoA);
  const b = new Date(isoB);
  const ms = Math.abs(b - a);
  return Math.max(1, Math.round(ms / (7 * 24 * 60 * 60 * 1000)));
}

/**
 * Deterministic recommendation. Returns one of: 'beginner' | 'event' | 'quick'.
 * See inline comments for the coach-rationale behind each branch.
 */
function computeRecommendation({ intent, longestRide }) {
  if (intent === 'event') return 'event';

  if (intent === 'getting_started') {
    // Reality-check: if they ride 30+ km regularly, an ongoing plan suits
    // them better than a rigid 12-week beginner programme.
    return (longestRide === '30_60' || longestRide === '60_100' ||
            longestRide === '100_160' || longestRide === 'over_160')
      ? 'quick'
      : 'beginner';
  }

  // intent === 'fitter'
  // If they haven't got a base yet, ongoing-plan structure is too loose —
  // send them to the beginner programme to build the habit first.
  if (longestRide === 'none' || longestRide === 'under_15') return 'beginner';
  return 'quick';
}

/** Coach-voice rationale paragraph shown on the recommendation screen. */
function rationaleFor({ recommendation, intent, longestRide, eventDateIso, trainingLength }) {
  if (recommendation === 'event') {
    const weeks = eventDateIso ? weeksBetween(new Date().toISOString(), eventDateIso) : null;
    const tight = weeks !== null && weeks <= 6;
    const base  = (longestRide === 'none' || longestRide === 'under_15');
    if (tight && base) {
      return "Your event is close and you're still building base — we'll focus on getting you to the finish comfortably rather than chasing a time.";
    }
    if (tight) {
      return "Event's close — we'll make every week count and taper you in sharp.";
    }
    return "Plenty of runway to build. I'll ramp your volume sensibly and taper you into race day.";
  }

  if (recommendation === 'beginner') {
    if (intent === 'fitter') {
      return "You've asked to get fitter, but without a riding base yet we'd skip too many foundations. Let's use the 12-week programme to build the habit first — you can progress to an event plan after.";
    }
    return "A gentle 12-week programme will build your aerobic base, teach you how to recover, and have you comfortable on 60 km rides by the end. No experience needed.";
  }

  // quick
  if (intent === 'getting_started') {
    return "You're selling yourself short — with a 30+ km base, a flexible ongoing plan will suit you better than the fixed beginner programme. You can always switch later.";
  }
  return "You've got a solid base already. Ongoing, flexible plan — we'll keep you progressing week by week without a hard deadline.";
}

// ── Small UI building blocks ────────────────────────────────────────────────

function ProgressDots({ step, total }) {
  return (
    <View style={s.progressRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[s.progressBar, i < step ? s.progressBarActive : null]}
        />
      ))}
    </View>
  );
}

function CoachHeader({ label }) {
  return (
    <View style={s.coachRow}>
      <View style={s.coachDot}><Text style={s.coachInitials}>{COACH.initials}</Text></View>
      <Text style={s.coachLabel}>{COACH.name} · {label || COACH.role}</Text>
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

// ── Main screen ─────────────────────────────────────────────────────────────

export default function PlanPickerScreen({ onDismiss, navigation }) {
  // Step index: 1 intent, 2 longest ride, 3 event date (event only),
  // 4 duration, 5 recommendation. We advance linearly; non-event users skip 3.
  const [step, setStep] = useState(1);

  // Answers
  const [intent, setIntent]         = useState(null);
  const [longestRide, setLongestRide] = useState(null);
  // Custom longest-ride km. Non-null when the user tapped "Enter exact
  // distance" and typed a number. Takes precedence over the bucket midpoint
  // when we build the intake / prefills, so the plan generator gets the
  // exact figure they told us rather than a bucketed approximation.
  const [customKm, setCustomKm] = useState('');
  const [showCustomKm, setShowCustomKm] = useState(false);
  const [eventDate, setEventDate]   = useState('');         // ISO yyyy-mm-dd
  const [trainingLen, setTrainingLen] = useState(null);     // key from DURATION_OPTIONS_*

  // Total steps shown in the progress indicator. Non-event = 3 questions (Q1
  // intent, Q2 longest ride, Q4 duration); event = 4 (adds Q3 date).
  const totalSteps = intent === 'event' ? 4 : 3;
  const isEvent = intent === 'event';

  // ── Step advance helpers ────────────────────────────────────────────────
  const onPickIntent = (key) => {
    setIntent(key);
    analytics.events.planPickerAnswered?.({ question: 'intent', choice: key });
    setStep(2);
  };

  const onPickLongestRide = (key) => {
    if (key === 'custom') {
      // Don't advance — just reveal the TextInput inline. User taps Confirm
      // to commit their number and move on.
      setShowCustomKm(true);
      setLongestRide(null);
      return;
    }
    setShowCustomKm(false);
    setCustomKm('');
    setLongestRide(key);
    analytics.events.planPickerAnswered?.({ question: 'longest_ride', choice: key });
    // Event branch → date step; others → straight to duration
    setStep(intent === 'event' ? 3 : 4);
  };

  /**
   * User typed a custom km number and tapped Confirm. We store the bucket
   * *derived* from their km so analytics + recommendation logic stay in the
   * same shape as the pre-baked buckets, but the exact number is what flows
   * downstream to the plan generator.
   */
  const onConfirmCustomKm = () => {
    const n = Number(String(customKm).trim());
    if (!isFinite(n) || n < 0 || n > 500) return;
    const derivedBucket = bucketFromKm(n);
    setLongestRide(derivedBucket);
    analytics.events.planPickerAnswered?.({
      question: 'longest_ride',
      choice: 'custom',
      km: n,
    });
    Keyboard.dismiss();
    setStep(intent === 'event' ? 3 : 4);
  };

  const onPickDate = (iso) => {
    setEventDate(iso);
    // Don't auto-advance here — user needs to tap Continue, because pickers
    // can emit multiple onChange events while scrolling the month.
  };

  const onContinueFromDate = () => {
    if (!eventDate) return;
    analytics.events.planPickerAnswered?.({ question: 'event_date', choice: eventDate });
    setStep(4);
  };

  const onPickDuration = (key) => {
    setTrainingLen(key);
    analytics.events.planPickerAnswered?.({ question: 'training_length', choice: key });
    setStep(5);
  };

  // Skip link — dismisses the picker and returns to the legacy three-card
  // empty state. Tracked separately so we can see how often users opt out.
  const onSkip = () => {
    analytics.events.planPickerSkipped?.({ atStep: step });
    onDismiss?.();
  };

  const onBack = () => {
    if (step === 1) { onDismiss?.(); return; }
    // Walk back the same branches we walked forward
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else if (step === 4) setStep(isEvent ? 3 : 2);
    else if (step === 5) setStep(4);
  };

  // ── Recommendation + routing ────────────────────────────────────────────
  const recommendation = useMemo(() => {
    if (step !== 5) return null;
    return computeRecommendation({ intent, longestRide });
  }, [step, intent, longestRide]);

  const rationale = useMemo(() => {
    if (!recommendation) return '';
    return rationaleFor({
      recommendation, intent, longestRide,
      eventDateIso: eventDate || null,
      trainingLength: trainingLen,
    });
  }, [recommendation, intent, longestRide, eventDate, trainingLen]);

  /**
   * Build the `skillIntake` payload persisted to user prefs and echoed into
   * the downstream screen as a route param. Kept flat + JSON-safe.
   */
  const buildIntake = useCallback((chosenPath) => {
    // Prefer the user-entered km. Falls back to the bucket midpoint so the
    // plan generator always receives *some* number (even if coarse).
    const customKmNum = Number(String(customKm).trim());
    const km = isFinite(customKmNum) && customKmNum > 0
      ? Math.round(customKmNum)
      : (BUCKET_TO_KM[longestRide] ?? null);
    return {
      version: 1,
      answeredAt: new Date().toISOString(),
      intent,
      longestRide,                               // bucket key (for segmentation)
      longestRideKm: km,                         // exact km (for plan gen)
      longestRideIsExact: isFinite(customKmNum) && customKmNum > 0,
      eventDate: eventDate || null,
      trainingLength: trainingLen,
      userLevel: km != null ? levelFromKm(km) : levelFromLongestRide(longestRide),
      recommendedPath: recommendation,
      chosenPath,
    };
  }, [intent, longestRide, customKm, eventDate, trainingLen, recommendation]);

  /**
   * Route to the chosen pathway. Persists the intake, pre-fills whatever the
   * downstream screen understands, and never changes plan-gen logic itself.
   */
  const onChoose = async (chosenPath) => {
    const intake = buildIntake(chosenPath);
    analytics.events.planPickerChose?.({
      recommended_path: recommendation,
      chosen_path: chosenPath,
      override: recommendation !== chosenPath,
    });
    try { await setUserPrefs({ skillIntake: intake }); } catch {}

    const subscribed = __DEV__ ? false : await isSubscribed();

    if (chosenPath === 'beginner') {
      navigation.navigate('BeginnerProgram', { intake });
      return;
    }

    if (chosenPath === 'event') {
      navigation.navigate('GoalSetup', {
        requirePaywall: !subscribed,
        intake, // GoalSetupScreen reads this for pre-fill
      });
      return;
    }

    // 'quick' — save an "improve" goal and jump straight to PlanConfig, same
    // as HomeScreen's existing quick-plan handler. We add the intake so
    // PlanConfig can pre-fill weeks + userLevel.
    try {
      const weeks = trainingLen && trainingLen !== 'ongoing' && trainingLen !== 'to_date'
        ? Number(trainingLen) : null;
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
      navigation.navigate('PlanConfig', {
        goal,
        requirePaywall: !subscribed,
        intake,
        prefillWeeks: weeks,
        prefillLevel: intake.userLevel,
        prefillLongestRideKm: intake.longestRideKm,
      });
    } catch {
      navigation.navigate('QuickPlan', { requirePaywall: !subscribed, intake });
    }
  };

  // ── Track mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    analytics.events.planPickerStarted?.();
  }, []);

  // When we first show the recommendation card, log it.
  useEffect(() => {
    if (recommendation) {
      analytics.events.planPickerRecommended?.({ path: recommendation });
    }
  }, [recommendation]);

  // ── Render ──────────────────────────────────────────────────────────────

  const renderHeader = (showSkip) => (
    <View style={s.headerRow}>
      <TouchableOpacity onPress={onBack} style={s.headerBtn} hitSlop={HIT}>
        <Text style={s.headerBtnText}>{step === 1 ? '' : '‹ Back'}</Text>
      </TouchableOpacity>
      <ProgressDots step={Math.min(step, totalSteps)} total={totalSteps} />
      <TouchableOpacity onPress={onSkip} style={s.headerBtn} hitSlop={HIT}>
        <Text style={s.headerSkip}>{showSkip ? 'Skip' : ''}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView contentContainerStyle={s.scrollWrap} showsVerticalScrollIndicator={false}>

        {/* ── Q1: intent ───────────────────────────────────────────────── */}
        {step === 1 && (
          <>
            {renderHeader(true)}
            <CoachHeader />
            <Text style={s.title}>What brings you here?</Text>
            <Text style={s.subtitle}>Tell me what you're after and I'll help you pick the right plan.</Text>
            <View style={s.choiceGroup}>
              {INTENT_OPTIONS.map(o => (
                <Choice key={o.key} title={o.title} sub={o.sub} onPress={() => onPickIntent(o.key)} />
              ))}
            </View>
          </>
        )}

        {/* ── Q2: longest ride ─────────────────────────────────────────── */}
        {step === 2 && (
          <>
            {renderHeader(true)}
            <CoachHeader />
            <Text style={s.title}>Your longest recent ride?</Text>
            <Text style={s.subtitle}>Honest answer — I'll pitch the plan to match.</Text>
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

        {/* ── Q3: event date (event branch only) ──────────────────────── */}
        {step === 3 && isEvent && (
          <>
            {renderHeader(true)}
            <CoachHeader />
            <Text style={s.title}>When's your event?</Text>
            <Text style={s.subtitle}>Pick the date. You can fine-tune it later.</Text>
            <View style={{ marginTop: 8 }}>
              <DatePicker value={eventDate} onChange={onPickDate} minDate={new Date().toISOString().slice(0,10)} />
            </View>
            <TouchableOpacity
              style={[s.primaryBtn, !eventDate && s.primaryBtnDisabled]}
              onPress={onContinueFromDate}
              disabled={!eventDate}
              activeOpacity={0.8}
            >
              <Text style={s.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Q4: training duration ───────────────────────────────────── */}
        {step === 4 && (
          <>
            {renderHeader(true)}
            <CoachHeader />
            <Text style={s.title}>
              {isEvent ? 'How long do you want to train?' : 'How long are you committing to?'}
            </Text>
            <Text style={s.subtitle}>
              {isEvent
                ? "We'll work backwards from your event date."
                : "Pick a horizon — you can always extend it."}
            </Text>
            {isEvent && eventDate && (
              <Text style={s.hintText}>
                Your event is {weeksBetween(new Date().toISOString(), eventDate)} weeks away.
              </Text>
            )}
            <View style={s.choiceGroup}>
              {(isEvent ? DURATION_OPTIONS_EVENT : DURATION_OPTIONS_NONEVENT).map(o => {
                // Gentle disable: if user picks 16 weeks but the event is only 5,
                // the option is still visible but marked dimmed. Clicking it still
                // works (we cap it downstream).
                const weeksToEvent = isEvent && eventDate
                  ? weeksBetween(new Date().toISOString(), eventDate) : null;
                const wouldOverrun = weeksToEvent != null &&
                  !isNaN(Number(o.key)) &&
                  Number(o.key) > weeksToEvent;
                return (
                  <Choice
                    key={o.key}
                    title={o.title}
                    sub={wouldOverrun ? `Your event is ${weeksToEvent} weeks away — we'll cap this` : o.sub}
                    onPress={() => onPickDuration(o.key)}
                  />
                );
              })}
            </View>
          </>
        )}

        {/* ── Step 5: recommendation ──────────────────────────────────── */}
        {step === 5 && recommendation && (
          <>
            {renderHeader(false)}
            <CoachHeader label="Clara's recommendation" />
            <Text style={s.recTitle}>Here's what I'd pick for you</Text>
            <Text style={s.recRationale}>{rationale}</Text>

            {/* Recommended card (big, pink-accented) */}
            <TouchableOpacity
              style={s.recCard}
              activeOpacity={0.88}
              onPress={() => onChoose(recommendation)}
            >
              <View style={s.recBadge}><Text style={s.recBadgeText}>RECOMMENDED</Text></View>
              <Text style={s.recCardTitle}>
                {recommendation === 'beginner' && 'Get into cycling'}
                {recommendation === 'event'    && 'Build a plan for your event'}
                {recommendation === 'quick'    && 'Just get fitter'}
              </Text>
              <Text style={s.recCardSub}>
                {recommendation === 'beginner' && '12-week programme · no experience needed'}
                {recommendation === 'event'    && 'Target date + adjusts as you go'}
                {recommendation === 'quick'    && 'Flexible, ongoing, around your week'}
              </Text>
            </TouchableOpacity>

            {/* Alternatives */}
            <Text style={s.orTryLabel}>Or try one of these</Text>
            {['beginner','event','quick'].filter(p => p !== recommendation).map(p => (
              <TouchableOpacity
                key={p}
                style={s.altCard}
                onPress={() => onChoose(p)}
                activeOpacity={0.8}
              >
                <Text style={s.altCardTitle}>
                  {p === 'beginner' && 'Get into cycling'}
                  {p === 'event'    && 'Build a plan for your event'}
                  {p === 'quick'    && 'Just get fitter'}
                </Text>
                <Text style={s.altCardSub}>
                  {p === 'beginner' && '12-week programme for total beginners'}
                  {p === 'event'    && 'Work backwards from a date'}
                  {p === 'quick'    && 'Ongoing, flexible plan'}
                </Text>
              </TouchableOpacity>
            ))}
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

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerBtn: { minWidth: 48 },
  headerBtnText: { fontSize: 14, color: colors.textMid, fontFamily: FF.regular },
  headerSkip:     { fontSize: 14, color: colors.primary, fontFamily: FF.medium, textAlign: 'right' },

  progressRow: { flexDirection: 'row', flex: 1, gap: 6, marginHorizontal: 12 },
  progressBar: {
    flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.border,
  },
  progressBarActive: { backgroundColor: colors.primary },

  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  coachDot: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  coachInitials: { fontSize: 11, color: '#fff', fontFamily: FF.semibold, fontWeight: '500' },
  coachLabel:    { fontSize: 12, color: colors.textMid, fontFamily: FF.regular },

  title: {
    fontSize: 22, fontFamily: FF.semibold, fontWeight: '500',
    color: colors.text, lineHeight: 28, marginBottom: 6,
  },
  subtitle: {
    fontSize: 14, fontFamily: FF.regular,
    color: colors.textMid, lineHeight: 20, marginBottom: 20,
  },
  hintText: {
    fontSize: 12, color: colors.primary, fontFamily: FF.medium,
    marginBottom: 12,
  },

  choiceGroup: { gap: 10 },
  choiceCard: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 14,
  },
  choiceCardHighlighted: {
    borderColor: colors.primary, backgroundColor: colors.primaryLight,
  },
  choiceTitle: { fontSize: 15, color: colors.text, fontFamily: FF.semibold, fontWeight: '500' },
  choiceSub:   { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, marginTop: 2 },

  customKmWrap: { marginTop: 16 },
  customKmLabel: {
    fontSize: 12, color: colors.textMid, fontFamily: FF.medium,
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

  primaryBtn: {
    marginTop: 24, backgroundColor: colors.primary, paddingVertical: 14,
    borderRadius: 14, alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.35 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontFamily: FF.semibold, fontWeight: '500' },

  recTitle: {
    fontSize: 22, fontFamily: FF.semibold, fontWeight: '500',
    color: colors.text, marginBottom: 8,
  },
  recRationale: {
    fontSize: 14, color: colors.textMid, fontFamily: FF.regular,
    lineHeight: 21, marginBottom: 20,
  },
  recCard: {
    borderWidth: 1.5, borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    borderRadius: 16, padding: 18, marginBottom: 18,
  },
  recBadge: {
    alignSelf: 'flex-start', backgroundColor: colors.primary,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginBottom: 10,
  },
  recBadgeText: { fontSize: 10, color: '#fff', fontFamily: FF.semibold, fontWeight: '500', letterSpacing: 0.5 },
  recCardTitle: { fontSize: 18, color: colors.text, fontFamily: FF.semibold, fontWeight: '500', marginBottom: 4 },
  recCardSub:   { fontSize: 13, color: colors.textMid, fontFamily: FF.regular, lineHeight: 18 },

  orTryLabel: {
    fontSize: 12, color: colors.textMuted, fontFamily: FF.medium,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10,
  },
  altCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  altCardTitle: { fontSize: 14, color: colors.text, fontFamily: FF.semibold, fontWeight: '500' },
  altCardSub:   { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, marginTop: 2 },
});
