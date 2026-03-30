/**
 * Calendar screen — monthly view showing activities across plans.
 * Supports plan filtering and shows type icons in day cells.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { getPlans, getGoals, getActivityDate } from '../services/storageService';

const FF = fontFamily;
const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CYCLING_LABELS = { road: 'Road', gravel: 'Gravel', mtb: 'MTB', mixed: 'Mixed' };

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

const TYPE_COLORS = {
  ride:     '#D97706',
  indoor:   '#3B82F6',
  strength: '#8B5CF6',
  rest:     '#64748B',
};

function getTypeColor(a) {
  if (a.type === 'strength') return TYPE_COLORS.strength;
  if (a.type === 'rest') return TYPE_COLORS.rest;
  if (a.type === 'ride' && a.title?.toLowerCase().includes('indoor')) return TYPE_COLORS.indoor;
  return TYPE_COLORS.ride;
}

export default function CalendarScreen({ navigation }) {
  const [plans, setPlans] = useState([]);
  const [goals, setGoals] = useState([]);
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [filterPlanId, setFilterPlanId] = useState(null); // null = all

  const load = useCallback(async () => {
    const [p, g] = await Promise.all([getPlans(), getGoals()]);
    setPlans(p);
    setGoals(g);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  // Filtered plans
  const visiblePlans = filterPlanId ? plans.filter(p => p.id === filterPlanId) : plans;

  // Build goal date map: date key → goal info (for target date markers)
  const goalDateMap = {};
  goals.forEach(g => {
    if (!g.targetDate) return;
    const d = new Date(g.targetDate + 'T00:00:00');
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    goalDateMap[key] = { label: g.eventName || (g.targetDistance ? `${g.targetDistance} km` : 'Goal'), goal: g };
  });

  // Build activity map: date string → activities
  const activityMap = {};
  visiblePlans.forEach(plan => {
    if (!plan.activities || !plan.startDate) return;
    plan.activities.forEach(a => {
      if (a.dayOfWeek == null) return;
      const d = getActivityDate(plan.startDate, a.week, a.dayOfWeek);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!activityMap[key]) activityMap[key] = [];
      activityMap[key].push({ ...a, _planId: plan.id });
    });
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const totalDays = lastDay.getDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const today = new Date();
  const isToday = (d) => d && today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
  const isSelected = (d) => d && selectedDate && selectedDate.getFullYear() === year && selectedDate.getMonth() === month && selectedDate.getDate() === d;
  const getKey = (d) => `${year}-${month}-${d}`;

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  // Day cell items: array of { icon, label, color }
  const getDayCellItems = (day) => {
    if (!day) return [];
    const acts = activityMap[getKey(day)];
    if (!acts || acts.length === 0) return [];
    return acts.map(a => {
      const icon = TYPE_ICONS[a.type] || '\uD83D\uDEB4';
      let label = '';
      if (a.distanceKm) label = `${a.distanceKm}km`;
      else if (a.durationMins) label = `${a.durationMins}m`;
      else label = a.type === 'strength' ? 'str' : a.type?.slice(0, 3) || '';
      return { icon, label, color: getTypeColor(a) };
    });
  };

  const selectedActivities = selectedDate
    ? activityMap[`${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`] || []
    : [];

  // Plan tab label
  const getPlanLabel = (plan) => {
    if (plan.name) return plan.name;
    const goal = goals.find(g => g.id === plan.goalId);
    if (goal?.eventName) return goal.eventName;
    if (goal?.goalType === 'distance') return `${goal.targetDistance} km`;
    return CYCLING_LABELS[goal?.cyclingType] || 'Plan';
  };

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Calendar</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Plan filter tabs */}
        {plans.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow} contentContainerStyle={s.filterRowContent}>
            <TouchableOpacity
              style={[s.filterTab, !filterPlanId && s.filterTabActive]}
              onPress={() => setFilterPlanId(null)}
            >
              <Text style={[s.filterTabText, !filterPlanId && s.filterTabTextActive]}>All plans</Text>
            </TouchableOpacity>
            {plans.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[s.filterTab, filterPlanId === p.id && s.filterTabActive]}
                onPress={() => setFilterPlanId(filterPlanId === p.id ? null : p.id)}
              >
                <Text style={[s.filterTabText, filterPlanId === p.id && s.filterTabTextActive]} numberOfLines={1}>
                  {getPlanLabel(p)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Month navigation */}
        <View style={s.monthNav}>
          <TouchableOpacity onPress={prevMonth} hitSlop={HIT}>
            <Text style={s.monthArrow}>{'\u2039'}</Text>
          </TouchableOpacity>
          <Text style={s.monthTitle}>{MONTHS[month]} {year}</Text>
          <TouchableOpacity onPress={nextMonth} hitSlop={HIT}>
            <Text style={s.monthArrow}>{'\u203A'}</Text>
          </TouchableOpacity>
        </View>

        {/* Day headers */}
        <View style={s.dayHeaderRow}>
          {DAY_HEADERS.map(d => (
            <View key={d} style={s.dayHeaderCell}>
              <Text style={s.dayHeaderText}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={s.grid}>
          {weeks.map((week, wi) => (
            <View key={wi} style={s.weekRow}>
              {week.map((day, di) => {
                const items = getDayCellItems(day);
                const hasGoal = day && !!goalDateMap[getKey(day)];
                return (
                  <TouchableOpacity
                    key={di}
                    style={[s.dayCell, hasGoal && s.dayCellGoal, isToday(day) && s.dayCellToday, isSelected(day) && s.dayCellSelected]}
                    onPress={() => day && setSelectedDate(new Date(year, month, day))}
                    disabled={!day}
                    activeOpacity={0.7}
                  >
                    {day ? (
                      <>
                        <Text style={[s.dayText, isToday(day) && s.dayTextToday, isSelected(day) && s.dayTextSelected]}>
                          {day}
                        </Text>
                        {goalDateMap[getKey(day)] && (
                          <View style={[s.goalFlag, isSelected(day) && s.goalFlagSelected]}>
                            <Text style={s.goalFlagIcon}>{'\uD83C\uDFC1'}</Text>
                          </View>
                        )}
                        {items.map((item, idx) => (
                          <View key={idx} style={s.cellItemRow}>
                            <Text style={s.cellItemIcon}>{item.icon}</Text>
                            <Text style={[s.cellItemLabel, isSelected(day) ? { color: 'rgba(255,255,255,0.8)' } : { color: item.color }]}>
                              {item.label}
                            </Text>
                          </View>
                        ))}
                      </>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Selected day activities */}
        <ScrollView style={s.activityList}>
          {selectedDate && (
            <Text style={s.selectedLabel}>
              {selectedDate.getDate()} {MONTHS[selectedDate.getMonth()]}
            </Text>
          )}
          {selectedDate && goalDateMap[`${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`] && (
            <View style={s.goalBanner}>
              <Text style={s.goalBannerIcon}>{'\uD83C\uDFC1'}</Text>
              <View style={s.goalBannerText}>
                <Text style={s.goalBannerTitle}>Goal target date</Text>
                <Text style={s.goalBannerLabel}>
                  {goalDateMap[`${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`].label}
                </Text>
              </View>
            </View>
          )}
          {selectedActivities.length === 0 && selectedDate && !goalDateMap[`${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`] && (
            <Text style={s.noActivities}>No activities this day</Text>
          )}
          {selectedActivities.map(activity => (
            <TouchableOpacity
              key={activity.id}
              style={[s.actCard, activity.completed && s.actCardDone]}
              onPress={() => navigation.navigate('ActivityDetail', { activityId: activity.id })}
              activeOpacity={0.75}
            >
              <View style={[s.actAccent, { backgroundColor: EFFORT_COLORS[activity.effort] || colors.primary }]} />
              <View style={s.actBody}>
                <View style={s.actTop}>
                  <Text style={s.actIcon}>{TYPE_ICONS[activity.type] || '\uD83D\uDEB4'}</Text>
                  <View style={s.actTextWrap}>
                    <Text style={[s.actTitle, activity.completed && s.actTitleDone]}>{activity.title}</Text>
                    <Text style={s.actMeta}>
                      {activity.distanceKm ? `${activity.distanceKm} km` : ''}
                      {activity.distanceKm && activity.durationMins ? ' \u00B7 ' : ''}
                      {activity.durationMins ? `${activity.durationMins} min` : ''}
                      {activity.effort ? ` \u00B7 ${activity.effort}` : ''}
                    </Text>
                  </View>
                  {activity.completed && (
                    <View style={s.checkDone}><Text style={s.checkMark}>{'\u2713'}</Text></View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 20 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, textAlign: 'center' },

  // Plan filter tabs
  filterRow: { marginBottom: 8, maxHeight: 40 },
  filterRowContent: { paddingHorizontal: 16, gap: 8 },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  filterTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterTabText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },
  filterTabTextActive: { color: '#fff' },

  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  monthArrow: { fontSize: 28, color: colors.text, fontWeight: '300', paddingHorizontal: 8 },
  monthTitle: { fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },

  dayHeaderRow: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 4 },
  dayHeaderCell: { flex: 1, alignItems: 'center' },
  dayHeaderText: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },

  grid: { paddingHorizontal: 12, marginBottom: 8 },
  weekRow: { flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: 4, minHeight: 52, borderRadius: 10 },
  dayCellToday: { backgroundColor: 'rgba(217,119,6,0.1)' },
  dayCellSelected: { backgroundColor: colors.primary },
  dayText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
  dayTextToday: { color: colors.primary },
  dayTextSelected: { color: '#fff' },

  dayCellGoal: { backgroundColor: 'rgba(217,119,6,0.12)', borderWidth: 1, borderColor: 'rgba(217,119,6,0.3)' },
  goalFlag: { marginTop: 1 },
  goalFlagSelected: { opacity: 0.9 },
  goalFlagIcon: { fontSize: 9 },

  cellItemRow: { flexDirection: 'row', alignItems: 'center', gap: 1, marginTop: 1 },
  cellItemIcon: { fontSize: 8 },
  cellItemLabel: { fontSize: 8, fontWeight: '600', fontFamily: FF.semibold },

  // Goal banner in selected day detail
  goalBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(217,119,6,0.1)', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.25)',
  },
  goalBannerIcon: { fontSize: 22 },
  goalBannerText: { flex: 1 },
  goalBannerTitle: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary, marginBottom: 2 },
  goalBannerLabel: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid },

  activityList: { flex: 1, paddingHorizontal: 16 },
  selectedLabel: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, marginBottom: 8, marginTop: 4 },
  noActivities: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, textAlign: 'center', marginTop: 20 },

  actCard: {
    flexDirection: 'row', backgroundColor: colors.surface, marginBottom: 8,
    borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border,
  },
  actCardDone: { opacity: 0.5 },
  actAccent: { width: 4 },
  actBody: { flex: 1, padding: 14 },
  actTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  actTextWrap: { flex: 1 },
  actTitle: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  actTitleDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  actMeta: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 2 },
  checkDone: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 12, color: '#fff', fontWeight: '700' },
});
