/**
 * OnboardingTour — first-run overlay walking a new user through the
 * most valuable parts of the app.
 *
 * 5 steps (rewritten April 2026):
 *   1. Welcome                    — warm positioning, who the app is for
 *   2. Today                      — the Today hero, the one thing you see daily
 *   3. Pick your coach            — 6 personalities; tap to pick; saves to prefs
 *   4. Sessions, clearly explained — structured breakdown (warm-up/main/cool-down)
 *   5. Units + Get started        — km/mi toggle + primary CTA
 *
 * Old content showed a generic "Build Base Fitness" plan with tempo intervals
 * at Week 3, which contradicted the beginner/returning-rider positioning in
 * BRAND.md. The new flow leans into what the app actually shows + is proud
 * of, and captures the units preference at the natural moment instead of
 * surfacing it later in Settings.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions,
  Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { colors, fontFamily } from '../theme';
import { getCoaches, DEFAULT_COACH_ID } from '../data/coaches';
import { getUserPrefs, setUserPrefs } from '../services/storageService';

const FF = fontFamily;
const { height: SH } = Dimensions.get('window');

// ── Tour steps ─────────────────────────────────────────────────────────────
// Step order and copy are tuned for Etapa's positioning (beginners,
// returning riders, women). Every string is in plain English — no FTP,
// TSS, or "Week 3 tempo intervals" vocabulary.
const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Etapa',
    body: 'Your AI cycling coach — built for new riders, returning riders, and anyone who wants a plan without the jargon.',
  },
  {
    id: 'today',
    title: 'Open the app. See today.',
    body: 'Your next session is the first thing you see — with one tap to open it, ask your coach about it, or tick it off. Tomorrow sits right underneath.',
    dummyCard: { type: 'today' },
  },
  {
    id: 'coach',
    title: 'Pick your coach',
    body: 'Six personalities. Pick the one you\'d actually ride with — you can switch later if they\'re not for you.',
    dummyCard: { type: 'coachPicker' },
  },
  {
    id: 'sessions',
    title: 'Every session, clearly explained',
    body: 'Hard sessions come with a warm-up, main set, and cool-down — and we show the target three ways: by feel, heart rate, or watts. Whichever works for you.',
    dummyCard: { type: 'sessionBreakdown' },
  },
  {
    id: 'ready',
    title: 'One last thing — km or miles?',
    body: 'Just so we know how to show your distances. You can change this anytime in Settings.',
    dummyCard: { type: 'units' },
    cta: 'Get started',
  },
];

// ── Dummy card renderers ───────────────────────────────────────────────────

/**
 * Step 2 — Today hero preview.
 * Mirrors the real HomeScreen Today hero: pink eyebrow, title, meta line,
 * action buttons. Below it a tiny Tomorrow preview so users see the pattern.
 */
function TodayCard() {
  return (
    <View style={cs.card}>
      <Text style={cs.todayEyebrow}>TODAY</Text>
      <Text style={cs.todayTitle}>First Adventure</Text>
      <Text style={cs.todayMeta}>8 km · 30 min · easy</Text>
      <View style={cs.todayActions}>
        <View style={cs.todayCta}>
          <Text style={cs.todayCtaText}>View details</Text>
          <Text style={cs.todayCtaArrow}>{'\u203A'}</Text>
        </View>
        <View style={cs.todayGhost}>
          <Text style={cs.todayGhostText}>Ask Clara</Text>
        </View>
      </View>

      {/* Divider — visually separates Today from Tomorrow, like the
          real home screen stacks them */}
      <View style={cs.divider} />

      <Text style={cs.tomorrowEyebrow}>TOMORROW</Text>
      <Text style={cs.tomorrowTitle}>Rest day</Text>
      <Text style={cs.tomorrowMeta}>Recovery is training too.</Text>
    </View>
  );
}

/**
 * Step 3 — Coach picker.
 * Real grid of the 6 coaches. Tapping one:
 *   - highlights the tapped card in pink
 *   - persists userPrefs.coachId immediately (the user's choice sticks even
 *     if they skip the rest of the tour)
 *   - shows a small sample quote from the picked coach so they know what
 *     they're getting tone-wise
 */
function CoachPickerCard({ selectedId, pendingId, onSelect }) {
  const coaches = getCoaches();
  const selected = coaches.find(c => c.id === selectedId) || coaches[0];
  return (
    <View style={cs.card}>
      <Text style={cs.cardLabel}>YOUR COACH</Text>

      {/* 3×2 grid of coach chips — initials + name + tagline */}
      <View style={cs.coachGrid}>
        {coaches.map((c) => {
          const picked = c.id === selectedId;
          // pendingId fires for ~300ms while we write the pref to
          // AsyncStorage — shows a tiny spinner on the tapped chip so
          // the tap doesn't feel dead before the highlight settles.
          const saving = c.id === pendingId;
          return (
            <TouchableOpacity
              key={c.id}
              style={[cs.coachChip, (picked || saving) && cs.coachChipPicked]}
              onPress={() => onSelect(c.id)}
              activeOpacity={0.85}
              disabled={pendingId !== null && pendingId !== c.id}
            >
              <View style={[cs.coachAvatar, { backgroundColor: c.avatarColor }]}>
                <Text style={cs.coachAvatarText}>{c.avatarInitials}</Text>
              </View>
              <Text style={[cs.coachName, picked && cs.coachNamePicked]} numberOfLines={1}>{c.name}</Text>
              <Text style={cs.coachTag} numberOfLines={2}>{c.tagline}</Text>
              {saving && (
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={cs.coachSpinner}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Sample quote from the currently-selected coach — gives the user a
          feel for the voice before they commit. Updates live as they tap
          different chips. */}
      {selected && (
        <View style={cs.quoteBox}>
          <Text style={cs.quoteAttrib}>{selected.name} says</Text>
          <Text style={cs.quoteText}>&ldquo;{selected.sampleQuote}&rdquo;</Text>
        </View>
      )}
    </View>
  );
}

/**
 * Step 4 — Structured session breakdown preview.
 * Shows the same three-stage layout the real ActivityDetail renders for
 * hard sessions: warm-up, main set (with triple-intensity), cool-down.
 * The point is the TRIPLE intensity — RPE / HR / power — which is the
 * best new thing in the app + the most beginner-friendly feature (RPE
 * needs no kit).
 */
function SessionBreakdownCard() {
  return (
    <View style={cs.card}>
      <Text style={cs.cardLabel}>HOW TO DO THIS SESSION</Text>

      {/* Warm-up */}
      <View style={cs.stage}>
        <Text style={cs.stageTitle}>Warm up · 10 min</Text>
        <Text style={cs.stageBody}>Easy spin, nothing to prove.</Text>
      </View>

      {/* Main set — pink-tinted to match the real screen */}
      <View style={[cs.stage, cs.stageMain]}>
        <Text style={[cs.stageTitle, cs.stageTitleMain]}>4 × 4 min hard, 3 min easy between</Text>
        <Text style={cs.stageBody}>Hold the effort steady. If the last rep drops off, the target was too high.</Text>

        <View style={cs.intensityBlock}>
          <View style={cs.intensityRow}>
            <Text style={cs.intensityKey}>Feel</Text>
            <Text style={cs.intensityVal}>8/10 — hard, short breaths</Text>
          </View>
          <View style={cs.intensityRow}>
            <Text style={cs.intensityKey}>Heart rate</Text>
            <Text style={cs.intensityVal}>Zone 4 · 85–92% of max</Text>
          </View>
          <View style={cs.intensityRow}>
            <Text style={cs.intensityKey}>Power</Text>
            <Text style={cs.intensityVal}>Zone 4 · 91–105% of FTP</Text>
          </View>
        </View>
      </View>

      {/* Cool-down */}
      <View style={cs.stage}>
        <Text style={cs.stageTitle}>Cool down · 10 min</Text>
        <Text style={cs.stageBody}>Easy spin, let the heart rate come down.</Text>
      </View>
    </View>
  );
}

/**
 * Step 5 — Units picker.
 * Big km / mi toggle, saves to userPrefs.units IMMEDIATELY on tap so the
 * choice persists even if the user bails before hitting Get Started. The
 * Get Started CTA lives in the main tour chrome (the "nextBtn" with
 * isLast styling) — this card just houses the toggle.
 */
function UnitsCard({ units, pending, onSelect }) {
  const renderBtn = (key, label, sub) => {
    const picked = units === key;
    const saving = pending === key;
    return (
      <TouchableOpacity
        style={[cs.unitsBtn, (picked || saving) && cs.unitsBtnPicked]}
        onPress={() => onSelect(key)}
        activeOpacity={0.85}
        disabled={pending !== null && pending !== key}
      >
        <Text style={[cs.unitsBtnText, picked && cs.unitsBtnTextPicked]}>{label}</Text>
        <Text style={[cs.unitsBtnSub, picked && cs.unitsBtnSubPicked]}>{sub}</Text>
        {saving && (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={{ position: 'absolute', top: 8, right: 8 }}
          />
        )}
      </TouchableOpacity>
    );
  };
  return (
    <View style={cs.card}>
      <Text style={cs.cardLabel}>DISTANCE UNITS</Text>
      <View style={cs.unitsRow}>
        {renderBtn('km', 'Kilometres', 'km')}
        {renderBtn('miles', 'Miles', 'mi')}
      </View>
    </View>
  );
}

/**
 * Dispatcher — picks the right renderer for the current step's card. The
 * coach + units cards need handlers, the other cards are stateless.
 */
function DummyCardRenderer({ dummyCard, selectedCoachId, pendingCoachId, onPickCoach, units, pendingUnits, onPickUnits }) {
  if (!dummyCard) return null;
  switch (dummyCard.type) {
    case 'today':              return <TodayCard />;
    case 'coachPicker':        return <CoachPickerCard selectedId={selectedCoachId} pendingId={pendingCoachId} onSelect={onPickCoach} />;
    case 'sessionBreakdown':   return <SessionBreakdownCard />;
    case 'units':              return <UnitsCard units={units} pending={pendingUnits} onSelect={onPickUnits} />;
    default:                    return null;
  }
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function OnboardingTour({ visible, onComplete }) {
  const [step, setStep] = useState(0);
  const [selectedCoachId, setSelectedCoachId] = useState(DEFAULT_COACH_ID);
  const [units, setUnits] = useState('km');
  // Transient "saving" state for coach + units picks. Set the moment the
  // user taps, cleared after the async prefs write settles. Drives a
  // small spinner on the tapped chip so the tap doesn't feel dead while
  // AsyncStorage flushes.
  const [pendingCoachId, setPendingCoachId] = useState(null);
  const [pendingUnits, setPendingUnits] = useState(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Hydrate existing prefs on open so repeat visitors don't have their
  // previous choices reset. Also means if the user picks a coach in
  // onboarding and re-enters it later (e.g. via a "View tour" link in
  // Settings — not built yet but likely), their pick is pre-highlighted.
  useEffect(() => {
    if (!visible) return;
    setStep(0);
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    getUserPrefs().then((p) => {
      if (p?.coachId) setSelectedCoachId(p.coachId);
      if (p?.units) setUnits(p.units);
    }).catch(() => {});
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  const animateTransition = (cb) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      cb();
      fadeAnim.setValue(0);
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    });
  };

  // Save coach choice immediately. Fire-and-forget — setUserPrefs mirrors
  // to AsyncStorage synchronously enough that by the time the user
  // completes the tour, the first plan config can read userPrefs.coachId
  // as its default.
  //
  // Visual feedback: set pendingCoachId while the storage write is in
  // flight so the tapped chip shows a spinner instead of feeling dead.
  // On slower phones the AsyncStorage write can be ~200ms and the user
  // registers no response otherwise.
  const handlePickCoach = (coachId) => {
    setSelectedCoachId(coachId);
    setPendingCoachId(coachId);
    setUserPrefs({ coachId })
      .catch(() => {})
      .finally(() => setPendingCoachId(null));
  };

  // Same pattern for units — persisted immediately so the rest of the
  // app (useUnits hook on Home, Calendar, WeekView, ActivityDetail)
  // picks up the choice from first render.
  const handlePickUnits = (nextUnits) => {
    setUnits(nextUnits);
    setPendingUnits(nextUnits);
    setUserPrefs({ units: nextUnits })
      .catch(() => {})
      .finally(() => setPendingUnits(null));
  };

  const handleNext = () => {
    if (step >= STEPS.length - 1) {
      // Final step — dismiss; units + coachId are already saved.
      onComplete?.();
      return;
    }
    animateTransition(() => setStep(s => s + 1));
  };

  const handleSkip = () => {
    // Skip still preserves any picks the user already made in earlier
    // steps because handlePickCoach / handlePickUnits wrote them as the
    // user tapped. Nothing to do here except dismiss.
    onComplete?.();
  };

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <View style={s.overlay}>
        {/* Skip button — always available, including the final step.
            Users who reach the last step and decide they're done can hit
            Skip to dismiss without the "Get started" confirmation. Picks
            made in earlier steps are preserved (handlePickCoach /
            handlePickUnits wrote them as the user tapped). */}
        <TouchableOpacity style={s.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={s.skipText}>Skip</Text>
        </TouchableOpacity>

        <Animated.View style={[
          s.contentWrap,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}>
          <ScrollView
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={s.title}>{current.title}</Text>
            <Text style={s.body}>{current.body}</Text>

            {current.dummyCard && (
              <View style={s.cardWrap}>
                <DummyCardRenderer
                  dummyCard={current.dummyCard}
                  selectedCoachId={selectedCoachId}
                  pendingCoachId={pendingCoachId}
                  onPickCoach={handlePickCoach}
                  units={units}
                  pendingUnits={pendingUnits}
                  onPickUnits={handlePickUnits}
                />
              </View>
            )}
          </ScrollView>

          {/* Progress dots */}
          <View style={s.dotsRow}>
            {STEPS.map((_, i) => (
              <View key={i} style={[s.dot, i === step && s.dotActive]} />
            ))}
          </View>

          {/* Action buttons — Back is available from step 1 onwards
              (including the final "Get started" step, so users can
              reverse out of the last screen). First step hides Back
              because there's nothing to go back to. */}
          <View style={s.btnRow}>
            {!isFirst && (
              <TouchableOpacity
                style={s.backBtn}
                onPress={() => animateTransition(() => setStep(st => st - 1))}
                activeOpacity={0.7}
              >
                <Text style={s.backBtnText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.nextBtn, isLast && s.ctaBtn]}
              onPress={handleNext}
              activeOpacity={0.85}
            >
              <Text style={[s.nextBtnText, isLast && s.ctaBtnText]}>
                {isLast ? (current.cta || 'Get started') : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  skipBtn: {
    position: 'absolute', top: 60, right: 24, zIndex: 10,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  skipText: {
    fontSize: 14, fontFamily: FF.regular, color: colors.textMid,
  },
  contentWrap: {
    flex: 1,
    justifyContent: 'center',
    maxHeight: SH * 0.88,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  title: {
    fontSize: 26, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.text, textAlign: 'center', marginBottom: 10,
  },
  body: {
    fontSize: 15, fontFamily: FF.regular, color: colors.textMid,
    textAlign: 'center', lineHeight: 22, maxWidth: 340, marginBottom: 20,
  },
  cardWrap: {
    width: '100%', maxWidth: 360, alignSelf: 'center',
  },
  dotsRow: {
    flexDirection: 'row', justifyContent: 'center',
    marginTop: 20, marginBottom: 20,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.textFaint, marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: colors.primary, width: 24,
  },
  btnRow: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 12, paddingBottom: 40,
  },
  backBtn: {
    paddingVertical: 14, paddingHorizontal: 24,
    borderRadius: 12, borderWidth: 1,
    borderColor: colors.border,
  },
  backBtnText: {
    fontSize: 15, fontFamily: FF.medium, color: colors.textMid,
  },
  nextBtn: {
    paddingVertical: 14, paddingHorizontal: 36,
    borderRadius: 12, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  nextBtnText: {
    fontSize: 15, fontFamily: FF.semibold, color: colors.text,
  },
  ctaBtn: {
    backgroundColor: colors.primary, borderColor: colors.primary,
    paddingHorizontal: 40,
  },
  ctaBtnText: {
    color: '#fff',
  },
});

// ── Card styles ────────────────────────────────────────────────────────────
const cs = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  cardLabel: {
    fontSize: 10, fontFamily: FF.medium, fontWeight: '500',
    color: colors.primary, letterSpacing: 1,
    marginBottom: 10, textTransform: 'uppercase',
  },
  divider: {
    height: 1, backgroundColor: colors.border,
    marginVertical: 14,
  },

  // ── Today card ───────────────────────────────────────────────────────
  todayEyebrow: {
    fontSize: 10, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.primary, letterSpacing: 1.2,
    marginBottom: 6, textTransform: 'uppercase',
  },
  todayTitle: {
    fontSize: 19, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.text, marginBottom: 4,
  },
  todayMeta: {
    fontSize: 13, fontFamily: FF.regular, color: colors.textMid,
    marginBottom: 14,
  },
  todayActions: {
    flexDirection: 'row', gap: 8,
  },
  todayCta: {
    flex: 1.6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 10, borderRadius: 10,
  },
  todayCtaText: {
    fontSize: 13, fontFamily: FF.semibold, fontWeight: '600', color: '#fff',
  },
  todayCtaArrow: {
    fontSize: 14, color: '#fff', fontWeight: '300',
  },
  todayGhost: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  todayGhostText: {
    fontSize: 13, fontFamily: FF.medium, color: colors.text,
  },
  tomorrowEyebrow: {
    fontSize: 10, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.textMuted, letterSpacing: 1.2,
    marginBottom: 4, textTransform: 'uppercase',
  },
  tomorrowTitle: {
    fontSize: 15, fontFamily: FF.medium, color: colors.text, marginBottom: 2,
  },
  tomorrowMeta: {
    fontSize: 12, fontFamily: FF.regular, color: colors.textMid,
  },

  // ── Coach picker ─────────────────────────────────────────────────────
  coachGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 8, marginBottom: 12,
  },
  coachChip: {
    width: '31.5%',
    alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 6,
    borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  coachChipPicked: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(232,69,139,0.08)',
  },
  coachAvatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  coachAvatarText: {
    fontSize: 12, fontFamily: FF.semibold, fontWeight: '700', color: '#fff',
  },
  coachName: {
    fontSize: 13, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.text, marginBottom: 2,
  },
  coachNamePicked: {
    color: colors.primary,
  },
  coachTag: {
    fontSize: 10, fontFamily: FF.regular,
    color: colors.textMuted, textAlign: 'center', lineHeight: 13,
  },
  // Positioned absolutely so it overlays the chip without bumping the
  // other text content around when it appears/disappears.
  coachSpinner: {
    position: 'absolute', top: 6, right: 6,
  },
  quoteBox: {
    padding: 12, borderRadius: 10,
    backgroundColor: 'rgba(232,69,139,0.06)',
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.18)',
  },
  quoteAttrib: {
    fontSize: 10, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.primary, letterSpacing: 1.2,
    marginBottom: 4, textTransform: 'uppercase',
  },
  quoteText: {
    fontSize: 13, fontFamily: FF.regular, color: colors.text,
    lineHeight: 19, fontStyle: 'italic',
  },

  // ── Session breakdown ────────────────────────────────────────────────
  stage: {
    paddingVertical: 8,
  },
  stageMain: {
    backgroundColor: 'rgba(232,69,139,0.06)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginVertical: 2,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.18)',
  },
  stageTitle: {
    fontSize: 13, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.text, marginBottom: 3,
  },
  stageTitleMain: { color: colors.primary },
  stageBody: {
    fontSize: 12.5, fontFamily: FF.regular, color: colors.textMid,
    lineHeight: 17,
  },
  intensityBlock: {
    marginTop: 8, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(232,69,139,0.14)',
    gap: 4,
  },
  intensityRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
  },
  intensityKey: {
    width: 74, fontSize: 10, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
    paddingTop: 2,
  },
  intensityVal: {
    flex: 1, fontSize: 12, fontFamily: FF.regular, color: colors.text,
    lineHeight: 16,
  },

  // ── Units picker ─────────────────────────────────────────────────────
  unitsRow: {
    flexDirection: 'row', gap: 10,
  },
  unitsBtn: {
    flex: 1,
    paddingVertical: 16, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
  },
  unitsBtnPicked: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(232,69,139,0.08)',
  },
  unitsBtnText: {
    fontSize: 15, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.text, marginBottom: 2,
  },
  unitsBtnTextPicked: { color: colors.primary },
  unitsBtnSub: {
    fontSize: 11, fontFamily: FF.regular, color: colors.textMuted,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  unitsBtnSubPicked: { color: colors.primary },
});
