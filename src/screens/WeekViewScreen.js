/**
 * Weekly plan view — dark theme. Activities grouped by day.
 * Shows month label, week navigation, no off-track badge.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, RefreshControl,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { getPlan, getPlans, getWeekActivities, getWeekProgress, markActivityComplete, getWeekMonthLabel, savePlan, getGoals } from '../services/storageService';
import { editPlanWithLLM } from '../services/llmPlanService';

const FF = fontFamily;
const DAY_LABELS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const EFFORT_COLORS = {
  easy:     '#22C55E',
  moderate: '#D97706',
  hard:     '#EF4444',
  recovery: '#64748B',
  max:      '#DC2626',
};

const TYPE_ICONS = {
  ride:     '\uD83D\uDEB4',
  strength: '\uD83D\uDCAA',
  rest:     '\uD83D\uDCA4',
};

export default function WeekViewScreen({ navigation, route }) {
  const initialWeek = route.params?.week || 1;
  const planId = route.params?.planId || null;
  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);
  const [week, setWeek] = useState(initialWeek);
  const [refreshing, setRefreshing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editing, setEditing] = useState(false);
  const [editStatus, setEditStatus] = useState('');

  const loadPlan = useCallback(async () => {
    let p;
    if (planId) {
      const plans = await getPlans();
      p = plans.find(pl => pl.id === planId) || null;
    } else {
      p = await getPlan();
    }
    setPlan(p);
    if (p) {
      const goals = await getGoals();
      setGoal(goals.find(g => g.id === p.goalId) || null);
    }
  }, [planId]);

  useEffect(() => { loadPlan(); }, [loadPlan]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', loadPlan);
    return unsub;
  }, [navigation, loadPlan]);

  const onRefresh = async () => { setRefreshing(true); await loadPlan(); setRefreshing(false); };

  if (!plan) return null;

  const activities = getWeekActivities(plan, week);
  const progress = getWeekProgress(plan, week);
  const isDeload = week % 4 === 0;
  const monthLabel = getWeekMonthLabel(plan.startDate, week);

  const byDay = {};
  activities.forEach(a => { const d = a.dayOfWeek ?? 0; if (!byDay[d]) byDay[d] = []; byDay[d].push(a); });

  const handleComplete = async (id) => { await markActivityComplete(id); await loadPlan(); };

  const handleEditWeek = async () => {
    if (!editText.trim() || !plan || editing) return;
    setEditing(true);
    setEditStatus('Thinking...');
    try {
      const instruction = `For week ${week} only: ${editText.trim()}`;
      const updated = await editPlanWithLLM(plan, goal, instruction, 'week', (msg) => setEditStatus(msg));
      await savePlan(updated);
      setPlan(updated);
      setEditText('');
      setEditStatus('');
    } catch (err) {
      setEditStatus('Failed to update');
      setTimeout(() => setEditStatus(''), 3000);
    }
    setEditing(false);
  };

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Week {week} of {plan.weeks}</Text>
            <Text style={s.headerMonth}>{monthLabel}</Text>
          </View>
          <View style={{ width: 32 }} />
        </View>

        {/* Week selector */}
        <View style={s.weekNav}>
          <TouchableOpacity onPress={() => setWeek(Math.max(1, week - 1))} disabled={week <= 1} style={s.weekNavBtn}>
            <Text style={[s.weekNavArrow, week <= 1 && s.weekNavDisabled]}>{'\u2039'}</Text>
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.weekPills}>
            {Array.from({ length: plan.weeks }, (_, i) => i + 1).map(w => (
              <TouchableOpacity key={w} style={[s.weekPill, w === week && s.weekPillActive]} onPress={() => setWeek(w)}>
                <Text style={[s.weekPillText, w === week && s.weekPillTextActive]}>{w}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={() => setWeek(Math.min(plan.weeks, week + 1))} disabled={week >= plan.weeks} style={s.weekNavBtn}>
            <Text style={[s.weekNavArrow, week >= plan.weeks && s.weekNavDisabled]}>{'\u203A'}</Text>
          </TouchableOpacity>
        </View>

        {/* Progress */}
        <View style={s.progressRow}>
          <Text style={s.progressLabel}>{progress.done}/{progress.total} sessions</Text>
          <Text style={s.progressPct}>{progress.pct}%</Text>
        </View>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progress.pct}%` }]} />
        </View>

        {isDeload && (
          <View style={s.deloadBanner}>
            <Text style={s.deloadText}>{'\uD83D\uDE34'} Recovery week — lighter load to let your body adapt</Text>
          </View>
        )}

        <ScrollView style={s.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#666" />}>
          {DAY_LABELS_FULL.map((dayLabel, dayIdx) => {
            const dayActivities = byDay[dayIdx] || [];
            if (dayActivities.length === 0) return null;

            // Get actual date for this day
            const dayDate = getDayDate(plan.startDate, week, dayIdx);

            return (
              <View key={dayIdx} style={s.dayGroup}>
                <Text style={s.dayHeader}>{dayLabel} {dayDate}</Text>
                {dayActivities.map(activity => (
                  <TouchableOpacity
                    key={activity.id}
                    style={[s.activityCard, activity.completed && s.activityCardDone]}
                    onPress={() => navigation.navigate('ActivityDetail', { activityId: activity.id })}
                    activeOpacity={0.75}
                  >
                    <View style={[s.activityAccent, { backgroundColor: EFFORT_COLORS[activity.effort] || colors.primary }]} />
                    <View style={s.activityBody}>
                      <View style={s.activityTop}>
                        <Text style={s.activityIcon}>{TYPE_ICONS[activity.type] || '\uD83D\uDEB4'}</Text>
                        <View style={s.activityTitleWrap}>
                          <Text style={[s.activityTitle, activity.completed && s.activityTitleDone]}>{activity.title}</Text>
                          <Text style={s.activityMeta}>
                            {activity.type === 'ride' && activity.distanceKm ? `${activity.distanceKm} km \u00B7 ` : ''}
                            {activity.durationMins ? `${activity.durationMins} min` : ''}
                            {activity.effort ? ` \u00B7 ${activity.effort}` : ''}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[s.checkBtn, activity.completed && s.checkBtnDone]}
                          onPress={() => !activity.completed && handleComplete(activity.id)}
                          disabled={activity.completed}
                        >
                          <Text style={s.checkMark}>{activity.completed ? '\u2713' : ''}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}
          {activities.length === 0 && (
            <View style={s.emptyWeek}><Text style={s.emptyText}>No activities this week</Text></View>
          )}
          <View style={{ height: 80 }} />
        </ScrollView>

        {/* AI Edit bar */}
        <View style={s.editBar}>
          {editStatus ? (
            <View style={s.editStatusRow}>
              {editing && <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />}
              <Text style={s.editStatusText}>{editStatus}</Text>
            </View>
          ) : null}
          <View style={s.editInputRow}>
            <TextInput
              style={s.editInput}
              value={editText}
              onChangeText={setEditText}
              placeholder={`Edit week ${week}\u2026`}
              placeholderTextColor={colors.textFaint}
              editable={!editing}
            />
            <TouchableOpacity
              style={[s.editSendBtn, (!editText.trim() || editing) && s.editSendBtnDisabled]}
              onPress={handleEditWeek}
              disabled={!editText.trim() || editing}
            >
              <Text style={s.editSendText}>{'\u2191'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function getDayDate(startDateStr, week, dayIdx) {
  const start = new Date(startDateStr);
  const offset = (week - 1) * 7 + dayIdx;
  const d = new Date(start);
  d.setDate(d.getDate() + offset);
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[d.getMonth()]}`;
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  headerMonth: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 2 },

  weekNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 12 },
  weekNavBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  weekNavArrow: { fontSize: 28, color: colors.text, fontWeight: '300' },
  weekNavDisabled: { color: colors.textFaint },

  weekPills: { flexDirection: 'row', paddingHorizontal: 4 },
  weekPill: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2, backgroundColor: colors.surfaceLight },
  weekPillActive: { backgroundColor: colors.primary },
  weekPillText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },
  weekPillTextActive: { color: '#fff' },

  progressRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 6 },
  progressLabel: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },
  progressPct: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary },
  progressTrack: { height: 4, backgroundColor: colors.border, borderRadius: 2, marginHorizontal: 20, marginBottom: 12, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },

  deloadBanner: { backgroundColor: 'rgba(100,116,139,0.1)', marginHorizontal: 20, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(100,116,139,0.2)' },
  deloadText: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: '#94A3B8' },

  list: { flex: 1 },
  dayGroup: { marginBottom: 8 },
  dayHeader: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 20, paddingVertical: 8 },

  activityCard: {
    flexDirection: 'row', backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 8,
    borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border,
  },
  activityCardDone: { opacity: 0.5 },
  activityAccent: { width: 4 },
  activityBody: { flex: 1, padding: 14 },
  activityTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activityIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  activityTitleWrap: { flex: 1 },
  activityTitle: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  activityTitleDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  activityMeta: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 2 },

  checkBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkBtnDone: { borderColor: '#22C55E', backgroundColor: '#22C55E' },
  checkMark: { fontSize: 14, color: '#fff', fontWeight: '700' },

  emptyWeek: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },

  // Edit bar
  editBar: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  editStatusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  editStatusText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  editInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  editInput: {
    flex: 1, backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    color: colors.text, fontFamily: FF.regular, fontSize: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  editSendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  editSendBtnDisabled: { opacity: 0.3 },
  editSendText: { fontSize: 18, color: '#fff', fontWeight: '700' },
});
