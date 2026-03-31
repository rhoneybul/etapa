/**
 * Weekly plan view — dark theme. Activities grouped by day.
 * Shows month label, week navigation, no off-track badge.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, RefreshControl,
  TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { getPlan, getPlans, getWeekActivities, getWeekProgress, markActivityComplete, getWeekMonthLabel, getGoals, getPlanConfig, updateActivity } from '../services/storageService';
import { editActivityWithAI } from '../services/llmPlanService';
import { getSessionColor, getSessionLabel, getCrossTrainingForDay, CROSS_TRAINING_COLOR } from '../utils/sessionLabels';
import analytics from '../services/analyticsService';

const FF = fontFamily;
const DAY_LABELS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function WeekViewScreen({ navigation, route }) {
  const initialWeek = route.params?.week || 1;
  const planId = route.params?.planId || null;
  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);
  const [planConfig, setPlanConfig] = useState(null);
  const [week, setWeek] = useState(initialWeek);
  const [refreshing, setRefreshing] = useState(false);
  // Activity inline edit
  const [editingActivity, setEditingActivity] = useState(null); // activity object being edited
  const [actEditText, setActEditText] = useState('');
  const [actEditing, setActEditing] = useState(false);
  const [actEditStatus, setActEditStatus] = useState('');

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
      const cfg = await getPlanConfig(p.configId);
      setPlanConfig(cfg);
    }
  }, [planId]);

  useEffect(() => { loadPlan(); }, [loadPlan]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', loadPlan);
    return unsub;
  }, [navigation, loadPlan]);
  useEffect(() => {
    if (plan) analytics.events.weekViewed(week, plan.id);
  }, [week, plan?.id]);

  const onRefresh = async () => { setRefreshing(true); await loadPlan(); setRefreshing(false); };

  if (!plan) return null;

  const activities = getWeekActivities(plan, week);
  const progress = getWeekProgress(plan, week);
  const isDeload = week % 4 === 0;
  const monthLabel = getWeekMonthLabel(plan.startDate, week);

  const byDay = {};
  activities.forEach(a => { const d = a.dayOfWeek ?? 0; if (!byDay[d]) byDay[d] = []; byDay[d].push(a); });

  const handleComplete = async (id) => {
    const act = activities.find(a => a.id === id);
    if (act) {
      if (!act.completed) {
        analytics.events.activityCompleted({ activityType: act.type, subType: act.subType, effort: act.effort, week, distanceKm: act.distanceKm, durationMins: act.durationMins });
      } else {
        analytics.events.activityUncompleted({ activityType: act.type, week });
      }
    }
    await markActivityComplete(id);
    await loadPlan();
  };

  // Inline activity edit via AI
  const handleActivityEdit = async () => {
    if (!actEditText.trim() || !editingActivity || actEditing) return;
    setActEditing(true);
    setActEditStatus('Asking coach...');
    try {
      const result = await editActivityWithAI(editingActivity, goal, actEditText.trim(), (msg) => setActEditStatus(msg));
      if (result.updatedActivity) {
        analytics.events.activityEditedAI({ activityType: editingActivity.type, subType: editingActivity.subType, week, hadChanges: true });
        await updateActivity(editingActivity.id, result.updatedActivity);
        setActEditStatus('Updated!');
        await loadPlan();
        setTimeout(() => { setEditingActivity(null); setActEditText(''); setActEditStatus(''); }, 800);
      } else if (result.answer) {
        setActEditStatus(result.answer);
        setTimeout(() => setActEditStatus(''), 5000);
      }
    } catch {
      setActEditStatus('Failed to update');
      setTimeout(() => setActEditStatus(''), 3000);
    }
    setActEditing(false);
  };

  const crossTraining = planConfig?.crossTrainingDaysFull || {};

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
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
          <TouchableOpacity onPress={() => { const to = Math.max(1, week - 1); analytics.events.weekNavigated('prev', week, to); setWeek(to); }} disabled={week <= 1} style={s.weekNavBtn}>
            <Text style={[s.weekNavArrow, week <= 1 && s.weekNavDisabled]}>{'\u2039'}</Text>
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.weekPills}>
            {Array.from({ length: plan.weeks }, (_, i) => i + 1).map(w => (
              <TouchableOpacity key={w} style={[s.weekPill, w === week && s.weekPillActive]} onPress={() => setWeek(w)}>
                <Text style={[s.weekPillText, w === week && s.weekPillTextActive]}>{w}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={() => { const to = Math.min(plan.weeks, week + 1); analytics.events.weekNavigated('next', week, to); setWeek(to); }} disabled={week >= plan.weeks} style={s.weekNavBtn}>
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
            <Text style={s.deloadText}>Recovery week \u2014 lighter load to let your body adapt</Text>
          </View>
        )}

        <ScrollView style={s.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#666" />}>
          {DAY_LABELS_FULL.map((dayLabel, dayIdx) => {
            const dayActivities = byDay[dayIdx] || [];
            const ctItems = getCrossTrainingForDay(crossTraining, dayIdx);
            if (dayActivities.length === 0 && ctItems.length === 0) return null;

            const dayDate = getDayDate(plan.startDate, week, dayIdx);

            return (
              <View key={dayIdx} style={s.dayGroup}>
                <Text style={s.dayHeader}>{dayLabel} {dayDate}</Text>
                {dayActivities.map(activity => {
                  const isEditing = editingActivity?.id === activity.id;
                  return (
                    <View key={activity.id}>
                      <TouchableOpacity
                        style={[s.activityCard, activity.completed && s.activityCardDone, isEditing && s.activityCardEditing]}
                        onPress={() => navigation.navigate('ActivityDetail', { activityId: activity.id })}
                        onLongPress={() => { setEditingActivity(activity); setActEditText(''); setActEditStatus(''); }}
                        activeOpacity={0.75}
                        delayLongPress={400}
                      >
                        <View style={[s.activityAccent, { backgroundColor: getSessionColor(activity) }]} />
                        <View style={s.activityBody}>
                          <View style={s.activityTop}>
                            <View style={[s.activityTypeBadge, { backgroundColor: getSessionColor(activity) + '18' }]}>
                              <Text style={[s.activityTypeText, { color: getSessionColor(activity) }]}>{getSessionLabel(activity)}</Text>
                            </View>
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
                          {!activity.completed && (
                            <Text style={s.editHint}>Hold to edit</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                      {/* Inline edit bar for this activity */}
                      {isEditing && (
                        <View style={s.actEditBar}>
                          {actEditStatus ? (
                            <Text style={s.actEditStatusText}>{actEditStatus}</Text>
                          ) : null}
                          <View style={s.actEditRow}>
                            <TextInput
                              style={s.actEditInput}
                              value={actEditText}
                              onChangeText={setActEditText}
                              placeholder={`e.g. "Make it shorter" or "Change to intervals"`}
                              placeholderTextColor={colors.textFaint}
                              editable={!actEditing}
                              autoFocus
                              returnKeyType="send"
                              onSubmitEditing={handleActivityEdit}
                            />
                            <TouchableOpacity
                              style={[s.actEditSendBtn, (!actEditText.trim() || actEditing) && { opacity: 0.3 }]}
                              onPress={handleActivityEdit}
                              disabled={!actEditText.trim() || actEditing}
                            >
                              <Text style={s.actEditSendText}>{'\u2191'}</Text>
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity onPress={() => setEditingActivity(null)} style={s.actEditCancel}>
                            <Text style={s.actEditCancelText}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
                {/* Cross-training items */}
                {ctItems.map((ct, i) => (
                  <View key={`ct-${i}`} style={s.ctCard}>
                    <View style={[s.activityAccent, { backgroundColor: CROSS_TRAINING_COLOR }]} />
                    <View style={s.ctBody}>
                      <View style={[s.activityTypeBadge, { backgroundColor: CROSS_TRAINING_COLOR + '18' }]}>
                        <Text style={[s.activityTypeText, { color: CROSS_TRAINING_COLOR }]}>{ct.label}</Text>
                      </View>
                      <Text style={s.ctNote}>Your activity {'\u00B7'} Factored into plan recovery</Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          })}
          {activities.length === 0 && Object.keys(crossTraining).length === 0 && (
            <View style={s.emptyWeek}><Text style={s.emptyText}>No activities this week</Text></View>
          )}
          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Bottom bar */}
        <View style={s.editBar}>
          <TouchableOpacity
            style={s.coachBtn}
            onPress={() => navigation.navigate('CoachChat', { planId: plan.id, weekNum: week })}
            activeOpacity={0.7}
          >
            <View style={[s.coachDot, { backgroundColor: colors.primary }]} />
            <View style={s.coachBtnTextWrap}>
              <Text style={s.coachBtnLabel}>Ask coach about week {week}</Text>
              <Text style={s.coachBtnHint}>Get advice or ask your coach to change this week</Text>
            </View>
            <Text style={s.coachBtnArrow}>{'\u203A'}</Text>
          </TouchableOpacity>
        </View>
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
  activityTypeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  activityTypeText: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, textTransform: 'uppercase', letterSpacing: 0.3 },
  activityTitleWrap: { flex: 1 },
  activityTitle: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  activityTitleDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  activityMeta: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 2 },

  checkBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkBtnDone: { borderColor: '#22C55E', backgroundColor: '#22C55E' },
  checkMark: { fontSize: 14, color: '#fff', fontWeight: '700' },

  emptyWeek: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },

  editHint: { fontSize: 10, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginTop: 6 },

  // Activity inline edit
  activityCardEditing: { borderColor: colors.primary },
  actEditBar: { marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.primary + '44' },
  actEditStatusText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.primary, marginBottom: 6 },
  actEditRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  actEditInput: {
    flex: 1, backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    color: colors.text, fontFamily: FF.regular, fontSize: 13,
    borderWidth: 1, borderColor: colors.border,
  },
  actEditSendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  actEditSendText: { fontSize: 16, color: '#fff', fontWeight: '700' },
  actEditCancel: { marginTop: 6, alignSelf: 'flex-end' },
  actEditCancelText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },

  // Cross-training cards
  ctCard: {
    flexDirection: 'row', backgroundColor: 'rgba(6,182,212,0.06)', marginHorizontal: 16, marginBottom: 8,
    borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(6,182,212,0.2)', borderStyle: 'dashed',
  },
  ctBody: { flex: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  ctNote: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, flex: 1 },

  // Bottom bar — single coach button
  editBar: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  coachBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14,
    backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.border,
  },
  coachDot: { width: 10, height: 10, borderRadius: 5 },
  coachBtnTextWrap: { flex: 1 },
  coachBtnLabel: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  coachBtnHint: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginTop: 1 },
  coachBtnArrow: { fontSize: 22, color: colors.textFaint, fontWeight: '300' },
});
