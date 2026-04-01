/**
 * Plan Configuration Wizard — 4 steps:
 *  Step 1: How active are you? (fitness level — beginner / intermediate / advanced / expert)
 *  Step 2: What training types? (outdoor, indoor, strength)
 *  Step 3: Build your week — session counts, day placement, AND other training
 *  Step 4: Duration (if no target date) & start date
 */
import React, { useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fontFamily } from '../theme';
import WizardShell, { CheckCard } from '../components/WizardShell';
import { savePlanConfig } from '../services/storageService';
import { suggestWeeks } from '../services/planGenerator';
import DatePicker from '../components/DatePicker';
import { COACHES, DEFAULT_COACH_ID } from '../data/coaches';
import analytics from '../services/analyticsService';

const FF = fontFamily;
const TOTAL_STEPS = 5;

const FITNESS_LEVEL_COLORS = {
  beginner:     '#22C55E',
  intermediate: '#D97706',
  advanced:     '#EF4444',
  expert:       '#DC2626',
};

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
  { key: 'outdoor',  label: 'Outdoor rides',     short: 'Outdoor' },
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

const TYPE_COLORS = {
  outdoor:  '#D97706',
  indoor:   '#3B82F6',
  strength: '#8B5CF6',
};

const CT_COLOR = '#06B6D4';

const CYCLING_KEYS = TRAINING_TYPES.map(t => t.key);
const isCyclingType = (key) => CYCLING_KEYS.includes(key);

export default function PlanConfigScreen({ navigation, route }) {
  const goal = route.params?.goal;
  const beginnerDefaults = route.params?.beginnerDefaults || null;

  const [step, setStep] = useState(beginnerDefaults ? 3 : 1); // Skip fitness + training types for beginner
  const [fitnessLevel, setFitnessLevel] = useState(beginnerDefaults?.fitnessLevel || null);
  const [trainingTypes, setTrainingTypes] = useState(['outdoor']);
  const [startDateChoice, setStartDateChoice] = useState('next_monday');
  const [customStartDate, setCustomStartDate] = useState('');
  const [planWeeks, setPlanWeeks] = useState(beginnerDefaults?.weeks || null);

  // Step 3: session counts per cycling type
  const [sessionCounts, setSessionCounts] = useState(
    beginnerDefaults ? { outdoor: beginnerDefaults.daysPerWeek } : { outdoor: 2 }
  );

  // Unified day activities — each day holds an array of activity keys
  // e.g. { monday: ['outdoor', 'run'], tuesday: ['indoor'], ... }
  const [dayActivities, setDayActivities] = useState({});

  // Currently selected activity type for tap-to-place
  const [selectedActivity, setSelectedActivity] = useState('outdoor');

  // Coach selection
  const [coachId, setCoachId] = useState(DEFAULT_COACH_ID);

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
  const allPlaced = totalCyclingPlaced === totalSessions && totalSessions > 0;

  // Handle tapping a day card — place or remove the selected activity
  const handleDayTap = (dayKey) => {
    setDayActivities(prev => {
      const next = { ...prev };
      const current = next[dayKey] || [];
      const act = selectedActivity;

      // If it's a cycling type, check quota
      if (isCyclingType(act)) {
        const target = sessionCounts[act] || 0;
        let placed = 0;
        Object.values(prev).forEach(acts => { placed += acts.filter(a => a === act).length; });

        if (current.includes(act)) {
          // Remove it
          const updated = [...current];
          updated.splice(updated.indexOf(act), 1);
          if (updated.length === 0) delete next[dayKey];
          else next[dayKey] = updated;
        } else if (placed < target) {
          // Add it
          next[dayKey] = [...current, act];
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
    if (step === 3) return allPlaced;
    if (step === 4) {
      if (startDateChoice === 'custom' && !/^\d{4}-\d{2}-\d{2}$/.test(customStartDate)) return false;
      if (!goal.targetDate && !planWeeks) return false;
      return true;
    }
    if (step === 5) return !!coachId;
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
      if (step === 3) analytics.events.configStepCompleted(3, { sessionsPerWeek: totalSessions, daysPlaced: Object.keys(dayActivities).length });
      if (step === 4) analytics.events.configStepCompleted(4, { planWeeks, startDateChoice });
      setStep(step + 1);
      return;
    }

    const availableDays = Object.keys(dayAssignments);
    const daysPerWeek = totalSessions;

    const startDate = getChosenStartDate();
    const weeks = planWeeks || suggestWeeks(goal, fitnessLevel, startDate);

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
      startDate: startDate.toISOString(),
      ...(beginnerDefaults?.paymentStatus && { paymentStatus: beginnerDefaults.paymentStatus }),
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

    navigation.replace('PlanLoading', { goal, config });
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
                <View style={[s.levelIndicator, { backgroundColor: FITNESS_LEVEL_COLORS[fl.key] || colors.primary }]} />
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

    // ── Step 3: Build your week (unified activity placement) ────────────────
    if (step === 3) {
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

      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* ── Cycling session counters ── */}
          {activeTypes.map(tt => {
            const count = sessionCounts[tt.key] || 0;
            const placed = placedByType[tt.key] || 0;
            return (
              <View key={tt.key} style={s.counterRow}>
                <View style={[s.typeIndicator, { backgroundColor: TYPE_COLORS[tt.key] || colors.primary }]} />
                <View style={s.counterLabelWrap}>
                  <Text style={s.counterLabel}>{tt.label}</Text>
                  {count > 0 && placed < count && (
                    <Text style={s.counterHint}>{count - placed} to place</Text>
                  )}
                  {count > 0 && placed >= count && (
                    <Text style={s.counterHintDone}>{'\u2713'} All placed</Text>
                  )}
                </View>
                <View style={s.counterControls}>
                  <TouchableOpacity
                    style={[s.counterBtn, count <= 0 && s.counterBtnDisabled]}
                    onPress={() => adjustCount(tt.key, -1)}
                    disabled={count <= 0}
                  >
                    <Text style={[s.counterBtnText, count <= 0 && s.counterBtnTextDisabled]}>{'\u2212'}</Text>
                  </TouchableOpacity>
                  <Text style={s.counterValue}>{count}</Text>
                  <TouchableOpacity
                    style={s.counterBtn}
                    onPress={() => adjustCount(tt.key, 1)}
                  >
                    <Text style={s.counterBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {/* ── Activity palette ── */}
          <View style={s.divider} />
          <Text style={s.placeLabel}>Build your week</Text>
          <Text style={s.placeSub}>
            Select an activity, then tap a day to place it. Tap a placed item to remove it. You can stack multiple activities on one day.
          </Text>
          <Text style={[s.placeStatus, allPlaced ? s.placeStatusOk : s.placeStatusPending]}>
            {totalCyclingPlaced}/{totalSessions} cycling sessions placed
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.paletteScroll} contentContainerStyle={s.paletteContent}>
            {/* Cycling types */}
            {cyclingPalette.map(cp => {
              const isSelected = selectedActivity === cp.key;
              const remaining = cp.target - cp.placed;
              return (
                <TouchableOpacity
                  key={cp.key}
                  style={[s.palettePill, isSelected && s.palettePillSelected, isSelected && { borderColor: cp.color, backgroundColor: cp.color + '18' }]}
                  onPress={() => setSelectedActivity(cp.key)}
                  activeOpacity={0.7}
                >
                  <View style={[s.paletteDot, { backgroundColor: cp.color }]} />
                  <Text style={[s.paletteLabel, isSelected && { color: cp.color }]}>{cp.label}</Text>
                  {remaining > 0 && (
                    <View style={[s.paletteBadge, { backgroundColor: cp.color }]}>
                      <Text style={s.paletteBadgeText}>{remaining}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
            {/* Divider + cross-training label */}
            <View style={s.paletteDivider} />
            <View style={s.paletteSectionLabel}>
              <Text style={s.paletteSectionText}>Other activities</Text>
            </View>
            {CROSS_TRAINING_TYPES.map(ct => {
              const isSelected = selectedActivity === ct.key;
              const isUsed = Object.values(dayActivities).some(acts => acts.includes(ct.key));
              return (
                <TouchableOpacity
                  key={ct.key}
                  style={[s.palettePill, isSelected && s.palettePillSelected, isSelected && { borderColor: CT_COLOR, backgroundColor: CT_COLOR + '18' }, isUsed && !isSelected && { borderColor: CT_COLOR + '66' }]}
                  onPress={() => setSelectedActivity(ct.key)}
                  activeOpacity={0.7}
                >
                  <View style={[s.paletteDot, { backgroundColor: CT_COLOR }]} />
                  <Text style={[s.paletteLabel, isSelected && { color: CT_COLOR }]}>{ct.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Selected activity indicator */}
          {selectedActivity && (
            <View style={[s.selectedIndicator, { borderColor: getActivityColor(selectedActivity) + '44' }]}>
              <View style={[s.selectedIndicatorDot, { backgroundColor: getActivityColor(selectedActivity) }]} />
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
                  {acts.length > 0 ? (
                    <View style={s.dayStack}>
                      {acts.map((actKey, idx) => {
                        const actColor = getActivityColor(actKey);
                        return (
                          <TouchableOpacity
                            key={`${actKey}-${idx}`}
                            style={[s.stackPill, { backgroundColor: actColor + '18', borderColor: actColor + '44' }]}
                            onPress={(e) => { e.stopPropagation?.(); handleRemoveActivity(day.key, actKey); }}
                            activeOpacity={0.7}
                          >
                            <View style={[s.stackDot, { backgroundColor: actColor }]} />
                            <Text style={[s.stackLabel, { color: actColor }]} numberOfLines={1}>{getActivityLabel(actKey)}</Text>
                            <Text style={[s.stackRemove, { color: actColor }]}>{'\u00D7'}</Text>
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

    // ── Step 4: Duration + start date ──────────────────────────────────────
    if (step === 4) {
      const hasTargetDate = !!goal.targetDate;
      const effectiveWeeks = planWeeks || suggestWeeks(goal, fitnessLevel, getChosenStartDate());

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

    // ── Step 5: Choose your coach ────────────────────────────────────────────
    if (step === 5) {
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
                    <View style={[s.coachLevelBadge, {
                      backgroundColor: coach.level === 'beginner' ? 'rgba(34,197,94,0.12)'
                        : coach.level === 'intermediate' ? 'rgba(217,119,6,0.12)'
                        : 'rgba(239,68,68,0.12)'
                    }]}>
                      <Text style={[s.coachLevelText, {
                        color: coach.level === 'beginner' ? '#22C55E'
                          : coach.level === 'intermediate' ? '#D97706'
                          : '#EF4444'
                      }]}>
                        {coach.level === 'beginner' ? 'Great for beginners'
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
    const target = new Date(goal.targetDate);
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
    3: 'Build your week',
    4: goal.targetDate ? 'When should it start?' : 'Duration & start date',
    5: 'Choose your coach',
  };

  const subtitles = {
    1: 'Be honest \u2014 this helps us set realistic targets',
    2: 'Choose as many as you like',
    3: 'Set session counts, place them on days, and add any other training',
    4: goal.targetDate ? 'Pick a start date for your training plan' : 'How long and when to begin',
    5: 'Pick a coaching personality that fits your style',
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
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  levelIndicator: { width: 4, height: 36, borderRadius: 2 },
  levelTextWrap: { flex: 1 },
  levelLabel: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  levelLabelSelected: { color: colors.primary },
  levelDesc: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 2 },
  levelBenchmark: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: colors.primary, marginTop: 4, opacity: 0.8 },

  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.textFaint },
  radioSelected: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },

  // ── Counters ──────────────────────────────────────────────────────────────
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
  placeStatusOk: { color: '#22C55E' },
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
  palettePillSelected: { transform: [{ scale: 1.05 }] },
  paletteDot: { width: 6, height: 6, borderRadius: 3 },
  paletteLabel: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
  paletteBadge: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  paletteBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  paletteDivider: { width: 1, height: 24, backgroundColor: colors.border, marginHorizontal: 4, alignSelf: 'center' },
  paletteSectionLabel: { justifyContent: 'center', marginRight: 6 },
  paletteSectionText: { fontSize: 9, fontWeight: '600', fontFamily: FF.semibold, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 },

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

  counterHintDone: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: '#22C55E', marginTop: 1 },

  // Cross-training info note
  crossTrainNote: {
    backgroundColor: 'rgba(6,182,212,0.08)', borderRadius: 12, padding: 14, marginTop: 8,
    borderWidth: 1, borderColor: 'rgba(6,182,212,0.2)',
  },
  crossTrainNoteText: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: CT_COLOR, lineHeight: 19 },

  // ── Duration ─────────────────────────────────────────────────────────────
  durationHeading: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4, marginHorizontal: 4 },
  durationHint: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginBottom: 14, marginHorizontal: 4 },
  durationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  durationPill: {
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
  },
  durationPillActive: { borderColor: colors.primary, backgroundColor: 'rgba(217,119,6,0.1)' },
  durationPillText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
  durationPillTextActive: { color: colors.primary, fontWeight: '600' },
  beginnerDurationBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 16 },
  beginnerDurationText: { fontSize: 14, fontFamily: FF.semibold, color: '#22C55E' },

  // ── Start date ─────────────────────────────────────────────────────────────
  startDateOption: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 8,
    borderWidth: 1.5, borderColor: colors.border,
  },
  startDateOptionActive: { borderColor: colors.primary, backgroundColor: 'rgba(217,119,6,0.06)' },
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
    backgroundColor: 'rgba(34,197,94,0.12)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8,
  },
  recommendText: { fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: '#22C55E' },

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
  coachCardSelected: { borderColor: colors.primary, backgroundColor: 'rgba(217,119,6,0.04)' },
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
  coachLevelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  coachLevelText: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold },
  coachQuote: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, fontStyle: 'italic', marginTop: 6, lineHeight: 17 },
  coachCheck: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  coachCheckMark: { fontSize: 13, color: '#fff', fontWeight: '700' },
});
