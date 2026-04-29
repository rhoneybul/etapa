/**
 * Weekly plan view — dark theme. Activities grouped by day.
 * Shows month label, week navigation, no off-track badge.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, RefreshControl,
  TextInput, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform, Animated, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily, BOTTOM_INSET } from '../theme';
import { getPlan, getPlans, getWeekActivities, getWeekProgress, markActivityComplete, getWeekMonthLabel, getGoals, getPlanConfig, updateActivity, savePlan } from '../services/storageService';
import { editActivityWithAI, adjustWeekForOrganisedRide, fetchRideTip } from '../services/llmPlanService';
import { uid } from '../services/storageService';
import { getSessionColor, getSessionLabel, getActivityIcon, getCrossTrainingForDay, CROSS_TRAINING_COLOR } from '../utils/sessionLabels';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { syncStravaActivities, getStravaActivitiesForWeek, getStravaActivitiesForDate } from '../services/stravaSyncService';
import { isStravaConnected } from '../services/stravaService';
import StravaLogo from '../components/StravaLogo';
import CoachChatCard from '../components/CoachChatCard';
import ActivityFeedbackSheet from '../components/ActivityFeedbackSheet';
import { getCoach } from '../data/coaches';
import { useUnits } from '../utils/units';
import analytics from '../services/analyticsService';

const FF = fontFamily;
const ACTIVITY_BLUE = '#A0A8B4';
const DAY_LABELS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function WeekViewScreen({ navigation, route }) {
  const { formatDistance } = useUnits();
  const initialWeek = route.params?.week || 1;
  const planId = route.params?.planId || null;
  const openOrgRideDay = route.params?.openOrgRide ?? null;
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

  // Organised ride modal
  const [showOrgRide, setShowOrgRide] = useState(false);
  const [orgRideDay, setOrgRideDay] = useState(null);
  const [orgRideForm, setOrgRideForm] = useState({ description: '', durationMins: '', distanceKm: '', elevationM: '' });
  const [stravaActivities, setStravaActivities] = useState([]);

  // Background adjustment flag — must live here (before any early return) to satisfy Rules of Hooks
  const [adjustingInBackground, setAdjustingInBackground] = useState(false);

  // ── Today's tip card ───────────────────────────────────────────────────
  // Quick AI-generated note about today's session — weather, target HR
  // zone, RPE — fetched via Claude Haiku for snappy latency. The card
  // shimmers three placeholder rows while loading so the UI doesn't
  // feel empty in the ~1s wait. Cached per activityId for the screen's
  // lifetime so toggling weeks doesn't re-fire the call.
  const [tip, setTip] = useState(null);          // { tip, chips }
  const [tipLoading, setTipLoading] = useState(false);
  const [tipForActivityId, setTipForActivityId] = useState(null);
  const tipShimmer = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    // Only animate while loading — saves a tiny bit of CPU when the
    // tip is settled. The 0.4 → 1.0 range matches the standard skeleton
    // pattern used elsewhere (CoachChatCard refreshing state).
    if (!tipLoading) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(tipShimmer, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      Animated.timing(tipShimmer, { toValue: 0.4, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [tipLoading, tipShimmer]);

  // ── Post-ride feedback sheet ───────────────────────────────────────────
  // Opens whenever the rider flips an activity from completed:false →
  // true. Captures structured signal that flows into the next weekly
  // check-in (see ActivityFeedbackSheet + storageService updateActivity
  // + server/src/routes/checkins.js suggestion builder for the round
  // trip). Skip / backdrop-tap leaves the completion in place but no
  // feedback recorded.
  const [feedbackSheetOpen, setFeedbackSheetOpen] = useState(false);
  const [feedbackActivity, setFeedbackActivity] = useState(null);

  // Toast — non-modal "Saved — your coach will see this on Sunday."
  // confirmation after a feedback save. Same dismiss-on-timeout pattern
  // as the undo toast in CheckInScreen so the visual language is
  // consistent across the app. 4-second window per spec.
  const [feedbackToast, setFeedbackToast] = useState(null); // string | null
  const feedbackToastTimerRef = useRef(null);
  const showFeedbackToast = (message) => {
    if (feedbackToastTimerRef.current) clearTimeout(feedbackToastTimerRef.current);
    setFeedbackToast(message);
    feedbackToastTimerRef.current = setTimeout(() => setFeedbackToast(null), 4000);
  };

  // ── Week completion celebration ────────────────────────────────────────
  // Shown once when the user marks the LAST incomplete session of a week as
  // complete. Totals are captured at trigger time so they reflect the week
  // the user just finished (not whichever week they nav to afterwards).
  const [celebration, setCelebration] = useState(null);
  const celebrateScale = useRef(new Animated.Value(0.85)).current;
  const celebrateOpacity = useRef(new Animated.Value(0)).current;
  // Tracks the week we've already celebrated in this session so a user
  // toggling a session off/on doesn't re-trigger the modal repeatedly.
  const celebratedWeeksRef = useRef(new Set());

  // Compute the actual date for a given day index in the current week
  const getWeekDayInfo = (dayIdx) => {
    if (!plan?.startDate) return { label: DAY_LABELS_FULL[dayIdx], dateStr: '' };
    const start = parseDateLocal(plan.startDate);
    const d = new Date(start);
    d.setDate(d.getDate() + (week - 1) * 7 + dayIdx);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return { label: DAY_LABELS_FULL[dayIdx].slice(0, 3), dateStr: `${d.getDate()} ${months[d.getMonth()]}` };
  };
  const [orgRideProcessing, setOrgRideProcessing] = useState(false);

  const loadPlan = useCallback(async () => {
    let p;
    if (planId) {
      const plans = await getPlans();
      p = plans.find(pl => pl.id === planId) || null;
    } else {
      p = await getPlan();
    }
    // Gate: if plan is unpaid, redirect back to Home
    if (p?.paymentStatus === 'pending') {
      navigation.replace('Home');
      return;
    }
    setPlan(p);
    if (p) {
      const goals = await getGoals();
      setGoal(goals.find(g => g.id === p.goalId) || null);
      const cfg = await getPlanConfig(p.configId);
      setPlanConfig(cfg);
      // Sync Strava activities (non-blocking — wrapped in try/catch to prevent crashes)
      try {
        const connected = await isStravaConnected();
        if (connected) {
          syncStravaActivities(p).then(async (result) => {
            if (result?.stravaActivities) setStravaActivities(result.stravaActivities);
            if (result?.matchedCount > 0) {
              const refreshed = await getPlans();
              const updated = refreshed.find(pl => pl.id === (planId || p.id)) || null;
              if (updated) setPlan(updated);
            }
          }).catch(() => {});
        }
      } catch {}

    }
  }, [planId, navigation]);

  useEffect(() => { loadPlan(); }, [loadPlan]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', loadPlan);
    return unsub;
  }, [navigation, loadPlan]);
  useEffect(() => {
    if (plan) analytics.events.weekViewed(week, plan.id);
  }, [week, plan?.id]);

  // Wire up the tip fetcher. It runs whenever the activity we're
  // anchoring on changes — which mostly means "the user navigated to a
  // different week" or "today rolled over". A guard against re-fetching
  // for the same activityId keeps multiple re-renders from triggering
  // back-to-back calls. Also re-runs when `tipForActivityId` is reset
  // to null (the refresh-tap path).
  useEffect(() => {
    if (!plan) return;
    // Recompute target activity inside the effect so the closure isn't
    // stale across re-renders.
    if (!plan.startDate) return;
    const start = parseDateLocal(plan.startDate);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daysSince = Math.round((today - start) / (1000 * 60 * 60 * 24));
    const todayWeek = Math.floor(daysSince / 7) + 1;
    if (todayWeek !== week) { setTip(null); return; }
    const todayDow = ((daysSince % 7) + 7) % 7;
    const weekActs = getWeekActivities(plan, week);
    let target = null;
    for (let dow = todayDow; dow < 7; dow++) {
      const a = weekActs.find(x => x.dayOfWeek === dow && x.type !== 'rest' && !x.completed);
      if (a) { target = a; break; }
    }
    if (!target) { setTip(null); return; }
    if (tipForActivityId === target.id && tip) return; // already fetched
    let cancelled = false;
    setTipLoading(true);
    // We used to thread a hardcoded "18°C, light breeze" weather string
    // here as a placeholder until the real weather hook landed. That
    // shipped a tip card that was effectively a lie about the
    // conditions, so the placeholder was removed; the prompt builder
    // simply skips weather context server-side. Fatigue is also null
    // for now — no UI surfaces it yet.
    fetchRideTip(target, null).then((res) => {
      if (cancelled) return;
      setTip(res || null);
      setTipForActivityId(target.id);
    }).catch(() => {
      if (cancelled) return;
      setTip(null);
    }).finally(() => {
      if (!cancelled) setTipLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, week, tipForActivityId]);

  // Auto-open organised ride modal if navigated with openOrgRide param
  useEffect(() => {
    if (openOrgRideDay !== null && plan) {
      setOrgRideDay(openOrgRideDay);
      setShowOrgRide(true);
    }
  }, [openOrgRideDay, plan]);

  const onRefresh = async () => { setRefreshing(true); await loadPlan(); setRefreshing(false); };

  if (!plan) return null;

  const activities = getWeekActivities(plan, week);
  const progress = getWeekProgress(plan, week);
  const isDeload = week % 4 === 0;
  const monthLabel = getWeekMonthLabel(plan.startDate, week);

  // Find the activity for "today" (or the next upcoming session this week
  // if today is a rest day). Used to anchor the tip card so the rider
  // sees advice for what they're about to do, not a stale Monday tip
  // on Thursday. Returns null if nothing's scheduled in the rest of the
  // week.
  const findTodaysActivity = () => {
    if (!plan?.startDate) return null;
    const start = parseDateLocal(plan.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysSince = Math.round((today - start) / (1000 * 60 * 60 * 24));
    const todayWeek = Math.floor(daysSince / 7) + 1;
    const todayDow = ((daysSince % 7) + 7) % 7;
    if (todayWeek !== week) return null; // tip card only for the active week
    // Prefer today's session; otherwise scan forward for the next one.
    for (let dow = todayDow; dow < 7; dow++) {
      const acts = activities.filter(a => a.dayOfWeek === dow && a.type !== 'rest' && !a.completed);
      if (acts.length > 0) return acts[0];
    }
    return null;
  };
  const todaysActivity = findTodaysActivity();

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

    // ── Open the feedback sheet on transition false → true ──────────
    // We check `act?.completed` which is the PRE-toggle state captured
    // above. If the rider was un-marking a session we don't prompt —
    // they're not finishing, they're correcting a tap. Existing
    // feedback (if any) stays on the activity unchanged.
    if (act && !act.completed) {
      setFeedbackActivity(act);
      setFeedbackSheetOpen(true);
    }

    // ── Trigger week-complete celebration ─────────────────────────────
    // We check *after* loadPlan has refreshed the plan so the completion
    // state is accurate. Only fire when the user is marking DONE (not
    // un-marking), and only once per week per session.
    if (act && !act.completed && !celebratedWeeksRef.current.has(week)) {
      // Re-read fresh plan to count incomplete — storageService is the source of truth
      const fresh = await getPlan(planId).catch(() => null);
      if (fresh) {
        const freshWeekActs = getWeekActivities(fresh, week);
        const incomplete = freshWeekActs.filter(a => !a.completed).length;
        if (freshWeekActs.length > 0 && incomplete === 0) {
          const totalKm = freshWeekActs.reduce((s, a) => s + (a.distanceKm || 0), 0);
          const totalMins = freshWeekActs.reduce((s, a) => s + (a.durationMins || 0), 0);
          const totalHrs = totalMins / 60;
          celebratedWeeksRef.current.add(week);
          analytics.track('week_completed', {
            week, sessionCount: freshWeekActs.length,
            totalKm: Math.round(totalKm), totalHrs: Math.round(totalHrs * 10) / 10,
          });
          setCelebration({
            week,
            sessionCount: freshWeekActs.length,
            totalKm: Math.round(totalKm),
            totalHrs: Math.round(totalHrs * 10) / 10,
            weeksRemaining: Math.max(0, (fresh.weeks || 0) - week),
          });
          // Animate in
          celebrateScale.setValue(0.85);
          celebrateOpacity.setValue(0);
          Animated.parallel([
            Animated.spring(celebrateScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
            Animated.timing(celebrateOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
          ]).start();
        }
      }
    }
  };

  const dismissCelebration = () => {
    Animated.parallel([
      Animated.timing(celebrateScale, { toValue: 0.9, duration: 180, useNativeDriver: true }),
      Animated.timing(celebrateOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setCelebration(null));
  };

  // Add organised ride to current week
  const handleAddOrganisedRide = async () => {
    if (orgRideDay === null) {
      Alert.alert('Pick a day', 'Select which day this organised ride is on.');
      return;
    }
    if (!orgRideForm.description.trim()) {
      Alert.alert('Describe the ride', 'Enter a description for the organised ride.');
      return;
    }
    setOrgRideProcessing(true);
    try {
      // Create the organised ride activity
      const orgRide = {
        id: uid(),
        planId: plan.id,
        week,
        dayOfWeek: orgRideDay,
        type: 'ride',
        subType: 'organised',
        title: orgRideForm.description.trim(),
        description: 'Organised ride added to this week.',
        notes: [
          orgRideForm.durationMins ? `${orgRideForm.durationMins} min` : null,
          orgRideForm.distanceKm ? `${orgRideForm.distanceKm} km` : null,
          orgRideForm.elevationM ? `${orgRideForm.elevationM}m elevation` : null,
        ].filter(Boolean).join(' · ') || null,
        durationMins: orgRideForm.durationMins ? parseInt(orgRideForm.durationMins, 10) : null,
        distanceKm: orgRideForm.distanceKm ? parseFloat(orgRideForm.distanceKm) : null,
        elevationM: orgRideForm.elevationM ? parseInt(orgRideForm.elevationM, 10) : null,
        effort: 'moderate',
        completed: false,
        completedAt: null,
        isOrganised: true,
        stravaActivityId: null,
        stravaData: null,
      };

      // Add the ride immediately so the user sees it
      const updatedPlan = { ...plan };
      updatedPlan.activities = [...(updatedPlan.activities || []), orgRide];
      await savePlan(updatedPlan);
      await loadPlan();

      // Close the modal immediately
      setShowOrgRide(false);
      setOrgRideForm({ description: '', durationMins: '', distanceKm: '', elevationM: '' });
      setOrgRideDay(null);
      setOrgRideProcessing(false);

      // Ask AI to adjust this week's other activities in the background
      setAdjustingInBackground(true);
      try {
        const adjusted = await adjustWeekForOrganisedRide(updatedPlan, week, orgRide, goal);
        if (adjusted?.activities) {
          const bgUpdated = { ...updatedPlan, activities: adjusted.activities };
          await savePlan(bgUpdated);
          await loadPlan();
        }
      } catch {
        // If AI adjustment fails, the ride is still added — no user-facing error
      }
      setAdjustingInBackground(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to add organised ride.');
      setOrgRideProcessing(false);
    }
  };

  // ── Feedback sheet handlers ─────────────────────────────────────────────
  // Save: persist the structured payload onto the activity (server-synced
  // by updateActivity in storageService) and pop the toast. Skip / Close
  // (backdrop tap) leave the completion intact but record no feedback.
  // We stamp recordedAt server-side conceptually — the client writes it
  // because storageService.updateActivity is the only path to the row,
  // and we want the timestamp captured at the moment of save, not
  // whenever the row next syncs.
  const handleFeedbackSave = async ({ effort, rpe, feel, note }) => {
    // Don't dismiss the sheet here — it now drives a 'loading' →
    // 'reaction' phase internally so the rider sees a single coach
    // response (Haiku call via fetchPostRideReaction). The sheet calls
    // onClose itself when the rider taps Done or the backdrop after
    // the reaction lands. If the reaction call fails the sheet closes
    // silently and the toast we fire below remains the visible
    // confirmation.
    const act = feedbackActivity;
    if (!act?.id) return;
    try {
      await updateActivity(act.id, {
        feedback: {
          effort: effort || null,
          rpe: rpe || null,
          feel: feel || null,
          note: note || null,
          recordedAt: new Date().toISOString(),
        },
      });
      analytics.track?.('activity_feedback_saved', {
        activityId: act.id, effort, rpe, feel, hasNote: !!note,
      });
      showFeedbackToast('Saved \u2014 your coach will see this on Sunday.');
      await loadPlan();
    } catch {
      // Best-effort — the completion already landed, so the worst case
      // is the rider's note didn't sync. We don't surface an error
      // alert because that would imply something broke when really
      // they're already done.
    }
    // Note: feedbackActivity is cleared in handleFeedbackSkip when the
    // sheet finally closes (Done tap, backdrop, or silent close on
    // Haiku failure).
  };

  const handleFeedbackSkip = () => {
    // Backdrop tap and Skip both land here — the completion stands, no
    // feedback row added. Identical UX from the rider's POV.
    setFeedbackSheetOpen(false);
    setFeedbackActivity(null);
  };

  // "Chat with <coach>" handoff from the post-save reaction phase.
  // Navigates to CoachChatScreen scoped to the same activity so the
  // rider's first message lands with the right context already loaded
  // (CoachChatScreen reads route.params.activityId for scoping).
  // The reaction itself is one-shot and lives only in the sheet — we
  // don't seed it into chat history, the rider just picks up where
  // they left off in the conversation.
  const handleChatWithCoach = ({ activity: ctxActivity }) => {
    setFeedbackSheetOpen(false);
    setFeedbackActivity(null);
    navigation.navigate('CoachChat', {
      planId: plan?.id,
      weekNum: week,
      activityId: ctxActivity?.id || null,
    });
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
            <Text style={s.deloadText}>{'Recovery week \u2014 lighter load to let your body adapt'}</Text>
          </View>
        )}

        {/* Plan assessment removed (readiness % card) */}

        {/* Background adjusting banner */}
        {adjustingInBackground && (
          <View style={s.adjustBanner}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={s.adjustBannerText}>Your coach is adjusting the week...</Text>
          </View>
        )}

        <ScrollView
          style={s.list}
          contentContainerStyle={{ paddingBottom: 32 + BOTTOM_INSET }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#666" />}
        >
          {/* Tip-from-coach card — anchored on today's (or the next
              upcoming) session. Renders three shimmer rows during the
              fetch, then the prose tip + chips. Tap the refresh icon
              top-right to clear the cache and re-fetch. The card is
              hidden if there's nothing to anchor on (rest day at the
              end of the week, or future week navigation). */}
          {todaysActivity && (tipLoading || tip) && (() => {
            const coachName = getCoach(planConfig?.coachId)?.name || 'Coach';
            return (
              <View style={s.tipCard}>
                <View style={s.tipHeader}>
                  <Text style={s.tipEyebrow}>{`TIP FROM ${coachName.toUpperCase()}`}</Text>
                  <TouchableOpacity
                    onPress={() => { setTip(null); setTipForActivityId(null); }}
                    hitSlop={HIT}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="refresh" size={14} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                {tipLoading ? (
                  // Three shimmer rows — width staggers so it doesn't
                  // read as a perfect-rectangle skeleton.
                  <View>
                    {[0.95, 0.85, 0.62].map((w, i) => (
                      <Animated.View
                        key={i}
                        style={[s.tipShimmerRow, { width: `${w * 100}%`, opacity: tipShimmer }]}
                      />
                    ))}
                  </View>
                ) : (
                  <>
                    <Text style={s.tipText}>{tip?.tip || ''}</Text>
                    {Array.isArray(tip?.chips) && tip.chips.length > 0 && (
                      <View style={s.tipChipsRow}>
                        {tip.chips.map((c, i) => {
                          // Server returns { label, value } per chip; the
                          // label is the noun ("HR", "effort"), the value
                          // is the qualifier ("easy", "4/10"). Prefer the
                          // "label · value" rendering when both are set,
                          // fall back gracefully if a chip omits one or
                          // the other (older server response shapes).
                          const label = c?.label || '';
                          const value = c?.value || '';
                          const display = label && value
                            ? `${label} \u00B7 ${value}`
                            : (label || value);
                          if (!display) return null;
                          return (
                            <View key={i} style={s.tipChip}>
                              <Text style={s.tipChipText}>{display}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })()}

          {DAY_LABELS_FULL.map((dayLabel, dayIdx) => {
            const dayActivities = byDay[dayIdx] || [];
            const ctItems = getCrossTrainingForDay(crossTraining, dayIdx);
            const dateStr = plan?.startDate ? getDayDateStr(plan.startDate, week, dayIdx) : null;
            const dayStravaRides = dateStr
              ? getStravaActivitiesForDate(stravaActivities, dateStr).filter(sa => !dayActivities.some(a => a.stravaActivityId === sa.stravaId))
              : [];
            if (dayActivities.length === 0 && ctItems.length === 0 && dayStravaRides.length === 0) return null;

            const dayDate = getDayDate(plan.startDate, week, dayIdx);

            return (
              <View key={dayIdx} style={s.dayGroup}>
                <Text style={s.dayHeader}>{dayLabel} {dayDate}</Text>
                {dayActivities.map(activity => {
                  const isEditing = editingActivity?.id === activity.id;
                  return (
                    <View key={activity.id}>
                      <TouchableOpacity
                        style={[
                          s.activityCard,
                          activity.type === 'strength' && s.activityCardStrength,
                          activity.completed && s.activityCardDone,
                          isEditing && s.activityCardEditing,
                        ]}
                        onPress={() => navigation.navigate('ActivityDetail', { activityId: activity.id })}
                        onLongPress={() => { setEditingActivity(activity); setActEditText(''); setActEditStatus(''); }}
                        activeOpacity={0.75}
                        delayLongPress={400}
                      >
                        <View style={[
                          s.activityAccent,
                          { backgroundColor: ACTIVITY_BLUE },
                          activity.type === 'strength' && s.accentStrength,
                        ]} />
                        <View style={s.activityBody}>
                          <View style={s.activityTop}>
                            <MaterialCommunityIcons name={getActivityIcon(activity)} size={14} color={ACTIVITY_BLUE} />
                            <View style={[s.activityTypeBadge, { backgroundColor: ACTIVITY_BLUE + '18' }]}>
                              <Text style={[s.activityTypeText, { color: ACTIVITY_BLUE }]}>{getSessionLabel(activity)}</Text>
                            </View>
                            <View style={s.activityTitleWrap}>
                              <Text style={[s.activityTitle, activity.completed && s.activityTitleDone]}>{activity.title}</Text>
                              <Text style={s.activityMeta}>
                                {activity.type === 'ride' && activity.distanceKm ? `${formatDistance(activity.distanceKm)} \u00B7 ` : ''}
                                {activity.durationMins ? `~${activity.durationMins} min` : ''}
                                {activity.effort ? ` \u00B7 ${activity.effort}` : ''}
                              </Text>
                              {activity.stravaActivityId && (
                                <View style={s.stravaMatchBadge}>
                                  <StravaLogo size={12} />
                                  <Text style={s.stravaMatchText}>
                                    {activity.stravaData?.distanceKm ? `${activity.stravaData.distanceKm} km` : ''}
                                    {activity.stravaData?.distanceKm && activity.stravaData?.durationMins ? ' \u00B7 ' : ''}
                                    {activity.stravaData?.durationMins ? `${activity.stravaData.durationMins} min` : ''}
                                    {activity.stravaData?.avgSpeedKmh ? ` \u00B7 ${activity.stravaData.avgSpeedKmh} km/h` : ''}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <TouchableOpacity
                              style={[s.checkBtn, activity.completed && s.checkBtnDone]}
                              onPress={() => handleComplete(activity.id)}
                            >
                              <Text style={s.checkMark}>{activity.completed ? '\u2713' : ''}</Text>
                            </TouchableOpacity>
                          </View>
                          {!activity.completed && (
                            <Text style={s.editHint}>Hold to edit</Text>
                          )}
                          {/* "feedback saved" pill — only when the rider
                              has already left feedback for this session.
                              Tapping the pill re-opens the sheet so they
                              can edit (e.g. they realised the climb was
                              "hard" not "just right"). Stops the rider
                              wondering "did my note save?" and lets them
                              correct it without un-marking the session. */}
                          {activity.completed && activity.feedback && (
                            <TouchableOpacity
                              style={s.feedbackSavedPill}
                              onPress={() => {
                                setFeedbackActivity(activity);
                                setFeedbackSheetOpen(true);
                              }}
                              activeOpacity={0.7}
                              accessibilityLabel="Feedback saved — tap to edit"
                            >
                              <MaterialCommunityIcons name="check" size={10} color={colors.primary} />
                              <Text style={s.feedbackSavedPillText}>FEEDBACK SAVED</Text>
                            </TouchableOpacity>
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
                      <View style={[s.typeShape, s.typeShapeDiamond, { backgroundColor: CROSS_TRAINING_COLOR }]} />
                      <View style={[s.activityTypeBadge, { backgroundColor: CROSS_TRAINING_COLOR + '18' }]}>
                        <Text style={[s.activityTypeText, { color: CROSS_TRAINING_COLOR }]}>{ct.label}</Text>
                      </View>
                      <Text style={s.ctNote}>Your activity {'\u00B7'} Factored into plan recovery</Text>
                    </View>
                  </View>
                ))}
                {/* Unmatched Strava rides for this day */}
                {dayStravaRides.map(sa => (
                  <View key={sa.stravaId} style={s.stravaRideCard}>
                    <View style={[s.activityAccent, { backgroundColor: '#FC4C02' }]} />
                    <View style={s.stravaRideBody}>
                      <View style={[s.activityTypeBadge, { backgroundColor: 'rgba(252,76,2,0.12)' }]}>
                        <Text style={[s.activityTypeText, { color: '#FC4C02' }]}>STRAVA</Text>
                      </View>
                      <Text style={s.stravaRideName}>{sa.name || 'Ride'}</Text>
                      <Text style={s.stravaRideMeta}>
                        {sa.distanceKm ? `${sa.distanceKm} km` : ''}
                        {sa.distanceKm && sa.durationMins ? ' \u00B7 ' : ''}
                        {sa.durationMins ? `${sa.durationMins} min` : ''}
                        {sa.avgSpeedKmh ? ` \u00B7 ${sa.avgSpeedKmh} km/h` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          })}
          {/* Days with no scheduled activities — still allow adding organised rides */}
          {DAY_LABELS_FULL.map((dayLabel, dayIdx) => {
            const dayActivitiesForDay = byDay[dayIdx] || [];
            const ctItems = getCrossTrainingForDay(crossTraining, dayIdx);
            if (dayActivitiesForDay.length > 0 || ctItems.length > 0) return null; // already rendered above
            return null; // rest days stay clean
          })}
          {activities.length === 0 && Object.keys(crossTraining).length === 0 && (
            <View style={s.emptyWeek}><Text style={s.emptyText}>No activities this week</Text></View>
          )}

          {/* Floating add organised ride for rest days */}
          <TouchableOpacity
            style={s.addOrgRideFloating}
            onPress={() => { setOrgRideDay(null); setShowOrgRide(true); }}
            activeOpacity={0.7}
          >
            <Text style={s.addOrgRideFloatingText}>+ Add organised ride this week</Text>
          </TouchableOpacity>

          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Bottom bar — same CoachChatCard as Home/Activity for consistency.
            The `subtitleOverride` keeps the week-specific copy so the user
            still knows the chat will be scoped to this week's plan. */}
        <View style={s.editBar}>
          <CoachChatCard
            coach={getCoach(planConfig?.coachId)}
            onPress={() => navigation.navigate('CoachChat', { planId: plan.id, weekNum: week })}
            subtitleOverride={`Get advice or ask your coach to change week ${week}`}
          />
        </View>

        {/* Organised ride modal */}
        <Modal visible={showOrgRide} transparent animationType="slide" onRequestClose={() => setShowOrgRide(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.orgModalOverlay}>
            <TouchableOpacity style={s.orgModalBg} onPress={() => setShowOrgRide(false)} activeOpacity={1} />
            <View style={s.orgModalSheet}>
              <View style={s.orgModalHandle} />
              {/*
                Lucia reported (Apr 2026 TestFlight): "I am stuck on this
                screen because I cannot scroll from top to bottom to hide it".
                The keyboard was covering the Add-to-plan button with no way
                to dismiss it. Fix: wrap the form body in a ScrollView with:
                  - keyboardDismissMode="on-drag" → swipe down to dismiss
                  - keyboardShouldPersistTaps="handled" → day-pills still tap-through
                  - extra bottom padding so the keyboard doesn't cover the
                    submit button on the smallest iPhones.
              */}
              <ScrollView
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40 }}
              >
              <Text style={s.orgModalTitle}>Add organised ride</Text>

              {/* Day / date picker for current week */}
              <Text style={s.orgModalLabel}>Which day?</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.orgDayScroll} contentContainerStyle={s.orgDayScrollContent}>
                {DAY_LABELS_FULL.map((_, idx) => {
                  const { label, dateStr } = getWeekDayInfo(idx);
                  const selected = orgRideDay === idx;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[s.orgDayPill, selected && s.orgDayPillSelected]}
                      onPress={() => setOrgRideDay(idx)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.orgDayShort, selected && s.orgDayTextSelected]}>{label.toUpperCase()}</Text>
                      <Text style={[s.orgDayDate, selected && s.orgDayTextSelected]}>{dateStr}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={s.orgModalLabel}>Describe the ride</Text>
              <TextInput
                style={s.orgModalInput}
                placeholder="e.g. Saturday morning group ride, hilly route"
                placeholderTextColor={colors.textFaint}
                value={orgRideForm.description}
                onChangeText={v => setOrgRideForm(f => ({ ...f, description: v }))}
                returnKeyType="done"
                blurOnSubmit
                multiline
              />

              <View style={s.orgModalInputRow}>
                <View style={s.orgModalInputGroup}>
                  <Text style={s.orgModalInputLabel}>Duration</Text>
                  <TextInput
                    style={s.orgModalSmallInput}
                    placeholder="mins"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="numeric"
                    value={orgRideForm.durationMins}
                    onChangeText={v => setOrgRideForm(f => ({ ...f, durationMins: v }))}
                  />
                </View>
                <View style={s.orgModalInputGroup}>
                  <Text style={s.orgModalInputLabel}>Distance</Text>
                  <TextInput
                    style={s.orgModalSmallInput}
                    placeholder="km"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="numeric"
                    value={orgRideForm.distanceKm}
                    onChangeText={v => setOrgRideForm(f => ({ ...f, distanceKm: v }))}
                  />
                </View>
                <View style={s.orgModalInputGroup}>
                  <Text style={s.orgModalInputLabel}>Elevation</Text>
                  <TextInput
                    style={s.orgModalSmallInput}
                    placeholder="m"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="numeric"
                    value={orgRideForm.elevationM}
                    onChangeText={v => setOrgRideForm(f => ({ ...f, elevationM: v }))}
                  />
                </View>
              </View>

              <Text style={s.orgModalNote}>Your coach will adjust this week's plan to account for the extra ride.</Text>

              <TouchableOpacity
                style={[s.orgModalAddBtn, orgRideProcessing && { opacity: 0.6 }]}
                onPress={handleAddOrganisedRide}
                disabled={orgRideProcessing}
                activeOpacity={0.85}
              >
                {orgRideProcessing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.orgModalAddText}>Add to plan</Text>
                )}
              </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Post-ride feedback bottom sheet — opens after the rider
            transitions an activity from incomplete → complete. See
            handleComplete + handleFeedbackSave above for the pipeline.
            Skipping leaves completion intact, no feedback. */}
        <ActivityFeedbackSheet
          visible={feedbackSheetOpen}
          activity={feedbackActivity}
          onSave={handleFeedbackSave}
          onSkip={handleFeedbackSkip}
          onClose={handleFeedbackSkip}
          onChatWithCoach={handleChatWithCoach}
        />

        {/* "Saved — your coach will see this on Sunday." toast.
            4-second window, copies the undo-toast pattern from
            CheckInScreen so the visual language stays consistent. */}
        {feedbackToast && (
          <View style={s.feedbackToast} pointerEvents="box-none">
            <View style={s.feedbackToastInner} accessibilityRole="alert">
              <MaterialCommunityIcons name="check-circle" size={16} color={colors.primary} />
              <Text style={s.feedbackToastText}>{feedbackToast}</Text>
            </View>
          </View>
        )}

        {/* ── Week completion celebration ──────────────────────────────
            Full-screen overlay shown once when user completes the final
            session of a week. Tap anywhere to dismiss. Animation is a
            gentle scale + fade so it feels celebratory without being
            annoying. Copy is coach-voiced based on planConfig.coachId. */}
        {celebration && (() => {
          const coachId = planConfig?.coachId;
          const coachVoice = coachVoicedWeekDoneLine(coachId, celebration.weeksRemaining);
          return (
            <Pressable onPress={dismissCelebration} style={s.celebrateOverlay}>
              <Animated.View style={[
                s.celebrateCard,
                { opacity: celebrateOpacity, transform: [{ scale: celebrateScale }] },
              ]}>
                <View style={s.celebrateCheckWrap}>
                  <Text style={s.celebrateCheck}>{'\u2713'}</Text>
                </View>
                <Text style={s.celebrateTitle}>Week {celebration.week} — done.</Text>
                <Text style={s.celebrateSub}>
                  {celebration.sessionCount} sessions
                  {celebration.totalKm > 0 ? ` \u00B7 ${celebration.totalKm} km` : ''}
                  {celebration.totalHrs > 0 ? ` \u00B7 ${celebration.totalHrs} hrs` : ''}
                </Text>
                <Text style={s.celebrateCoach}>{coachVoice}</Text>
                <Text style={s.celebrateDismiss}>Tap to dismiss</Text>
              </Animated.View>
            </Pressable>
          );
        })()}
      </SafeAreaView>
    </View>
  );
}

// ── Coach-voiced one-liner when a week is complete ────────────────────────
// Each coach has a slightly different tone — see BRAND.md and the coach
// personas in server/src/routes/ai.js. Keep these short and genuine.
function coachVoicedWeekDoneLine(coachId, weeksRemaining) {
  const suffix = weeksRemaining > 0
    ? ` ${weeksRemaining} week${weeksRemaining === 1 ? '' : 's'} to go.`
    : ' That was the last week — you did it.';
  switch (coachId) {
    case 'clara':
      return 'Beautiful. Every week you show up, you\'re building something real.' + suffix;
    case 'lars':
      return 'Good week. Consistency is the fitness.' + suffix;
    case 'sophie':
      return 'Solid training load. Your aerobic base is growing.' + suffix;
    case 'matteo':
      return 'Nice rhythm this week. Ride, rest, repeat.' + suffix;
    case 'elena':
      return 'Strong work. This is how race weeks get won.' + suffix;
    case 'tom':
      return 'Cracking week, that. Nice one.' + suffix;
    default:
      return 'Great week. You\'re building fitness one session at a time.' + suffix;
  }
}

function parseDateLocal(dateStr) {
  // Parse YYYY-MM-DD or ISO string as local date (noon to avoid DST edge cases)
  const parts = dateStr.split('T')[0].split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
}

/** Snap a parsed date to the Monday of its week */
function snapToMonday(date) {
  const jsDay = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const mondayOffset = jsDay === 0 ? -6 : -(jsDay - 1);
  const monday = new Date(date);
  monday.setDate(monday.getDate() + mondayOffset);
  return monday;
}

function getDayDate(startDateStr, week, dayIdx) {
  const monday = snapToMonday(parseDateLocal(startDateStr));
  const offset = (week - 1) * 7 + dayIdx;
  const d = new Date(monday);
  d.setDate(d.getDate() + offset);
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[d.getMonth()]}`;
}

function getDayDateStr(startDateStr, week, dayIdx) {
  const monday = snapToMonday(parseDateLocal(startDateStr));
  const d = new Date(monday);
  d.setDate(d.getDate() + (week - 1) * 7 + dayIdx);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

  assessBanner: {
    backgroundColor: colors.surface, marginHorizontal: 20, borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  assessBannerLeft: { alignItems: 'center', minWidth: 44 },
  assessBannerChance: { fontSize: 20, fontWeight: '700', fontFamily: FF.semibold, color: colors.primary },
  assessBannerLabel: { fontSize: 9, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  assessBannerText: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, flex: 1, lineHeight: 17 },

  adjustBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(232,69,139,0.08)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.2)',
  },
  adjustBannerText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },

  // ── Tip-from-coach card (Haiku-fed quick advice) ─────────────────
  // Pink-tinted card with a small refresh affordance top-right. Sits
  // at the top of the week list so the rider sees it before drilling
  // into a specific day.
  tipCard: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#E8458B14', // 8% alpha pink tint
    borderWidth: 0.5, borderColor: '#E8458B50',
  },
  tipHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  tipEyebrow: {
    fontSize: 10, fontWeight: '700', color: '#E8458B',
    fontFamily: FF.semibold, letterSpacing: 0.8,
  },
  tipText: {
    fontSize: 13, color: colors.text, fontFamily: FF.regular,
    lineHeight: 19,
  },
  tipShimmerRow: {
    height: 12, borderRadius: 6, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tipChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tipChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 0.5, borderColor: colors.border,
  },
  tipChipText: { fontSize: 11, color: colors.textMid, fontFamily: FF.medium },

  // ── Activity-card "feedback saved" pill + post-save toast ──────────
  // Tiny pink chip rendered inline with the activity meta when the
  // rider has already left feedback for that session. Visible cue so
  // they know not to re-tap the checkmark expecting a sheet (and so
  // we can avoid re-prompting if they untoggle and re-toggle).
  feedbackSavedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: colors.primary + '14',
    borderWidth: 0.5, borderColor: colors.primary + '50',
    marginTop: 6, alignSelf: 'flex-start',
  },
  feedbackSavedPillText: {
    fontSize: 10, fontWeight: '600', color: colors.primary,
    fontFamily: FF.semibold, letterSpacing: 0.3,
  },
  // Toast — pinned to the bottom of the screen for 4s after Save.
  // Mirrors the undo-toast styling in CheckInScreen for consistency.
  feedbackToast: {
    position: 'absolute', left: 16, right: 16, bottom: 90,
    alignItems: 'center', pointerEvents: 'box-none',
  },
  feedbackToastInner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.text,
    paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: 10,
  },
  feedbackToastText: { color: colors.bg, fontSize: 13, fontFamily: FF.regular, flex: 0 },

  list: { flex: 1 },
  dayGroup: { marginBottom: 8 },
  dayHeader: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 20, paddingVertical: 8 },

  activityCard: {
    flexDirection: 'row', backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 8,
    borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border,
  },
  activityCardStrength: { borderStyle: 'dashed', borderColor: 'rgba(139,92,246,0.3)' },
  activityCardDone: { opacity: 0.5 },
  activityAccent: { width: 4 },
  accentStrength: { width: 4, borderRadius: 0 },
  activityBody: { flex: 1, padding: 14 },
  activityTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeShape: { width: 8, height: 8 },
  typeShapeCircle: { borderRadius: 4 },
  typeShapeSquare: { borderRadius: 2 },
  typeShapeDiamond: { borderRadius: 1, transform: [{ rotate: '45deg' }] },
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

  // ── Add organised ride ──────────────────────────────────────────────────
  addOrgRideBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, marginTop: 4,
  },
  addOrgRidePlus: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  addOrgRideText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
  addOrgRideFloating: {
    alignItems: 'center', paddingVertical: 14, marginHorizontal: 16, marginTop: 8,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  addOrgRideFloatingText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },

  // ── Organised ride modal ────────────────────────────────────────────────
  orgModalOverlay: { flex: 1, justifyContent: 'flex-end' },
  orgModalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  orgModalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  orgModalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: 16,
  },
  orgModalTitle: { fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  orgModalSub: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, marginBottom: 16 },
  orgModalLabel: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 6 },
  orgModalInput: {
    backgroundColor: colors.bg, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: FF.regular, color: colors.text,
    minHeight: 56, textAlignVertical: 'top', marginBottom: 14,
  },
  orgModalInputRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  orgModalInputGroup: { flex: 1 },
  orgModalInputLabel: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, marginBottom: 4 },
  orgModalSmallInput: {
    backgroundColor: colors.bg, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontFamily: FF.regular, color: colors.text,
  },
  orgModalNote: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginBottom: 16, lineHeight: 17 },

  // Day picker inside modal
  orgDayScroll: { marginBottom: 16 },
  orgDayScrollContent: { paddingRight: 8 },
  orgDayPill: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1.5, borderColor: colors.border,
    marginRight: 8, backgroundColor: colors.bg, minWidth: 58,
  },
  orgDayPillSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
  orgDayShort: { fontSize: 10, fontWeight: '700', fontFamily: FF.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  orgDayDate: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginTop: 3 },
  orgDayTextSelected: { color: colors.primary },

  orgModalAddBtn: {
    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center',
  },
  orgModalAddText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },

  // Strava inline
  stravaMatchBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4,
    backgroundColor: 'rgba(252,76,2,0.08)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start',
  },
  stravaMatchLogo: {
    width: 14, height: 14,
  },
  stravaMatchText: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: '#FC4C02' },
  stravaRideCard: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14,
    overflow: 'hidden', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(252,76,2,0.2)',
  },
  stravaRideBody: { flex: 1, padding: 14, gap: 4 },
  stravaRideName: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  stravaRideMeta: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: '#FC4C02' },

  // ── Week completion celebration overlay ───────────────────────────────
  celebrateOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center', justifyContent: 'center',
    padding: 24,
    zIndex: 1000,
  },
  celebrateCard: {
    width: '100%', maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 32, paddingHorizontal: 28,
    alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.35)',
    shadowColor: '#E8458B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  celebrateCheckWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#E8458B', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
  },
  celebrateCheck: {
    fontSize: 40, color: '#FFFFFF', lineHeight: 44, fontWeight: '600',
  },
  celebrateTitle: {
    fontSize: 24, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.text, textAlign: 'center', marginBottom: 8, letterSpacing: -0.3,
  },
  celebrateSub: {
    fontSize: 14, fontWeight: '500', fontFamily: FF.medium,
    color: colors.textMid, textAlign: 'center', marginBottom: 18,
  },
  celebrateCoach: {
    fontSize: 15, fontWeight: '400', fontFamily: FF.regular,
    color: colors.text, textAlign: 'center', lineHeight: 22,
    marginBottom: 24, paddingHorizontal: 4,
  },
  celebrateDismiss: {
    fontSize: 11, fontWeight: '500', fontFamily: FF.medium,
    color: colors.textFaint, letterSpacing: 0.8, textTransform: 'uppercase',
  },
});
