/**
 * Goal Setup Wizard — 3 steps:
 *  Step 1: Cycling type (road / gravel / mtb / mixed)
 *  Step 2: Goal type (race / distance / improve)
 *  Step 3: Goal details (plan name, target distance/elevation, date, event name)
 */
import React, { useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Keyboard } from 'react-native';
import { colors, fontFamily } from '../theme';
import WizardShell, { OptionCard } from '../components/WizardShell';
import DatePicker from '../components/DatePicker';
import { saveGoal } from '../services/storageService';

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
  const [targetDate, setTargetDate] = useState('');
  const [eventName, setEventName] = useState('');

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
      setStep(step + 1);
      return;
    }

    // Auto-generate plan name if not provided
    const autoName = planName.trim()
      || eventName
      || (targetDistance ? `${targetDistance} km` : null)
      || (goalType === 'improve' ? 'Improve my cycling' : 'My plan');

    const goal = await saveGoal({
      cyclingType,
      goalType,
      targetDistance: targetDistance ? parseFloat(targetDistance) : null,
      targetElevation: targetElevation ? parseFloat(targetElevation) : null,
      targetDate: targetDate || null,
      eventName: eventName || null,
      planName: autoName,
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
          {/* Plan name — always shown */}
          <Text style={s.fieldLabel}>Plan name</Text>
          <TextInput
            style={s.input}
            placeholder={eventName || (targetDistance ? `${targetDistance} km` : 'e.g. Summer build, 100km goal')}
            placeholderTextColor={colors.textFaint}
            value={planName}
            onChangeText={setPlanName}
          />

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
                onChangeText={setEventName}
              />
              <Text style={s.fieldLabel}>Distance (km, optional)</Text>
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
});
