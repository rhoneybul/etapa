/**
 * Goal Setup Wizard — 3 steps:
 *  Step 1: Cycling type (road / gravel / mtb / mixed)
 *  Step 2: Goal type (race / distance / improve)
 *  Step 3: Goal details (plan name, target distance/elevation, date, event name)
 */
import React, { useState, useRef } from 'react';
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
  { key: 'mixed',  label: 'Mixed', description: 'A bit of everything' },
];

const GOAL_TYPES = [
  { key: 'race',    label: 'Race', description: 'Training for a specific race or sportive' },
  { key: 'distance',label: 'Hit a distance', description: 'Build up to a target distance' },
  { key: 'improve', label: 'Just want to improve', description: 'Get fitter and stronger on the bike' },
];

export default function GoalSetupScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [cyclingType, setCyclingType] = useState(null);
  const [goalType, setGoalType] = useState(null);
  const [planName, setPlanName] = useState('');
  const [targetDistance, setTargetDistance] = useState('');
  const [targetElevation, setTargetElevation] = useState('');
  const [targetTime, setTargetTime] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [eventName, setEventName] = useState('');
  const [raceLooking, setRaceLooking] = useState(false);
  const [raceResult, setRaceResult] = useState(null);

  const handleRaceLookup = async () => {
    if (!eventName.trim()) return;
    setRaceLooking(true);
    setRaceResult(null);
    try {
      const result = await lookupRace(eventName.trim());
      if (result?.found) {
        setRaceResult(result);
        if (result.distanceKm && !targetDistance) setTargetDistance(String(result.distanceKm));
        if (result.elevationM && !targetElevation) setTargetElevation(String(result.elevationM));
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
    if (step < TOTAL_STEPS) {
      if (step === 1) analytics.events.goalStepCompleted(1, { cyclingType });
      if (step === 2) analytics.events.goalStepCompleted(2, { goalType });
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

    navigation.replace('PlanConfig', { goal });
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else navigation.goBack();
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
              <DatePicker
                label="Race date (optional)"
                value={targetDate}
                onChange={setTargetDate}
              />
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
  input: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    fontSize: 16, fontWeight: '400', fontFamily: FF.regular, color: colors.text,
    borderWidth: 1, borderColor: colors.border,
  },
  infoText: { fontSize: 16, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 24, padding: 8 },

  // Race lookup
  lookupBtn: {
    backgroundColor: 'rgba(217,119,6,0.1)', borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(217,119,6,0.2)',
  },
  lookupBtnText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  lookupResult: {
    backgroundColor: 'rgba(34,197,94,0.06)', borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
  },
  lookupResultName: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  lookupResultMeta: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, marginBottom: 4 },
  lookupResultDesc: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 4 },
  lookupNotFound: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginBottom: 16, marginHorizontal: 8 },
});
