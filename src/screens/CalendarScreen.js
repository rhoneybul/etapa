/**
 * Calendar screen — monthly view showing activities across plans.
 * Supports plan filtering and shows type icons in day cells.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { getPlans, getGoals, getActivityDate, getPlanConfig, savePlan, getWeekActivities, getUserPrefs } from '../services/storageService';
import { coachChat } from '../services/llmPlanService';
import { getSessionColor, getSessionLabel, getMetricLabel, getActivityIcon, CROSS_TRAINING_COLOR, getCrossTrainingLabel } from '../utils/sessionLabels';
import { getCoach } from '../data/coaches';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import analytics from '../services/analyticsService';

const FF = fontFamily;
const ACTIVITY_BLUE = '#E8458B';
const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CYCLING_LABELS = { road: 'Road', gravel: 'Gravel', mtb: 'MTB', ebike: 'E-Bike', mixed: 'Mixed' };

export default function CalendarScreen({ navigation, route }) {
  const pendingChanges = route.params?.pendingChanges || null;
  const [plans, setPlans] = useState([]);
  const [goals, setGoals] = useState([]);
  const [planConfigs, setPlanConfigs] = useState({}); // configId → config
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [filterPlanId, setFilterPlanId] = useState(null); // null = all
  const [reviewMode, setReviewMode] = useState(!!pendingChanges); // true when reviewing coach changes
  const [movingActivity, setMovingActivity] = useState(null); // { activity, planId, planStartDate } when moving
  const [actionActivity, setActionActivity] = useState(null); // { activity, planId } when action bar is shown

  // Inline coach chat during review
  const [reviewMessages, setReviewMessages] = useState([]); // { role, content }
  const [reviewInput, setReviewInput] = useState('');
  const [reviewSending, setReviewSending] = useState(false);
  const [showReviewChat, setShowReviewChat] = useState(false);
  const reviewScrollRef = useRef(null);

  // Sync reviewMode when pendingChanges arrives via navigation (screen already mounted)
  useEffect(() => {
    if (pendingChanges) {
      setReviewMode(true);
    }
  }, [pendingChanges]);

  const load = useCallback(async () => {
    const [p, g] = await Promise.all([getPlans(), getGoals()]);
    setPlans(p);
    setGoals(g);
    // Load configs for cross-training
    const cfgs = {};
    for (const plan of p) {
      if (plan.configId && !cfgs[plan.configId]) {
        const cfg = await getPlanConfig(plan.configId);
        if (cfg) cfgs[plan.configId] = cfg;
      }
    }
    setPlanConfigs(cfgs);
  }, []);

  useEffect(() => { load(); analytics.events.calendarViewed(MONTHS[viewDate.getMonth()]); }, [load]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  // Compute diff between previous and proposed activities
  const changeDiff = useMemo(() => {
    if (!pendingChanges) return null;
    const { previousActivities, proposedActivities } = pendingChanges;
    const prevById = {};
    (previousActivities || []).forEach(a => { prevById[a.id] = a; });
    const propById = {};
    (proposedActivities || []).forEach(a => { propById[a.id] = a; });

    const added = [];
    const modified = [];
    const removed = [];

    (proposedActivities || []).forEach(a => {
      if (!prevById[a.id]) {
        added.push(a);
      } else {
        const prev = prevById[a.id];
        const changed = a.week !== prev.week || a.dayOfWeek !== prev.dayOfWeek ||
          a.title !== prev.title || a.distanceKm !== prev.distanceKm ||
          a.durationMins !== prev.durationMins || a.effort !== prev.effort ||
          a.type !== prev.type || a.subType !== prev.subType;
        if (changed) modified.push({ before: prev, after: a });
      }
    });

    (previousActivities || []).forEach(a => {
      if (!propById[a.id]) removed.push(a);
    });

    const affectedDayKeys = new Set();
    added.forEach(a => affectedDayKeys.add(`${a.week}-${a.dayOfWeek}`));
    modified.forEach(m => {
      affectedDayKeys.add(`${m.before.week}-${m.before.dayOfWeek}`);
      affectedDayKeys.add(`${m.after.week}-${m.after.dayOfWeek}`);
    });
    removed.forEach(a => affectedDayKeys.add(`${a.week}-${a.dayOfWeek}`));

    return { added, modified, removed, affectedDayKeys, total: added.length + modified.length + removed.length };
  }, [pendingChanges]);

  // Accept changes: save the proposed activities
  const handleAcceptChanges = useCallback(async () => {
    if (!pendingChanges) return;
    const allPlans = await getPlans();
    const plan = allPlans.find(p => p.id === pendingChanges.planId);
    if (!plan) return;
    plan.activities = pendingChanges.proposedActivities;
    await savePlan(plan);
    setReviewMode(false);
    navigation.setParams({ pendingChanges: null });
    load();
  }, [pendingChanges, navigation, load]);

  // Reject changes: discard and go back
  const handleRejectChanges = useCallback(() => {
    setReviewMode(false);
    navigation.setParams({ pendingChanges: null });
  }, [navigation]);

  // Send an inline review message to the coach
  const handleReviewSend = useCallback(async () => {
    if (!reviewInput.trim() || reviewSending || !pendingChanges) return;
    const userMsg = { role: 'user', content: reviewInput.trim() };
    const updatedMsgs = [...reviewMessages, userMsg];
    setReviewMessages(updatedMsgs);
    setReviewInput('');
    setReviewSending(true);

    try {
      const plan = plans.find(p => p.id === pendingChanges.planId);
      if (!plan) throw new Error('Plan not found');
      const cfg = plan.configId ? planConfigs[plan.configId] : null;

      // Build context for the coach
      const now = new Date();
      const sp = plan.startDate.split('T')[0].split('-');
      const start = new Date(Number(sp[0]), Number(sp[1]) - 1, Number(sp[2]), 12, 0, 0);
      const daysSince = Math.round((now - start) / (1000 * 60 * 60 * 24));
      const currentWeek = Math.max(1, Math.min(Math.floor(daysSince / 7) + 1, plan.weeks));

      const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const allActivities = (pendingChanges.proposedActivities || []).map(a => {
        const d = getActivityDate(plan.startDate, a.week, a.dayOfWeek);
        const calDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return {
          id: a.id, week: a.week, dayOfWeek: a.dayOfWeek,
          dayName: DAY_NAMES[a.dayOfWeek] || 'Unknown',
          calendarDate: calDate,
          type: a.type, subType: a.subType, title: a.title,
          durationMins: a.durationMins, distanceKm: a.distanceKm,
          effort: a.effort, completed: a.completed,
        };
      });

      // Week 1 day mapping so the coach knows the calendar layout
      const week1Days = {};
      for (let dow = 0; dow < 7; dow++) {
        const d = getActivityDate(plan.startDate, 1, dow);
        week1Days[`dayOfWeek ${dow}`] = `${DAY_NAMES[dow]} ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }

      const goal = goals.find(g => g.id === plan.goalId);
      const context = {
        plan: { name: plan.name, weeks: plan.weeks, startDate: plan.startDate, currentWeek },
        calendarMapping: week1Days,
        goal: goal ? { goalType: goal.goalType, eventName: goal.eventName, targetDistance: goal.targetDistance, targetDate: goal.targetDate, cyclingType: goal.cyclingType } : null,
        coachId: cfg?.coachId || null,
        allActivities,
        reviewMode: true,
        previousActivities: (pendingChanges.previousActivities || []).map(a => {
          const d = getActivityDate(plan.startDate, a.week, a.dayOfWeek);
          const calDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          return {
            id: a.id, week: a.week, dayOfWeek: a.dayOfWeek,
            dayName: DAY_NAMES[a.dayOfWeek] || 'Unknown',
            calendarDate: calDate,
            title: a.title, durationMins: a.durationMins, distanceKm: a.distanceKm, effort: a.effort,
          };
        }),
      };

      // Prepend a system-like context message about the review
      const apiMessages = [
        { role: 'user', content: 'I\'m reviewing changes you suggested to my plan. Here are the proposed changes. I may want to adjust them further.' },
        { role: 'assistant', content: 'Of course! I\'m happy to adjust the changes. What would you like me to modify?' },
        ...updatedMsgs.map(m => ({ role: m.role, content: m.content })),
      ];

      const result = await coachChat(apiMessages, context);
      const coachMsg = { role: 'assistant', content: result.reply };
      setReviewMessages(prev => [...prev, coachMsg]);

      // If the coach returned updated activities, refresh the pending changes
      if (result.updatedActivities && result.updatedActivities.length > 0) {
        const existing = pendingChanges.proposedActivities || [];
        const incomingById = {};
        result.updatedActivities.forEach(a => { incomingById[a.id] = a; });
        // Merge: update existing, add new
        const merged = existing.map(a => incomingById[a.id] ? { ...a, ...incomingById[a.id] } : a);
        const existingIds = new Set(existing.map(a => a.id));
        result.updatedActivities.forEach(a => {
          if (!existingIds.has(a.id)) merged.push(a);
        });

        navigation.setParams({
          pendingChanges: {
            ...pendingChanges,
            proposedActivities: merged,
          },
        });
      }
    } catch {
      setReviewMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Try again.' }]);
    }

    setReviewSending(false);
    setTimeout(() => reviewScrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [reviewInput, reviewSending, reviewMessages, pendingChanges, plans, goals, planConfigs, navigation]);

  // Long-press an activity — show inline action bar
  const handleActivityLongPress = useCallback((activity, planId) => {
    setActionActivity({ activity, planId });
  }, []);

  const handleActionMove = useCallback(() => {
    if (!actionActivity) return;
    const plan = plans.find(p => p.id === actionActivity.planId);
    if (!plan?.startDate) return;
    setMovingActivity({ activity: actionActivity.activity, planId: actionActivity.planId, planStartDate: plan.startDate });
    setSelectedDate(null);
    setActionActivity(null);
  }, [actionActivity, plans]);

  const handleActionDelete = useCallback(async () => {
    if (!actionActivity) return;
    const allPlans = await getPlans();
    const plan = allPlans.find(p => p.id === actionActivity.planId);
    if (!plan) return;
    plan.activities = (plan.activities || []).filter(a => a.id !== actionActivity.activity.id);
    await savePlan(plan);
    setActionActivity(null);
    setSelectedDate(null);
    load();
  }, [actionActivity, load]);

  // Tap a day cell while moving — place the activity on that day
  const handlePlaceActivity = useCallback(async (targetDate) => {
    if (!movingActivity) return;
    const { activity, planId, planStartDate } = movingActivity;

    // Calculate target week + dayOfWeek from the calendar date
    const datePart = String(planStartDate).split('T')[0];
    const [sy, sm, sd] = datePart.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd, 12, 0, 0);
    const jsDay = start.getDay();
    const mondayOffset = jsDay === 0 ? -6 : -(jsDay - 1);
    const monday = new Date(start);
    monday.setDate(monday.getDate() + mondayOffset);

    const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 12, 0, 0);
    const diffDays = Math.round((target - monday) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) { setMovingActivity(null); return; }

    const newWeek = Math.floor(diffDays / 7) + 1;
    const newDayOfWeek = diffDays % 7;

    // Same position — cancel
    if (newWeek === activity.week && newDayOfWeek === activity.dayOfWeek) {
      setMovingActivity(null);
      return;
    }

    // Find plan and update
    const allPlans = await getPlans();
    const plan = allPlans.find(p => p.id === planId);
    if (!plan) { setMovingActivity(null); return; }

    // Check plan bounds
    if (newWeek < 1 || newWeek > (plan.weeks || 52)) {
      Alert.alert('Out of range', 'That day is outside this plan.');
      setMovingActivity(null);
      return;
    }

    const act = plan.activities.find(a => a.id === activity.id);
    if (act) {
      act.week = newWeek;
      act.dayOfWeek = newDayOfWeek;
      await savePlan(plan);
    }
    setMovingActivity(null);
    load();
  }, [movingActivity, load]);

  // When entering review mode, jump to the first affected month
  useEffect(() => {
    if (reviewMode && pendingChanges && changeDiff && changeDiff.affectedDayKeys.size > 0) {
      const plan = plans.find(p => p.id === pendingChanges.planId);
      if (plan?.startDate) {
        // Get the first affected day
        const firstKey = [...changeDiff.affectedDayKeys].sort()[0];
        const [week, dayOfWeek] = firstKey.split('-').map(Number);
        const d = getActivityDate(plan.startDate, week, dayOfWeek);
        setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
      }
    }
  }, [reviewMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const crossTrainingMap = {}; // date key → [{ label, color }]
  const DAY_KEY_MAP = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

  visiblePlans.forEach(plan => {
    if (!plan.activities || !plan.startDate) return;
    plan.activities.forEach(a => {
      if (a.dayOfWeek == null) return;
      const d = getActivityDate(plan.startDate, a.week, a.dayOfWeek);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!activityMap[key]) activityMap[key] = [];
      activityMap[key].push({ ...a, _planId: plan.id });
    });

    // Add cross-training pseudo-entries
    const cfg = plan.configId ? planConfigs[plan.configId] : null;
    const ctDays = cfg?.crossTrainingDaysFull;
    if (ctDays) {
      for (let week = 1; week <= plan.weeks; week++) {
        DAY_KEY_MAP.forEach((dayKey, dayIdx) => {
          const activities = ctDays[dayKey];
          if (!activities || activities.length === 0) return;
          const d = getActivityDate(plan.startDate, week, dayIdx);
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          if (!crossTrainingMap[key]) crossTrainingMap[key] = [];
          activities.forEach(ct => {
            crossTrainingMap[key].push({
              label: getCrossTrainingLabel(ct),
              color: CROSS_TRAINING_COLOR,
              _isCrossTraining: true,
            });
          });
        });
      }
    }
  });

  // When in review mode, build a set of affected calendar date keys for highlighting
  const affectedDateKeys = useMemo(() => {
    if (!reviewMode || !pendingChanges || !changeDiff) return new Set();
    const plan = visiblePlans.find(p => p.id === pendingChanges.planId) || plans.find(p => p.id === pendingChanges.planId);
    if (!plan?.startDate) return new Set();
    const keys = new Set();
    changeDiff.affectedDayKeys.forEach(dk => {
      const [week, dayOfWeek] = dk.split('-').map(Number);
      const d = getActivityDate(plan.startDate, week, dayOfWeek);
      keys.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    return keys;
  }, [reviewMode, pendingChanges, changeDiff, visiblePlans, plans]);

  // When in review mode, overlay proposed activities onto the activity map
  if (reviewMode && pendingChanges) {
    const plan = visiblePlans.find(p => p.id === pendingChanges.planId) || plans.find(p => p.id === pendingChanges.planId);
    if (plan?.startDate) {
      // Remove all previous activities from this plan from the map
      Object.keys(activityMap).forEach(key => {
        activityMap[key] = activityMap[key].filter(a => a._planId !== pendingChanges.planId);
        if (activityMap[key].length === 0) delete activityMap[key];
      });
      // Add proposed activities
      (pendingChanges.proposedActivities || []).forEach(a => {
        if (a.dayOfWeek == null) return;
        const d = getActivityDate(plan.startDate, a.week, a.dayOfWeek);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!activityMap[key]) activityMap[key] = [];
        activityMap[key].push({ ...a, _planId: plan.id });
      });
    }
  }

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

  // Day cell items: array of { label, metric, color }
  const getDayCellItems = (day) => {
    if (!day) return [];
    const items = [];
    const acts = activityMap[getKey(day)];
    if (acts && acts.length > 0) {
      acts.forEach(a => items.push({
        label: getSessionLabel(a),
        metric: getMetricLabel(a),
        color: getSessionColor(a),
        type: a.type,
        _activity: a,
      }));
    }
    const ct = crossTrainingMap[getKey(day)];
    if (ct && ct.length > 0) {
      ct.forEach(c => items.push({
        label: c.label,
        metric: null,
        color: c.color,
        isCrossTraining: true,
        ctKey: c.key,
      }));
    }
    return items;
  };

  const selectedActivities = selectedDate
    ? activityMap[`${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`] || []
    : [];
  const selectedCrossTraining = selectedDate
    ? crossTrainingMap[`${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`] || []
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

        {/* Review mode banner */}
        {reviewMode && changeDiff && (
          <View style={s.reviewBanner}>
            <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.primary} />
            <Text style={s.reviewBannerText}>
              Your coach suggested {changeDiff.total} change{changeDiff.total !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* Moving activity banner */}
        {movingActivity && (
          <View style={s.moveBanner}>
            <MaterialCommunityIcons name="cursor-move" size={16} color="#fff" />
            <Text style={s.moveBannerText} numberOfLines={1}>
              Moving: {movingActivity.activity.title}
            </Text>
            <TouchableOpacity onPress={() => setMovingActivity(null)} hitSlop={HIT}>
              <Text style={s.moveBannerCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

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
                    style={[
                      s.dayCell,
                      hasGoal && s.dayCellGoal,
                      isToday(day) && s.dayCellToday,
                      isSelected(day) && s.dayCellSelected,
                      reviewMode && day && affectedDateKeys.has(getKey(day)) && !isSelected(day) && s.dayCellChanged,
                      movingActivity && day && s.dayCellDropTarget,
                    ]}
                    onPress={() => {
                      if (!day) return;
                      if (movingActivity) {
                        handlePlaceActivity(new Date(year, month, day));
                      } else {
                        setSelectedDate(new Date(year, month, day));
                      }
                    }}
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
                            <View style={s.goalFlagDot} />
                          </View>
                        )}
                        {items.map((item, idx) => {
                          const iconName = item.isCrossTraining
                            ? getActivityIcon(item.ctKey || 'other')
                            : getActivityIcon(item._activity);
                          const iconColor = isSelected(day) ? 'rgba(255,255,255,0.9)' : ACTIVITY_BLUE;
                          const metricText = item.metric || '';
                          return (
                            <View key={idx} style={s.cellItemCol}>
                              <MaterialCommunityIcons name={iconName} size={11} color={iconColor} />
                              {metricText ? (
                                <Text style={[s.cellItemLabel, { color: iconColor }]} numberOfLines={1}>
                                  {metricText}
                                </Text>
                              ) : null}
                            </View>
                          );
                        })}
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
              <View style={s.goalBannerDot} />
              <View style={s.goalBannerText}>
                <Text style={s.goalBannerTitle}>Goal target date</Text>
                <Text style={s.goalBannerLabel}>
                  {goalDateMap[`${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`].label}
                </Text>
              </View>
            </View>
          )}
          {selectedActivities.length === 0 && selectedCrossTraining.length === 0 && selectedDate && !goalDateMap[`${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`] && (
            <Text style={s.noActivities}>No activities this day</Text>
          )}
          {selectedCrossTraining.map((ct, idx) => (
            <View key={`ct-${idx}`} style={s.ctCard}>
              <View style={[s.actAccent, { backgroundColor: CROSS_TRAINING_COLOR }]} />
              <View style={s.actBody}>
                <View style={s.actTop}>
                  <View style={[s.actTypeBadge, { backgroundColor: CROSS_TRAINING_COLOR + '18' }]}>
                    <Text style={[s.actTypeText, { color: CROSS_TRAINING_COLOR }]}>Your activity</Text>
                  </View>
                  <View style={s.actTextWrap}>
                    <Text style={s.actTitle}>{ct.label}</Text>
                    <Text style={s.actMeta}>Factored into plan recovery</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
          {selectedActivities.map(activity => (
            <TouchableOpacity
              key={activity.id}
              style={[s.actCard, activity.type === 'strength' && s.actCardStrength, activity.completed && s.actCardDone, actionActivity?.activity?.id === activity.id && s.actCardActive]}
              onPress={() => actionActivity ? setActionActivity(null) : navigation.navigate('ActivityDetail', { activityId: activity.id })}
              onLongPress={() => handleActivityLongPress(activity, activity._planId)}
              delayLongPress={400}
              activeOpacity={0.75}
            >
              <View style={[s.actAccent, { backgroundColor: ACTIVITY_BLUE }]} />
              <View style={s.actBody}>
                <View style={s.actTop}>
                  <View style={[s.typeShape, activity.type === 'strength' ? s.typeShapeSquare : s.typeShapeCircle, { backgroundColor: ACTIVITY_BLUE }]} />
                  <View style={[s.actTypeBadge, { backgroundColor: ACTIVITY_BLUE + '18' }]}>
                    <Text style={[s.actTypeText, { color: ACTIVITY_BLUE }]}>{getSessionLabel(activity)}</Text>
                  </View>
                  <View style={s.actTextWrap}>
                    <Text style={[s.actTitle, activity.completed && s.actTitleDone]}>{activity.title}</Text>
                    <Text style={s.actMeta}>
                      {activity.distanceKm ? `${activity.distanceKm} km` : ''}
                      {activity.distanceKm && activity.durationMins ? ' \u00B7 ' : ''}
                      {activity.durationMins ? `${activity.durationMins} min` : ''}
                      {activity.effort ? ` \u00B7 ${activity.effort}` : ''}
                    </Text>
                  </View>
                  {activity.completed ? (
                    <View style={s.checkDone}><Text style={s.checkMark}>{'\u2713'}</Text></View>
                  ) : (
                    <MaterialCommunityIcons name="dots-vertical" size={18} color={colors.textFaint} />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Activity action bar — shown on long-press */}
        {actionActivity && !movingActivity && (
          <View style={s.actionBar}>
            <Text style={s.actionBarTitle} numberOfLines={1}>{actionActivity.activity.title}</Text>
            <View style={s.actionBarBtns}>
              <TouchableOpacity style={s.actionBarBtn} onPress={handleActionMove} activeOpacity={0.7}>
                <MaterialCommunityIcons name="calendar-arrow-right" size={20} color={colors.text} />
                <Text style={s.actionBarBtnText}>Move</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBarBtn, s.actionBarBtnDelete]} onPress={handleActionDelete} activeOpacity={0.7}>
                <MaterialCommunityIcons name="delete-outline" size={20} color="#EF4444" />
                <Text style={[s.actionBarBtnText, { color: '#EF4444' }]}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBarBtn} onPress={() => setActionActivity(null)} activeOpacity={0.7}>
                <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
                <Text style={[s.actionBarBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Review mode bottom panel */}
        {reviewMode && changeDiff && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.reviewPanel}>
            {/* Inline chat messages */}
            {showReviewChat && reviewMessages.length > 0 && (
              <ScrollView
                ref={reviewScrollRef}
                style={s.reviewChatScroll}
                contentContainerStyle={s.reviewChatContent}
              >
                {reviewMessages.map((msg, i) => (
                  <View key={i} style={[s.reviewMsg, msg.role === 'user' ? s.reviewMsgUser : s.reviewMsgCoach]}>
                    <Text style={[s.reviewMsgText, msg.role === 'user' && s.reviewMsgTextUser]}>
                      {msg.content}
                    </Text>
                  </View>
                ))}
                {reviewSending && (
                  <View style={[s.reviewMsg, s.reviewMsgCoach]}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                )}
              </ScrollView>
            )}

            {/* Chat input row */}
            <View style={s.reviewInputRow}>
              <TextInput
                style={s.reviewTextInput}
                placeholder="Ask your coach to adjust..."
                placeholderTextColor={colors.textFaint}
                value={reviewInput}
                onChangeText={setReviewInput}
                onFocus={() => setShowReviewChat(true)}
                onSubmitEditing={handleReviewSend}
                returnKeyType="send"
                editable={!reviewSending}
              />
              <TouchableOpacity
                style={[s.reviewSendBtn, (!reviewInput.trim() || reviewSending) && s.reviewSendBtnDisabled]}
                onPress={handleReviewSend}
                disabled={!reviewInput.trim() || reviewSending}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="send" size={18} color={reviewInput.trim() && !reviewSending ? '#fff' : colors.textFaint} />
              </TouchableOpacity>
            </View>

            {/* Accept / Discard buttons */}
            <View style={s.reviewBtnRow}>
              <TouchableOpacity style={s.rejectBtn} onPress={handleRejectChanges} activeOpacity={0.7}>
                <MaterialCommunityIcons name="close" size={18} color={colors.textMuted} />
                <Text style={s.rejectBtnText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.acceptBtn} onPress={handleAcceptChanges} activeOpacity={0.7}>
                <MaterialCommunityIcons name="check" size={18} color="#fff" />
                <Text style={s.acceptBtnText}>Accept changes</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}

        {/* Coach chat bottom bar */}
        {!reviewMode && visiblePlans.length > 0 && (
          <View style={s.coachBar}>
            <TouchableOpacity
              style={s.coachBtn}
              onPress={() => navigation.navigate('CoachChat', { planId: visiblePlans[0].id })}
              activeOpacity={0.7}
            >
              <View style={[s.coachDot, { backgroundColor: colors.primary }]} />
              <View style={s.coachBtnTextWrap}>
                <Text style={s.coachBtnLabel}>Ask your coach</Text>
                <Text style={s.coachBtnHint}>Move sessions, adjust the plan, or get advice</Text>
              </View>
              <Text style={s.coachBtnArrow}>{'\u203A'}</Text>
            </TouchableOpacity>
          </View>
        )}
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
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: 4, minHeight: 58, borderRadius: 10 },
  dayCellToday: { backgroundColor: 'rgba(232,69,139,0.1)' },
  dayCellSelected: { backgroundColor: colors.primary },
  dayText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
  dayTextToday: { color: colors.primary },
  dayTextSelected: { color: '#fff' },

  dayCellGoal: { backgroundColor: 'rgba(232,69,139,0.12)', borderWidth: 1, borderColor: 'rgba(232,69,139,0.3)' },
  goalFlag: { marginTop: 2 },
  goalFlagSelected: { opacity: 0.9 },
  goalFlagDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },

  cellItemRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  cellItemCol: { alignItems: 'center', gap: 1, marginTop: 2 },
  cellItemDot: { width: 4, height: 4, borderRadius: 2 },
  cellItemDotSquare: { borderRadius: 1 },
  cellItemDotDiamond: { borderRadius: 0, transform: [{ rotate: '45deg' }] },
  cellItemLabel: { fontSize: 8, fontWeight: '700', fontFamily: FF.semibold, lineHeight: 10, maxWidth: 40 },

  // Goal banner in selected day detail
  goalBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(232,69,139,0.1)', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.25)',
  },
  goalBannerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  goalBannerText: { flex: 1 },
  goalBannerTitle: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary, marginBottom: 2 },
  goalBannerLabel: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid },

  activityList: { flex: 1, paddingHorizontal: 16 },
  selectedLabel: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, marginBottom: 8, marginTop: 4 },
  noActivities: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, textAlign: 'center', marginTop: 20 },

  ctCard: {
    flexDirection: 'row', backgroundColor: colors.surface, marginBottom: 8,
    borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: CROSS_TRAINING_COLOR + '30',
    borderStyle: 'dashed',
  },
  actCard: {
    flexDirection: 'row', backgroundColor: colors.surface, marginBottom: 8,
    borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border,
  },
  actCardStrength: { borderStyle: 'dashed', borderColor: 'rgba(139,92,246,0.3)' },
  actCardDone: { opacity: 0.5 },
  actAccent: { width: 4 },
  actBody: { flex: 1, padding: 14 },
  actTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeShape: { width: 8, height: 8 },
  typeShapeCircle: { borderRadius: 4 },
  typeShapeSquare: { borderRadius: 2 },
  actTypeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  actTypeText: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, textTransform: 'uppercase', letterSpacing: 0.3 },
  actTextWrap: { flex: 1 },
  actTitle: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  actTitleDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  actMeta: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 2 },
  checkDone: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 12, color: '#fff', fontWeight: '700' },

  // Coach chat bottom bar
  coachBar: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
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

  // Review mode
  reviewBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(232,69,139,0.1)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.25)',
  },
  reviewBannerText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },

  dayCellChanged: {
    backgroundColor: 'rgba(232,69,139,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(232,69,139,0.4)',
  },

  // Review panel (chat + buttons)
  reviewPanel: {
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    paddingBottom: Platform.OS === 'ios' ? 0 : 8,
  },
  reviewChatScroll: { maxHeight: 160, paddingHorizontal: 16, paddingTop: 10 },
  reviewChatContent: { gap: 6, paddingBottom: 4 },
  reviewMsg: { maxWidth: '85%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  reviewMsgUser: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  reviewMsgCoach: { alignSelf: 'flex-start', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  reviewMsgText: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.text, lineHeight: 20 },
  reviewMsgTextUser: { color: '#fff' },

  reviewInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  reviewTextInput: {
    flex: 1, height: 40, borderRadius: 20, paddingHorizontal: 16,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    fontSize: 14, fontFamily: FF.regular, color: colors.text,
  },
  reviewSendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  reviewSendBtnDisabled: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },

  reviewBtnRow: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 12,
  },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 14,
    backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.border,
  },
  rejectBtnText: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted },
  acceptBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 14,
    backgroundColor: colors.primary,
  },
  acceptBtnText: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },

  // Moving mode
  moveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: colors.primary, borderRadius: 12,
  },
  moveBannerText: { flex: 1, fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: '#fff' },
  moveBannerCancel: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: 'rgba(255,255,255,0.7)' },
  dayCellDropTarget: { borderWidth: 1, borderColor: 'rgba(232,69,139,0.3)', borderStyle: 'dashed' },

  // Activity action bar
  actCardActive: { borderColor: colors.primary, borderWidth: 1.5 },
  actionBar: {
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  actionBarTitle: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, marginBottom: 10 },
  actionBarBtns: { flexDirection: 'row', gap: 10 },
  actionBarBtn: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 12,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
  },
  actionBarBtnDelete: { borderColor: 'rgba(239,68,68,0.25)' },
  actionBarBtnText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
});
