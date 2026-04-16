/**
 * Plan Configuration Wizard — 4 steps:
 *  Step 1: How active are you? (fitness level — beginner / intermediate / advanced / expert)
 *  Step 2: What training types? (outdoor, indoor, strength)
 *  Step 3: Build your week — session counts, day placement, AND other training
 *  Step 4: Duration (if no target date) & start date
 */
import React, { useEffect, useState, useRef } from 'react';
import { View, ScrollView, Text, TouchableOpacity, StyleSheet, TextInput, Alert, Keyboard } from 'react-native';
import { colors, fontFamily } from '../theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import WizardShell, { CheckCard } from '../components/WizardShell';
import { savePlanConfig } from '../services/storageService';
import { suggestWeeks } from '../services/planGenerator';
import DatePicker from '../components/DatePicker';
import { COACHES } from '../data/coaches';
import analytics from '../services/analyticsService';
import { getActivityIcon } from '../utils/sessionLabels';

const FF = fontFamily;
const TOTAL_STEPS = 7;

// Bars indicator: 1 bar = beginner … 4 bars = expert
const LEVEL_BARS = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };
function FitnessLevelBars({ level, selected }) {
  const n = LEVEL_BARS[level] || 1;
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'flex-end' }}>
      {[1, 2, 3, 4].map(i => (
        <View
          key={i}
          style={{
            width: 5,
            height: 8 + i * 4,
            borderRadius: 2,
            backgroundColor: i <= n
              ? (selected ? colors.primary : colors.textMid)
              : (selected ? colors.primary + '30' : colors.border),
          }}
        />
      ))}
    </View>
  );
}

const FITNESS_LEVELS = [
  {
    key: 'beginner',
    label: 'Beginner',
    description: 'New to cycling or ride less than twice a week',
    benchmark: 'Avg ~18 km/h \u00B7 Comfortable up to ~40 km',
  },
  {
    key: 'intermediate',
    label: 'Intermediate',
    description: 'Ride 2\u20134 times a week with a reasonable base',
    benchmark: 'Avg ~24 km/h \u00B7 Comfortable up to ~80 km',
  },
  {
    key: 'advanced',
    label: 'Advanced',
    description: 'Train regularly and have been cycling for a while',
    benchmark: 'Avg ~28 km/h \u00B7 Comfortable up to ~130 km',
  },
  {
    key: 'expert',
    label: 'Expert',
    description: 'Competitive racer or high-volume endurance rider',
    benchmark: 'Avg ~32 km/h \u00B7 Comfortable 150+ km',
  },
];

const TRAINING_TYPES = [
  { key: 'outdoor',  label: 'Outdoor rides',     short: 'Ride' },
  { key: 'indoor',   label: 'Indoor trainer',    short: 'Indoor' },
  { key: 'strength', label: 'Strength training', short: 'Strength' },
];

// Activity types for cross-training
const CROSS_TRAINING_TYPES = [
  { key: 'run',             label: 'Run' },
  { key: 'trail_run',       label: 'Trail Run' },
  { key: 'walk',            label: 'Walk' },
  { key: 'hike',            label: 'Hike' },
  { key: 'swim',            label: 'Swim' },
  { key: 'weight_training', label: 'Weights' },
  { key: 'crossfit',        label: 'CrossFit' },
  { key: 'yoga',            label: 'Yoga' },
  { key: 'pilates',         label: 'Pilates' },
  { key: 'rowing',          label: 'Row' },
  { key: 'kayak',           label: 'Kayak' },
  { key: 'surf',            label: 'Surf' },
  { key: 'ski',             label: 'Ski' },
  { key: 'snowboard',       label: 'Snowboard' },
  { key: 'rock_climb',      label: 'Climb' },
  { key: 'soccer',          label: 'Soccer' },
  { key: 'tennis',          label: 'Tennis' },
  { key: 'padel',           label: 'Padel' },
  { key: 'golf',            label: 'Golf' },
  { key: 'martial_arts',    label: 'Martial Arts' },
  { key: 'dance',           label: 'Dance' },
  { key: 'skateboard',      label: 'Skate' },
  { key: 'elliptical',      label: 'Elliptical' },
  { key: 'stair_stepper',   label: 'Stairs' },
  { key: 'other',           label: 'Other' },
];

const DURATION_OPTIONS = [4, 6, 8, 10, 12, 16];

const DAYS = [
  { key: 'monday',    short: 'MON' },
  { key: 'tuesday',   short: 'TUE' },
  { key: 'wednesday', short: 'WED' },
  { key: 'thursday',  short: 'THU' },
  { key: 'friday',    short: 'FRI' },
  { key: 'saturday',  short: 'SAT' },
  { key: 'sunday',    short: 'SUN' },
];

// Simplified palette: keep this screen to a single accent (alt pink)
// to reduce the "rainbow" feel while retaining clear selection contrast.
const TYPE_COLORS = {
  outdoor:  colors.primaryDark,
  indoor:   colors.primaryDark,
  strength: colors.primaryDark,
};

const CT_COLOR = colors.primaryDark;

const CYCLING_KEYS = TRAINING_TYPES.map(t => t.key);
const isCyclingType = (key) => CYCLING_KEYS.includes(key);

export default function PlanConfigScreen({ navigation, route }) {
  const goal = route.params?.goal;
  const beginnerDefaults = route.params?.beginnerDefaults || null;
  const adjustment = route.params?.adjustment || null;
  const adjustmentData = route.params?.adjustmentData || null;
  const existingConfig = route.params?.existingConfig || null;
  const adjustPlanId = route.params?.planId || null;
  const requirePaywall = route.params?.requirePaywall || false;
  const defaultPlan = route.params?.defaultPlan || null;

  // If coming from a plan adjustment, pre-fill from existing config and jump to step 3
  const adjustmentDefaults = adjustment && existingConfig ? {
    fitnessLevel: existingConfig.fitnessLevel,
    trainingTypes: existingConfig.trainingTypes || ['outdoor'],
    sessionCounts: (() => {
      const sc = { ...(existingConfig.sessionCounts || { outdoor: existingConfig.daysPerWeek || 3 }) };
      if (adjustment === 'more_strength') sc.strength = (sc.strength || 0) + 1;
      return sc;
    })(),
    weeks: existingConfig.weeks,
  } : null;

  const [step, setStep] = useState(beginnerDefaults ? 3 : adjustmentDefaults ? 5 : 1); // adjustments skip to build week
  const [fitnessLevel, setFitnessLevel] = useState(
    adjustmentDefaults?.fitnessLevel || beginnerDefaults?.fitnessLevel || null
  );
  const [trainingTypes, setTrainingTypes] = useState(
    adjustmentDefaults?.trainingTypes || ['outdoor']
  );
  const [startDateChoice, setStartDateChoice] = useState('next_monday');
  const [customStartDate, setCustomStartDate] = useState('');
  const [planWeeks, setPlanWeeks] = useState(
    adjustmentDefaults?.weeks || beginnerDefaults?.weeks || null
  );

  // If there's no target date, we show a suggested duration pill as "selected".
  // Ensure `planWeeks` is actually set so Continue enables without extra taps.
  useEffect(() => {
    if (step !== 6) return;
    if (beginnerDefaults) return;
    if (goal?.targetDate) return;
    if (planWeeks) return;

    const raw = suggestWeeks(goal, fitnessLevel, getChosenStartDate());
    const weeks = (typeof raw === 'number' && !isNaN(raw) && raw > 0) ? raw : 8;
    setPlanWeeks(weeks);
  }, [step, beginnerDefaults, goal?.targetDate, planWeeks, goal, fitnessLevel, startDateChoice, customStartDate]);

  // Step 3: session counts per cycling type
  const [sessionCounts, setSessionCounts] = useState(
    adjustmentDefaults?.sessionCounts
      || (beginnerDefaults ? { outdoor: beginnerDefaults.daysPerWeek } : { outdoor: 2 })
  );

  // Unified day activities — each day holds an array of activity keys
  // e.g. { monday: ['outdoor', 'run'], tuesday: ['indoor'], ... }
  const [dayActivities, setDayActivities] = useState({});

  // Currently selected activity type for tap-to-place
  const [selectedActivity, setSelectedActivity] = useState('outdoor');

  // Coach selection — no default, user must make an explicit choice
  const [coachId, setCoachId] = useState(null);

  // Activity search (for cross-training)
  const [activitySearch, setActivitySearch] = useState('');

  // Recurring rides — fixed rides the user does every week
  // Each: { id, day, durationMins, distanceKm, elevationM, notes }
  const [recurringRides, setRecurringRides] = useState(
    existingConfig?.recurringRides || []
  );
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [recurringForm, setRecurringForm] = useState({ day: null, durationMins: '', distanceKm: '', elevationM: '', notes: '' });

  const step3ScrollRef = useRef(null);

  // One-off rides removed — pre-planned rides concept no longer shown in setup

  // Long ride day — defaults to Saturday, user can override
  const [longRideDayOverride, setLongRideDayOverride] = useState(
    existingConfig?.longRideDay || 'saturday'
  );

  // Auto-place the outdoor ride on the long ride day whenever it changes.
  // Ensures that by the time the user lands on the Build Week step, their
  // long ride day and any recurring rides are already on the grid.
  useEffect(() => {
    // Long ride day — always ensure there's an outdoor ride there
    if (longRideDayOverride) {
      setDayActivities(prev => {
        const acts = prev[longRideDayOverride] || [];
        if (acts.includes('outdoor')) return prev;
        return { ...prev, [longRideDayOverride]: [...acts, 'outdoor'] };
      });
    }
    // Recurring rides — ensure each is placed on its day
    recurringRides.forEach(ride => {
      setDayActivities(prev => {
        const acts = prev[ride.day] || [];
        // Allow multiple outdoor rides on the same day (long ride + recurring)
        const outdoorCount = acts.filter(a => a === 'outdoor').length;
        const needed = ride.day === longRideDayOverride ? 2 : 1;
        if (outdoorCount >= needed) return prev;
        return { ...prev, [ride.day]: [...acts, 'outdoor'] };
      });
    });
  }, [longRideDayOverride, recurringRides]);

  const toggleTrainingType = (type) => {
    setTrainingTypes(prev => {
      if (type === 'outdoor') return prev;
      const next = prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type];
      setSessionCounts(sc => {
        const updated = { ...sc };
        if (!next.includes(type)) {
          delete updated[type];
          // Remove placed instances of this type from dayActivities
          setDayActivities(da => {
            const cleaned = {};
            Object.entries(da).forEach(([day, acts]) => {
              const filtered = acts.filter(a => a !== type);
              if (filtered.length > 0) cleaned[day] = filtered;
            });
            return cleaned;
          });
        } else if (!updated[type]) {
          updated[type] = 1;
        }
        return updated;
      });
      return next;
    });
  };

  const adjustCount = (type, delta) => {
    setSessionCounts(prev => {
      const next = { ...prev };
      const newVal = Math.max(0, (next[type] || 0) + delta);
      next[type] = newVal;

      // Count how many of this type are placed
      let placedCount = 0;
      Object.values(dayActivities).forEach(acts => { placedCount += acts.filter(a => a === type).length; });

      if (placedCount > newVal) {
        setDayActivities(da => {
          const cleaned = { ...da };
          let toRemove = placedCount - newVal;
          for (let i = DAYS.length - 1; i >= 0 && toRemove > 0; i--) {
            const dayKey = DAYS[i].key;
            const acts = cleaned[dayKey] || [];
            const idx = acts.lastIndexOf(type);
            if (idx !== -1) {
              const updated = [...acts];
              updated.splice(idx, 1);
              if (updated.length === 0) delete cleaned[dayKey];
              else cleaned[dayKey] = updated;
              toRemove--;
            }
          }
          return cleaned;
        });
      }
      return next;
    });
  };

  const totalSessions = Object.values(sessionCounts).reduce((s, v) => s + v, 0);

  // Count placed cycling sessions
  const placedByType = {};
  trainingTypes.forEach(t => { placedByType[t] = 0; });
  Object.values(dayActivities).forEach(acts => {
    acts.forEach(a => { if (isCyclingType(a)) placedByType[a] = (placedByType[a] || 0) + 1; });
  });

  const totalCyclingPlaced = Object.values(placedByType).reduce((s, v) => s + v, 0);
  const allPlaced = totalCyclingPlaced > 0;

  // Handle tapping a day card — place or remove the selected activity
  // A day is "locked" for removal of its outdoor ride if:
  //  - it's the long ride day (must go back to step 4 to change)
  //  - it has a regular ride scheduled (must go back to step 3 to change)
  // When locked, the first outdoor ride on the day can't be removed — but
  // additional activities (strength, cross-training) can still be added/removed.
  const isOutdoorLockedOnDay = (dayKey) =>
    dayKey === effectiveLongRideDay || recurringRides.some(r => r.day === dayKey);

  const countOutdoorOnDay = (acts) => (acts || []).filter(a => a === 'outdoor').length;

  const handleDayTap = (dayKey) => {
    setDayActivities(prev => {
      const next = { ...prev };
      const current = next[dayKey] || [];
      const act = selectedActivity;

      // If it's a cycling type, place freely and auto-adjust session count
      if (isCyclingType(act)) {
        if (current.includes(act)) {
          // If removing the last outdoor ride from a locked day, block it
          if (act === 'outdoor' && isOutdoorLockedOnDay(dayKey) && countOutdoorOnDay(current) <= 1) {
            return prev;
          }
          // Remove it
          const updated = [...current];
          updated.splice(updated.indexOf(act), 1);
          if (updated.length === 0) delete next[dayKey];
          else next[dayKey] = updated;
          // Auto-decrement session count if needed
          let newPlaced = 0;
          Object.values(next).forEach(acts => { newPlaced += acts.filter(a => a === act).length; });
          setSessionCounts(sc => {
            const current = sc[act] || 0;
            if (newPlaced < current) return { ...sc, [act]: Math.max(1, newPlaced) };
            return sc;
          });
        } else {
          // Add it — no quota limit
          next[dayKey] = [...current, act];
          // Auto-increment session count if placement exceeds current target
          let newPlaced = 0;
          Object.values(next).forEach(acts => { newPlaced += acts.filter(a => a === act).length; });
          setSessionCounts(sc => {
            const target = sc[act] || 0;
            if (newPlaced > target) return { ...sc, [act]: newPlaced };
            return sc;
          });
        }
      } else {
        // Cross-training: toggle on/off
        if (current.includes(act)) {
          const updated = current.filter(a => a !== act);
          if (updated.length === 0) delete next[dayKey];
          else next[dayKey] = updated;
        } else {
          next[dayKey] = [...current, act];
        }
      }
      return next;
    });
  };

  // Remove a specific activity from a day (tap on a placed pill)
  const handleRemoveActivity = (dayKey, actKey) => {
    // Block removal of the locked outdoor ride (long ride day or day with regular ride)
    if (actKey === 'outdoor' && isOutdoorLockedOnDay(dayKey)) {
      const current = dayActivities[dayKey] || [];
      if (countOutdoorOnDay(current) <= 1) return;
    }
    setDayActivities(prev => {
      const next = { ...prev };
      const current = next[dayKey] || [];
      const updated = [...current];
      const idx = updated.indexOf(actKey);
      if (idx !== -1) updated.splice(idx, 1);
      if (updated.length === 0) delete next[dayKey];
      else next[dayKey] = updated;
      return next;
    });
  };

  // ── Recurring rides helpers ──
  const addRecurringRide = () => {
    if (!recurringForm.day) { Alert.alert('Select a day', 'Pick which day this ride happens.'); return; }
    if (!recurringForm.durationMins && !recurringForm.distanceKm) {
      Alert.alert('Add details', 'Enter at least a duration or distance for this ride.');
      return;
    }
    const ride = {
      id: Date.now().toString(36),
      day: recurringForm.day,
      durationMins: recurringForm.durationMins ? parseInt(recurringForm.durationMins, 10) : null,
      distanceKm: recurringForm.distanceKm ? parseFloat(recurringForm.distanceKm) : null,
      elevationM: recurringForm.elevationM ? parseInt(recurringForm.elevationM, 10) : null,
      notes: recurringForm.notes || '',
    };
    setRecurringRides(prev => [...prev, ride]);

    // Auto-place on the day grid as an outdoor ride
    const rideDay = recurringForm.day;
    setDayActivities(prev => {
      const next = { ...prev };
      const current = next[rideDay] || [];
      if (!current.includes('outdoor')) {
        next[rideDay] = [...current, 'outdoor'];
      }
      return next;
    });
    // Ensure outdoor count is at least enough for this placement
    setSessionCounts(prev => {
      let placedOutdoor = 0;
      Object.values(dayActivities).forEach(acts => { placedOutdoor += acts.filter(a => a === 'outdoor').length; });
      // +1 for the one we just placed
      const newPlaced = placedOutdoor + 1;
      if ((prev.outdoor || 0) < newPlaced) {
        return { ...prev, outdoor: newPlaced };
      }
      return prev;
    });

    setRecurringForm({ day: null, durationMins: '', distanceKm: '', elevationM: '', notes: '' });
    setShowAddRecurring(false);
  };

  const removeRecurringRide = (id) => {
    // Find the ride's day before removing, to clean up auto-placed activity
    const ride = recurringRides.find(r => r.id === id);
    if (ride) {
      // Only remove the auto-placed outdoor if no other recurring ride is on the same day
      const otherOnSameDay = recurringRides.filter(r => r.id !== id && r.day === ride.day);
      if (otherOnSameDay.length === 0) {
        setDayActivities(prev => {
          const next = { ...prev };
          const current = next[ride.day] || [];
          const idx = current.indexOf('outdoor');
          if (idx !== -1) {
            const updated = [...current];
            updated.splice(idx, 1);
            if (updated.length === 0) delete next[ride.day];
            else next[ride.day] = updated;
          }
          return next;
        });
      }
    }
    setRecurringRides(prev => prev.filter(r => r.id !== id));
  };


  // ── Long ride day — user must explicitly select ──
  const effectiveLongRideDay = longRideDayOverride || null;

  // Selecting a long ride day also places an outdoor ride on that day and
  // removes the auto-placed one from the previous long ride day (if any).
  const handleSelectLongRideDay = (dayKey) => {
    setDayActivities(prev => {
      const next = { ...prev };
      // Remove the auto-placed outdoor from the old long ride day
      if (longRideDayOverride && longRideDayOverride !== dayKey) {
        const old = next[longRideDayOverride] || [];
        const idx = old.indexOf('outdoor');
        if (idx !== -1) {
          const updated = [...old];
          updated.splice(idx, 1);
          if (updated.length === 0) delete next[longRideDayOverride];
          else next[longRideDayOverride] = updated;
        }
      }
      // Place an outdoor ride on the new long ride day if not already there
      const current = next[dayKey] || [];
      if (!current.includes('outdoor')) {
        next[dayKey] = [...current, 'outdoor'];
        // Keep session count in sync
        let newPlaced = 0;
        Object.values(next).forEach(acts => { newPlaced += acts.filter(a => a === 'outdoor').length; });
        setSessionCounts(sc => {
          const target = sc['outdoor'] || 0;
          if (newPlaced > target) return { ...sc, outdoor: newPlaced };
          return sc;
        });
      }
      return next;
    });
    setLongRideDayOverride(dayKey);
  };

  // Derive legacy formats for downstream compatibility
  const dayAssignments = {};
  const crossTrainingDays = {};
  Object.entries(dayActivities).forEach(([day, acts]) => {
    const cycling = acts.find(a => isCyclingType(a));
    if (cycling) dayAssignments[day] = cycling;
    const ct = acts.filter(a => !isCyclingType(a));
    if (ct.length > 0) crossTrainingDays[day] = ct;
  });
  const crossTrainingDaysLegacy = {};
  Object.entries(crossTrainingDays).forEach(([day, types]) => {
    if (types.length > 0) crossTrainingDaysLegacy[day] = types[0];
  });

  const canContinue = () => {
    if (step === 1) return !!fitnessLevel;
    if (step === 2) return trainingTypes.length > 0;
    if (step === 3) return true; // organised rides are optional
    if (step === 4) return !!effectiveLongRideDay;
    if (step === 5) return allPlaced;
    if (step === 6) {
      if (startDateChoice === 'custom' && !/^\d{4}-\d{2}-\d{2}$/.test(customStartDate)) return false;
      if (!goal.targetDate && !planWeeks) return false;
      return true;
    }
    if (step === 7) return !!coachId;
    return false;
  };

  const handleContinue = async () => {
    if (step < TOTAL_STEPS) {
      if (step === 1) analytics.events.configStepCompleted(1, { fitnessLevel });
      if (step === 2) {
        analytics.events.configStepCompleted(2, { trainingTypes });
        setSessionCounts(prev => {
          const next = {};
          trainingTypes.forEach(t => { next[t] = prev[t] || 1; });
          return next;
        });
        setDayActivities({});
        setSelectedActivity(trainingTypes[0] || 'outdoor');
      }
      if (step === 5) analytics.events.configStepCompleted(3, { sessionsPerWeek: totalSessions, daysPlaced: Object.keys(dayActivities).length });
      if (step === 6) analytics.events.configStepCompleted(4, { planWeeks, startDateChoice });
      if (step === 7) analytics.events.configStepCompleted(5, { coachId });
      setStep(step + 1);
      return;
    }

    const availableDays = Object.keys(dayAssignments);
    const daysPerWeek = totalSessions;

    const startDate = getChosenStartDate();
    const suggested = planWeeks || suggestWeeks(goal, fitnessLevel, startDate);
    // Guard against NaN — default to 8 weeks if suggestWeeks fails
    const weeks = (typeof suggested === 'number' && !isNaN(suggested) && suggested > 0) ? suggested : 8;

    const config = await savePlanConfig({
      goalId: goal.id,
      daysPerWeek,
      weeks,
      trainingTypes,
      sessionCounts,
      availableDays,
      dayAssignments,
      fitnessLevel,
      coachId,
      crossTrainingDays: crossTrainingDaysLegacy,
      crossTrainingDaysFull: crossTrainingDays,
      startDate: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`,
      recurringRides,
      longRideDay: effectiveLongRideDay,
      ...(beginnerDefaults?.paymentStatus && { paymentStatus: beginnerDefaults.paymentStatus }),
      ...(adjustment && { adjustment, adjustmentData }),
    });

    analytics.events.configStepCompleted(5, { coachId });
    analytics.events.coachSelected(coachId);
    analytics.events.configCompleted({
      fitnessLevel,
      trainingTypes,
      sessionsPerWeek: totalSessions,
      weeks: config.weeks,
      coachId,
      daysPerWeek: availableDays.length,
    });

    navigation.replace('PlanLoading', { goal, config, requirePaywall, defaultPlan });
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else navigation.goBack();
  };

  const renderStep = () => {
    // ── Step 1: Fitness level ──────────────────────────────────────────────
    if (step === 1) {
      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          {FITNESS_LEVELS.map(fl => (
            <TouchableOpacity
              key={fl.key}
              style={[s.levelCard, fitnessLevel === fl.key && s.levelCardSelected]}
              onPress={() => setFitnessLevel(fl.key)}
              activeOpacity={0.7}
            >
              <View style={s.levelRow}>
                <View style={[s.levelIconWrap, fitnessLevel === fl.key && s.levelIconWrapSelected]}>
                  <FitnessLevelBars level={fl.key} selected={fitnessLevel === fl.key} />
                </View>
                <View style={s.levelTextWrap}>
                  <Text style={[s.levelLabel, fitnessLevel === fl.key && s.levelLabelSelected]}>{fl.label}</Text>
                  <Text style={s.levelDesc}>{fl.description}</Text>
                  <Text style={s.levelBenchmark}>{fl.benchmark}</Text>
                </View>
                {fitnessLevel === fl.key
                  ? <View style={s.radioSelected}><View style={s.radioInner} /></View>
                  : <View style={s.radio} />
                }
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }

    // ── Step 2: Training types ─────────────────────────────────────────────
    if (step === 2) {
      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          {TRAINING_TYPES.map(tt => (
            <CheckCard
              key={tt.key}
              label={tt.label}
              checked={trainingTypes.includes(tt.key)}
              onPress={() => toggleTrainingType(tt.key)}
            />
          ))}
        </ScrollView>
      );
    }

    // ── Step 3: Organised rides ───────────────────────────────────────────────
    if (step === 3) {
      return (
        <ScrollView
          ref={step3ScrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: showAddRecurring ? 420 : 20 }}
        >
          <View style={s.organisedSection}>
            <Text style={s.organisedHint}>
              Got a regular group ride, club ride, or fixed session every week? Add it here and your plan will be built around it. You can skip this if you don't have any.
            </Text>

            {recurringRides.map(ride => (
              <View key={ride.id} style={s.organisedCard}>
                <View style={s.organisedCardRow}>
                  <View style={[s.organisedDayBadge, { backgroundColor: colors.primary + '18' }]}>
                    <Text style={s.organisedDayBadgeText}>{DAYS.find(d => d.key === ride.day)?.short || ride.day}</Text>
                  </View>
                  <View style={s.organisedCardDetails}>
                    {ride.durationMins ? <Text style={s.organisedDetail}>{ride.durationMins} min</Text> : null}
                    {ride.distanceKm ? <Text style={s.organisedDetail}>{ride.distanceKm} km</Text> : null}
                    {ride.elevationM ? <Text style={s.organisedDetail}>{ride.elevationM}m elev</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => removeRecurringRide(ride.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={s.organisedRemove}>{'\u00D7'}</Text>
                  </TouchableOpacity>
                </View>
                {ride.notes ? <Text style={s.organisedNotes}>{ride.notes}</Text> : null}
              </View>
            ))}

            {showAddRecurring ? (
              <View style={s.organisedForm}>
                <Text style={s.organisedFormLabel}>Which day?</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.organisedFormDayScroll}>
                  {DAYS.map(d => (
                    <TouchableOpacity
                      key={d.key}
                      style={[s.organisedFormDayPill, recurringForm.day === d.key && s.organisedFormDayPillSelected]}
                      onPress={() => setRecurringForm(f => ({ ...f, day: d.key }))}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.organisedFormDayText, recurringForm.day === d.key && s.organisedFormDayTextSelected]}>{d.short}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={s.organisedFormInputRow}>
                  <View style={s.organisedFormInputGroup}>
                    <Text style={s.organisedFormInputLabel}>Duration</Text>
                    <TextInput style={s.organisedFormInput} placeholder="mins" placeholderTextColor={colors.textFaint} keyboardType="numeric" value={recurringForm.durationMins} onChangeText={v => setRecurringForm(f => ({ ...f, durationMins: v }))} onFocus={() => setTimeout(() => step3ScrollRef.current?.scrollToEnd({ animated: true }), 300)} />
                  </View>
                  <View style={s.organisedFormInputGroup}>
                    <Text style={s.organisedFormInputLabel}>Distance</Text>
                    <TextInput style={s.organisedFormInput} placeholder="km" placeholderTextColor={colors.textFaint} keyboardType="numeric" value={recurringForm.distanceKm} onChangeText={v => setRecurringForm(f => ({ ...f, distanceKm: v }))} onFocus={() => setTimeout(() => step3ScrollRef.current?.scrollToEnd({ animated: true }), 300)} />
                  </View>
                  <View style={s.organisedFormInputGroup}>
                    <Text style={s.organisedFormInputLabel}>Elevation</Text>
                    <TextInput style={s.organisedFormInput} placeholder="m" placeholderTextColor={colors.textFaint} keyboardType="numeric" value={recurringForm.elevationM} onChangeText={v => setRecurringForm(f => ({ ...f, elevationM: v }))} onFocus={() => setTimeout(() => step3ScrollRef.current?.scrollToEnd({ animated: true }), 300)} />
                  </View>
                </View>

                <TouchableOpacity style={s.keyboardDoneRow} onPress={() => Keyboard.dismiss()} activeOpacity={0.7}>
                  <Text style={s.keyboardDoneText}>Done</Text>
                </TouchableOpacity>

                <TextInput
                  style={s.organisedFormNotesInput}
                  placeholder="Name or notes (e.g. 'Friday club ride with mates')"
                  placeholderTextColor={colors.textFaint}
                  value={recurringForm.notes}
                  onChangeText={v => setRecurringForm(f => ({ ...f, notes: v }))}
                  returnKeyType="done"
                  onSubmitEditing={addRecurringRide}
                  blurOnSubmit
                  onFocus={() => setTimeout(() => step3ScrollRef.current?.scrollToEnd({ animated: true }), 300)}
                />

                <View style={s.organisedFormActions}>
                  <TouchableOpacity style={s.organisedFormCancelBtn} onPress={() => { Keyboard.dismiss(); setShowAddRecurring(false); setRecurringForm({ day: null, durationMins: '', distanceKm: '', elevationM: '', notes: '' }); }}>
                    <Text style={s.organisedFormCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.organisedFormAddBtn} onPress={() => { Keyboard.dismiss(); addRecurringRide(); }}>
                    <Text style={s.organisedFormAddText}>Add ride</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={s.organisedAddTrigger} onPress={() => setShowAddRecurring(true)} activeOpacity={0.7}>
                <Text style={s.organisedAddTriggerPlus}>+</Text>
                <Text style={s.organisedAddTriggerText}>Add a regular ride</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      );
    }

    // ── Step 4: Long ride day ─────────────────────────────────────────────────
    if (step === 4) {
      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={s.placeSub}>
            Which day will you do your longest ride each week? Your coach will schedule your biggest session here.
          </Text>
          <View style={s.longRideDayRow}>
            {DAYS.map(d => {
              const isSelected = effectiveLongRideDay === d.key;
              // Highlight if a recurring ride is on this day
              const hasRecurring = recurringRides.some(r => r.day === d.key);
              return (
                <TouchableOpacity
                  key={d.key}
                  style={[s.longRidePill, isSelected && s.longRidePillSelected, !isSelected && hasRecurring && s.longRidePillHint]}
                  onPress={() => handleSelectLongRideDay(d.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.longRidePillText, isSelected && s.longRidePillTextSelected]}>{d.short}</Text>
                  {hasRecurring && !isSelected && <View style={s.longRidePillHintDot} />}
                </TouchableOpacity>
              );
            })}
          </View>
          {recurringRides.length > 0 && (
            <Text style={s.longRideDayHint}>
              Days with a dot already have a regular ride. You can pick the same day or a different one.
            </Text>
          )}
        </ScrollView>
      );
    }

    // ── Step 5: Build your week (unified activity placement) ──────────────────
    if (step === 5) {
      const activeTypes = TRAINING_TYPES.filter(tt => trainingTypes.includes(tt.key));
      const hasCrossTraining = Object.keys(crossTrainingDays).length > 0;

      // Build the activity palette: cycling types (with remaining counts) + cross-training
      const cyclingPalette = activeTypes.map(tt => ({
        key: tt.key,
        label: tt.short,
        color: TYPE_COLORS[tt.key] || colors.primary,
        isCycling: true,
        target: sessionCounts[tt.key] || 0,
        placed: placedByType[tt.key] || 0,
      }));

      // Get label for any activity key
      const getActivityLabel = (key) => {
        const tt = TRAINING_TYPES.find(t => t.key === key);
        if (tt) return tt.short;
        const ct = CROSS_TRAINING_TYPES.find(t => t.key === key);
        return ct ? ct.label : key;
      };
      const getActivityColor = (key) => {
        if (TYPE_COLORS[key]) return TYPE_COLORS[key];
        return CT_COLOR;
      };

      // Count how many outdoor rides come from organised rides
      const organisedOutdoorCount = recurringRides.length;

      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Show a summary of organised rides + long ride day already set */}
          {(recurringRides.length > 0 || effectiveLongRideDay) && (
            <View style={s.buildWeekSummary}>
              {recurringRides.length > 0 && (
                <Text style={s.buildWeekSummaryText}>
                  {recurringRides.length === 1
                    ? `1 regular ride · ${DAYS.find(d => d.key === recurringRides[0].day)?.short}`
                    : `${recurringRides.length} regular rides`}
                </Text>
              )}
              {effectiveLongRideDay && (
                <Text style={s.buildWeekSummaryText}>
                  Long ride · {DAYS.find(d => d.key === effectiveLongRideDay)?.short}
                </Text>
              )}
            </View>
          )}

          {/* ── Activity palette ── */}
          <Text style={s.placeSub}>
            Select an activity, then tap a day to place it. Tap a placed item to remove it.
          </Text>

          {/* Search box for activities — above the palette */}
          <View style={s.activitySearchWrap}>
            <TextInput
              style={s.activitySearchInput}
              placeholder="Search activities (e.g. row, swim, yoga)"
              placeholderTextColor={colors.textFaint}
              value={activitySearch}
              onChangeText={setActivitySearch}
              returnKeyType="search"
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.paletteScroll} contentContainerStyle={s.paletteContent}>
            {/* Cycling types */}
            {cyclingPalette.map(cp => {
              const isSelected = selectedActivity === cp.key;
              const remaining = cp.target - cp.placed;
              return (
                <TouchableOpacity
                  key={cp.key}
                  style={[s.palettePill, isSelected && s.palettePillSelected, isSelected && { borderColor: cp.color, backgroundColor: cp.color + '30' }]}
                  onPress={() => setSelectedActivity(cp.key)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name={getActivityIcon({ type: cp.key === 'strength' ? 'strength' : 'ride', subType: cp.key === 'indoor' ? 'indoor' : undefined, title: cp.key })} size={14} color={cp.color} />
                  <Text style={[s.paletteLabel, isSelected && { color: cp.color }]}>{cp.label}</Text>
                </TouchableOpacity>
              );
            })}
            {/* Divider + cross-training label */}
            <View style={s.paletteDivider} />
            <View style={s.paletteSectionLabel}>
              <Text style={s.paletteSectionText}>Other activities</Text>
            </View>
            {CROSS_TRAINING_TYPES.filter(ct => {
              if (!activitySearch.trim()) return true;
              const q = activitySearch.toLowerCase();
              return ct.label.toLowerCase().includes(q) || ct.key.toLowerCase().includes(q);
            }).map(ct => {
              const isSelected = selectedActivity === ct.key;
              const isUsed = Object.values(dayActivities).some(acts => acts.includes(ct.key));
              return (
                <TouchableOpacity
                  key={ct.key}
                  style={[s.palettePill, isSelected && s.palettePillSelected, isSelected && { borderColor: CT_COLOR, backgroundColor: CT_COLOR + '30' }, isUsed && !isSelected && { borderColor: CT_COLOR + '66' }]}
                  onPress={() => { setSelectedActivity(ct.key); setActivitySearch(''); }}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name={getActivityIcon(ct.key)} size={14} color={CT_COLOR} />
                  <Text style={[s.paletteLabel, isSelected && { color: CT_COLOR }]}>{ct.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Selected activity indicator */}
          {selectedActivity && (
            <View style={[s.selectedIndicator, { borderColor: getActivityColor(selectedActivity), backgroundColor: getActivityColor(selectedActivity) + '14' }]}>
              <MaterialCommunityIcons
                name={getActivityIcon(isCyclingType(selectedActivity)
                  ? { type: selectedActivity === 'strength' ? 'strength' : 'ride', subType: selectedActivity === 'indoor' ? 'indoor' : undefined, title: selectedActivity }
                  : selectedActivity)}
                size={14}
                color={getActivityColor(selectedActivity)}
              />
              <Text style={[s.selectedIndicatorText, { color: getActivityColor(selectedActivity) }]}>
                {getActivityLabel(selectedActivity)}
              </Text>
              <Text style={s.selectedIndicatorHint}>{'\u2014'} tap a day to place</Text>
            </View>
          )}
          {selectedActivity && !isCyclingType(selectedActivity) && (
            <Text style={s.crossTrainingNote}>
              This won't be scheduled in your plan, but your coach will factor it into recovery and load planning.
            </Text>
          )}

          {/* ── Unified day grid ── */}
          <View style={s.dayGrid}>
            {DAYS.map(day => {
              const acts = dayActivities[day.key] || [];
              const selectedColor = getActivityColor(selectedActivity);
              const hasSelected = acts.includes(selectedActivity);

              return (
                <TouchableOpacity
                  key={day.key}
                  style={[
                    s.dayCard,
                    hasSelected && { borderColor: selectedColor },
                    acts.length > 0 && !hasSelected && { borderColor: getActivityColor(acts[0]) + '44' },
                  ]}
                  onPress={() => handleDayTap(day.key)}
                  activeOpacity={0.7}
                >
                  <Text style={s.dayShort}>{day.short}</Text>
                  {/* Show recurring ride name if this day has one, otherwise just show activity pills */}
                  {acts.length > 0 ? (
                    <View style={s.dayStack}>
                      {acts.map((actKey, idx) => {
                        const actColor = getActivityColor(actKey);
                        // Figure out if this specific chip is locked (can't be removed).
                        // An outdoor chip is locked if the day is the long ride day
                        // or has a recurring ride — AND this is the first outdoor chip.
                        const outdoorsBefore = acts.slice(0, idx).filter(a => a === 'outdoor').length;
                        const isOutdoor = actKey === 'outdoor';
                        const locked = isOutdoor && outdoorsBefore === 0 && isOutdoorLockedOnDay(day.key);
                        // For outdoor activities, show recurring ride name if one exists for this day
                        let displayLabel = getActivityLabel(actKey);
                        if (isOutdoor) {
                          const dayRecurring = recurringRides.filter(r => r.day === day.key);
                          if (dayRecurring[outdoorsBefore]?.notes) {
                            displayLabel = dayRecurring[outdoorsBefore].notes;
                          } else if (locked && day.key === effectiveLongRideDay) {
                            displayLabel = 'Long ride';
                          }
                        }
                        return (
                          <TouchableOpacity
                            key={`${actKey}-${idx}`}
                            style={[s.stackPill, { backgroundColor: actColor + '18', borderColor: actColor + '44' }]}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              if (locked) return;
                              handleRemoveActivity(day.key, actKey);
                            }}
                            activeOpacity={locked ? 1 : 0.7}
                          >
                            <MaterialCommunityIcons
                              name={getActivityIcon(isCyclingType(actKey)
                                ? { type: actKey === 'strength' ? 'strength' : 'ride', subType: actKey === 'indoor' ? 'indoor' : undefined, title: actKey }
                                : actKey)}
                              size={12}
                              color={actColor}
                            />
                            <Text style={[s.stackLabel, { color: actColor }]} numberOfLines={1}>{displayLabel}</Text>
                            {locked
                              ? <MaterialCommunityIcons name="lock" size={10} color={actColor + 'AA'} />
                              : <Text style={[s.stackRemove, { color: actColor }]}>{'\u00D7'}</Text>
                            }
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={s.dayEmptyPlus}>+</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.dayHint}>Multiple activities can share a day {'\u00B7'} your coach will balance the load</Text>

          {hasCrossTraining && (
            <View style={s.crossTrainNote}>
              <Text style={s.crossTrainNoteText}>
                Your AI coach will factor other training in {'\u2014'} scheduling easier cycling sessions near hard cross-training days and managing your total training load.
              </Text>
            </View>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      );
    }

    // ── Step 6: Duration + start date ──────────────────────────────────────
    if (step === 6) {
      const hasTargetDate = !!goal.targetDate;
      const rawWeeks = planWeeks || suggestWeeks(goal, fitnessLevel, getChosenStartDate());
      const effectiveWeeks = (typeof rawWeeks === 'number' && !isNaN(rawWeeks) && rawWeeks > 0) ? rawWeeks : 8;

      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          {!hasTargetDate && !beginnerDefaults && (
            <>
              <Text style={s.durationHeading}>How long for?</Text>
              <Text style={s.durationHint}>Choose a plan duration in weeks</Text>
              <View style={s.durationGrid}>
                {DURATION_OPTIONS.map(w => (
                  <TouchableOpacity
                    key={w}
                    style={[s.durationPill, effectiveWeeks === w && s.durationPillActive]}
                    onPress={() => setPlanWeeks(w)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.durationPillText, effectiveWeeks === w && s.durationPillTextActive]}>
                      {w} weeks
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={s.divider} />
            </>
          )}
          {beginnerDefaults && (
            <>
              <View style={s.beginnerDurationBadge}>
                <Text style={s.beginnerDurationText}>12-week program</Text>
              </View>
              <View style={s.divider} />
            </>
          )}

          {startDateOptions.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[s.startDateOption, startDateChoice === opt.key && s.startDateOptionActive]}
              onPress={() => setStartDateChoice(opt.key)}
              activeOpacity={0.8}
            >
              <View style={s.startDateRadio}>
                {startDateChoice === opt.key && <View style={s.startDateRadioDot} />}
              </View>
              <View style={s.startDateInfo}>
                <Text style={[s.startDateLabel, startDateChoice === opt.key && s.startDateLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={s.startDateDesc}>{opt.desc}</Text>
                {opt.recommended && (
                  <View style={s.recommendBadge}>
                    <Text style={s.recommendText}>Recommended</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}

          {startDateChoice === 'custom' && (
            <View style={s.customDateWrap}>
              <DatePicker
                label="Start date"
                value={customStartDate}
                onChange={setCustomStartDate}
              />
              <Text style={s.customDateHint}>Pick a Monday for best results</Text>
            </View>
          )}

          <View style={s.startDateSummary}>
            <Text style={s.startDateSummaryLabel}>Your plan</Text>
            <Text style={s.startDateSummaryText}>
              {effectiveWeeks} weeks starting {formatDateShort(getChosenStartDate())}
            </Text>
            {goal.targetDate && (
              <Text style={s.startDateSummaryText}>
                Target: {formatDateShort(new Date(goal.targetDate))}
              </Text>
            )}
          </View>
        </ScrollView>
      );
    }

    // ── Step 7: Choose your coach ────────────────────────────────────────────
    if (step === 7) {
      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          {COACHES.map(coach => {
            const selected = coachId === coach.id;
            return (
              <TouchableOpacity
                key={coach.id}
                style={[s.coachCard, selected && s.coachCardSelected]}
                onPress={() => setCoachId(coach.id)}
                activeOpacity={0.8}
              >
                <View style={[s.coachAvatar, { backgroundColor: coach.avatarColor }]}>
                  <Text style={s.coachAvatarText}>{coach.avatarInitials}</Text>
                </View>
                <View style={s.coachInfo}>
                  <View style={s.coachNameRow}>
                    <Text style={[s.coachName, selected && s.coachNameSelected]}>
                      {coach.name} {coach.surname}
                    </Text>
                    <Text style={s.coachPronouns}>{coach.pronouns}</Text>
                  </View>
                  <Text style={[s.coachTagline, selected && s.coachTaglineSelected]}>
                    {coach.tagline}
                  </Text>
                  <Text style={s.coachBio} numberOfLines={selected ? undefined : 2}>{coach.bio}</Text>
                  <View style={s.coachBadgeRow}>
                    <View style={s.coachLevelBadge}>
                      <FitnessLevelBars level={coach.level} selected={selected} />
                      <Text style={[s.coachLevelText, selected && { color: colors.primary }]}>
                        {coach.level === 'beginner' ? 'Beginner friendly'
                          : coach.level === 'intermediate' ? 'Intermediate+'
                          : 'Advanced+'}
                      </Text>
                    </View>
                  </View>
                  {selected && (
                    <Text style={s.coachQuote}>"{coach.sampleQuote}"</Text>
                  )}
                </View>
                {selected && (
                  <View style={s.coachCheck}>
                    <Text style={s.coachCheckMark}>{'\u2713'}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 20 }} />
        </ScrollView>
      );
    }

  };

  // ── Date helpers ──────────────────────────────────────────────────────────
  function getNextMonday() {
    const d = new Date();
    const dow = d.getDay();
    const daysUntil = dow === 0 ? 1 : dow === 1 ? 7 : 8 - dow;
    const m = new Date(d);
    m.setDate(m.getDate() + daysUntil);
    m.setHours(0, 0, 0, 0);
    return m;
  }

  function getThisMonday() {
    const d = new Date();
    const dow = d.getDay();
    const daysSince = dow === 0 ? 6 : dow - 1;
    const m = new Date(d);
    m.setDate(m.getDate() - daysSince);
    m.setHours(0, 0, 0, 0);
    return m;
  }

  function getChosenStartDate() {
    if (startDateChoice === 'this_monday') return getThisMonday();
    if (startDateChoice === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(customStartDate)) {
      const d = new Date(customStartDate + 'T00:00:00');
      return d;
    }
    return getNextMonday();
  }

  function getRecommendedStart() {
    if (!goal.targetDate) return 'next_monday';
    const target = new Date(goal.targetDate + 'T12:00:00');
    const weeks = suggestWeeks(goal, fitnessLevel, getNextMonday());
    const idealStart = new Date(target);
    idealStart.setDate(idealStart.getDate() - weeks * 7);
    const now = new Date();
    if (idealStart <= now) return 'this_monday';
    return 'next_monday';
  }

  function formatDateShort(d) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  const recommended = getRecommendedStart();
  const nextMon = getNextMonday();
  const thisMon = getThisMonday();
  const isToday = new Date().getDay() === 1;

  const startDateOptions = [
    ...(isToday ? [] : [{
      key: 'this_monday',
      label: `This Monday \u2014 ${formatDateShort(thisMon)}`,
      desc: 'Start right away from the beginning of this week',
      recommended: recommended === 'this_monday',
    }]),
    {
      key: 'next_monday',
      label: `Next Monday \u2014 ${formatDateShort(nextMon)}`,
      desc: 'Start fresh from the beginning of next week',
      recommended: recommended === 'next_monday',
    },
    {
      key: 'custom',
      label: 'Choose a date',
      desc: 'Pick a specific start date',
      recommended: false,
    },
  ];

  const titles = {
    1: 'What\'s your current level?',
    2: 'What types of training?',
    3: 'Any regular rides?',
    4: 'Your longest ride day',
    5: 'Build your week',
    6: goal.targetDate ? 'When should it start?' : 'Duration & start date',
    7: 'Choose your coach',
  };

  const subtitles = {
    1: 'Be honest \u2014 this helps us set realistic targets',
    2: 'Choose as many as you like',
    3: 'Group ride, club session, or anything else you do every week',
    4: 'Your coach will schedule your longest ride here each week',
    5: 'Tap a day to place sessions. Stack as many as you like.',
    6: goal.targetDate ? 'Pick a start date for your training plan' : 'How long and when to begin',
    7: 'Pick a coaching personality that fits your style',
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
      continueLabel={step === TOTAL_STEPS ? 'Generate my plan' : 'Continue'}
      continueDisabled={!canContinue()}
      skipLabel={step === 3 ? 'Skip — I don\'t have regular rides' : undefined}
      onSkip={step === 3 ? () => setStep(4) : undefined}
    >
      {renderStep()}
    </WizardShell>
  );
}

const s = StyleSheet.create({
  // ── Level cards (step 1) ────────────────────────────────────────────────
  levelCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1.5, borderColor: colors.border,
  },
  levelCardSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceLight },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  levelIconWrap: {
    width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  levelIconWrapSelected: {
    backgroundColor: 'rgba(232,69,139,0.1)', borderColor: colors.primary,
  },
  levelTextWrap: { flex: 1 },
  levelLabel: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  levelLabelSelected: { color: colors.primary },
  levelDesc: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 2 },
  levelBenchmark: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: colors.primary, marginTop: 4, opacity: 0.8 },

  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.textFaint },
  radioSelected: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },

  // ── Counters ──────────────────────────────────────────────────────────────
  counterSectionTitle: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  counterSectionHint: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.primary, marginBottom: 10, lineHeight: 18 },
  counterOrganisedNote: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: '#06B6D4', marginTop: 1 },
  counterRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  typeIndicator: { width: 4, height: 36, borderRadius: 2, marginRight: 10 },
  counterLabelWrap: { flex: 1, marginLeft: 8 },
  counterLabel: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  counterHint: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.primary, marginTop: 1 },
  counterControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  counterBtn: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.5, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  counterBtnDisabled: { borderColor: colors.textFaint },
  counterBtnText: { fontSize: 18, fontWeight: '500', color: colors.primary },
  counterBtnTextDisabled: { color: colors.textFaint },
  counterValue: { fontSize: 20, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, width: 24, textAlign: 'center' },

  // ── Divider + status ─────────────────────────────────────────────────────
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },
  placeLabel: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4, marginHorizontal: 4 },
  placeStatus: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, marginBottom: 14, marginHorizontal: 4 },
  placeStatusOk: { color: colors.secondary },
  placeStatusPending: { color: colors.primary },

  // ── Activity palette ─────────────────────────────────────────────────────
  paletteScroll: { marginBottom: 14, maxHeight: 44 },
  paletteContent: { gap: 6, paddingHorizontal: 2 },
  placeSub: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginBottom: 8, marginHorizontal: 4, lineHeight: 19 },
  palettePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
  },
  palettePillSelected: { transform: [{ scale: 1.05 }], borderWidth: 2 },
  paletteDot: { width: 6, height: 6, borderRadius: 3 },
  paletteLabel: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
  paletteBadge: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  paletteBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  paletteDivider: { width: 1, height: 24, backgroundColor: colors.border, marginHorizontal: 4, alignSelf: 'center' },
  paletteSectionLabel: { justifyContent: 'center', marginRight: 6 },
  paletteSectionText: { fontSize: 9, fontWeight: '600', fontFamily: FF.semibold, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 },

  // ── Activity search ────────────────────────────────────────────────────
  activitySearchWrap: { paddingHorizontal: 0, marginTop: 8, marginBottom: 12, alignSelf: 'stretch' },
  activitySearchInput: {
    backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, fontFamily: FF.regular, color: colors.text,
  },

  // ── Selected indicator ───────────────────────────────────────────────────
  selectedIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: colors.surface, borderWidth: 1, marginBottom: 14,
  },
  selectedIndicatorDot: { width: 8, height: 8, borderRadius: 4 },
  selectedIndicatorText: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold },
  selectedIndicatorHint: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint },
  crossTrainingNote: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: CT_COLOR, marginBottom: 14, marginTop: -8, paddingHorizontal: 4, lineHeight: 16, opacity: 0.85 },

  // ── Unified day grid ────────────────────────────────────────────────────
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  dayCard: {
    width: '30.5%', minHeight: 80, backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 4,
  },
  dayShort: { fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  dayScheduledTag: { fontSize: 8, fontWeight: '600', fontFamily: FF.semibold, color: colors.secondary, letterSpacing: 0.3, marginBottom: 3, textTransform: 'uppercase' },
  dayRecurringName: { fontSize: 8, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary, marginBottom: 3, textAlign: 'center', paddingHorizontal: 2 },
  dayStack: { width: '100%', alignItems: 'center', gap: 3 },
  stackPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
    borderWidth: 1, width: '94%',
  },
  stackDot: { width: 5, height: 5, borderRadius: 2.5 },
  stackLabel: { fontSize: 9, fontWeight: '600', fontFamily: FF.semibold, flex: 1 },
  stackRemove: { fontSize: 13, fontWeight: '600', marginLeft: 2 },
  dayEmptyPlus: { fontSize: 22, color: colors.primary, fontWeight: '500', marginTop: 4 },
  dayHint: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, textAlign: 'center', marginTop: 4, marginBottom: 8 },

  counterHintDone: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: colors.secondary, marginTop: 1 },

  // Cross-training info note
  crossTrainNote: {
    backgroundColor: 'rgba(6,182,212,0.08)', borderRadius: 12, padding: 14, marginTop: 8,
    borderWidth: 1, borderColor: 'rgba(6,182,212,0.2)',
  },
  crossTrainNoteText: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: CT_COLOR, lineHeight: 19 },

  // ── Shared section helpers ──────────────────────────────────────────────
  sectionDivider: { height: 1, backgroundColor: colors.border, marginVertical: 18 },
  sectionHeading: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  sectionHint: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginBottom: 12, lineHeight: 19 },


  // ── Long ride day ──────────────────────────────────────────────────────
  longRideSection: { marginTop: 16 },
  longRideCard: {
    backgroundColor: 'rgba(232,69,139,0.06)', borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: 'rgba(232,69,139,0.2)',
  },
  longRideCardTitle: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  longRideCardHint: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginBottom: 12, lineHeight: 19 },
  longRideDayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 12,
  },
  longRideDayScroll: { marginTop: 4 },
  longRidePill: {
    width: 68,
    paddingVertical: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border,
  },
  longRidePillSelected: {
    borderColor: colors.primary, backgroundColor: colors.primary,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  longRidePillHint: { borderColor: colors.primary + '66', backgroundColor: colors.primary + '08' },
  longRidePillText: { fontSize: 13, fontWeight: '700', fontFamily: FF.semibold, color: colors.textMid, letterSpacing: 0.5 },
  longRidePillTextSelected: { color: '#fff' },
  longRidePillHintDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 4 },
  longRideAutoTag: { fontSize: 9, fontWeight: '500', fontFamily: FF.medium, color: colors.textFaint, textAlign: 'center', marginTop: 2 },
  longRideDayHint: { fontSize: 12, fontFamily: FF.regular, color: colors.textMuted, marginTop: 12, lineHeight: 17 },

  // Build week summary strip
  buildWeekSummary: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  buildWeekSummaryText: {
    fontSize: 12, fontFamily: FF.medium, color: colors.primary,
    backgroundColor: colors.primary + '14', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden',
  },

  // ── Organised rides ─────────────────────────────────────────────────
  organisedSection: { marginTop: 20, marginBottom: 8 },
  organisedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  organisedHeading: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  organisedOptional: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: colors.textFaint, backgroundColor: colors.surface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  organisedHint: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginBottom: 12, lineHeight: 19 },
  organisedCard: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  organisedCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  organisedDayBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  organisedDayBadgeText: { fontSize: 12, fontWeight: '700', fontFamily: FF.semibold, color: colors.primary },
  organisedCardDetails: { flex: 1, flexDirection: 'row', gap: 10 },
  organisedDetail: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
  organisedRemove: { fontSize: 20, color: colors.textMuted, paddingHorizontal: 4 },
  organisedNotes: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 6 },
  organisedForm: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginTop: 4,
    borderWidth: 1, borderColor: colors.primary + '44',
  },
  organisedFormLabel: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 8 },
  organisedFormDayScroll: { marginBottom: 12 },
  organisedFormDayPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginRight: 6,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
  },
  organisedFormDayPillSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '14' },
  organisedFormDayText: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMid },
  organisedFormDayTextSelected: { color: colors.primary },
  organisedFormInputRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  organisedFormInputGroup: { flex: 1 },
  organisedFormInputLabel: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, marginBottom: 4 },
  organisedFormInput: {
    backgroundColor: colors.bg, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontFamily: FF.regular, color: colors.text,
  },
  organisedFormNotesInput: {
    backgroundColor: colors.bg, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: FF.regular, color: colors.text,
    marginBottom: 12,
  },
  keyboardDoneRow: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 4, marginBottom: 8 },
  keyboardDoneText: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary },
  organisedFormActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  organisedFormCancelBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  organisedFormCancelText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
  organisedFormAddBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  organisedFormAddText: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  organisedAddTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginTop: 4,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  organisedAddTriggerPlus: { fontSize: 20, color: colors.primary, fontWeight: '600' },
  organisedAddTriggerText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },

  // ── Duration ─────────────────────────────────────────────────────────────
  durationHeading: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4, marginHorizontal: 4 },
  durationHint: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginBottom: 14, marginHorizontal: 4 },
  durationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  durationPill: {
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
  },
  durationPillActive: { borderColor: colors.primary, backgroundColor: 'rgba(232,69,139,0.1)' },
  durationPillText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
  durationPillTextActive: { color: colors.primary, fontWeight: '600' },
  beginnerDurationBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(232,69,139,0.12)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 16 },
  beginnerDurationText: { fontSize: 14, fontFamily: FF.semibold, color: colors.secondary },

  // ── Start date ─────────────────────────────────────────────────────────────
  startDateOption: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 8,
    borderWidth: 1.5, borderColor: colors.border,
  },
  startDateOptionActive: { borderColor: colors.primary, backgroundColor: 'rgba(232,69,139,0.06)' },
  startDateRadio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: colors.textFaint,
    alignItems: 'center', justifyContent: 'center', marginRight: 14, marginTop: 2,
  },
  startDateRadioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  startDateInfo: { flex: 1 },
  startDateLabel: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.text, marginBottom: 2 },
  startDateLabelActive: { color: colors.primary },
  startDateDesc: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, lineHeight: 18 },
  recommendBadge: {
    marginTop: 6, alignSelf: 'flex-start',
    backgroundColor: 'rgba(232,69,139,0.12)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8,
  },
  recommendText: { fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: colors.secondary },

  customDateWrap: { marginTop: 8, marginBottom: 8 },
  customDateHint: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginTop: 6, marginHorizontal: 4 },

  startDateSummary: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginTop: 12, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  startDateSummaryLabel: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  startDateSummaryText: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 20 },

  // ── Coach selection (step 5) ────────────────────────────────────────────
  coachCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1.5, borderColor: colors.border,
  },
  coachCardSelected: { borderColor: colors.primary, backgroundColor: colors.surface },
  coachAvatar: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  coachAvatarText: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: FF.semibold },
  coachInfo: { flex: 1 },
  coachNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coachName: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  coachNameSelected: { color: colors.primary },
  coachPronouns: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint },
  coachTagline: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, marginTop: 1 },
  coachTaglineSelected: { color: colors.primary },
  coachBio: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 17, marginTop: 4 },
  coachBadgeRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  coachLevelBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  coachLevelText: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, letterSpacing: 0.3 },
  coachQuote: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, fontStyle: 'italic', marginTop: 6, lineHeight: 17 },
  coachCheck: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  coachCheckMark: { fontSize: 13, color: '#fff', fontWeight: '700' },
});
