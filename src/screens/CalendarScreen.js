/**
 * Calendar screen — monthly view showing activities across plans.
 * Supports plan filtering and shows type icons in day cells.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert,
  TextInput, KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator,
  Animated,
} from 'react-native';
import { Gesture, GestureDetector, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily, useBottomInset } from '../theme';
import { getPlans, getGoals, getActivityDate, getPlanConfig, savePlan, getWeekActivities, getUserPrefs } from '../services/storageService';
import { coachChat } from '../services/llmPlanService';
import { getSessionColor, getSessionLabel, getMetricLabel, getActivityIcon, CROSS_TRAINING_COLOR, getCrossTrainingLabel } from '../utils/sessionLabels';
import { getCoach } from '../data/coaches';
import CoachChatCard from '../components/CoachChatCard';
import { useUnits } from '../utils/units';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import analytics from '../services/analyticsService';

const FF = fontFamily;
const ACTIVITY_BLUE = '#E8458B';
const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CYCLING_LABELS = { road: 'Road', gravel: 'Gravel', mtb: 'MTB', ebike: 'E-Bike', mixed: 'Mixed' };

export default function CalendarScreen({ navigation, route }) {
  const { formatDistance } = useUnits();
  const pendingChanges = route.params?.pendingChanges || null;
  // Use the real device bottom inset so sticky bars on this screen never
  // sit underneath the Android gesture bar / 3-button nav.
  const bottomInset = useBottomInset(12);
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

  // ── Drag-and-drop state ────────────────────────────────────────────────
  // Same pattern as HomeScreen: long-press activates Pan, ghost follows the
  // finger, and each day cell is a measured drop zone. We hit-test on both
  // X and Y because the calendar is a 2D grid. Single-month only — drops
  // outside the current month fall through as "no target" and cancel.
  const [dragActivity, setDragActivity] = useState(null);
  const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dropZonesRef = useRef({}); // dateKey → { x, y, width, height }
  const [hoveredDateKey, setHoveredDateKey] = useState(null);
  const hoveredDateKeyRef = useRef(null);
  // After a drag, the activity card's onPress still fires — suppress it so
  // a release doesn't open the action bar as if the user tapped.
  const justDraggedRef = useRef(false);
  // Brief highlight on the target cell after a successful move so the user
  // sees where the activity landed (especially useful when the move crosses
  // months or lands on a pre-plan-start day that would otherwise look like
  // a no-op from the home screen).
  const [justMovedKey, setJustMovedKey] = useState(null);

  const registerDropZone = (dateKey, ref) => {
    if (!ref || !ref.measureInWindow) return;
    ref.measureInWindow((x, y, w, h) => {
      dropZonesRef.current[dateKey] = { x, y, width: w, height: h };
    });
  };

  const findDropTargetAtXY = (pageX, pageY) => {
    for (const [dateKey, zone] of Object.entries(dropZonesRef.current)) {
      if (
        pageX >= zone.x && pageX <= zone.x + zone.width &&
        pageY >= zone.y && pageY <= zone.y + zone.height
      ) {
        return dateKey;
      }
    }
    return null;
  };

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

  // When the month changes the grid cells get reused with new dayKeys,
  // so the old measurements in dropZonesRef point at wrong (dateKey →
  // zone) pairs. Clear them — the ref callbacks on each cell will
  // repopulate the map as React attaches refs after the re-render.
  useEffect(() => {
    dropZonesRef.current = {};
  }, [viewDate]);
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

  // Place an activity on a calendar date. Works for both the tap-to-move
  // flow (uses movingActivity state) and the drag-and-drop flow (passes
  // the { activity, planId, planStartDate } as `override`).
  //
  // Important: if the target is before plan.startDate, we simply allow
  // negative/zero week values. We do NOT regenerate the rest of the plan
  // or shift other activities — the user explicitly wants a single-
  // activity move that saves credits. They can always ask the coach to
  // reshape the plan afterwards.
  const handlePlaceActivity = useCallback(async (targetDate, override) => {
    const moving = override || movingActivity;
    if (!moving) return;
    const { activity, planId, planStartDate } = moving;

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

    // Allow negative diffDays for pre-plan-start moves. Use floor + mod-7
    // correction so dayOfWeek is always 0..6 even for negative values.
    const newWeek = Math.floor(diffDays / 7) + 1;
    const newDayOfWeek = ((diffDays % 7) + 7) % 7;

    // Same position — cancel
    if (newWeek === activity.week && newDayOfWeek === activity.dayOfWeek) {
      setMovingActivity(null);
      return;
    }

    // Find plan and update
    const allPlans = await getPlans();
    const plan = allPlans.find(p => p.id === planId);
    if (!plan) { setMovingActivity(null); return; }

    // Upper bound only — allow moves before plan start (week can be <= 0).
    if (newWeek > (plan.weeks || 52)) {
      Alert.alert('Out of range', 'That day is outside this plan.');
      setMovingActivity(null);
      return;
    }

    // Optimistic update so the move is visible immediately, no delay
    // waiting on savePlan + load().
    setPlans((prev) => prev.map((p) => {
      if (p.id !== planId) return p;
      return {
        ...p,
        activities: (p.activities || []).map(a =>
          a.id === activity.id ? { ...a, week: newWeek, dayOfWeek: newDayOfWeek } : a
        ),
      };
    }));

    // Surface the move to the user: jump the calendar to the target
    // month (if different), select the target date, and flash the cell
    // briefly so they can see exactly where the activity landed. Without
    // this, moves to other months — especially pre-plan-start — can
    // feel like "nothing happened" because the source day just empties.
    //
    // NOTE: derive year/month from viewDate INSIDE the callback, don't
    // close over the `year`/`month` locals computed later in the render
    // body — those are in the temporal dead zone when useCallback runs
    // on the first render and referencing them here throws
    // "Cannot access 'year' before initialization".
    const currentYear = viewDate.getFullYear();
    const currentMonth = viewDate.getMonth();
    const targetKey = `${target.getFullYear()}-${target.getMonth()}-${target.getDate()}`;
    const targetMonthChanged = target.getFullYear() !== currentYear || target.getMonth() !== currentMonth;
    if (targetMonthChanged) {
      setViewDate(new Date(target.getFullYear(), target.getMonth(), 1));
    }
    setSelectedDate(target);
    setJustMovedKey(targetKey);
    setTimeout(() => setJustMovedKey((k) => (k === targetKey ? null : k)), 1400);

    const act = plan.activities.find(a => a.id === activity.id);
    if (act) {
      act.week = newWeek;
      act.dayOfWeek = newDayOfWeek;
      await savePlan(plan);
    }
    setMovingActivity(null);
    load();
  }, [movingActivity, load, viewDate]);

  // Build the composed drag gesture for an activity card. Matches
  // HomeScreen's pattern: long-press 350ms activates Pan, which then
  // drives the ghost and hit-tests on every frame. On release, we look
  // up the hovered day cell and fire handlePlaceActivity with the full
  // moving payload (we don't rely on state having settled by the time
  // onEnd runs).
  const makeDragGesture = (activity, planId, planStartDate) => {
    let didActivate = false;
    const payload = { activity, planId, planStartDate };
    return Gesture.Pan()
      .activateAfterLongPress(350)
      .runOnJS(true)
      .onStart((e) => {
        didActivate = true;
        setDragActivity(activity);
        setMovingActivity(payload);
        dragPos.setValue({ x: e.absoluteX - 140, y: e.absoluteY - 24 });
      })
      .onChange((e) => {
        dragPos.setValue({ x: e.absoluteX - 140, y: e.absoluteY - 24 });
        const target = findDropTargetAtXY(e.absoluteX, e.absoluteY);
        if (target !== hoveredDateKeyRef.current) {
          hoveredDateKeyRef.current = target;
          setHoveredDateKey(target);
        }
      })
      .onEnd(async (e) => {
        const targetKey = findDropTargetAtXY(e.absoluteX, e.absoluteY);
        setDragActivity(null);
        setHoveredDateKey(null);
        hoveredDateKeyRef.current = null;
        justDraggedRef.current = true;
        setTimeout(() => { justDraggedRef.current = false; }, 300);
        if (targetKey) {
          const [ty, tm, td] = targetKey.split('-').map(Number);
          await handlePlaceActivity(new Date(ty, tm, td), payload);
        } else {
          // Dropped outside any cell (e.g. off-month) — just cancel.
          setMovingActivity(null);
        }
      })
      .onFinalize(() => {
        if (didActivate) {
          setDragActivity(null);
          setHoveredDateKey(null);
          hoveredDateKeyRef.current = null;
          justDraggedRef.current = true;
          setTimeout(() => { justDraggedRef.current = false; }, 300);
        }
        didActivate = false;
      });
  };

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

  // Source day key when moving an activity (so we can highlight it)
  const moveSourceKey = useMemo(() => {
    if (!movingActivity) return null;
    const d = getActivityDate(movingActivity.planStartDate, movingActivity.activity.week, movingActivity.activity.dayOfWeek);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }, [movingActivity]);
  const isMoveSource = (d) => d && moveSourceKey && moveSourceKey === getKey(d);

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

        {/* Top drag-tip banner removed — the hint now lives ON each
            unselected activity card (next to the drag handle) where
            it's right next to the gesture target instead of floating
            at the top of the screen. See the `actDragHint` render
            below inside the activity map. */}

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
                const dayKey = day ? getKey(day) : null;
                const isDragHover = dragActivity && dayKey && hoveredDateKey === dayKey;
                const isJustMoved = dayKey && justMovedKey === dayKey;
                return (
                  <TouchableOpacity
                    // Key includes year/month so cells remount on month
                    // navigation — this retriggers the ref callback and
                    // repopulates dropZonesRef with the current dayKeys.
                    key={`${year}-${month}-${wi}-${di}`}
                    ref={(r) => { if (day) registerDropZone(dayKey, r); }}
                    style={[
                      s.dayCell,
                      hasGoal && s.dayCellGoal,
                      isToday(day) && s.dayCellToday,
                      isSelected(day) && s.dayCellSelected,
                      reviewMode && day && affectedDateKeys.has(getKey(day)) && !isSelected(day) && s.dayCellChanged,
                      movingActivity && day && !isMoveSource(day) && !dragActivity && s.dayCellDropTarget,
                      isMoveSource(day) && s.dayCellMoveSource,
                      isDragHover && s.dayCellDragHover,
                      isJustMoved && s.dayCellJustMoved,
                    ]}
                    onPress={() => {
                      if (!day) return;
                      if (movingActivity) {
                        handlePlaceActivity(new Date(year, month, day));
                      } else {
                        const tappedDate = new Date(year, month, day);
                        setSelectedDate(tappedDate);
                        // If the tapped day has exactly one activity, surface
                        // the action bar immediately so the user sees all
                        // options (Move/Delete/Open) without needing a second
                        // tap on the activity card below.
                        const dayActs = activityMap[getKey(day)] || [];
                        if (dayActs.length === 1) {
                          setActionActivity({ activity: dayActs[0], planId: dayActs[0]._planId });
                        } else {
                          setActionActivity(null);
                        }
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

        {/* Selected day activities.
            Using the gesture-handler-aware ScrollView (GHScrollView) so
            the long-press-then-pan drag on an activity card activates
            reliably — a plain RN ScrollView grabs touches too eagerly
            during the 350ms hold and steals the gesture before Pan
            fires. Also disabling scroll while a drag is in flight so
            the list doesn't try to scroll under the finger as the
            ghost card moves.
            showsVerticalScrollIndicator={false} because the iOS
            Simulator renders a permanent scrollbar when driven by a
            mouse — on real devices it only flashes during scroll, but
            turning it off entirely avoids the simulator artefact and
            looks cleaner regardless. */}
        <GHScrollView
          style={s.activityList}
          scrollEnabled={!dragActivity}
          showsVerticalScrollIndicator={false}
        >
          {selectedDate && (
            <View style={s.selectedHeader}>
              <Text style={s.selectedLabel}>
                {selectedDate.getDate()} {MONTHS[selectedDate.getMonth()]}
              </Text>
              {selectedActivities.length > 0 && !actionActivity && (
                <Text style={s.selectedHint}>Tap an activity for options</Text>
              )}
            </View>
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
          {selectedActivities.map(activity => {
            const plan = plans.find(p => p.id === activity._planId);
            const planStartDate = plan?.startDate;
            const dragGesture = planStartDate
              ? makeDragGesture(activity, activity._planId, planStartDate)
              : null;
            // Per-card selection state. The card that's currently
            // "open" shows its inline action strip (Open / Move /
            // Delete); every OTHER card on the same day dims to
            // give focus to the selection. Tapping a card that's
            // already selected does NOT navigate — that used to
            // double-duty with a chevron in the old action bar and
            // was confusing. Open is now always an explicit button.
            const isSelected = actionActivity?.activity?.id === activity.id;
            const anyOtherSelected = !!actionActivity && !isSelected;
            const card = (
              <TouchableOpacity
                key={activity.id}
                style={[
                  s.actCard,
                  activity.type === 'strength' && s.actCardStrength,
                  activity.completed && s.actCardDone,
                  isSelected && s.actCardActive,
                  anyOtherSelected && s.actCardDimmed,
                ]}
                onPress={() => {
                  if (justDraggedRef.current) return;
                  if (isSelected) {
                    // Tapping the open card collapses it — same as
                    // tapping the ✕ in the top-right. Avoids the
                    // "does tapping again navigate?" ambiguity from
                    // the old two-tap model.
                    setActionActivity(null);
                  } else {
                    setActionActivity({ activity, planId: activity._planId });
                  }
                }}
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
                        {activity.distanceKm ? formatDistance(activity.distanceKm) : ''}
                        {activity.distanceKm && activity.durationMins ? ' \u00B7 ' : ''}
                        {activity.durationMins ? `${activity.durationMins} min` : ''}
                        {activity.effort ? ` \u00B7 ${activity.effort}` : ''}
                      </Text>
                    </View>
                    {/* Right-side affordance. Completed → check.
                        Selected → ✕ to collapse (absorbs the old
                        standalone Cancel button from the action
                        bar). Otherwise → ≡ + "Hold to drag" hint,
                        replacing the top banner. */}
                    {activity.completed ? (
                      <View style={s.checkDone}><Text style={s.checkMark}>{'\u2713'}</Text></View>
                    ) : isSelected ? (
                      <View style={s.actCloseBadge}>
                        <MaterialCommunityIcons name="close" size={14} color={colors.textMuted} />
                      </View>
                    ) : (
                      <View style={s.actDragHint}>
                        <MaterialCommunityIcons name="drag-horizontal-variant" size={16} color={colors.textFaint} />
                        <Text style={s.actDragHintText}>Hold to drag</Text>
                      </View>
                    )}
                  </View>

                  {/* Inline action strip — lives inside the card so
                      the selected activity and its actions read as
                      one element instead of two. Mirrors what the
                      separate action bar used to do; the Cancel
                      button moved up to the ✕ in the header row. */}
                  {isSelected && !movingActivity && (
                    <View style={s.actStrip}>
                      <TouchableOpacity
                        style={[s.actStripBtn, s.actStripBtnOpen]}
                        onPress={() => {
                          const id = activity.id;
                          setActionActivity(null);
                          navigation.navigate('ActivityDetail', { activityId: id });
                        }}
                        activeOpacity={0.75}
                      >
                        <MaterialCommunityIcons name="arrow-right" size={16} color={colors.primary} />
                        <Text style={[s.actStripBtnText, { color: colors.primary }]}>Open</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.actStripBtn}
                        onPress={handleActionMove}
                        activeOpacity={0.75}
                      >
                        <MaterialCommunityIcons name="calendar-arrow-right" size={16} color={colors.text} />
                        <Text style={s.actStripBtnText}>Move</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.actStripBtn, s.actStripBtnDelete]}
                        onPress={handleActionDelete}
                        activeOpacity={0.75}
                      >
                        <MaterialCommunityIcons name="delete-outline" size={16} color="#EF4444" />
                        <Text style={[s.actStripBtnText, { color: '#EF4444' }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
            return dragGesture ? (
              <GestureDetector key={activity.id} gesture={dragGesture}>
                {card}
              </GestureDetector>
            ) : card;
          })}

          {/* Coach chat card — also inside the scroll view so it stays
              part of the same scrollable panel. Only in non-review mode;
              review mode uses its own bottom sheet below. */}
          {!reviewMode && visiblePlans.length > 0 && (() => {
            const firstPlan = visiblePlans[0];
            const cfg = firstPlan.configId ? planConfigs[firstPlan.configId] : null;
            return (
              <View style={s.coachCardWrap}>
                <CoachChatCard
                  coach={getCoach(cfg?.coachId)}
                  onPress={() => navigation.navigate('CoachChat', { planId: firstPlan.id })}
                  subtitleOverride="Move sessions, adjust the plan, or ask anything about your training."
                />
              </View>
            );
          })()}

          {/* Bottom spacer clears the Android gesture bar so the last
              card has breathing room. */}
          <View style={{ height: 24 + bottomInset }} />
        </GHScrollView>

        {/* Review mode bottom panel */}
        {reviewMode && changeDiff && (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : (StatusBar.currentHeight ?? 0)}
            style={s.reviewPanel}
          >
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

        {/* Floating drag ghost — follows the finger during a drag and
            renders a shadowed copy of the activity so the user can see
            exactly what they're moving while the original card stays put. */}
        {dragActivity && (
          <Animated.View
            pointerEvents="none"
            style={[
              s.dragGhost,
              {
                transform: [
                  { translateX: dragPos.x },
                  { translateY: dragPos.y },
                ],
              },
            ]}
          >
            <Text style={s.dragGhostTitle} numberOfLines={1}>{dragActivity.title || 'Session'}</Text>
            {(dragActivity.distanceKm || dragActivity.durationMins) && (
              <Text style={s.dragGhostMeta} numberOfLines={1}>
                {dragActivity.distanceKm ? formatDistance(dragActivity.distanceKm) : ''}
                {dragActivity.distanceKm && dragActivity.durationMins ? ' \u00B7 ' : ''}
                {dragActivity.durationMins ? `${dragActivity.durationMins} min` : ''}
              </Text>
            )}
          </Animated.View>
        )}

        {/* The coach chat card that used to live here has moved INSIDE
            the GHScrollView above so it scrolls with the activity list
            and action bar as one cohesive panel below the calendar grid.
            See the coachCardWrap block just before the scroll spacer. */}
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
  selectedHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, marginTop: 4 },
  selectedLabel: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted },
  selectedHint: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint },
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

  // Wrapper around the shared CoachChatCard when it lives INSIDE the
  // GHScrollView. No border / no surface background — those were needed
  // when it was a fixed bottom bar, but in-scroll we want it to feel
  // like a card floating on the screen background, consistent with
  // HomeScreen's coachCardWrap treatment.
  coachCardWrap: { paddingHorizontal: 16, paddingTop: 8 },

  // (Legacy coachBar style kept for reference — no longer used in JSX
  // after the action-bar + coach-card moved into the GHScrollView.)
  coachBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.OS === 'android' ? 34 : 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
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
    paddingBottom: Platform.OS === 'ios' ? 0 : 24,
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
  dayCellMoveSource: { backgroundColor: 'rgba(232,69,139,0.2)', borderColor: colors.primary, borderWidth: 1.5, borderStyle: 'solid' },
  // Only the hovered cell during a drag lights up — cleaner than flagging
  // every cell as a potential target.
  dayCellDragHover: {
    backgroundColor: 'rgba(232,69,139,0.22)',
    borderWidth: 1.5, borderColor: colors.primary,
  },

  // Brief flash on the cell where an activity just landed. Without this,
  // moves to another month (especially pre-plan-start) can feel like
  // "nothing happened" because the source day just empties.
  dayCellJustMoved: {
    backgroundColor: 'rgba(232,69,139,0.32)',
    borderWidth: 1.5, borderColor: colors.primary,
  },

  // Tiny helper text below the activity list so users know drag works.
  dragHint: {
    fontSize: 11, fontWeight: '400', fontFamily: FF.regular,
    color: colors.textFaint, textAlign: 'center', marginTop: 6, marginBottom: 4,
  },

  // Ghost card that follows the finger while dragging — shadowed, with
  // the pink border so it clearly looks like a floating clone.
  dragGhost: {
    position: 'absolute', left: 0, top: 0,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.primary,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35, shadowRadius: 18, elevation: 16,
    minWidth: 180, maxWidth: 280,
  },
  dragGhostTitle: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  dragGhostMeta: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 2 },

  // Activity card — selected / dimmed states.
  // Selected: pink border, slightly warmer background. Dimmed: applied
  // to every OTHER card on the same day when one is open, so the
  // active selection has focus without having to hide siblings.
  actCardActive: {
    borderColor: colors.primary, borderWidth: 1.5,
    backgroundColor: 'rgba(232,69,139,0.06)',
  },
  actCardDimmed: { opacity: 0.45 },

  // Right-side affordances on the activity card.
  // actDragHint: muted ≡ + "Hold to drag" caption, replaces the top
  // banner as the single place where the drag affordance lives.
  // actCloseBadge: small circular ✕ shown in the same slot when the
  // card is selected — absorbs the old standalone Cancel button.
  actDragHint: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4 },
  actDragHintText: { fontSize: 10, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, letterSpacing: 0.2 },
  actCloseBadge: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  // Inline action strip that opens inside the selected activity card.
  // Three equal-width buttons: Open (navigates to ActivityDetail),
  // Move (starts the move flow), Delete (confirms + removes). Split
  // from the card body by a faint divider so the strip feels attached
  // to its parent rather than floating.
  actStrip: {
    flexDirection: 'row', gap: 6,
    marginTop: 12, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(232,69,139,0.25)',
  },
  actStripBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  actStripBtnOpen: { backgroundColor: 'rgba(232,69,139,0.14)' },
  actStripBtnDelete: { backgroundColor: 'rgba(239,68,68,0.08)' },
  actStripBtnText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
});
