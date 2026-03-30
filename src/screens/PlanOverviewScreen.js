/**
 * Plan Overview — shows the full plan build-up, weekly volume chart,
 * phase descriptions, and free-text AI edit input.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { getPlans, getGoals, savePlan, getWeekActivities } from '../services/storageService';
import { editPlanWithLLM } from '../services/llmPlanService';

const FF = fontFamily;

function getPlanPhases(totalWeeks) {
  if (totalWeeks <= 4) {
    return [{ name: 'Build', start: 1, end: totalWeeks, desc: 'Progressive volume and intensity increase' }];
  }
  const baseEnd = Math.ceil(totalWeeks * 0.3);
  const buildEnd = Math.ceil(totalWeeks * 0.65);
  const peakEnd = Math.ceil(totalWeeks * 0.85);
  const phases = [
    { name: 'Base', start: 1, end: baseEnd, desc: 'Building aerobic foundation with steady volume' },
    { name: 'Build', start: baseEnd + 1, end: buildEnd, desc: 'Increasing intensity and sport-specific work' },
    { name: 'Peak', start: buildEnd + 1, end: peakEnd, desc: 'Highest load — sharpening fitness' },
    { name: 'Taper', start: peakEnd + 1, end: totalWeeks, desc: 'Reducing volume to arrive fresh' },
  ];
  return phases.filter(p => p.start <= p.end);
}

function getWeekVolume(plan, weekNum) {
  const acts = getWeekActivities(plan, weekNum);
  const totalKm = acts.reduce((s, a) => s + (a.distanceKm || 0), 0);
  const totalMins = acts.reduce((s, a) => s + (a.durationMins || 0), 0);
  const rideCount = acts.filter(a => a.type === 'ride').length;
  const strengthCount = acts.filter(a => a.type === 'strength').length;
  return { totalKm, totalMins, rideCount, strengthCount, total: acts.length };
}

export default function PlanOverviewScreen({ navigation, route }) {
  const planId = route.params?.planId;
  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);
  const [editText, setEditText] = useState('');
  const [editing, setEditing] = useState(false);
  const [editStatus, setEditStatus] = useState('');

  const load = useCallback(async () => {
    const plans = await getPlans();
    const p = plans.find(pl => pl.id === planId) || plans[0];
    setPlan(p);
    if (p) {
      const goals = await getGoals();
      setGoal(goals.find(g => g.id === p.goalId) || null);
    }
  }, [planId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const handleEditPlan = async () => {
    if (!editText.trim() || !plan || editing) return;
    setEditing(true);
    setEditStatus('Thinking...');
    try {
      const updated = await editPlanWithLLM(plan, goal, editText.trim(), 'plan', (msg) => setEditStatus(msg));
      await savePlan(updated);
      setPlan(updated);
      setEditText('');
      setEditStatus('');
    } catch (err) {
      setEditStatus('Failed to update plan');
      setTimeout(() => setEditStatus(''), 3000);
    }
    setEditing(false);
  };

  if (!plan) return null;

  const phases = getPlanPhases(plan.weeks);
  const weekVolumes = Array.from({ length: plan.weeks }, (_, i) => getWeekVolume(plan, i + 1));
  const maxKm = Math.max(...weekVolumes.map(v => v.totalKm), 1);

  const now = new Date();
  const start = new Date(plan.startDate);
  const daysSince = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const currentWeek = Math.max(1, Math.min(Math.floor(daysSince / 7) + 1, plan.weeks));

  const totalKm = weekVolumes.reduce((s, v) => s + v.totalKm, 0);
  const totalSessions = plan.activities?.length || 0;
  const totalHours = weekVolumes.reduce((s, v) => s + v.totalMins, 0) / 60;

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>{plan.name || 'Your Plan'}</Text>
          <View style={{ width: 32 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
            {/* Stats */}
            <View style={s.statsRow}>
              <View style={s.statBox}>
                <Text style={s.statValue}>{Math.round(totalKm)}</Text>
                <Text style={s.statLabel}>Total km</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statValue}>{totalSessions}</Text>
                <Text style={s.statLabel}>Sessions</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statValue}>{totalHours.toFixed(0)}</Text>
                <Text style={s.statLabel}>Hours</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statValue}>{plan.weeks}</Text>
                <Text style={s.statLabel}>Weeks</Text>
              </View>
            </View>

            {/* Volume chart */}
            <View style={s.chartCard}>
              <Text style={s.chartTitle}>Weekly volume</Text>
              <View style={s.chartArea}>
                {weekVolumes.map((v, i) => {
                  const h = maxKm > 0 ? Math.max(4, (v.totalKm / maxKm) * 100) : 4;
                  const isDeload = (i + 1) % 4 === 0;
                  const isCurrent = i + 1 === currentWeek;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={s.chartCol}
                      onPress={() => navigation.navigate('WeekView', { week: i + 1, planId: plan.id })}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        s.chartBar,
                        { height: h },
                        isDeload && s.chartBarDeload,
                        isCurrent && s.chartBarCurrent,
                      ]} />
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={s.chartDateRow}>
                {weekVolumes.map((_, i) => {
                  const showLabel = i === 0 || (i + 1) % 4 === 0 || i === plan.weeks - 1;
                  if (!showLabel) return <View key={i} style={s.chartDateCol} />;
                  const weekStart = new Date(start);
                  weekStart.setDate(weekStart.getDate() + i * 7);
                  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                  const dateLabel = `${monthNames[weekStart.getMonth()]} ${weekStart.getDate()}`;
                  const isCurrent = i + 1 === currentWeek;
                  return (
                    <View key={i} style={s.chartDateCol}>
                      <Text style={[s.chartDateLabel, isCurrent && s.chartDateLabelCurrent]}>{dateLabel}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={s.chartLegend}>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: colors.primary }]} />
                  <Text style={s.legendText}>Training</Text>
                </View>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: '#64748B' }]} />
                  <Text style={s.legendText}>Deload</Text>
                </View>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: '#22C55E' }]} />
                  <Text style={s.legendText}>Current</Text>
                </View>
              </View>
            </View>

            {/* Phases */}
            <Text style={s.sectionTitle}>Training phases</Text>
            {phases.map((phase, i) => (
              <View key={i} style={s.phaseCard}>
                <View style={s.phaseHeader}>
                  <Text style={s.phaseName}>{phase.name}</Text>
                  <Text style={s.phaseWeeks}>Weeks {phase.start}{'\u2013'}{phase.end}</Text>
                </View>
                <Text style={s.phaseDesc}>{phase.desc}</Text>
                {currentWeek >= phase.start && currentWeek <= phase.end && (
                  <View style={s.currentBadge}>
                    <Text style={s.currentBadgeText}>You are here</Text>
                  </View>
                )}
              </View>
            ))}

            {/* Week by week */}
            <Text style={s.sectionTitle}>Week by week</Text>
            {weekVolumes.map((v, i) => {
              const weekNum = i + 1;
              const isDeload = weekNum % 4 === 0;
              const isCurrent = weekNum === currentWeek;
              const isPast = weekNum < currentWeek;
              return (
                <TouchableOpacity
                  key={i}
                  style={[s.weekRow, isCurrent && s.weekRowCurrent]}
                  onPress={() => navigation.navigate('WeekView', { week: weekNum, planId: plan.id })}
                  activeOpacity={0.7}
                >
                  <View style={[s.weekNumCol, isCurrent && s.weekNumColCurrent]}>
                    <Text style={[s.weekNum, isCurrent && s.weekNumCurrent]}>{weekNum}</Text>
                  </View>
                  <View style={s.weekInfo}>
                    <Text style={[s.weekTitle, isPast && s.weekTitlePast]}>
                      {isDeload ? 'Recovery week' : `Week ${weekNum}`}
                    </Text>
                    <Text style={s.weekMeta}>
                      {v.rideCount > 0 ? `${v.rideCount} ride${v.rideCount > 1 ? 's' : ''}` : ''}
                      {v.rideCount > 0 && v.strengthCount > 0 ? ' \u00B7 ' : ''}
                      {v.strengthCount > 0 ? `${v.strengthCount} strength` : ''}
                      {v.totalKm > 0 ? ` \u00B7 ${Math.round(v.totalKm)} km` : ''}
                    </Text>
                  </View>
                  <Text style={s.weekArrow}>{'\u203A'}</Text>
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 100 }} />
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
                placeholder={'Adjust your plan\u2026'}
                placeholderTextColor={colors.textFaint}
                multiline
                editable={!editing}
              />
              <TouchableOpacity
                style={[s.editSendBtn, (!editText.trim() || editing) && s.editSendBtnDisabled]}
                onPress={handleEditPlan}
                disabled={!editText.trim() || editing}
              >
                <Text style={s.editSendText}>{'\u2191'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.editHint}>e.g. "Make week 6 easier" or "Add more intervals"</Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, textAlign: 'center' },

  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16 },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 12, backgroundColor: colors.surface, borderRadius: 12, marginHorizontal: 3, borderWidth: 1, borderColor: colors.border },
  statValue: { fontSize: 20, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  statLabel: { fontSize: 10, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

  chartCard: { backgroundColor: colors.surface, marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  chartTitle: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 12 },
  chartArea: { flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 2 },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  chartBar: { width: '80%', backgroundColor: colors.primary, borderRadius: 3, minHeight: 4 },
  chartBarDeload: { backgroundColor: '#64748B' },
  chartBarCurrent: { backgroundColor: '#22C55E' },
  chartDateRow: { flexDirection: 'row', marginTop: 6, gap: 2 },
  chartDateCol: { flex: 1, alignItems: 'center' },
  chartDateLabel: { fontSize: 9, fontWeight: '500', fontFamily: FF.medium, color: colors.textFaint },
  chartDateLabelCurrent: { color: '#22C55E' },
  chartLegend: { flexDirection: 'row', gap: 16, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },

  sectionTitle: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, paddingHorizontal: 20, marginBottom: 10, marginTop: 4 },

  phaseCard: { backgroundColor: colors.surface, marginHorizontal: 16, borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  phaseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  phaseName: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  phaseWeeks: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },
  phaseDesc: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 18 },
  currentBadge: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: 'rgba(34,197,94,0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  currentBadgeText: { fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: '#22C55E' },

  weekRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 16, marginBottom: 4, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  weekRowCurrent: { borderColor: colors.primary, borderWidth: 1.5 },
  weekNumCol: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  weekNumColCurrent: { backgroundColor: 'rgba(217,119,6,0.15)' },
  weekNum: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted },
  weekNumCurrent: { color: colors.primary },
  weekInfo: { flex: 1 },
  weekTitle: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  weekTitlePast: { color: colors.textMuted },
  weekMeta: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 1 },
  weekArrow: { fontSize: 20, color: colors.textFaint, fontWeight: '300' },

  editBar: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  editStatusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  editStatusText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  editInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  editInput: {
    flex: 1, backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    color: colors.text, fontFamily: FF.regular, fontSize: 14, maxHeight: 80,
    borderWidth: 1, borderColor: colors.border,
  },
  editSendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  editSendBtnDisabled: { opacity: 0.3 },
  editSendText: { fontSize: 18, color: '#fff', fontWeight: '700' },
  editHint: { fontSize: 10, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginTop: 6 },
});
