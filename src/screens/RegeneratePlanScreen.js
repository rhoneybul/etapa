/**
 * Regenerate Plan — tweak-then-regenerate flow.
 *
 * Opens with the current plan's fitness level, duration, and days-per-week
 * pre-filled. The user can tweak any or all, confirm, and we call the server
 * which:
 *   1. Takes a snapshot of the current plan ("pre-regenerate")
 *   2. Kicks off async LLM generation with the updated config
 *   3. Returns a jobId we pass to PlanLoadingScreen
 *
 * The original plan id is reused — activities get replaced in place, so any
 * existing references (chat sessions, notifications, deep links) keep working.
 * The old plan can be restored from Version history if they regret the change.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getGoal, getPlanConfig, updatePlanConfig } from '../services/storageService';
import api from '../services/api';
import analytics from '../services/analyticsService';
import remoteConfig from '../services/remoteConfig';

const FF = fontFamily;

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
const DAYS_PER_WEEK = [2, 3, 4, 5, 6];

const LEVEL_BARS = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };
function LevelBars({ level, selected }) {
  const n = LEVEL_BARS[level] || 1;
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'flex-end' }}>
      {[1, 2, 3, 4].map(i => (
        <View
          key={i}
          style={{
            width: 5, height: 8 + i * 4, borderRadius: 2,
            backgroundColor: i <= n
              ? (selected ? colors.primary : colors.textMid)
              : (selected ? colors.primary + '30' : colors.border),
          }}
        />
      ))}
    </View>
  );
}

function readRemoteOptions() {
  const rawLevels = remoteConfig.getJson('fitnessLevels', DEFAULT_FITNESS_LEVELS);
  const rawDurations = remoteConfig.getJson('planDurations', DEFAULT_DURATIONS);
  const levels = (Array.isArray(rawLevels) && rawLevels.length ? rawLevels : DEFAULT_FITNESS_LEVELS)
    .map(l => ({ key: l.key, label: l.label, description: l.description }));
  const durations = (Array.isArray(rawDurations) && rawDurations.length ? rawDurations : DEFAULT_DURATIONS)
    .map(d => ({ key: d.weeks ?? d.key, label: d.label }));
  return { levels, durations };
}

export default function RegeneratePlanScreen({ navigation, route }) {
  const { plan } = route.params || {};
  const [goal, setGoal] = useState(null);
  const [existingConfig, setExistingConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  // Editable fields — start null, populated from the existing config once loaded
  const [level, setLevel] = useState(null);
  const [weeks, setWeeks] = useState(null);
  const [daysPerWeek, setDaysPerWeek] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { levels: FITNESS_LEVELS, durations: DURATIONS } = readRemoteOptions();

  useEffect(() => {
    (async () => {
      try {
        if (!plan?.goalId) {
          Alert.alert('Plan not found', 'We couldn\u2019t load this plan. Please try again.');
          navigation.goBack();
          return;
        }
        const g = await getGoal(plan.goalId);
        const c = await getPlanConfig(plan.configId || null);
        setGoal(g);
        setExistingConfig(c);
        setLevel(c?.fitnessLevel || 'intermediate');
        setWeeks(c?.weeks || plan.weeks || 8);
        setDaysPerWeek(c?.daysPerWeek || c?.sessionsPerWeek || 3);
      } finally {
        setLoading(false);
      }
    })();
  }, [plan?.goalId, plan?.configId]);

  const canSubmit = !!level && !!weeks && !!daysPerWeek && !submitting && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    Alert.alert(
      'Regenerate plan?',
      'We\u2019ll save your current plan as a version you can restore later, then build a new one with these settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'default',
          onPress: () => submitRegenerate(),
        },
      ],
    );
  };

  const submitRegenerate = async () => {
    setSubmitting(true);
    try {
      // Build the updated config — merge edits onto the existing record.
      const updatedConfig = {
        ...(existingConfig || {}),
        fitnessLevel:    level,
        weeks,
        daysPerWeek,
        sessionsPerWeek: daysPerWeek,
      };

      // Persist the config changes locally + remotely so the new plan's
      // configId points at up-to-date values.
      if (existingConfig?.id) {
        await updatePlanConfig(existingConfig.id, {
          fitnessLevel: level, weeks, daysPerWeek, sessionsPerWeek: daysPerWeek,
        });
      }

      // Kick off server-side regenerate — the server snapshots, then starts
      // the LLM job. We only need the returned jobId to hand over to PlanLoading.
      const result = await api.plans.regenerate(plan.id, {
        goal,
        config: updatedConfig,
      });

      if (!result?.jobId) {
        throw new Error('Server did not return a job id');
      }

      analytics.events.planGenerationStarted?.({
        weeks, coachId: updatedConfig.coachId, reason: 'regenerate',
      });

      navigation.replace('PlanLoading', {
        goal,
        config: updatedConfig,
        existingJobId: result.jobId,
        isRegenerate: true,
        requirePaywall: false, // already a subscriber if they had a plan
      });
    } catch (err) {
      console.error('[RegeneratePlan] submit failed:', err);
      Alert.alert('Couldn\u2019t start regenerate', err?.message || 'Please try again in a moment.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={[s.scroll, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator color={colors.textMid} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Regenerate plan</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.intro}>
          Tweak anything that's changed, then we'll rebuild your plan. Your current plan is saved automatically — you can restore it from Version history any time.
        </Text>

        <Text style={s.question}>How fit are you now?</Text>
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

        <Text style={s.question}>How long a plan?</Text>
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
                <Text style={[s.pillText, selected && s.pillTextSelected]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={s.question}>How many days a week can you ride?</Text>
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
                <Text style={[s.pillText, selected && s.pillTextSelected]}>{d}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={s.hint}>
          Heads up: this will replace your current plan's sessions. Completed sessions will stay as they are in your history — only upcoming ones get rebuilt.
        </Text>
      </ScrollView>

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
            <Text style={s.submitBtnText}>Rebuild my plan</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20,
  },
  headerTitle: {
    fontSize: 17, fontFamily: FF.semibold, fontWeight: '600', color: colors.text,
  },

  scroll: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 32 },

  intro: {
    fontSize: 16, lineHeight: 24,
    color: colors.textMid,
    fontFamily: FF.regular, fontWeight: '300',
    marginBottom: 32,
  },

  question: {
    fontSize: 18, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.text,
    marginTop: 20, marginBottom: 14,
  },

  optionGridTwoCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionCard: {
    flexGrow: 1, flexBasis: '46%',
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, padding: 16,
  },
  optionCardSelected: { borderColor: colors.primary, backgroundColor: '#1a0f16' },
  optionCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6,
  },
  optionCardLabel: { fontSize: 15, fontFamily: FF.semibold, fontWeight: '600', color: colors.text },
  optionCardLabelSelected: { color: colors.primary },
  optionCardDesc: {
    fontSize: 13, lineHeight: 18,
    color: colors.textMuted, fontFamily: FF.regular, fontWeight: '300',
  },
  optionCardDescSelected: { color: colors.textMid },

  pillRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  pill: {
    paddingVertical: 14, paddingHorizontal: 22,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 100, minWidth: 92, alignItems: 'center',
  },
  pillSmall: {
    paddingVertical: 14, paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 100, minWidth: 58, alignItems: 'center',
  },
  pillSelected: { borderColor: colors.primary, backgroundColor: '#1a0f16' },
  pillText: { fontSize: 15, fontFamily: FF.semibold, fontWeight: '600', color: colors.textMid },
  pillTextSelected: { color: colors.primary },

  hint: {
    fontSize: 13, lineHeight: 20,
    color: colors.textMuted, fontFamily: FF.regular, fontWeight: '300',
    marginTop: 40,
  },

  footer: {
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16, borderRadius: 100,
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { backgroundColor: colors.border },
  submitBtnText: {
    fontSize: 16, fontFamily: FF.semibold, fontWeight: '600', color: colors.bg,
  },
});
