/**
 * Activity detail screen — shows full info for a single activity.
 * Editable metrics (distance, duration, effort, day).
 * AI chat: ask questions or request changes to the session.
 * Changes cascade to adjust future activities proportionally.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar, Keyboard,
  Linking, ActionSheetIOS,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily, BOTTOM_INSET } from '../theme';
import { getPlans, getGoals, getPlanConfig, getUserPrefs, markActivityComplete, updateActivity, savePlan } from '../services/storageService';
import { editActivityWithAI, explainActivity as explainActivityApi } from '../services/llmPlanService';
import { buildWorkoutExportUrl } from '../services/api';
import { getSessionColor, getSessionLabel, SESSION_COLORS, EFFORT_LABELS as EFFORT_GUIDE_LABELS } from '../utils/sessionLabels';
import { formatRpe, formatHeartRate, formatPower, shouldShowPower } from '../utils/intensity';
import { useUnits } from '../utils/units';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CoachChatCard from '../components/CoachChatCard';
import BikeSwapModal from '../components/BikeSwapModal';
import ExportInstructionsModal from '../components/ExportInstructionsModal';
import { BIKE_LABELS as BIKE_LABEL_MAP, BIKE_KEYS } from '../utils/bikeSwap';
import { getCoach } from '../data/coaches';
import analytics from '../services/analyticsService';

const FF = fontFamily;

const EFFORT_COLORS = SESSION_COLORS;
const ACTIVITY_BLUE = '#A0A8B4';

const EFFORT_LABELS = {
  easy:     'Easy \u2014 Zone 2',
  moderate: 'Moderate \u2014 Zone 3-4',
  hard:     'Hard \u2014 Zone 4-5',
  recovery: 'Recovery \u2014 Zone 1',
  max:      'All out \u2014 Zone 5+',
};

const EFFORT_LIST = ['easy', 'moderate', 'hard', 'recovery', 'max'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Ride tips generator ──────────────────────────────────────────────────────
function generateRideTips(activity) {
  const tips = [];
  const dur = activity.durationMins || 60;
  const effort = activity.effort || 'moderate';
  const subType = activity.subType || 'endurance';

  if (dur <= 45) {
    tips.push({ title: 'Hydration', text: 'A single bottle of water should be enough. Sip regularly rather than waiting until you feel thirsty.' });
  } else if (dur <= 90) {
    tips.push({ title: 'Hydration', text: 'Bring one full bottle (500\u2013750 ml). Aim for a few sips every 15 minutes. Add an electrolyte tab if it\'s warm.' });
  } else {
    tips.push({ title: 'Hydration', text: `For a ${dur}-minute ride, bring two bottles or plan a refill stop. Drink 500\u2013750 ml per hour and use electrolytes.` });
  }

  if (dur <= 60) {
    tips.push({ title: 'Fueling', text: 'You shouldn\'t need to eat during the ride. Make sure you\'ve had a light meal 1\u20132 hours beforehand.' });
  } else if (dur <= 120) {
    tips.push({ title: 'Fueling', text: 'Pack a banana or energy bar. Start eating around the 45-minute mark \u2014 aim for 30\u201360g of carbs per hour.' });
  } else {
    tips.push({ title: 'Fueling', text: `Long ride! Aim for 60\u201390g carbs per hour. Pack gels, bars, or real food. Start fueling early \u2014 don't wait until you feel depleted.` });
  }

  tips.push({ title: 'Before the ride', text: 'Do 5 minutes of dynamic stretching: leg swings, hip circles, and gentle squats. Skip static stretches \u2014 save those for after.' });

  if (effort === 'hard' || effort === 'max' || dur > 90) {
    tips.push({ title: 'After the ride', text: 'This is a tough session \u2014 spend 10\u201315 minutes stretching afterwards. Focus on quads, hamstrings, hip flexors, and lower back.' });
  } else {
    tips.push({ title: 'After the ride', text: 'Cool down with 5\u201310 minutes of gentle stretching. Hit your quads, hamstrings, and calves while they\'re still warm.' });
  }

  if (subType === 'intervals' || effort === 'hard' || effort === 'max') {
    tips.push({ title: 'Interval tip', text: 'Warm up for at least 10 minutes before hitting any hard efforts. Cool down with easy spinning afterwards.' });
  } else if (subType === 'endurance' || effort === 'easy') {
    tips.push({ title: 'Pacing tip', text: 'Keep it conversational \u2014 you should be able to talk in full sentences. If you can\'t, ease off.' });
  } else if (subType === 'recovery') {
    tips.push({ title: 'Recovery tip', text: 'Keep the effort genuinely easy \u2014 resist the temptation to push. Your legs are rebuilding from harder efforts.' });
  }

  return tips;
}

export default function ActivityDetailScreen({ navigation, route }) {
  const { formatDistance, unit } = useUnits();
  const { activityId, initialEditing } = route.params;
  const [activity, setActivity] = useState(null);
  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);
  // planConfig carries the user's chosen coach; needed so the CoachChatCard
  // renders the correct avatar / name / colour on this screen too.
  const [planConfig, setPlanConfig] = useState(null);
  // Allow callers (e.g. HomeScreen long-press → Edit) to open this screen
  // directly in edit mode so the user doesn't have to tap "Edit" again.
  const [isEditing, setIsEditing] = useState(!!initialEditing);
  const [editValues, setEditValues] = useState({});
  const [showTips, setShowTips] = useState(false);

  // AI chat state
  const [chatText, setChatText] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatStatus, setChatStatus] = useState('');
  const [chatMessages, setChatMessages] = useState([]); // { role: 'user'|'coach', text: string }

  // User prefs drive the intensity-rendering strategy — users with maxHr
  // get bpm instead of %, users with ftp get watts. Absent fields fall
  // back to percentages. Loaded once on mount.
  const [userPrefs, setUserPrefs] = useState(null);
  // Lazy "Explain this session" state — for plans that pre-date the
  // structured-session schema. When tapped, we call the server to
  // synthesise a structure and cache it on the activity.
  const [explaining, setExplaining] = useState(false);
  // Tracks the completion-toggle round-trip (AsyncStorage write + server
  // sync + re-fetch activity). Drives the spinner inside the complete
  // circle so the tap doesn't feel dead while the save is in flight —
  // users reported the tap "taking a while to register". Also blocks
  // re-entry so double-taps don't fire two toggles.
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [explainError, setExplainError] = useState('');

  // Bike swap modal — opened when the rider taps a different bike chip
  // in edit mode. Holds the *target* bike. The modal computes the
  // suggested distance/duration adjustments via utils/bikeSwap.js.
  const [pendingBikeSwap, setPendingBikeSwap] = useState(null);

  // True briefly while we're building the export URL — keeps the share
  // button from being double-tapped while the auth-token round trip is
  // in flight.
  const [exporting, setExporting] = useState(false);
  // ExportInstructionsModal state. We hold the *pending format* here so
  // tapping "Got it — export the file" inside the modal can fire the
  // export with the format the user originally chose. Null = closed.
  const [pendingExportFormat, setPendingExportFormat] = useState(null);

  const scrollRef = useRef(null);

  const loadActivity = async () => {
    const plans = await getPlans();
    const goals = await getGoals();
    for (const p of plans) {
      const a = p.activities?.find(act => act.id === activityId);
      if (a) {
        setPlan(p);
        setActivity(a);
        setGoal(goals.find(g => g.id === p.goalId) || null);
        if (p.configId) {
          const cfg = await getPlanConfig(p.configId);
          if (cfg) setPlanConfig(cfg);
        }
        analytics.events.activityViewed({ activityType: a.type, subType: a.subType, effort: a.effort, week: a.week, completed: !!a.completed });
        setEditValues({
          distanceKm: a.distanceKm?.toString() || '',
          durationMins: a.durationMins?.toString() || '',
          effort: a.effort || 'moderate',
          dayOfWeek: a.dayOfWeek ?? 0,
          // Per-session bike override. Null = "rider's choice / matches
          // plan default". Editable when the rider has > 1 bike type.
          bikeType: a.bikeType || null,
        });
        return;
      }
    }
  };

  useEffect(() => { loadActivity(); }, [activityId]);
  useEffect(() => { getUserPrefs().then(setUserPrefs).catch(() => {}); }, []);

  // "Explain this session" handler — fills in the structure block for
  // legacy activities by calling the server. Caches the result back onto
  // the activity via updateActivity() so the next visit renders instantly.
  const handleExplainSession = async () => {
    if (!activity || explaining) return;
    setExplaining(true);
    setExplainError('');
    try {
      const structure = await explainActivityApi(activity, goal);
      if (!structure) {
        setExplainError('Couldn\'t generate a breakdown right now. Try again in a moment.');
        return;
      }
      await updateActivity(activityId, { structure });
      await loadActivity();
    } catch (err) {
      console.warn('explain-session failed:', err);
      setExplainError('Something went wrong — try again.');
    } finally {
      setExplaining(false);
    }
  };

  const handleComplete = async () => {
    if (savingCompletion) return; // Block double-taps while the save is in flight.
    if (activity && !activity.completed) {
      analytics.events.activityCompleted({ activityType: activity.type, subType: activity.subType, effort: activity.effort, week: activity.week, distanceKm: activity.distanceKm, durationMins: activity.durationMins });
    } else if (activity) {
      analytics.events.activityUncompleted({ activityType: activity.type, week: activity.week });
    }
    setSavingCompletion(true);
    try {
      await markActivityComplete(activityId);
      await loadActivity();
    } finally {
      setSavingCompletion(false);
    }
  };

  const handleSaveEdits = async () => {
    const newDist = parseFloat(editValues.distanceKm) || null;
    const newDur = parseInt(editValues.durationMins) || null;
    const newEffort = editValues.effort;
    const newDay = editValues.dayOfWeek;

    const oldDist = activity.distanceKm;
    const oldDur = activity.durationMins;

    await updateActivity(activityId, {
      distanceKm: newDist,
      durationMins: newDur,
      effort: newEffort,
      dayOfWeek: newDay,
      bikeType: editValues.bikeType || null,
    });

    if (plan && (oldDist !== newDist || oldDur !== newDur)) {
      const distRatio = oldDist && newDist ? newDist / oldDist : 1;
      const durRatio = oldDur && newDur ? newDur / oldDur : 1;

      if (Math.abs(distRatio - 1) > 0.05 || Math.abs(durRatio - 1) > 0.05) {
        const updatedPlan = { ...plan, activities: plan.activities.map(a => {
          if (a.id === activityId) return a;
          if (a.week < activity.week) return a;
          if (a.week === activity.week && (a.dayOfWeek ?? 0) <= (activity.dayOfWeek ?? 0)) return a;
          if (a.type !== activity.type) return a;
          if (a.completed) return a;

          return {
            ...a,
            distanceKm: a.distanceKm ? Math.round(a.distanceKm * distRatio) : a.distanceKm,
            durationMins: a.durationMins ? Math.round(a.durationMins * durRatio) : a.durationMins,
          };
        })};

        const idx = updatedPlan.activities.findIndex(a => a.id === activityId);
        if (idx >= 0) {
          updatedPlan.activities[idx] = {
            ...updatedPlan.activities[idx],
            distanceKm: newDist,
            durationMins: newDur,
            effort: newEffort,
            dayOfWeek: newDay,
          };
        }

        await savePlan(updatedPlan);
      }
    }

    const changedFields = [];
    if (parseFloat(editValues.distanceKm) !== activity.distanceKm) changedFields.push('distance');
    if (parseInt(editValues.durationMins) !== activity.durationMins) changedFields.push('duration');
    if (editValues.effort !== activity.effort) changedFields.push('effort');
    if (editValues.dayOfWeek !== (activity.dayOfWeek ?? 0)) changedFields.push('day');
    if (changedFields.length > 0) {
      analytics.events.activityEditedManual({ activityType: activity.type, week: activity.week, changedFields });
    }
    setIsEditing(false);
    await loadActivity();
  };

  // AI chat handler
  const handleChatSend = async () => {
    if (!chatText.trim() || chatLoading) return;
    const msg = chatText.trim();
    setChatText('');
    Keyboard.dismiss();

    setChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setChatLoading(true);

    try {
      const result = await editActivityWithAI(activity, goal, msg, setChatStatus);

      if (result.answer) {
        setChatMessages(prev => [...prev, { role: 'coach', text: result.answer }]);
      }

      if (result.updatedActivity) {
        analytics.events.activityEditedAI({ activityType: activity.type, subType: activity.subType, week: activity.week, hadChanges: true });
        // Apply the AI's changes to the activity
        const updates = {};
        if (result.updatedActivity.title) updates.title = result.updatedActivity.title;
        if (result.updatedActivity.description) updates.description = result.updatedActivity.description;
        if (result.updatedActivity.notes !== undefined) updates.notes = result.updatedActivity.notes;
        if (result.updatedActivity.durationMins) updates.durationMins = result.updatedActivity.durationMins;
        if (result.updatedActivity.distanceKm !== undefined) updates.distanceKm = result.updatedActivity.distanceKm;
        if (result.updatedActivity.effort) updates.effort = result.updatedActivity.effort;
        if (result.updatedActivity.subType !== undefined) updates.subType = result.updatedActivity.subType;

        await updateActivity(activityId, updates);
        await loadActivity();
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'coach', text: 'Sorry, something went wrong. Try again.' }]);
    }

    setChatLoading(false);
    setChatStatus('');

    // Scroll to bottom
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  if (!activity) return null;

  const isRide = activity.type === 'ride';
  const isStrength = activity.type === 'strength';
  const effortColor = ACTIVITY_BLUE;

  // Bike-type override: every ride session shows all five bike chips
  // (Road / Gravel / MTB / E-bike / Indoor) regardless of what the
  // rider configured at intake. Per-session swap is a "today only" call
  // — they might have set up the plan as Road but actually be doing
  // Tuesday on gravel because the road's icy. Goal-level cyclingTypes
  // is no longer used to filter the chip list; it stays around as a
  // defaulting hint for the plan generator only.
  const allBikeOptions = BIKE_KEYS; // ['road','gravel','mtb','ebike','indoor']
  const showBikeRow = isRide;

  // Indoor session detection — drives the "Send to trainer" card. We
  // count a session as indoor if its subType is 'indoor', the rider
  // chose 'indoor' as the bike for it, or the title/description make
  // it obvious. Outdoor rides could theoretically be exported too but
  // we deliberately scope this UI to indoor sessions where the export
  // is genuinely useful.
  const isIndoorSession =
    isRide && (
      activity.subType === 'indoor' ||
      activity.bikeType === 'indoor' ||
      /indoor|trainer|turbo|zwift/i.test(activity.title || '') ||
      /indoor|trainer|turbo/i.test(activity.description || '')
    );

  // Format chosen — decide whether to show the instructions modal or
  // skip straight to the export. We surface the modal by default and
  // honour the rider's "don't show this again" pref. Power users tap
  // it once, opt out, and never see it again.
  const handleExportFormatChosen = (format) => {
    if (userPrefs?.hideExportInstructions) {
      runExport(format);
    } else {
      setPendingExportFormat(format);
    }
  };

  // Actually fire the export. Mints a one-shot signed URL on the server
  // (POST /export-url) and opens it via the OS browser. iOS will then
  // offer an "Open with…" sheet for apps that registered .zwo / .mrc;
  // Android browsers download the file and offer an Intent picker. We
  // don't need a native share dependency for this.
  const runExport = async (format) => {
    if (!plan?.id || !activity?.id || exporting) return;
    setExporting(true);
    try {
      const url = await buildWorkoutExportUrl(plan.id, activity.id, format);
      if (!url) {
        Alert.alert('Sign-in needed', 'Sign back in and try the export again.');
        return;
      }
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Couldn\'t open the link', 'Your device blocked the export URL.');
        return;
      }
      analytics.events.activityExported?.({ activityId: activity.id, format });
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Export failed', 'We couldn\'t generate the workout file. Try again in a moment.');
    } finally {
      setExporting(false);
    }
  };

  // Kept around so existing call-sites that referenced the old name keep
  // working. Just delegates to handleExportFormatChosen.
  const handleExportWorkout = handleExportFormatChosen;

  // Picker for which file format to export. iOS gets the native action
  // sheet; Android falls back to an Alert. ZWO is the headline option
  // (works in Zwift, Rouvy, MyWhoosh, Wahoo SYSTM, TrainerRoad import).
  // MRC is the universal text-format fallback.
  const showExportPicker = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Send this session to your trainer',
          message: 'Pick a file format. After you tap, choose your trainer app from the share sheet.',
          options: ['Zwift / Wahoo SYSTM / Rouvy (.zwo)', 'Older trainer apps (.mrc)', 'Cancel'],
          cancelButtonIndex: 2,
        },
        (idx) => {
          if (idx === 0) handleExportWorkout('zwo');
          else if (idx === 1) handleExportWorkout('mrc');
        },
      );
    } else {
      Alert.alert(
        'Send this session to your trainer',
        'Pick a file format.',
        [
          { text: 'Zwift / Wahoo / Rouvy (.zwo)', onPress: () => handleExportWorkout('zwo') },
          { text: 'Older apps (.mrc)', onPress: () => handleExportWorkout('mrc') },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    }
  };
  // Plan default ("from-bike" for the swap calc). Order of preference:
  // (1) the activity's own bikeType (set by the plan generator or a
  // previous swap), (2) anything in editValues mid-edit, (3) the goal's
  // first configured bike, (4) the legacy single field, (5) road as a
  // sensible last-resort default.
  const planDefaultBike = (Array.isArray(goal?.cyclingTypes) && goal.cyclingTypes[0])
    || goal?.cyclingType
    || 'road';
  const currentBike = activity.bikeType || editValues.bikeType || planDefaultBike;

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : (StatusBar.currentHeight ?? 0)}
        >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Activity</Text>
          {!isEditing ? (
            <TouchableOpacity onPress={() => setIsEditing(true)} hitSlop={HIT}>
              <Text style={s.editBtn}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleSaveEdits} hitSlop={HIT}>
              <Text style={s.saveBtn}>Save</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView ref={scrollRef} style={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Title card — the completion toggle now lives here in the
              header as a circular checkbox next to the title, matching
              the pattern used in HomeScreen's week list. Previously the
              "Mark as complete" action was a big pink button at the
              bottom of the screen; users consistently missed it and
              the inconsistency between list-row checkmark and detail-
              screen big-button looked like two different concepts. */}
          <View style={s.titleCard}>
            <View style={[s.typeTag, { backgroundColor: effortColor + '20' }]}>
              <Text style={[s.typeTagText, { color: effortColor }]}>
                {isStrength ? 'strength' : (activity.subType || 'ride')}
              </Text>
            </View>
            <View style={s.titleRow}>
              <Text style={[s.title, activity.completed && s.titleDone]}>{activity.title}</Text>
              <TouchableOpacity
                onPress={handleComplete}
                style={[s.completeCircle, activity.completed && s.completeCircleDone]}
                hitSlop={HIT}
                activeOpacity={0.7}
                disabled={savingCompletion}
                accessibilityLabel={activity.completed ? 'Mark as incomplete' : 'Mark as complete'}
              >
                {/* While saving, show a small spinner inside the circle
                    so the tap feels responsive. Tick colour matches the
                    done state so the swap reads as one element. */}
                {savingCompletion ? (
                  <ActivityIndicator size="small" color={activity.completed ? '#fff' : colors.primary} />
                ) : activity.completed ? (
                  <Text style={s.completeTick}>{'\u2713'}</Text>
                ) : null}
              </TouchableOpacity>
            </View>
            <Text style={s.titleHint}>
              {savingCompletion
                ? 'Saving…'
                : activity.completed ? 'Completed — tap the tick to undo' : 'Tap the circle to mark as complete'}
            </Text>
          </View>

          {/* Metrics — editable */}
          {isRide && (
            <View style={s.metricsCard}>
              {isEditing ? (
                <>
                  <View style={s.metric}>
                    <Text style={s.metricLabel}>DISTANCE</Text>
                    <TextInput
                      style={s.metricInput}
                      value={editValues.distanceKm}
                      onChangeText={v => setEditValues(prev => ({ ...prev, distanceKm: v }))}
                      keyboardType="numeric"
                      placeholder={unit}
                      placeholderTextColor={colors.textFaint}
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
                    />
                    <Text style={s.metricUnit}>{unit}</Text>
                  </View>
                  <View style={s.metric}>
                    <Text style={s.metricLabel}>DURATION</Text>
                    <TextInput
                      style={s.metricInput}
                      value={editValues.durationMins}
                      onChangeText={v => setEditValues(prev => ({ ...prev, durationMins: v }))}
                      keyboardType="numeric"
                      placeholder="min"
                      placeholderTextColor={colors.textFaint}
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
                    />
                    <Text style={s.metricUnit}>min</Text>
                  </View>
                </>
              ) : (
                <>
                  {activity.distanceKm != null && (
                    <View style={s.metric}>
                      <Text style={s.metricLabel}>DISTANCE</Text>
                      <Text style={s.metricValue}>{formatDistance(activity.distanceKm)}</Text>
                    </View>
                  )}
                  {activity.durationMins != null && (
                    <View style={s.metric}>
                      <Text style={s.metricLabel}>DURATION</Text>
                      <Text style={s.metricValue}>{activity.durationMins} min</Text>
                    </View>
                  )}
                </>
              )}
              <View style={s.metric}>
                <Text style={s.metricLabel}>EFFORT</Text>
                {isEditing ? (
                  <TouchableOpacity onPress={() => {
                    const idx = EFFORT_LIST.indexOf(editValues.effort);
                    const next = EFFORT_LIST[(idx + 1) % EFFORT_LIST.length];
                    setEditValues(prev => ({ ...prev, effort: next }));
                  }}>
                    <Text style={[s.metricValue, { color: ACTIVITY_BLUE }]}>
                      {editValues.effort} {'\u25BE'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[s.metricValue, { color: effortColor }]}>{activity.effort}</Text>
                )}
              </View>
            </View>
          )}

          {/* Bike-type swap — every ride shows all five bike chips so
              the rider can swap to anything on the fly, regardless of
              what they configured at intake. Selected chip is
              highlighted by colour alone (no checkmark glyph — the fill
              is the affordance). Tapping a different chip opens the
              BikeSwapModal with the coach-derived distance/duration
              adjustment. In edit mode the result lands in editValues;
              outside edit mode it persists immediately via updateActivity
              so swap-from-anywhere is one fluent interaction. */}
          {showBikeRow && (
            <View style={s.bikeCard}>
              <View style={s.bikeCardHeader}>
                <Text style={s.bikeCardLabel}>BIKE</Text>
                <Text style={s.bikeCardHelp}>Tap to swap</Text>
              </View>
              <View style={s.bikeChipsRow}>
                {allBikeOptions.map(b => {
                  const selected = currentBike === b;
                  const label = BIKE_LABEL_MAP[b] || b;
                  const onPress = () => {
                    if (selected) return;
                    setPendingBikeSwap({ from: currentBike, to: b });
                  };
                  return (
                    <TouchableOpacity
                      key={b}
                      style={[s.bikeChip, selected && s.bikeChipSelected]}
                      onPress={onPress}
                      activeOpacity={0.7}
                      accessibilityLabel={selected ? `${label} bike, currently selected` : `Swap to ${label}`}
                    >
                      <Text style={[s.bikeChipText, selected && s.bikeChipTextSelected]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Strength duration */}
          {isStrength && (
            <View style={s.metricsCard}>
              <View style={s.metric}>
                <Text style={s.metricLabel}>DURATION</Text>
                {isEditing ? (
                  <View>
                    <TextInput
                      style={s.metricInput}
                      value={editValues.durationMins}
                      onChangeText={v => setEditValues(prev => ({ ...prev, durationMins: v }))}
                      keyboardType="numeric"
                      placeholderTextColor={colors.textFaint}
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
                    />
                    <Text style={s.metricUnit}>min</Text>
                  </View>
                ) : (
                  <Text style={s.metricValue}>{activity.durationMins} min</Text>
                )}
              </View>
              <View style={s.metric}>
                <Text style={s.metricLabel}>INTENSITY</Text>
                <Text style={[s.metricValue, { color: effortColor }]}>{activity.effort}</Text>
              </View>
            </View>
          )}

          {/* Day selector in edit mode.
              Under each day pill we show what's already scheduled on that
              day in the same week so the user can see "Tue is already a
              ride" before moving this session onto it. The current
              activity itself is excluded from the summary (otherwise every
              day shows its own session). */}
          {isEditing && (() => {
            // Build a per-day-of-week summary for the current activity's week.
            const scheduleByDay = Array.from({ length: 7 }, () => []);
            (plan?.activities || []).forEach((a) => {
              if (a.id === activity.id) return; // hide self
              if ((a.week ?? 1) !== (activity.week ?? 1)) return;
              scheduleByDay[a.dayOfWeek ?? 0].push(a);
            });
            const summarise = (acts) => {
              if (!acts.length) return null;
              const primary = acts[0];
              if (acts.length === 1) {
                if (primary.type === 'strength') return 'Strength';
                if (primary.distanceKm) return formatDistance(primary.distanceKm);
                if (primary.durationMins) return `${primary.durationMins} min`;
                return 'Session';
              }
              return `${acts.length} sessions`;
            };
            return (
              <View style={s.daySelectorCard}>
                <Text style={s.daySelectorLabel}>DAY</Text>
                <View style={s.daySelectorRow}>
                  {DAY_NAMES.map((name, i) => {
                    const busy = scheduleByDay[i];
                    const summary = summarise(busy);
                    const isSelected = editValues.dayOfWeek === i;
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[s.dayPillCol, isSelected && s.dayPillColActive]}
                        onPress={() => setEditValues(prev => ({ ...prev, dayOfWeek: i }))}
                      >
                        <Text style={[s.dayPillText, isSelected && s.dayPillTextActive]}>{name}</Text>
                        <Text
                          style={[
                            s.dayPillSummary,
                            isSelected && s.dayPillSummaryActive,
                            !summary && s.dayPillSummaryRest,
                          ]}
                          numberOfLines={1}
                        >
                          {summary || 'Rest'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })()}

          {/* Cascade notice */}
          {isEditing && (
            <View style={s.cascadeNotice}>
              <Text style={s.cascadeText}>Changes to distance or duration will proportionally adjust all future sessions of this type</Text>
            </View>
          )}

          {/* Effort guide */}
          {!isEditing && activity.effort && EFFORT_LABELS[activity.effort] && (
            <View style={s.effortGuide}>
              <View style={[s.effortDot, { backgroundColor: effortColor }]} />
              <Text style={s.effortGuideText}>{EFFORT_LABELS[activity.effort]}</Text>
            </View>
          )}

          {/* Description */}
          <View style={s.descCard}>
            <Text style={s.descTitle}>What to do</Text>
            <Text style={s.descBody}>{activity.description}</Text>
          </View>

          {/* Session breakdown — only for rides where intensity actually
              matters (intervals / tempo / hard / max). For easy endurance
              rides the "What to do" card above is enough context, and
              rendering a "session breakdown" with recovery-level RPE adds
              noise without information. */}
          {isRide && !isEditing && (() => {
            const needsBreakdown = activity.subType === 'intervals'
              || activity.subType === 'tempo'
              || activity.effort === 'hard'
              || activity.effort === 'max';
            if (!needsBreakdown) return null;
            return activity.structure
              ? renderStructurePanel(activity.structure, userPrefs)
              : renderExplainCta({ onPress: handleExplainSession, loading: explaining, error: explainError });
          })()}

          {/* Tips — rides only */}
          {isRide && !isEditing && (
            <>
              {!showTips ? (
                <TouchableOpacity
                  style={s.tipsBtn}
                  onPress={() => setShowTips(true)}
                  activeOpacity={0.8}
                >
                  <Text style={s.tipsBtnText}>Show ride tips</Text>
                  <Text style={s.tipsBtnArrow}>{'\u203A'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.tipsCard}>
                  <View style={s.tipsHeader}>
                    <Text style={s.tipsTitle}>Ride tips</Text>
                    <TouchableOpacity onPress={() => setShowTips(false)} hitSlop={HIT}>
                      <Text style={s.tipsHide}>Hide</Text>
                    </TouchableOpacity>
                  </View>
                  {generateRideTips(activity).map((tip, idx) => (
                    <View key={idx} style={s.tipRow}>
                      <View style={s.tipDot} />
                      <View style={s.tipContent}>
                        <Text style={s.tipTitle}>{tip.title}</Text>
                        <Text style={s.tipText}>{tip.text}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Notes */}
          {activity.notes && (
            <View style={s.notesCard}>
              <Text style={s.notesTitle}>Notes</Text>
              <Text style={s.notesBody}>{activity.notes}</Text>
            </View>
          )}

          {/* Strava link */}
          {activity.stravaActivityId && (
            <View style={s.stravaCard}>
              <Text style={s.stravaLabel}>Strava Activity</Text>
              <Text style={s.stravaId}>#{activity.stravaActivityId}</Text>
              {activity.stravaData && (
                <Text style={s.stravaMeta}>
                  {activity.stravaData.distance ? `${(activity.stravaData.distance / 1000).toFixed(1)} km` : ''}
                  {activity.stravaData.time ? ` \u00B7 ${Math.round(activity.stravaData.time / 60)} min` : ''}
                </Text>
              )}
            </View>
          )}

          {/* AI chat history */}
          {chatMessages.length > 0 && (
            <View style={s.chatHistory}>
              <Text style={s.chatHistoryTitle}>Coach chat</Text>
              {chatMessages.map((msg, idx) => (
                <View key={idx} style={[s.chatBubble, msg.role === 'user' ? s.chatBubbleUser : s.chatBubbleCoach]}>
                  <Text style={[s.chatBubbleText, msg.role === 'user' ? s.chatBubbleTextUser : s.chatBubbleTextCoach]}>
                    {msg.text}
                  </Text>
                </View>
              ))}
            </View>
          )}


          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Send-to-trainer button — shown for indoor rides only.
            Compact, button-like styling to read as an action rather
            than another notes-style card (the previous treatment was
            too close in size and shape to the "What to do" prose card
            above and confused testers). Leading export icon, single-
            line label, trailing chevron. */}
        {!isEditing && isIndoorSession && (
          <TouchableOpacity
            style={s.exportRow}
            onPress={showExportPicker}
            activeOpacity={0.85}
            disabled={exporting}
            accessibilityLabel="Send this indoor session to your trainer"
          >
            <View style={s.exportRowIcon}>
              <MaterialCommunityIcons
                name="export-variant"
                size={16}
                color={colors.primary}
              />
            </View>
            <View style={s.exportRowText}>
              <Text style={s.exportRowTitle}>Send to your trainer</Text>
              <Text style={s.exportRowSub} numberOfLines={1}>
                Zwift, Wahoo SYSTM, Rouvy &amp; more
              </Text>
            </View>
            {exporting
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={s.exportRowArrow}>{'\u203A'}</Text>}
          </TouchableOpacity>
        )}

        {/* Coach chat entry-point — same CoachChatCard component used on
            Home and Week view, so the "ask your coach" action looks the
            same wherever it appears. Previously this screen had a small
            chat input bar inline, which diverged from the card pattern
            and made the coach entry feel like a different feature here. */}
        {!isEditing && (
          <View style={s.coachCardBar}>
            <CoachChatCard
              coach={getCoach(planConfig?.coachId)}
              // Open the chat scoped to THIS session — the chat thread
              // persists separately per activity (see CoachChatScreen
              // chatKey) and the coach is grounded to discuss only this
              // ride. Replies don't bump the home-screen coach chip.
              onPress={() => navigation.navigate('CoachChat', { planId: plan?.id, activityId: activity.id })}
              subtitleOverride={`Ask about this ${isStrength ? 'strength session' : 'ride'} or tweak it with your coach`}
            />
          </View>
        )}
        </KeyboardAvoidingView>
      </SafeAreaView>
      {/* Bike swap suggestion sheet — opened from the Bike chip row above
          when the rider taps a different bike in edit mode. */}
      <BikeSwapModal
        visible={!!pendingBikeSwap}
        session={activity}
        fromBike={pendingBikeSwap?.from}
        toBike={pendingBikeSwap?.to}
        onApply={async ({ bikeType, durationMins, distanceKm }) => {
          // In edit mode the swap stays in editValues until the user
          // taps Save — keeps the standard "edit + commit" flow intact
          // for users who want to adjust other fields too. Outside edit
          // mode we persist directly via updateActivity so swap-from-
          // anywhere is a single fluent interaction.
          if (isEditing) {
            setEditValues(prev => ({
              ...prev,
              bikeType,
              durationMins: durationMins != null ? String(durationMins) : prev.durationMins,
              distanceKm: distanceKm != null ? String(distanceKm) : '',
            }));
          } else {
            await updateActivity(activityId, {
              bikeType,
              durationMins: durationMins ?? activity.durationMins,
              distanceKm: distanceKm,
            });
            await loadActivity();
          }
          analytics.events.activityEditedManual?.({
            activityType: activity.type,
            week: activity.week,
            changedFields: ['bikeType', 'distance', 'duration'],
          });
          setPendingBikeSwap(null);
        }}
        onApplyOriginal={async ({ bikeType }) => {
          // "Keep original numbers" — only the bike changes. Same edit
          // vs out-of-edit branching as above.
          if (isEditing) {
            setEditValues(prev => ({ ...prev, bikeType }));
          } else {
            await updateActivity(activityId, { bikeType });
            await loadActivity();
          }
          analytics.events.activityEditedManual?.({
            activityType: activity.type,
            week: activity.week,
            changedFields: ['bikeType'],
          });
          setPendingBikeSwap(null);
        }}
        onCancel={() => setPendingBikeSwap(null)}
      />
      {/* First-time export instructions. Suppressed by the "Don't show
          this again" checkbox — handled inside the modal via setUserPrefs. */}
      <ExportInstructionsModal
        visible={!!pendingExportFormat}
        onProceed={() => {
          const fmt = pendingExportFormat;
          setPendingExportFormat(null);
          // Refresh prefs so subsequent exports honour the new "don't
          // show again" pref without needing to refocus the screen.
          getUserPrefs().then(setUserPrefs).catch(() => {});
          runExport(fmt);
        }}
        onCancel={() => setPendingExportFormat(null)}
      />
    </View>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

// ── Session breakdown renderer ────────────────────────────────────────────
// Takes a structure object ({warmup, main, cooldown}) and renders the three
// stages with the triple-intensity view (RPE + HR + power) for the main
// set. Kept outside the component so it can be reused from other detail
// surfaces later (e.g. week-preview summary) without duplication.
function renderStructurePanel(structure, userPrefs) {
  if (!structure) return null;
  const { warmup, main, cooldown } = structure;
  const intensity = main?.intensity;
  const rpeLine = formatRpe(intensity);
  const hrLine = formatHeartRate(intensity, userPrefs);
  const powerLine = shouldShowPower(intensity, userPrefs) ? formatPower(intensity, userPrefs) : null;

  // Main set label — build a natural-sounding summary from the numeric
  // fields so users see "4 × 4 min hard, 3 min easy between" rather than
  // a raw key-value dump. Falls back to a generic label when shape is
  // unexpected (won't happen with server-validated structures, but belt
  // and braces for manually edited plans).
  let mainLabel = 'Main set';
  if (main?.type === 'intervals' && main.reps && main.workMins) {
    mainLabel = `${main.reps} × ${main.workMins} min`;
    if (main.restMins) mainLabel += `, ${main.restMins} min easy between`;
  } else if (main?.type === 'tempo' && main.blockMins) {
    mainLabel = `${main.blockMins} min sustained tempo`;
  } else if (main?.type === 'steady' && main.blockMins) {
    mainLabel = `${main.blockMins} min steady`;
  }

  return (
    <View style={structureStyles.panel}>
      <Text style={structureStyles.panelTitle}>How to do this session</Text>

      {warmup && (
        <View style={structureStyles.stage}>
          <View style={structureStyles.stageHead}>
            <MaterialCommunityIcons name="play-speed" size={14} color={colors.textMuted} />
            <Text style={structureStyles.stageLabel}>Warm up · {warmup.durationMins || '?'} min</Text>
          </View>
          {warmup.description ? <Text style={structureStyles.stageBody}>{warmup.description}</Text> : null}
        </View>
      )}

      {main && (
        <View style={[structureStyles.stage, structureStyles.stageMain]}>
          <View style={structureStyles.stageHead}>
            <MaterialCommunityIcons name="fire" size={14} color={colors.primary} />
            <Text style={[structureStyles.stageLabel, structureStyles.stageLabelMain]}>{mainLabel}</Text>
          </View>
          {main.description ? <Text style={structureStyles.stageBody}>{main.description}</Text> : null}

          {/* Triple-intensity block — RPE always, HR and power conditional */}
          {(rpeLine || hrLine || powerLine) && (
            <View style={structureStyles.intensityBlock}>
              {rpeLine && (
                <View style={structureStyles.intensityRow}>
                  <Text style={structureStyles.intensityKey}>Feel</Text>
                  <Text style={structureStyles.intensityVal}>{rpeLine}</Text>
                </View>
              )}
              {hrLine && (
                <View style={structureStyles.intensityRow}>
                  <Text style={structureStyles.intensityKey}>Heart rate</Text>
                  <Text style={structureStyles.intensityVal}>{hrLine}</Text>
                </View>
              )}
              {powerLine && (
                <View style={structureStyles.intensityRow}>
                  <Text style={structureStyles.intensityKey}>Power</Text>
                  <Text style={structureStyles.intensityVal}>{powerLine}</Text>
                </View>
              )}
            </View>
          )}

          {/* Only show the "set your own numbers" nudge when we're rendering
              % ranges AND the user hasn't told us their max HR / FTP. Once
              they've entered them we silently swap to actual numbers. */}
          {!userPrefs?.maxHr && !userPrefs?.ftp && (hrLine || powerLine) && (
            <Text style={structureStyles.prefsNudge}>
              Add your max heart rate or FTP in Settings to see bpm and watt targets instead of percentages.
            </Text>
          )}
        </View>
      )}

      {cooldown && (
        <View style={structureStyles.stage}>
          <View style={structureStyles.stageHead}>
            <MaterialCommunityIcons name="snowflake" size={14} color={colors.textMuted} />
            <Text style={structureStyles.stageLabel}>Cool down · {cooldown.durationMins || '?'} min</Text>
          </View>
          {cooldown.description ? <Text style={structureStyles.stageBody}>{cooldown.description}</Text> : null}
        </View>
      )}
    </View>
  );
}

// Legacy-plan escape hatch: structure-free activity shows a button that
// triggers the server to synthesise one. First tap costs a Claude call and
// is cached back on the activity for instant subsequent loads.
function renderExplainCta({ onPress, loading, error }) {
  return (
    <View style={structureStyles.explainCard}>
      <Text style={structureStyles.explainTitle}>Want a proper breakdown?</Text>
      <Text style={structureStyles.explainBody}>
        Get warm-up, main set, and cool-down laid out in plain English — with heart rate and effort targets you can actually use.
      </Text>
      {error ? <Text style={structureStyles.explainError}>{error}</Text> : null}
      <TouchableOpacity
        style={[structureStyles.explainBtn, loading && structureStyles.explainBtnDisabled]}
        onPress={onPress}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={structureStyles.explainBtnText}>Explain this session</Text>}
      </TouchableOpacity>
    </View>
  );
}

// Styles isolated from the main sheet so the breakdown panel can be
// dropped into other screens later without dragging the rest of the
// ActivityDetail stylesheet along.
const structureStyles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: colors.border,
  },
  panelTitle: {
    fontSize: 14, fontWeight: '600', fontFamily: fontFamily.semibold,
    color: colors.text, marginBottom: 12,
  },

  stage: { paddingVertical: 8 },
  stageMain: {
    backgroundColor: 'rgba(232,69,139,0.06)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12, marginVertical: 2,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.18)',
  },
  stageHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  stageLabel: {
    fontSize: 13, fontWeight: '600', fontFamily: fontFamily.semibold,
    color: colors.text,
  },
  stageLabelMain: { color: colors.primary },
  stageBody: {
    fontSize: 13, fontWeight: '400', fontFamily: fontFamily.regular,
    color: colors.textMid, lineHeight: 19, marginTop: 2,
  },

  intensityBlock: {
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(232,69,139,0.14)',
    gap: 6,
  },
  intensityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  intensityKey: {
    width: 84, fontSize: 11, fontWeight: '600', fontFamily: fontFamily.semibold,
    color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 2,
  },
  intensityVal: {
    flex: 1, fontSize: 13, fontWeight: '400', fontFamily: fontFamily.regular,
    color: colors.text, lineHeight: 18,
  },

  prefsNudge: {
    marginTop: 10, fontSize: 11, fontWeight: '400', fontFamily: fontFamily.regular,
    color: colors.textFaint, fontStyle: 'italic', lineHeight: 15,
  },

  // Explain CTA — shown on legacy activities without structure. Pink-tinted
  // to match the rest of the accent treatment on this screen.
  explainCard: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.25)',
  },
  explainTitle: {
    fontSize: 14, fontWeight: '600', fontFamily: fontFamily.semibold,
    color: colors.text, marginBottom: 6,
  },
  explainBody: {
    fontSize: 13, fontWeight: '400', fontFamily: fontFamily.regular,
    color: colors.textMid, lineHeight: 19, marginBottom: 12,
  },
  explainError: {
    fontSize: 12, fontFamily: fontFamily.medium, color: '#EF4444', marginBottom: 8,
  },
  explainBtn: {
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  explainBtnDisabled: { opacity: 0.7 },
  explainBtnText: {
    fontSize: 14, fontWeight: '600', fontFamily: fontFamily.semibold, color: '#fff',
  },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, textAlign: 'center' },
  editBtn: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  saveBtn: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: '#E8458B' },

  scroll: { flex: 1 },

  titleCard: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  typeTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 10 },
  typeTagText: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  // Title row — the completion toggle sits to the right of the title,
  // mirroring the week-list in HomeScreen (and ActivityDetail's old
  // "Mark as complete" button at the bottom, which users often missed).
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Apr 27 2026: dropped 22 → 18 so the activity hero sits closer in
  // weight to the rest of the app's typography. The previous 22pt
  // felt cavernous on its own card and left this screen looking
  // visually heavier than the home-screen heroes that link into it.
  title: { flex: 1, fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, lineHeight: 22 },
  titleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  titleHint: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginTop: 8 },
  // Circular checkbox toggle — visually identical to the week-list
  // version in HomeScreen so the "mark complete" idiom stays one
  // consistent shape across the app.
  completeCircle: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  completeCircleDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  completeTick: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 18 },

  metricsCard: {
    flexDirection: 'row', backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border,
  },
  metric: { flex: 1, padding: 16, alignItems: 'center', borderRightWidth: 0.5, borderRightColor: colors.border },
  metricLabel: { fontSize: 10, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  // Dropped 18 → 16 so longer effort labels ("moderate", "recovery")
  // fit on a single line in the third metric column. At 18pt those
  // wrapped to two lines and pushed the metric card vertically
  // out of alignment with the other two columns.
  metricValue: { fontSize: 16, fontWeight: '500', fontFamily: FF.medium, color: colors.text, textAlign: 'center' },
  metricInput: {
    fontSize: 16, fontWeight: '500', fontFamily: FF.medium, color: colors.text,
    textAlign: 'center',
    // Stretch to fill the parent column so the pink focus underline spans
    // the whole metric cell, not just a tiny segment under the typed
    // number. Parent `metric` has alignItems:'center' which otherwise
    // shrinks the input to its content width — override that here.
    alignSelf: 'stretch',
    borderBottomWidth: 1.5, borderBottomColor: colors.primary,
    paddingVertical: 4, paddingHorizontal: 8,
  },
  metricUnit: { fontSize: 10, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 2, textAlign: 'center' },

  // Bike-type override row. Hidden when the goal carries only one
  // bike type. Tapping a chip in edit mode opens BikeSwapModal.
  bikeCard: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 16,
    padding: 14, borderWidth: 1, borderColor: colors.border,
  },
  // Header row holds the BIKE label on the left and a "Tap to swap"
  // hint on the right — makes the chips read as actionable without
  // requiring the rider to enter edit mode first.
  bikeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  bikeCardLabel: { fontSize: 10, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  bikeCardHelp: { fontSize: 10, fontWeight: '500', fontFamily: FF.medium, color: colors.primary, letterSpacing: 0.4 },
  // Bike chips — sized for fat fingers. 8 → 10pt vertical, 14 → 18pt
  // horizontal, font 12 → 14pt. The selected state uses a stronger
  // border (1.5pt) so the active chip pops at a glance from across
  // the screen.
  bikeChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bikeChip: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1, borderColor: colors.border,
    minWidth: 72, alignItems: 'center',
  },
  bikeChipSelected: {
    backgroundColor: colors.primary + '22',
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  bikeChipText: { fontSize: 14, color: colors.textMid, fontFamily: FF.regular },
  bikeChipTextSelected: { color: colors.text, fontWeight: '600', fontFamily: FF.semibold },
  bikeHint: { fontSize: 11, color: colors.textMuted, fontFamily: FF.regular, marginTop: 8 },
  // Single-bike state — shown under the read-only chip with a CTA to
  // PlanPicker so the rider can widen the bike menu without rebuilding
  // the whole plan. Subtle so it doesn't pull focus from the session
  // info.
  bikeAddMoreRow: {
    marginTop: 10, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  bikeAddMoreText: {
    fontSize: 12, fontFamily: FF.medium, fontWeight: '500',
    color: colors.primary, letterSpacing: 0.2,
  },

  // Send-to-trainer button — compact single-line action row with a
  // leading icon. Smaller scale than the prose "What to do" card above
  // it so the two read as different element types (notes vs action).
  exportRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 12,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 0.5, borderColor: colors.primary + '55',
  },
  exportRowIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.primary + '1A',
    alignItems: 'center', justifyContent: 'center',
  },
  exportRowText: { flex: 1, flexDirection: 'column' },
  exportRowTitle: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  exportRowSub: { fontSize: 11, color: colors.textMuted, fontFamily: FF.regular, marginTop: 1 },
  exportRowArrow: { fontSize: 22, color: colors.textMuted, fontFamily: FF.regular, lineHeight: 22 },

  daySelectorCard: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  daySelectorLabel: { fontSize: 10, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  daySelectorRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surfaceLight },
  dayPillActive: { backgroundColor: colors.primary },
  dayPillText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },
  dayPillTextActive: { color: '#fff' },
  // Column variant of the day pill — stacks the day letters on top of a
  // small summary line ("8 km", "Rest", "2 sessions") so the user knows
  // what's already scheduled on each day before choosing to move here.
  dayPillCol: {
    flex: 1, minWidth: 38,
    paddingHorizontal: 4, paddingVertical: 6,
    borderRadius: 8, backgroundColor: colors.surfaceLight,
    alignItems: 'center', marginHorizontal: 2,
  },
  dayPillColActive: { backgroundColor: colors.primary },
  dayPillSummary: {
    fontSize: 9, fontWeight: '500', fontFamily: FF.medium,
    color: colors.textMid, marginTop: 2, letterSpacing: 0.2,
  },
  dayPillSummaryActive: { color: 'rgba(255,255,255,0.85)' },
  dayPillSummaryRest: { color: colors.textFaint, fontStyle: 'italic' },

  cascadeNotice: { marginHorizontal: 20, marginBottom: 12 },
  cascadeText: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, fontStyle: 'italic' },

  effortGuide: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, marginBottom: 12 },
  effortDot: { width: 8, height: 8, borderRadius: 4 },
  effortGuideText: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid },

  descCard: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  descTitle: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 8 },
  // Dropped 15 → 13 with lineHeight 19 to match the body copy on
  // HomeScreen and the rest of the app — the previous 15pt body felt
  // a step heavier than every other paragraph in the app.
  descBody: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 19 },

  // Tips
  tipsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  tipsBtnDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  tipsBtnText: { flex: 1, fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  tipsBtnArrow: { fontSize: 20, color: colors.primary, fontWeight: '300' },

  tipsCard: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.25)',
  },
  tipsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  tipsTitle: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  tipsHide: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },

  tipRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  tipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 7 },
  tipContent: { flex: 1 },
  tipTitle: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary, marginBottom: 3 },
  tipText: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 19 },

  notesCard: {
    backgroundColor: 'rgba(232,69,139,0.08)', marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.2)',
  },
  notesTitle: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary, marginBottom: 6 },
  notesBody: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 20 },

  stravaCard: {
    backgroundColor: 'rgba(249,115,22,0.08)', marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(249,115,22,0.2)',
  },
  stravaLabel: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, color: '#FB923C', marginBottom: 4 },
  stravaId: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  stravaMeta: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, marginTop: 4 },

  // AI chat
  chatHistory: { marginHorizontal: 16, marginBottom: 12 },
  chatHistoryTitle: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  chatBubble: { borderRadius: 14, padding: 14, marginBottom: 8, maxWidth: '85%' },
  chatBubbleUser: { backgroundColor: colors.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  chatBubbleCoach: { backgroundColor: colors.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  chatBubbleText: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, lineHeight: 20 },
  chatBubbleTextUser: { color: '#fff' },
  chatBubbleTextCoach: { color: colors.textMid },

  // Wrapper for the CoachChatCard at the bottom of this screen. Matches
  // HomeScreen's coachCardWrap spacing so the card is laid out the same
  // way on every screen it appears on.
  coachCardBar: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 + BOTTOM_INSET,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  chatBar: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  chatStatusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  chatStatusText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  chatInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  chatInput: {
    flex: 1, backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    color: colors.text, fontFamily: FF.regular, fontSize: 14,
    borderWidth: 1, borderColor: colors.border, maxHeight: 80,
  },
  chatSendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  chatSendBtnDisabled: { opacity: 0.3 },
  chatSendText: { fontSize: 18, color: '#fff', fontWeight: '700' },

  bottomBar: { paddingHorizontal: 20, paddingBottom: 12 + BOTTOM_INSET, paddingTop: 8 },
  completeBtn: { backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
  completeBtnText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },

  // Add organised ride
  addOrgRideLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, marginHorizontal: 20, marginTop: 8,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  addOrgRideLinkPlus: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  addOrgRideLinkText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
});
