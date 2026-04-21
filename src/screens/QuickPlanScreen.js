/**
 * Quick Plan — the "just want to improve" pathway.
 *
 * A minimal single-screen flow: fitness level + plan length + days per week.
 * No goal wizard, no cycling type picker — we default to `improve` and `mixed`.
 * Once submitted, we save a goal + plan config and navigate to PlanLoading,
 * which handles the Claude generation + paywall gating.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { saveGoal, savePlanConfig } from '../services/storageService';
import analytics from '../services/analyticsService';
import { t } from '../services/strings';
import remoteConfig from '../services/remoteConfig';

const FF = fontFamily;

// Defaults — bundled copies of what lives remotely at `fitnessLevels` /
// `planDurations`. The app uses these unless the backend sends alternatives,
// so the screen still works offline or pre-first-fetch.
const DEFAULT_FITNESS_LEVELS = [
  { key: 'beginner',     label: 'Beginner',     description: 'New to cycling or riding less than twice a week' },
  { key: 'intermediate', label: 'Intermediate', description: 'Ride 2–4 times a week with a reasonable base' },
  { key: 'advanced',     label: 'Advanced',     description: 'Train regularly and have been cycling for a while' },
  { key: 'expert',       label: 'Expert',       description: 'Competitive or high-volume endurance rider' },
];

const DEFAULT_DURATIONS = [
  { key: 4,  label: '4 weeks' },
  { key: 8,  label: '8 weeks' },
  { key: 12, label: '12 weeks' },
];

const DAYS_PER_WEEK = [2, 3, 4, 5];

/**
 * Pull fitness levels + durations from remoteConfig with bundled fallbacks.
 * Returns normalised shape so the render code doesn't care about the source.
 */
function readRemoteOptions() {
  const rawLevels = remoteConfig.getJson('fitnessLevels', DEFAULT_FITNESS_LEVELS);
  const rawDurations = remoteConfig.getJson('planDurations', DEFAULT_DURATIONS);

  // Normalise remote shape: { key, label, description } for levels,
  // { weeks, label } or { key, label } for durations.
  const levels = (Array.isArray(rawLevels) && rawLevels.length ? rawLevels : DEFAULT_FITNESS_LEVELS)
    .map(l => ({ key: l.key, label: l.label, description: l.description }));

  const durations = (Array.isArray(rawDurations) && rawDurations.length ? rawDurations : DEFAULT_DURATIONS)
    .map(d => ({ key: d.weeks ?? d.key, label: d.label }));

  return { levels, durations };
}

// Fitness-level indicator bars (matches the style used in PlanConfigScreen)
const LEVEL_BARS = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };
function LevelBars({ level, selected }) {
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

export default function QuickPlanScreen({ navigation, route }) {
  const requirePaywall = route?.params?.requirePaywall || false;
  const [level, setLevel] = useState(null);
  const [weeks, setWeeks] = useState(null);
  const [daysPerWeek, setDaysPerWeek] = useState(3);     // sensible default
  const [submitting, setSubmitting] = useState(false);

  // Remote-driven options with bundled fallback. Re-read on every render —
  // cheap, synchronous, and picks up config changes after a background refresh.
  const [, forceRerender] = useState(0);
  useEffect(() => remoteConfig.subscribe(() => forceRerender(x => x + 1)), []);
  const { levels: FITNESS_LEVELS, durations: DURATIONS } = readRemoteOptions();

  const canSubmit = !!level && !!weeks && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Save the goal — "improve" type, mixed cycling style as sensible defaults
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

      // Save the plan config
      await savePlanConfig({
        goalId: goal.id,
        fitnessLevel: level,
        weeks,
        daysPerWeek,
        sessionsPerWeek: daysPerWeek,
        indoorTrainer: false,
        trainingTypes: ['outdoor'],
        coachId: null,
        extraNotes: '',
      });

      analytics.events?.quickPlanStarted?.({ level, weeks, daysPerWeek });

      navigation.navigate('PlanLoading', {
        goalId: goal.id,
        requirePaywall,
      });
    } catch (err) {
      setSubmitting(false);
      console.error('[QuickPlan] submit error:', err);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('quickPlan.headerTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.intro}>
          {t('quickPlan.intro')}
        </Text>

        {/* Q1 — fitness level */}
        <Text style={s.question}>{t('quickPlan.q1')}</Text>
        <View style={s.optionGridTwoCol}>
          {FITNESS_LEVELS.map(opt => {
            const selected = level === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[s.optionCard, selected && s.optionCardSelected]}
                onPress={() => setLevel(opt.key)}
                activeOpacity={0.85}
              >
                <View style={s.optionCardHeader}>
                  <Text style={[s.optionCardLabel, selected && s.optionCardLabelSelected]}>
                    {opt.label}
                  </Text>
                  <LevelBars level={opt.key} selected={selected} />
                </View>
                <Text style={[s.optionCardDesc, selected && s.optionCardDescSelected]}>
                  {opt.description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Q2 — duration */}
        <Text style={s.question}>{t('quickPlan.q2')}</Text>
        <View style={s.pillRow}>
          {DURATIONS.map(opt => {
            const selected = weeks === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[s.pill, selected && s.pillSelected]}
                onPress={() => setWeeks(opt.key)}
                activeOpacity={0.85}
              >
                <Text style={[s.pillText, selected && s.pillTextSelected]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Q3 — days per week */}
        <Text style={s.question}>{t('quickPlan.q3')}</Text>
        <View style={s.pillRow}>
          {DAYS_PER_WEEK.map(d => {
            const selected = daysPerWeek === d;
            return (
              <TouchableOpacity
                key={d}
                style={[s.pillSmall, selected && s.pillSelected]}
                onPress={() => setDaysPerWeek(d)}
                activeOpacity={0.85}
              >
                <Text style={[s.pillText, selected && s.pillTextSelected]}>
                  {d}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={s.hint}>
          {t('quickPlan.hint')}
        </Text>
      </ScrollView>

      {/* Sticky CTA at the bottom */}
      <View style={s.footer}>
        <TouchableOpacity
          style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.88}
        >
          {submitting ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={s.submitBtnText}>{t('quickPlan.cta')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 17, fontFamily: FF.semibold, fontWeight: '600', color: colors.text,
  },

  scroll: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 32 },

  intro: {
    fontSize: 16, lineHeight: 24,
    color: colors.textMid,
    fontFamily: FF.regular,
    fontWeight: '300',
    marginBottom: 32,
  },

  question: {
    fontSize: 18, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.text,
    marginTop: 20, marginBottom: 14,
  },

  optionGridTwoCol: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionCard: {
    flexGrow: 1, flexBasis: '46%',
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  optionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#1a0f16',
  },
  optionCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6,
  },
  optionCardLabel: {
    fontSize: 15, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.text,
  },
  optionCardLabelSelected: { color: colors.primary },
  optionCardDesc: {
    fontSize: 13, lineHeight: 18,
    color: colors.textMuted,
    fontFamily: FF.regular, fontWeight: '300',
  },
  optionCardDescSelected: { color: colors.textMid },

  pillRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  pill: {
    paddingVertical: 14, paddingHorizontal: 22,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 100,
    minWidth: 92,
    alignItems: 'center',
  },
  pillSmall: {
    paddingVertical: 14, paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 100,
    minWidth: 58,
    alignItems: 'center',
  },
  pillSelected: {
    borderColor: colors.primary,
    backgroundColor: '#1a0f16',
  },
  pillText: {
    fontSize: 15, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.textMid,
  },
  pillTextSelected: { color: colors.primary },

  hint: {
    fontSize: 13, lineHeight: 20,
    color: colors.textMuted,
    fontFamily: FF.regular, fontWeight: '300',
    marginTop: 40,
  },

  footer: {
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: colors.border,
  },
  submitBtnText: {
    fontSize: 16, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.bg,
  },
});
