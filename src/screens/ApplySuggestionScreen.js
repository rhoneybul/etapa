/**
 * ApplySuggestionScreen — full workflow for applying a "ways to level up" suggestion.
 * Flow: loading → show recommended change → pick day (if needed) → apply → show result → done/undo.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { getPlan, getGoal, savePlan, getPlanConfig, getUserPrefs } from '../services/storageService';
import { editPlanWithLLM } from '../services/llmPlanService';
import { convertDistance, distanceLabel } from '../utils/units';

const FF = fontFamily;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const SUGGEST_COLORS = {
  training: '#D97706',
  nutrition: '#22C55E',
  strength: '#8B5CF6',
  cross_training: '#06B6D4',
  mental: '#3B82F6',
  recovery: '#64748B',
};

// Steps: 'preview' → 'pickDay' (if needed) → 'applying' → 'done'
export default function ApplySuggestionScreen({ navigation, route }) {
  const { planId, goalId, suggestion } = route.params;
  const [step, setStep] = useState('preview');
  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);
  const [previousPlan, setPreviousPlan] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [units, setUnits] = useState('km');
  const [changes, setChanges] = useState({ added: [], modified: [], removed: [] });

  // All suggestion types benefit from day selection so the coach knows where to add/adjust sessions
  const needsDay = true;
  const sugColor = SUGGEST_COLORS[suggestion?.type] || '#64748B';

  useEffect(() => {
    getUserPrefs().then(p => setUnits(p.units || 'km')).catch(() => {});
    getPlan(planId).then(p => setPlan(p));
    if (goalId) getGoal(goalId).then(g => setGoal(g)).catch(() => {});
  }, [planId, goalId]);

  const handleApply = async (dayOfWeek) => {
    if (!plan) return;
    const before = { ...plan, activities: [...(plan.activities || [])] };
    setPreviousPlan(before);

    // Show loading state immediately
    setStep('applying');

    // Mark this suggestion as applied on the plan
    const appliedKey = suggestion?.title || suggestion?.text || '';
    if (appliedKey) {
      const applied = new Set(plan.appliedSuggestions || []);
      applied.add(appliedKey);
      plan.appliedSuggestions = [...applied];
      await savePlan(plan);
    }

    try {
      const instruction = dayOfWeek !== undefined && dayOfWeek !== null
        ? `${suggestion.title}: ${suggestion.text}. Add the new session on day ${dayOfWeek} (0=Mon, 6=Sun).`
        : `${suggestion.title}: ${suggestion.text}`;
      const cfg = plan.configId ? await getPlanConfig(plan.configId) : null;
      const coachId = cfg?.coachId || null;
      const updated = await editPlanWithLLM(plan, goal, instruction, 'plan', () => {}, coachId);
      if (updated) {
        await savePlan(updated);
        computeChanges(before, updated);
      }
    } catch (err) {
      console.warn('Failed to apply suggestion:', err);
      // Restore the original plan if the update failed
      await savePlan(before);
    }

    // Show done state
    setStep('done');
  };

  const computeChanges = (before, after) => {
    const beforeIds = new Set((before.activities || []).map(a => a.id));
    const afterMap = {};
    (after.activities || []).forEach(a => { afterMap[a.id] = a; });
    const beforeMap = {};
    (before.activities || []).forEach(a => { beforeMap[a.id] = a; });

    const added = (after.activities || []).filter(a => !beforeIds.has(a.id));
    const modified = (after.activities || []).filter(a => {
      if (!beforeIds.has(a.id)) return false;
      const old = beforeMap[a.id];
      return old.durationMins !== a.durationMins || old.distanceKm !== a.distanceKm || old.title !== a.title;
    });

    setChanges({ added, modified, removed: [] });
  };

  const handleUndo = async () => {
    if (previousPlan) {
      await savePlan(previousPlan);
    }
    navigation.goBack();
  };

  const handleKeep = () => {
    navigation.goBack();
  };

  const formatActivity = (a) => {
    const day = a.dayOfWeek !== undefined && a.dayOfWeek !== null ? DAY_NAMES[a.dayOfWeek] : '';
    const dist = a.distanceKm ? ` · ${convertDistance(a.distanceKm, units)} ${distanceLabel(units)}` : '';
    const dur = a.durationMins ? ` · ${a.durationMins} min` : '';
    return `Wk ${a.week} ${day} — ${a.title || a.type}${dist}${dur}`;
  };

  // ── Preview step ──
  if (step === 'preview') {
    return (
      <View style={s.container}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
              <Text style={s.backArrow}>{'\u2190'}</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>Level Up</Text>
            <View style={{ width: 32 }} />
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 100 }}>
            <View style={s.suggestionCard}>
              <View style={[s.suggestionDot, { backgroundColor: sugColor }]} />
              <Text style={s.suggestionTitle}>{suggestion?.title}</Text>
              <Text style={s.suggestionText}>{suggestion?.text}</Text>
            </View>

            <Text style={s.infoText}>
              Applying this will update your training plan. Your coach will adjust the volume and scheduling to fit.
            </Text>

            <View style={s.daySection}>
              <Text style={s.daySectionTitle}>Which day should this apply to?</Text>
              <Text style={s.daySectionHint}>Optional — your coach will decide if you skip this</Text>
              <View style={s.dayGrid}>
                {DAY_NAMES.map((name, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[s.dayBtn, selectedDay === idx && s.dayBtnSelected]}
                    onPress={() => setSelectedDay(selectedDay === idx ? null : idx)}
                  >
                    <Text style={[s.dayBtnText, selectedDay === idx && s.dayBtnTextSelected]}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={s.ctaWrap}>
            <View style={s.ctaRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.applyBtn}
                onPress={() => handleApply(selectedDay !== null ? selectedDay : undefined)}
                activeOpacity={0.8}
              >
                <Text style={s.applyBtnText}>Apply to plan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Applying step (loading) ──
  if (step === 'applying') {
    return (
      <View style={s.container}>
        <SafeAreaView style={[s.safe, s.centerWrap]}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={s.applyingTitle}>Updating your plan</Text>
          <Text style={s.applyingSub}>Your coach is adjusting sessions and load...</Text>
        </SafeAreaView>
      </View>
    );
  }

  // ── Done step ──
  const totalChanges = changes.added.length + changes.modified.length;
  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <View style={{ width: 32 }} />
          <Text style={s.headerTitle}>Plan Updated</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={s.doneHero}>
            <View style={s.doneCheck}>
              <Text style={s.doneCheckText}>{'\u2713'}</Text>
            </View>
            <Text style={s.doneTitle}>{suggestion?.title || 'Changes applied'}</Text>
            <Text style={s.doneSub}>
              {totalChanges === 0 ? 'No visible changes.' : `${totalChanges} change${totalChanges !== 1 ? 's' : ''} made`}
            </Text>
          </View>

          {changes.added.length > 0 && (
            <View style={s.changesSection}>
              <Text style={s.changesSectionTitle}>Added</Text>
              {changes.added.map((a, i) => (
                <View key={i} style={s.changeRow}>
                  <View style={[s.changeDot, { backgroundColor: '#22C55E' }]} />
                  <Text style={s.changeText}>{formatActivity(a)}</Text>
                </View>
              ))}
            </View>
          )}

          {changes.modified.length > 0 && (
            <View style={s.changesSection}>
              <Text style={s.changesSectionTitle}>Modified</Text>
              {changes.modified.map((a, i) => (
                <View key={i} style={s.changeRow}>
                  <View style={[s.changeDot, { backgroundColor: colors.primary }]} />
                  <Text style={s.changeText}>{formatActivity(a)}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={s.ctaWrap}>
          <View style={s.ctaRow}>
            <TouchableOpacity style={s.cancelBtn} onPress={handleUndo} activeOpacity={0.8}>
              <Text style={[s.cancelBtnText, { color: '#EF4444' }]}>Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.applyBtn} onPress={handleKeep} activeOpacity={0.8}>
              <Text style={s.applyBtnText}>Keep changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: { flex: 1, paddingHorizontal: 20 },
  centerWrap: { justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, textAlign: 'center' },

  // Preview
  suggestionCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 20, marginTop: 12,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  suggestionDot: { width: 12, height: 12, borderRadius: 6, marginBottom: 12 },
  suggestionTitle: { fontSize: 20, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 8, textAlign: 'center' },
  suggestionText: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 20, textAlign: 'center' },
  infoText: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, lineHeight: 19, marginTop: 16, textAlign: 'center', paddingHorizontal: 8 },

  // Day picker
  daySection: { marginTop: 24 },
  daySectionTitle: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4, textAlign: 'center' },
  daySectionHint: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginBottom: 12, textAlign: 'center' },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  dayBtn: {
    backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: colors.border, minWidth: 60, alignItems: 'center',
  },
  dayBtnSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
  dayBtnText: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  dayBtnTextSelected: { color: colors.primary },

  // CTA
  ctaWrap: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  ctaRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMid },
  applyBtn: {
    flex: 1, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  applyBtnDisabled: { opacity: 0.4 },
  applyBtnText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },

  // Applying
  applyingTitle: { fontSize: 20, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginTop: 20 },
  applyingSub: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 6 },

  // Done
  doneHero: {
    alignItems: 'center', paddingVertical: 28, marginTop: 8,
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 20,
  },
  doneCheck: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 2, borderColor: '#22C55E',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  doneCheckText: { fontSize: 22, color: '#22C55E', fontWeight: '700' },
  doneTitle: { fontSize: 20, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 6, textAlign: 'center' },
  doneSub: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, textAlign: 'center' },

  changesSection: {
    marginTop: 16, backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  changesSectionTitle: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 },
  changeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  changeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  changeText: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, flex: 1, lineHeight: 20 },
});
