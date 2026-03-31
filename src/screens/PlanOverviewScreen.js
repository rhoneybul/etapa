/**
 * Plan Overview — shows the full plan build-up, weekly volume chart,
 * phase descriptions, and free-text AI edit input.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { getPlans, getGoals, getWeekActivities } from '../services/storageService';
import analytics from '../services/analyticsService';

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

// Week flag colours and labels
const WEEK_FLAGS = {
  recovery: { label: 'Recovery', color: '#64748B', bg: 'rgba(100,116,139,0.12)' },
  peak:     { label: 'Peak week', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  longest:  { label: 'Longest ride', color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
  taper:    { label: 'Taper', color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  test:     { label: 'Test week', color: '#6366F1', bg: 'rgba(99,102,241,0.12)' },
};

function getWeekFlags(weekVolumes, phases, plan) {
  const flags = weekVolumes.map(() => []);
  const maxKmWeek = weekVolumes.reduce((best, v, i) => v.totalKm > (weekVolumes[best]?.totalKm || 0) ? i : best, 0);

  // Find the week with the single longest ride
  let longestRideKm = 0;
  let longestRideWeek = -1;
  for (let w = 0; w < plan.weeks; w++) {
    const acts = (plan.activities || []).filter(a => a.week === w + 1);
    acts.forEach(a => {
      if ((a.distanceKm || 0) > longestRideKm) {
        longestRideKm = a.distanceKm;
        longestRideWeek = w;
      }
    });
  }

  weekVolumes.forEach((v, i) => {
    const weekNum = i + 1;
    const isDeload = weekNum % 4 === 0;
    const phase = phases.find(p => weekNum >= p.start && weekNum <= p.end);

    if (isDeload) flags[i].push('recovery');
    if (phase?.name === 'Taper') flags[i].push('taper');
    if (phase?.name === 'Peak' && i === maxKmWeek) flags[i].push('peak');
    else if (phase?.name === 'Peak' && !isDeload) flags[i].push('peak');
    if (i === longestRideWeek && longestRideKm > 0) flags[i].push('longest');
  });

  return flags;
}

// Ride type colors for stacked bars
const RIDE_TYPE_COLORS = {
  endurance:  '#D97706', // amber (primary)
  tempo:      '#F59E0B', // lighter amber
  intervals:  '#EF4444', // red
  recovery:   '#64748B', // slate
  indoor:     '#6366F1', // indigo
  strength:   '#A855F7', // purple
  other:      '#94A3B8', // muted
};

const RIDE_TYPE_LABELS = {
  endurance: 'Endurance',
  tempo: 'Tempo',
  intervals: 'Intervals',
  recovery: 'Recovery',
  indoor: 'Indoor',
  strength: 'Strength',
};

function getWeekVolume(plan, weekNum) {
  const acts = getWeekActivities(plan, weekNum);
  const totalKm = acts.reduce((s, a) => s + (a.distanceKm || 0), 0);
  const totalMins = acts.reduce((s, a) => s + (a.durationMins || 0), 0);
  const rideCount = acts.filter(a => a.type === 'ride').length;
  const strengthCount = acts.filter(a => a.type === 'strength').length;

  // Break down km by ride subType for stacked bars
  const byType = {};
  acts.forEach(a => {
    const key = a.type === 'strength' ? 'strength' : (a.subType || 'other');
    const km = a.distanceKm || 0;
    if (!byType[key]) byType[key] = 0;
    byType[key] += km;
  });

  // Convert to ordered segments array
  const typeOrder = ['endurance', 'tempo', 'intervals', 'indoor', 'recovery', 'strength', 'other'];
  const segments = typeOrder
    .filter(t => byType[t] > 0)
    .map(t => ({ type: t, km: byType[t], color: RIDE_TYPE_COLORS[t] || RIDE_TYPE_COLORS.other }));

  return { totalKm, totalMins, rideCount, strengthCount, total: acts.length, segments };
}

export default function PlanOverviewScreen({ navigation, route }) {
  const planId = route.params?.planId;
  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);

  const load = useCallback(async () => {
    const plans = await getPlans();
    const p = plans.find(pl => pl.id === planId) || plans[0];
    setPlan(p);
    if (p) {
      const goals = await getGoals();
      setGoal(goals.find(g => g.id === p.goalId) || null);
      analytics.events.planOverviewViewed(p.id, p.weeks);
    }
  }, [planId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  if (!plan) return null;

  const phases = getPlanPhases(plan.weeks);
  const weekVolumes = Array.from({ length: plan.weeks }, (_, i) => getWeekVolume(plan, i + 1));
  const maxKm = Math.max(...weekVolumes.map(v => v.totalKm), 1);
  const weekFlags = getWeekFlags(weekVolumes, phases, plan);

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

            {/* Volume chart — stacked by ride type */}
            <View style={s.chartCard}>
              <Text style={s.chartTitle}>Weekly volume</Text>
              <View style={s.chartArea}>
                {weekVolumes.map((v, i) => {
                  const totalH = maxKm > 0 ? Math.max(4, (v.totalKm / maxKm) * 100) : 4;
                  const isCurrent = i + 1 === currentWeek;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={s.chartCol}
                      onPress={() => navigation.navigate('WeekView', { week: i + 1, planId: plan.id })}
                      activeOpacity={0.7}
                    >
                      {v.totalKm > 0 && (
                        <Text style={[s.chartBarLabel, isCurrent && { color: '#22C55E' }]}>
                          {Math.round(v.totalKm)}
                        </Text>
                      )}
                      <View style={[s.chartBarStack, { height: totalH }, isCurrent && s.chartBarStackCurrent]}>
                        {v.segments.length > 0 ? v.segments.map((seg, si) => {
                          const segH = v.totalKm > 0 ? (seg.km / v.totalKm) * totalH : 0;
                          return (
                            <View
                              key={si}
                              style={{
                                width: '100%',
                                height: segH,
                                backgroundColor: seg.color,
                              }}
                            />
                          );
                        }) : (
                          <View style={{ width: '100%', height: totalH, backgroundColor: '#64748B', borderRadius: 3 }} />
                        )}
                      </View>
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
              {/* Dynamic legend based on ride types present */}
              <View style={s.chartLegend}>
                {(() => {
                  const typesUsed = new Set();
                  weekVolumes.forEach(v => v.segments.forEach(seg => typesUsed.add(seg.type)));
                  const typeOrder = ['endurance', 'tempo', 'intervals', 'indoor', 'recovery', 'strength'];
                  return typeOrder.filter(t => typesUsed.has(t)).map(t => (
                    <View key={t} style={s.legendItem}>
                      <View style={[s.legendDot, { backgroundColor: RIDE_TYPE_COLORS[t] }]} />
                      <Text style={s.legendText}>{RIDE_TYPE_LABELS[t]}</Text>
                    </View>
                  ));
                })()}
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
              const weekStart = new Date(start);
              weekStart.setDate(weekStart.getDate() + i * 7);
              const weekEnd = new Date(weekStart);
              weekEnd.setDate(weekEnd.getDate() + 6);
              const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const fmtDate = (d) => `${d.getDate()} ${monthNames[d.getMonth()]}`;
              const dateRange = `${fmtDate(weekStart)} \u2013 ${fmtDate(weekEnd)}`;
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
                    <View style={s.weekTitleRow}>
                      <Text style={[s.weekTitle, isPast && s.weekTitlePast]}>
                        {isDeload ? 'Recovery week' : `Week ${weekNum}`}
                      </Text>
                      {weekFlags[i].map((flag, fi) => {
                        const f = WEEK_FLAGS[flag];
                        if (!f) return null;
                        return (
                          <View key={fi} style={[s.weekFlagBadge, { backgroundColor: f.bg }]}>
                            <Text style={[s.weekFlagText, { color: f.color }]}>{f.label}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <Text style={s.weekDate}>{dateRange}</Text>
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

          {/* Bottom bar */}
          <View style={s.editBar}>
            <TouchableOpacity
              style={s.coachBtn}
              onPress={() => navigation.navigate('CoachChat', { planId: plan.id })}
              activeOpacity={0.7}
            >
              <View style={[s.coachDot, { backgroundColor: colors.primary }]} />
              <View style={s.coachBtnTextWrap}>
                <Text style={s.coachBtnLabel}>Ask coach about your plan</Text>
                <Text style={s.coachBtnHint}>Get advice or ask your coach to restructure your plan</Text>
              </View>
              <Text style={s.coachBtnArrow}>{'\u203A'}</Text>
            </TouchableOpacity>
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
  chartArea: { flexDirection: 'row', alignItems: 'flex-end', height: 125, gap: 2 },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  chartBarStack: { width: '80%', borderRadius: 3, minHeight: 4, overflow: 'hidden' },
  chartBarStackCurrent: { borderWidth: 1.5, borderColor: '#22C55E' },
  chartBarLabel: { fontSize: 9, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, marginBottom: 2 },
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
  weekTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  weekFlagBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  weekFlagText: { fontSize: 9, fontWeight: '600', fontFamily: FF.semibold, textTransform: 'uppercase', letterSpacing: 0.3 },
  weekTitle: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  weekTitlePast: { color: colors.textMuted },
  weekDate: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: colors.primary, marginTop: 1, opacity: 0.8 },
  weekMeta: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 1 },
  weekArrow: { fontSize: 20, color: colors.textFaint, fontWeight: '300' },

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
