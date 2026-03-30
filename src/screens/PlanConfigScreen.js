/**
 * Plan Configuration Wizard — 4 steps:
 *  Step 1: How active are you? (fitness level)
 *  Step 2: What training types? (outdoor, indoor, strength)
 *  Step 3: Session counts + place on days of the week
 *  Step 4: When should the plan start?
 */
import React, { useState, useMemo } from 'react';
import { View, ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fontFamily } from '../theme';
import WizardShell, { OptionCard, CheckCard } from '../components/WizardShell';
import { savePlanConfig } from '../services/storageService';
import { suggestWeeks } from '../services/planGenerator';
import DatePicker from '../components/DatePicker';

const FF = fontFamily;
const TOTAL_STEPS = 4;

const FITNESS_LEVELS = [
  { key: 'beginner',     emoji: '\uD83D\uDEB2', label: 'New to cycling', description: 'I don\'t ride regularly yet or just getting started' },
  { key: 'intermediate', emoji: '\u26A1',        label: 'Regular rider', description: 'I ride a few times a week and have a reasonable base' },
  { key: 'advanced',     emoji: '\uD83D\uDD25',  label: 'Experienced', description: 'I train regularly and have been cycling for a while' },
];

const TRAINING_TYPES = [
  { key: 'outdoor',  emoji: '\uD83C\uDF24\uFE0F', label: 'Outdoor rides',     short: 'Outdoor' },
  { key: 'indoor',   emoji: '\uD83C\uDFE0',       label: 'Indoor trainer',    short: 'Indoor' },
  { key: 'strength', emoji: '\uD83D\uDCAA',       label: 'Strength training', short: 'Strength' },
];

const DURATION_OPTIONS = [4, 6, 8, 10, 12, 16];

const DAYS = [
  { key: 'monday',    short: 'Mon' },
  { key: 'tuesday',   short: 'Tue' },
  { key: 'wednesday', short: 'Wed' },
  { key: 'thursday',  short: 'Thu' },
  { key: 'friday',    short: 'Fri' },
  { key: 'saturday',  short: 'Sat' },
  { key: 'sunday',    short: 'Sun' },
];

const DAY_KEY_TO_INDEX = {};
DAYS.forEach((d, i) => { DAY_KEY_TO_INDEX[d.key] = i; });

const TYPE_COLORS = {
  outdoor:  '#D97706',
  indoor:   '#3B82F6',
  strength: '#8B5CF6',
};

export default function PlanConfigScreen({ navigation, route }) {
  const goal = route.params?.goal;

  const [step, setStep] = useState(1);
  const [fitnessLevel, setFitnessLevel] = useState(null);
  const [trainingTypes, setTrainingTypes] = useState(['outdoor']);
  const [startDateChoice, setStartDateChoice] = useState('next_monday'); // 'next_monday' | 'this_monday' | 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [planWeeks, setPlanWeeks] = useState(null); // manual override when no target date

  // Step 3: session counts per type + day assignments
  const [sessionCounts, setSessionCounts] = useState({ outdoor: 2 });
  // dayAssignments: { monday: 'outdoor', wednesday: 'strength', ... }
  const [dayAssignments, setDayAssignments] = useState({});

  const toggleTrainingType = (type) => {
    setTrainingTypes(prev => {
      if (type === 'outdoor') return prev;
      const next = prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type];
      // Reset counts for removed types and init new ones
      setSessionCounts(sc => {
        const updated = { ...sc };
        if (!next.includes(type)) {
          delete updated[type];
          // Remove day assignments of this type
          setDayAssignments(da => {
            const cleaned = { ...da };
            Object.keys(cleaned).forEach(k => { if (cleaned[k] === type) delete cleaned[k]; });
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

      // If count decreased, may need to unassign overflow days
      const placedCount = Object.values(dayAssignments).filter(v => v === type).length;
      if (placedCount > newVal) {
        // Remove excess assigned days (from the end)
        setDayAssignments(da => {
          const cleaned = { ...da };
          let toRemove = placedCount - newVal;
          // Remove from last day backwards
          for (let i = DAYS.length - 1; i >= 0 && toRemove > 0; i--) {
            if (cleaned[DAYS[i].key] === type) {
              delete cleaned[DAYS[i].key];
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

  // Count placed sessions per type
  const placedByType = {};
  trainingTypes.forEach(t => { placedByType[t] = 0; });
  Object.values(dayAssignments).forEach(t => { placedByType[t] = (placedByType[t] || 0) + 1; });

  const totalPlaced = Object.values(dayAssignments).filter(Boolean).length;
  const allPlaced = totalPlaced === totalSessions && totalSessions > 0;

  // Figure out which type to assign next when tapping an empty day
  const getNextUnplacedType = () => {
    for (const t of trainingTypes) {
      const target = sessionCounts[t] || 0;
      const placed = placedByType[t] || 0;
      if (placed < target) return t;
    }
    return null;
  };

  const handleDayTap = (dayKey) => {
    setDayAssignments(prev => {
      const next = { ...prev };
      if (next[dayKey]) {
        // Already assigned — remove it
        delete next[dayKey];
        return next;
      }
      // Assign next unplaced type
      // Recalculate placed counts with current state
      const currentPlaced = {};
      trainingTypes.forEach(t => { currentPlaced[t] = 0; });
      Object.values(next).forEach(t => { currentPlaced[t] = (currentPlaced[t] || 0) + 1; });

      for (const t of trainingTypes) {
        const target = sessionCounts[t] || 0;
        if ((currentPlaced[t] || 0) < target) {
          next[dayKey] = t;
          return next;
        }
      }
      return prev; // nothing to assign
    });
  };

  // Cycle through types on an already-assigned day
  const handleDayLongPress = (dayKey) => {
    setDayAssignments(prev => {
      if (!prev[dayKey]) return prev;
      const currentType = prev[dayKey];
      const currentIdx = trainingTypes.indexOf(currentType);

      // Find next type that has unplaced capacity (or same type if none)
      const next = { ...prev };
      // Free this slot first
      delete next[dayKey];

      const currentPlaced = {};
      trainingTypes.forEach(t => { currentPlaced[t] = 0; });
      Object.values(next).forEach(t => { currentPlaced[t] = (currentPlaced[t] || 0) + 1; });

      // Try types after current, then wrap around
      for (let offset = 1; offset <= trainingTypes.length; offset++) {
        const t = trainingTypes[(currentIdx + offset) % trainingTypes.length];
        if ((currentPlaced[t] || 0) < (sessionCounts[t] || 0)) {
          next[dayKey] = t;
          return next;
        }
      }
      // If no other type fits, just remove
      return next;
    });
  };

  const canContinue = () => {
    if (step === 1) return !!fitnessLevel;
    if (step === 2) return trainingTypes.length > 0;
    if (step === 3) return allPlaced;
    if (step === 4) {
      if (startDateChoice === 'custom' && !/^\d{4}-\d{2}-\d{2}$/.test(customStartDate)) return false;
      // If no target date, user must pick a duration
      if (!goal.targetDate && !planWeeks) return false;
      return true;
    }
    return false;
  };

  const handleContinue = async () => {
    if (step < TOTAL_STEPS) {
      // When moving to step 3, initialize counts for new types
      if (step === 2) {
        setSessionCounts(prev => {
          const next = {};
          trainingTypes.forEach(t => { next[t] = prev[t] || 1; });
          return next;
        });
        setDayAssignments({});
      }
      setStep(step + 1);
      return;
    }

    // Build config and navigate to loading
    const availableDays = Object.keys(dayAssignments);
    const daysPerWeek = totalSessions;
    const weeks = planWeeks || suggestWeeks(goal, fitnessLevel);

    // Compute chosen start date
    const startDate = getChosenStartDate();

    const config = await savePlanConfig({
      goalId: goal.id,
      daysPerWeek,
      weeks,
      trainingTypes,
      sessionCounts,
      availableDays,
      dayAssignments,
      fitnessLevel,
      startDate: startDate.toISOString(),
    });

    navigation.replace('PlanLoading', { goal, config });
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else navigation.goBack();
  };

  const renderStep = () => {
    if (step === 1) {
      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          {FITNESS_LEVELS.map(fl => (
            <OptionCard
              key={fl.key}
              emoji={fl.emoji}
              label={fl.label}
              description={fl.description}
              selected={fitnessLevel === fl.key}
              onPress={() => setFitnessLevel(fl.key)}
            />
          ))}
        </ScrollView>
      );
    }

    if (step === 2) {
      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          {TRAINING_TYPES.map(tt => (
            <CheckCard
              key={tt.key}
              emoji={tt.emoji}
              label={tt.label}
              checked={trainingTypes.includes(tt.key)}
              onPress={() => toggleTrainingType(tt.key)}
            />
          ))}
        </ScrollView>
      );
    }

    if (step === 3) {
      const activeTypes = TRAINING_TYPES.filter(tt => trainingTypes.includes(tt.key));
      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Session counters */}
          {activeTypes.map(tt => {
            const count = sessionCounts[tt.key] || 0;
            const placed = placedByType[tt.key] || 0;
            return (
              <View key={tt.key} style={s.counterRow}>
                <View style={[s.typeIndicator, { backgroundColor: TYPE_COLORS[tt.key] || colors.primary }]} />
                <Text style={s.counterEmoji}>{tt.emoji}</Text>
                <View style={s.counterLabelWrap}>
                  <Text style={s.counterLabel}>{tt.label}</Text>
                  {count > 0 && placed < count && (
                    <Text style={s.counterHint}>{count - placed} to place</Text>
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

          {/* Divider + status */}
          <View style={s.divider} />
          <Text style={s.placeLabel}>Place on your week</Text>
          <Text style={[s.placeStatus, allPlaced ? s.placeStatusOk : s.placeStatusPending]}>
            {totalPlaced}/{totalSessions} placed
          </Text>

          {/* Day grid */}
          <View style={s.dayGrid}>
            {DAYS.map(day => {
              const assignedType = dayAssignments[day.key];
              const typeInfo = assignedType ? TRAINING_TYPES.find(t => t.key === assignedType) : null;
              const typeColor = assignedType ? (TYPE_COLORS[assignedType] || colors.primary) : null;
              const canAssign = !assignedType && getNextUnplacedType();

              return (
                <TouchableOpacity
                  key={day.key}
                  style={[
                    s.dayCard,
                    assignedType && { borderColor: typeColor },
                  ]}
                  onPress={() => handleDayTap(day.key)}
                  onLongPress={() => handleDayLongPress(day.key)}
                  activeOpacity={0.7}
                >
                  <Text style={s.dayShort}>{day.short}</Text>
                  {assignedType ? (
                    <View style={s.dayAssigned}>
                      <View style={[s.dayDot, { backgroundColor: typeColor }]} />
                      <Text style={[s.dayTypeLabel, { color: typeColor }]}>{typeInfo?.short || assignedType}</Text>
                    </View>
                  ) : (
                    <Text style={[s.dayEmpty, canAssign && s.dayEmptyActive]}>
                      {canAssign ? '+' : '\u2014'}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.dayHint}>Tap to assign {'\u00B7'} tap again to remove {'\u00B7'} long press to change type</Text>
        </ScrollView>
      );
    }

    if (step === 4) {
      const hasTargetDate = !!goal.targetDate;
      const effectiveWeeks = planWeeks || suggestWeeks(goal, fitnessLevel);

      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Duration picker — shown when there's no target date */}
          {!hasTargetDate && (
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

          {/* Start date options */}
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
    const weeks = suggestWeeks(goal, fitnessLevel);
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
      label: `This Monday — ${formatDateShort(thisMon)}`,
      desc: 'Start right away from the beginning of this week',
      recommended: recommended === 'this_monday',
    }]),
    {
      key: 'next_monday',
      label: `Next Monday — ${formatDateShort(nextMon)}`,
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
    1: 'How active are you currently?',
    2: 'What types of training?',
    3: 'Build your week',
    4: goal.targetDate ? 'When should it start?' : 'Duration & start date',
  };

  const subtitles = {
    1: 'Pick the level that suits you best',
    2: 'Choose as many as you like',
    3: 'Set session counts and place them on your days',
    4: goal.targetDate ? 'Pick a start date for your training plan' : 'How long and when to begin',
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
  // ── Counters ──────────────────────────────────────────────────────────────
  counterRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  typeIndicator: { width: 4, height: 36, borderRadius: 2, marginRight: 10 },
  counterEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
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

  // ── Day grid ──────────────────────────────────────────────────────────────
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  dayCard: {
    width: '30.5%', minHeight: 72, backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, paddingHorizontal: 6,
  },
  dayShort: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  dayAssigned: { alignItems: 'center', gap: 3 },
  dayDot: { width: 8, height: 8, borderRadius: 4 },
  dayTypeLabel: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium },
  dayEmpty: { fontSize: 20, color: colors.textFaint, fontWeight: '300' },
  dayEmptyActive: { color: colors.primary, fontWeight: '500', fontSize: 24 },
  dayHint: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, textAlign: 'center', marginTop: 4, marginBottom: 16 },

  // ── Step 4: Duration ─────────────────────────────────────────────────
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

  // ── Step 4: Start date ─────────────────────────────────────────────────
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
  customDateLabel: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid, marginBottom: 8, marginHorizontal: 4 },
  customDateInput: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 16,
    fontSize: 16, fontWeight: '400', fontFamily: FF.regular, color: colors.text,
    borderWidth: 1, borderColor: colors.border,
  },
  customDateHint: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginTop: 6, marginHorizontal: 4 },

  startDateSummary: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginTop: 12, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  startDateSummaryLabel: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  startDateSummaryText: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 20 },
});
