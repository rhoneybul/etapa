/**
 * Goal Setup Wizard — 3 steps:
 *  Step 1: Cycling type (road / gravel / mtb / mixed)
 *  Step 2: Goal type (race / distance / improve)
 *  Step 3: Goal details (plan name, target distance/elevation, date, event name)
 */
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Keyboard, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors, fontFamily } from '../theme';
import WizardShell, { OptionCard } from '../components/WizardShell';
import DatePicker from '../components/DatePicker';
import { saveGoal } from '../services/storageService';
import { lookupRace } from '../services/llmPlanService';
import analytics from '../services/analyticsService';

const FF = fontFamily;
const TOTAL_STEPS = 3;

const CYCLING_TYPES = [
  { key: 'road',   label: 'Road', description: 'Road cycling on tarmac' },
  { key: 'gravel', label: 'Gravel', description: 'Mixed surface and gravel riding' },
  { key: 'mtb',    label: 'Mountain Bike', description: 'Off-road and trail riding' },
  { key: 'ebike',  label: 'E-Bike', description: 'Electric-assisted cycling' },
  { key: 'mixed',  label: 'Mixed', description: 'A bit of everything' },
];

const GOAL_TYPES = [
  { key: 'race',    label: 'Race', description: 'Training for a specific race or sportive' },
  { key: 'distance',label: 'Hit a distance', description: 'Build up to a target distance' },
  { key: 'improve', label: 'Just want to improve', description: 'Get fitter and stronger on the bike' },
];

export default function GoalSetupScreen({ navigation, route }) {
  const requirePaywall = route?.params?.requirePaywall || false;
  // Pre-fills from the guided PlanPicker (opt-in intake flow on home). Only
  // reads the intake — never branches on it — so downstream plan generation
  // is unchanged. If intake is absent, the screen behaves exactly as before.
  const intake = route?.params?.intake || null;
  // If the PlanPicker intake already fixed the goalType (event users have
  // implicitly said "race"), we don't need to show step 2 — auto-advance
  // past it. The user can still go back to change it, but the default path
  // skips a redundant tap.
  const skipGoalTypeStep = intake?.intent === 'event';
  const [step, setStep] = useState(1);
  // Used by the abandon-tracking effect below to distinguish "user progressed
  // to the next screen" (set true on success) from "user hit back / closed".
  const completedRef = useRef(false);
  // Keep the latest step in a ref so the abandon listener can read it at exit time.
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; }, [step]);

  // Fire plan_funnel_abandoned if the user leaves this screen without
  // advancing to PlanConfig. Includes the step they bailed on.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', () => {
      if (completedRef.current) return; // They advanced successfully — not an abandon.
      analytics.events.planFunnelAbandoned({
        atScreen: 'GoalSetup',
        atStep: stepRef.current,
      });
    });
    return unsub;
  }, [navigation]);
  const [cyclingType, setCyclingType] = useState(null);
  // PlanPicker pre-fill: if user came from the intake flow with intent=event,
  // seed goalType so step 1 can advance past the "pick a goal type" prompt
  // straight into the specifics. User can still change it on the screen.
  const [goalType, setGoalType] = useState(intake?.intent === 'event' ? 'race' : null);
  const [planName, setPlanName] = useState('');
  // PlanPicker pre-fill: the intake flow now asks for race name, distance,
  // elevation and time directly. Pre-seed the form and — when we have an
  // event name — skip GoalSetup's step 3 entirely. User can still edit
  // anything via Settings / Edit plan later.
  const [targetDistance, setTargetDistance] = useState(intake?.targetDistance != null ? String(intake.targetDistance) : '');
  const [targetElevation, setTargetElevation] = useState(intake?.targetElevation != null ? String(intake.targetElevation) : '');
  const [targetTime, setTargetTime] = useState(intake?.targetTime != null ? String(intake.targetTime) : '');
  const [targetDate, setTargetDate] = useState(intake?.eventDate || '');
  const [eventName, setEventName] = useState(intake?.eventName || '');

  // Whether the intake already has all the event specifics we need. When
  // true, step 3 is skipped in both the forward and back directions — the
  // user answered these questions 1 screen ago already.
  const skipGoalDetailsStep = intake?.intent === 'event' && !!intake?.eventName;
  const [raceLooking, setRaceLooking] = useState(false);
  const [raceResult, setRaceResult] = useState(null);

  const handleRaceLookup = async () => {
    if (!eventName.trim()) return;
    // Wipe the previous lookup state BEFORE firing a new request. Prevents
    // the "typed Traka 360, got 360km; changed to London Marathon, fields
    // still show 360km" bug (reported by Nick, Apr 2026). Only reason the
    // old code had `!targetDistance` guards was to respect manually-typed
    // values — but users who have clicked "Look up" explicitly want the
    // fields to sync to whatever the new lookup returns.
    setRaceLooking(true);
    setRaceResult(null);
    setTargetDistance('');
    setTargetElevation('');
    try {
      const result = await lookupRace(eventName.trim());
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

  const canContinue = () => {
    if (step === 1) return !!cyclingType;
    if (step === 2) return !!goalType;
    if (step === 3) {
      if (goalType === 'improve') return true;
      if (goalType === 'distance') return targetDistance.length > 0;
      if (goalType === 'race') return eventName.length > 0;
      return true;
    }
    return false;
  };

  const handleContinue = async () => {
    // Step-advance path — only runs when we're not at the final step and
    // not about to short-circuit to save.
    // Event users who filled in the full event form on the intake already
    // have everything we need after tapping Continue on step 1 (bike type),
    // so we skip both step 2 (goalType) and step 3 (race specifics) and
    // fall through to the save block below.
    const shouldFinishNow = step === 1 && skipGoalTypeStep && skipGoalDetailsStep;
    if (step < TOTAL_STEPS && !shouldFinishNow) {
      if (step === 1) analytics.events.goalStepCompleted(1, { cyclingType });
      if (step === 2) analytics.events.goalStepCompleted(2, { goalType });
      if (step === 1 && skipGoalTypeStep) {
        setStep(3); // jump past goalType; step 3 still needs answering
        return;
      }
      setStep(step + 1);
      return;
    }

    // For race goals, use the race name directly as the plan name
    // For other goals, auto-generate
    const autoName = goalType === 'race'
      ? (eventName || planName.trim() || 'Race Plan')
      : (planName.trim() || eventName || (targetDistance ? `${targetDistance} km` : null) || (goalType === 'improve' ? 'Improve my cycling' : 'My plan'));

    const goal = await saveGoal({
      cyclingType,
      goalType,
      targetDistance: targetDistance ? parseFloat(targetDistance) : null,
      targetElevation: targetElevation ? parseFloat(targetElevation) : null,
      targetTime: targetTime ? parseFloat(targetTime) : null,
      targetDate: targetDate || null,
      eventName: eventName || null,
      planName: autoName,
    });

    analytics.events.goalStepCompleted(3, { goalType, hasEventName: !!eventName, hasTargetDate: !!targetDate });
    analytics.events.goalCreated({
      cyclingType,
      goalType,
      targetDistance: targetDistance ? parseFloat(targetDistance) : null,
      targetDate: targetDate || null,
      eventName: eventName || null,
    });

    completedRef.current = true; // Tell the abandon listener this is a successful advance.
    // Forward the PlanPicker intake + its derived pre-fills. Absent when the
    // user came from the legacy three-card flow — PlanConfig tolerates null.
    // `trainingLength` from the intake becomes `prefillWeeks` so PlanConfig
    // can skip its own "how long is this plan?" step for event users who
    // already answered that in the intake.
    const trainingLen = intake?.trainingLength;
    const prefillWeeks = (trainingLen && trainingLen !== 'ongoing' && trainingLen !== 'to_date')
      ? Number(trainingLen)
      : null;
    navigation.replace('PlanConfig', {
      goal,
      requirePaywall,
      intake,
      prefillWeeks,
      prefillLevel: intake?.userLevel || null,
      prefillLongestRideKm: intake?.longestRideKm || null,
    });
  };

  const handleBack = () => {
    if (step <= 1) { navigation.goBack(); return; }
    // If goalType was auto-selected from the intake, skipping back from
    // step 3 → step 2 would show a question we pre-answered. Jump to step 1.
    if (step === 3 && skipGoalTypeStep) { setStep(1); return; }
    setStep(step - 1);
  };

  const renderStep = () => {
    if (step === 1) {
      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          {CYCLING_TYPES.map(ct => (
            <OptionCard
              key={ct.key}
              label={ct.label}
              description={ct.description}
              selected={cyclingType === ct.key}
              onPress={() => setCyclingType(ct.key)}
            />
          ))}
        </ScrollView>
      );
    }

    if (step === 2) {
      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          {GOAL_TYPES.map(gt => (
            <OptionCard
              key={gt.key}
              label={gt.label}
              description={gt.description}
              selected={goalType === gt.key}
              onPress={() => setGoalType(gt.key)}
            />
          ))}
        </ScrollView>
      );
    }

    if (step === 3) {
      return (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Plan name — shown for non-race goals */}
          {goalType !== 'race' && (
            <>
              <Text style={s.fieldLabel}>Plan name</Text>
              <TextInput
                style={s.input}
                placeholder={eventName || (targetDistance ? `${targetDistance} km` : 'e.g. Summer build, 100km goal')}
                placeholderTextColor={colors.textFaint}
                value={planName}
                onChangeText={setPlanName}
              />
            </>
          )}

          {goalType === 'improve' && (
            <Text style={s.infoText}>
              We'll build a plan to get you riding consistently and improving your fitness on the bike.
            </Text>
          )}

          {goalType === 'race' && (
            <>
              <Text style={s.fieldLabel}>Race / event name</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Etape du Tour, London to Brighton"
                placeholderTextColor={colors.textFaint}
                value={eventName}
                onChangeText={(text) => { setEventName(text); setRaceResult(null); }}
              />

              {/* Look up button */}
              {eventName.trim().length > 2 && (
                <TouchableOpacity
                  style={s.lookupBtn}
                  onPress={handleRaceLookup}
                  disabled={raceLooking}
                  activeOpacity={0.8}
                >
                  {raceLooking ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={s.lookupBtnText}>Look up distance & elevation</Text>
                  )}
                </TouchableOpacity>
              )}

              {/* Lookup result */}
              {raceResult?.found && (
                <View style={s.lookupResult}>
                  <Text style={s.lookupResultName}>{raceResult.name}</Text>
                  <Text style={s.lookupResultMeta}>
                    {[
                      raceResult.distanceKm ? `${raceResult.distanceKm} km` : null,
                      raceResult.elevationM ? `${raceResult.elevationM} m elevation` : null,
                      raceResult.location,
                    ].filter(Boolean).join(' \u00B7 ')}
                  </Text>
                  {raceResult.description && (
                    <Text style={s.lookupResultDesc}>{raceResult.description}</Text>
                  )}
                </View>
              )}
              {raceResult && !raceResult.found && (
                <Text style={s.lookupNotFound}>
                  Couldn't find that race — enter the details manually below
                </Text>
              )}

              <Text style={s.fieldLabel}>Distance (km{raceResult?.found ? '' : ', optional'})</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. 100"
                placeholderTextColor={colors.textFaint}
                value={targetDistance}
                onChangeText={setTargetDistance}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              <Text style={s.fieldLabel}>Elevation gain (m, optional)</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. 2500"
                placeholderTextColor={colors.textFaint}
                value={targetElevation}
                onChangeText={setTargetElevation}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
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
              {/* Race date — hidden when the PlanPicker intake already
                  captured one. The user answered this 3 screens ago and
                  shouldn't be asked again. A small confirmation row is
                  shown instead, with a tap-to-edit fallback for anyone
                  who wants to change it. */}
              {intake?.eventDate ? (
                <View style={s.prefilledRow}>
                  <View>
                    <Text style={s.prefilledLabel}>Race date</Text>
                    <Text style={s.prefilledValue}>
                      {new Date(intake.eventDate).toLocaleDateString('en-GB', {
                        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      // Let the user override — wipe the state and fall back
                      // to the regular picker on the next render.
                      setTargetDate('');
                    }}
                    hitSlop={HIT}
                  >
                    <Text style={s.prefilledEdit}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <DatePicker
                  label="Race date (optional)"
                  value={targetDate}
                  onChange={setTargetDate}
                />
              )}
            </>
          )}

          {goalType === 'distance' && (
            <>
              <Text style={s.fieldLabel}>What distance do you want to hit? (km)</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. 100"
                placeholderTextColor={colors.textFaint}
                value={targetDistance}
                onChangeText={setTargetDistance}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              <Text style={s.fieldLabel}>Elevation gain (m, optional)</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. 1500"
                placeholderTextColor={colors.textFaint}
                value={targetElevation}
                onChangeText={setTargetElevation}
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              <Text style={s.fieldLabel}>Target time (hours, optional)</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. 4"
                placeholderTextColor={colors.textFaint}
                value={targetTime}
                onChangeText={setTargetTime}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              <DatePicker
                label="By when? (optional)"
                value={targetDate}
                onChange={setTargetDate}
              />
            </>
          )}
        </ScrollView>
      );
    }
  };

  const titles = {
    1: 'What type of cycling?',
    2: 'What is your goal?',
    3: goalType === 'improve' ? 'Just want to improve' : 'Tell us about your goal',
  };

  const subtitles = {
    1: 'Pick the type that best describes your riding',
    2: 'Pick a goal that suits you best',
    3: goalType === 'improve' ? null : 'We\'ll use this to tailor your plan',
  };

  return (
    <WizardShell
      step={step}
      totalSteps={TOTAL_STEPS}
      title={titles[step]}
      subtitle={subtitles[step]}
      onBack={handleBack}
      onClose={() => navigation.popToTop()}
      onContinue={handleContinue}
      continueDisabled={!canContinue()}
    >
      {renderStep()}
    </WizardShell>
  );
}

const s = StyleSheet.create({
  fieldLabel: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid, marginBottom: 8, marginTop: 16, marginHorizontal: 8 },
  // Read-only confirmation row for a value that was captured earlier in
  // the flow (e.g. race date from the PlanPicker intake). Same visual
  // weight as a field but non-editable, with a small "Change" link for
  // the user to fall back to the full picker.
  prefilledRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    marginHorizontal: 8, marginTop: 16,
  },
  prefilledLabel: {
    fontSize: 11, fontFamily: FF.medium, fontWeight: '500',
    color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase',
    marginBottom: 2,
  },
  prefilledValue: { fontSize: 15, fontFamily: FF.semibold, fontWeight: '500', color: colors.text },
  prefilledEdit: { fontSize: 13, fontFamily: FF.medium, fontWeight: '500', color: colors.primary },
  input: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    fontSize: 16, fontWeight: '400', fontFamily: FF.regular, color: colors.text,
    borderWidth: 1, borderColor: colors.border,
  },
  infoText: { fontSize: 16, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 24, padding: 8 },

  // Race lookup
  lookupBtn: {
    backgroundColor: 'rgba(232,69,139,0.1)', borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(232,69,139,0.2)',
  },
  lookupBtnText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  lookupResult: {
    backgroundColor: 'rgba(232,69,139,0.06)', borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.2)',
  },
  lookupResultName: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  lookupResultMeta: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, marginBottom: 4 },
  lookupResultDesc: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 4 },
  lookupNotFound: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginBottom: 16, marginHorizontal: 8 },
});
