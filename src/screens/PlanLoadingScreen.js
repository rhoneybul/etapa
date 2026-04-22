/**
 * Plan loading screen — async plan generation with live activity preview,
 * marketing notes, cancel button, and background support via push notifications.
 *
 * The plan generates server-side. The user can leave the app and will receive
 * a push notification when the plan is ready.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, Image,
  TouchableOpacity, ScrollView, Alert, AppState, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily, BOTTOM_INSET } from '../theme';
import useScreenGuard from '../hooks/useScreenGuard';
import {
  generatePlanWithLLM,
  startAsyncPlanGeneration,
  pollPlanJob,
  cancelPlanJob,
} from '../services/llmPlanService';
import { savePlan } from '../services/storageService';
import analytics from '../services/analyticsService';

const FF = fontFamily;
const POLL_INTERVAL = 2000; // 2 seconds

// Marketing / tips shown while the plan generates
const MARKETING_TIPS = [
  { title: 'Personalised to you', body: 'Your AI coach analyses your fitness level, goals, and schedule to build a plan that fits your life.' },
  { title: 'Progressive overload', body: 'Each week builds on the last — volume and intensity increase gradually so your body adapts safely.' },
  { title: 'Built-in recovery', body: 'Deload weeks and rest days are scheduled automatically to prevent burnout and overtraining.' },
  { title: 'Fully editable', body: 'Need to move a session or skip a week? Chat with your coach to adjust the plan anytime.' },
  { title: 'Event-ready tapering', body: 'If you have a target event, your plan tapers volume in the final weeks so you arrive fresh.' },
];

// Progress stages for the animated bar (when using sync fallback)
const PROGRESS_STAGES = {
  'Building your plan...':                 0.05,
  'Consulting your AI coach...':          0.15,
  'Building your training framework...':  0.25,
  'Calculating progressive overload...':  0.40,
  'Adding periodisation and taper...':    0.55,
  'Scheduling your sessions...':          0.65,
  'Building your personalised plan...':   0.75,
  'Finalising your plan...':              0.88,
  'Plan ready!':                          1.0,
};

// Map server progress strings to bar targets
const ASYNC_PROGRESS_MAP = {
  'Building your plan...':                 0.05,
  'Consulting your AI coach...':          0.15,
  'Building your training framework...':  0.25,
  'Calculating progressive overload...':  0.40,
  'Adding periodisation and taper...':    0.55,
  'Scheduling your sessions...':          0.65,
  'Building your personalised plan...':   0.75,
  'Finalising your plan...':              0.88,
  'Plan ready!':                          1.0,
};

export default function PlanLoadingScreen({ navigation, route }) {
  // Remote kill-switch / redirect — see REMOTE_FIRST_CHECKLIST.md §"screen
  // kill-switch". Admins can pause plan generation or reroute stuck users
  // without shipping a build via workflows.screens.PlanLoadingScreen in
  // remote config.
  const guard = useScreenGuard('PlanLoadingScreen', navigation);

  // `existingJobId` is set when a caller (e.g. RegeneratePlanScreen) has
  // already kicked off generation via a different endpoint. We skip the
  // startAsync* call and poll directly.
  const { goal, config, requirePaywall, defaultPlan, existingJobId, isRegenerate } = route.params;
  const [message, setMessage] = useState('Building your plan...');
  // `activities` state kept intentionally unused — previously drove the
  // "Sessions being planned" preview which we removed. Left here in case we
  // want to wire up a different in-progress indicator later.
  const [tipIndex, setTipIndex] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  // Abandon tracking — set true right before we navigate away on successful
  // plan generation. Used by the beforeRemove listener below.
  const completedRef = useRef(false);
  // Record when generation started so we can log how long the user waited
  // before bailing.
  const generationStartedAtRef = useRef(Date.now());

  // Plan-generation abandon: user left before the plan finished generating.
  // This is its own important funnel stage — plan generation takes 10-30s
  // and users often bail if it's too slow.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', () => {
      if (completedRef.current) return;
      analytics.events.planFunnelAbandoned({
        atScreen: 'PlanLoading',
        reason: 'cancelled_or_backed_out',
        waitedMs: Date.now() - generationStartedAtRef.current,
      });
    });
    return unsub;
  }, [navigation]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0.02)).current;
  const tipFade = useRef(new Animated.Value(1)).current;
  const jobIdRef = useRef(null);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  // Slow creep — while waiting for the AI response, the bar drifts
  // slowly forward so it never looks completely frozen.
  const creepRef = useRef(null);

  const startCreep = useCallback((from, ceiling) => {
    if (creepRef.current) creepRef.current.stop();
    creepRef.current = Animated.timing(progressAnim, {
      toValue: ceiling,
      duration: 30000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    creepRef.current.start();
  }, [progressAnim]);

  const jumpTo = useCallback((target) => {
    if (creepRef.current) creepRef.current.stop();
    const duration = target >= 1.0 ? 300 : 600;
    Animated.timing(progressAnim, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(() => {
      if (target < 0.88) {
        startCreep(target, Math.min(target + 0.08, 0.92));
      }
    });
  }, [progressAnim, startCreep]);

  const handleProgress = useCallback((msg) => {
    if (!mountedRef.current) return;
    setMessage(msg);
    const target = PROGRESS_STAGES[msg] || ASYNC_PROGRESS_MAP[msg];
    if (target !== undefined) jumpTo(target);
  }, [jumpTo]);

  // Cycle through marketing tips
  useEffect(() => {
    const tipTimer = setInterval(() => {
      Animated.timing(tipFade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setTipIndex(prev => (prev + 1) % MARKETING_TIPS.length);
        Animated.timing(tipFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }, 6000);
    return () => clearInterval(tipTimer);
  }, []);

  // Handle app state changes — if user backgrounds the app,
  // we keep polling when they come back
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && jobIdRef.current && !pollRef.current) {
        startPolling(jobIdRef.current);
      }
    });
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Fade in
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();

    // Pulsing icon
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    startCreep(0.02, 0.12);
    generate();

    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = (jobId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const job = await pollPlanJob(jobId);
        if (!mountedRef.current) return;

        // Update progress message
        if (job.progress) handleProgress(job.progress);

        // (Intentionally not updating activities state — the loading UI
        // stays on "Building your plan" with tips until navigation fires.
        // The old "Sessions being planned" preview was removed to keep the
        // experience calm and prevent leaking partial/revisable data.)

        if (job.status === 'completed' && job.plan) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          handlePlanReady(job.plan);
        } else if (job.status === 'failed') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setMessage('Something went wrong. Retrying...');
          setTimeout(() => { if (mountedRef.current) navigation.goBack(); }, 2000);
        } else if (job.status === 'cancelled') {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (err) {
        // Polling error — keep trying
        console.warn('[PlanLoading] Poll error:', err);
      }
    }, POLL_INTERVAL);
  };

  const handlePlanReady = async (plan) => {
    if (config.paymentStatus) plan.paymentStatus = config.paymentStatus;
    await savePlan(plan);

    const totalKm = (plan.activities || []).reduce((s, a) => s + (a.distanceKm || 0), 0);
    const totalMins = (plan.activities || []).reduce((s, a) => s + (a.durationMins || 0), 0);
    analytics.events.planGenerated({
      weeks: plan.weeks,
      totalKm: Math.round(totalKm),
      totalSessions: plan.activities?.length || 0,
      totalHours: Math.round(totalMins / 60),
      coachId: config.coachId,
    });

    if (mountedRef.current) {
      completedRef.current = true; // Prevent abandon event from firing on the nav below.
      if (requirePaywall) {
        // Trial expired or payment required — go to paywall before home
        navigation.replace('Paywall', { nextScreen: 'Home', nextParams: { freshPlanId: plan.id }, defaultPlan, source: 'plan_ready' });
      } else {
        // Go straight to Home — skip the loading screen by passing freshPlanId
        navigation.replace('Home', { freshPlanId: plan.id });
      }
    }
  };

  const generate = async () => {
    analytics.events.planGenerationStarted({ weeks: config.weeks, coachId: config.coachId });

    // If a jobId was handed to us (e.g. by RegeneratePlanScreen after calling
    // POST /api/plans/:id/regenerate), skip the fresh kickoff and poll it.
    if (existingJobId) {
      jobIdRef.current = existingJobId;
      startPolling(existingJobId);
      return;
    }

    // Try async server-side generation first
    try {
      const jobId = await startAsyncPlanGeneration(goal, config);
      jobIdRef.current = jobId;
      startPolling(jobId);
      return; // polling takes over from here
    } catch (err) {
      console.warn('[PlanLoading] Async generation failed, falling back to sync:', err);
    }

    // Fallback: synchronous generation (original flow)
    try {
      const plan = await generatePlanWithLLM(goal, config, handleProgress);
      if (!mountedRef.current) return;
      await handlePlanReady(plan);
    } catch (err) {
      analytics.events.planGenerationFailed(err.message);
      if (!mountedRef.current) return;
      setMessage('Something went wrong. Retrying...');
      setTimeout(() => navigation.goBack(), 2000);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel plan generation?',
      'Your plan is being built by your AI coach. Are you sure you want to cancel?',
      [
        { text: 'Keep building', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            if (jobIdRef.current) {
              await cancelPlanJob(jobIdRef.current);
            }
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            navigation.goBack();
          },
        },
      ]
    );
  };

  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const tip = MARKETING_TIPS[tipIndex];

  // Remote kill-switch / redirect wins over everything. If admin has
  // disabled this screen or set a redirectTo, we short-circuit before
  // running any plan-generation logic.
  if (guard.blocked) return guard.render();

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header area with logo + progress */}
          <Animated.View style={[s.header, { opacity: fadeAnim }]}>
            <Animated.View style={[s.logoWrap, { transform: [{ scale: pulseAnim }] }]}>
              <Image source={require('../../assets/icon.png')} style={s.logoImage} />
            </Animated.View>

            <Text style={s.title}>Building your plan</Text>
            <Text style={s.message}>{message}</Text>

            <View style={s.progressTrack}>
              <Animated.View style={[s.progressFill, { width: barWidth }]} />
            </View>
          </Animated.View>

          {/* Activity preview intentionally removed — keep loading UI calm. */}

          {/* Marketing tip card */}
          <Animated.View style={[s.tipCard, { opacity: tipFade }]}>
            <Text style={s.tipTitle}>{tip.title}</Text>
            <Text style={s.tipBody}>{tip.body}</Text>
          </Animated.View>

          {/* Background note */}
          <View style={s.bgNote}>
            <Text style={s.bgNoteText}>
              You can leave the app — we'll send you a notification when your plan is ready.
            </Text>
          </View>

          {/* ── Health & AI disclaimer ─────────────────────────────────────
              Visible legal notice shown every time a plan is built. This is
              defensive copy — explicit assumption-of-risk and "not medical
              advice" language. Pairs with the more detailed health-disclaimer
              in the Terms of Service. Do not remove without legal review. */}
          <View style={s.disclaimerCard}>
            <Text style={s.disclaimerTitle}>Before you ride</Text>
            <Text style={s.disclaimerBody}>
              Etapa's plans are AI-generated guidance, not medical advice.
              Cycling and structured training carry real risk of injury.
              Consult a doctor before starting — especially if you have a
              heart or lung condition, are pregnant, are returning from injury,
              or are over 50. Stop and see a doctor if you experience chest
              pain, dizziness, or persistent pain. By using Etapa, you accept
              you are training at your own risk.
            </Text>
          </View>
        </ScrollView>

        {/* Bottom: cancel button + powered by */}
        <View style={s.bottom}>
          <TouchableOpacity
            style={s.cancelBtn}
            onPress={handleCancel}
            activeOpacity={0.7}
            disabled={cancelling}
          >
            <Text style={s.cancelText}>{cancelling ? 'Cancelling...' : 'Cancel'}</Text>
          </TouchableOpacity>
          <Text style={s.powered}>Powered by AI</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 20 },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: { alignItems: 'center', marginBottom: 32 },
  logoWrap: {
    width: 72, height: 72, borderRadius: 20,
    overflow: 'hidden', marginBottom: 24,
    shadowColor: '#E8458B', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 20, elevation: 8,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.2)',
  },
  logoImage: { width: 72, height: 72 },
  title: { fontSize: 22, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 8 },
  message: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, textAlign: 'center', lineHeight: 20, minHeight: 20 },
  progressTrack: { width: '100%', height: 3, backgroundColor: colors.border, borderRadius: 1.5, overflow: 'hidden', marginTop: 20 },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 1.5 },

  // ── Activity preview ───────────────────────────────────────────────────────
  previewSection: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, padding: 16, marginBottom: 20,
  },
  previewTitle: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  previewDot: { width: 6, height: 6, borderRadius: 3 },
  previewContent: { flex: 1 },
  previewName: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  previewMeta: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginTop: 2 },
  effortDot: { width: 8, height: 8, borderRadius: 4 },
  previewMore: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginTop: 8, textAlign: 'center' },

  // ── Marketing tip card ─────────────────────────────────────────────────────
  tipCard: {
    backgroundColor: 'rgba(232,69,139,0.06)', borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(232,69,139,0.15)', padding: 20, marginBottom: 20, alignItems: 'center',
  },
  tipIcon: { fontSize: 28, marginBottom: 10, fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif' },
  tipTitle: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 6, textAlign: 'center' },
  tipBody: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },

  // ── Background note ────────────────────────────────────────────────────────
  bgNote: {
    backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1,
    borderColor: colors.border, padding: 14, marginBottom: 20, alignItems: 'center',
  },
  bgNoteText: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },

  // ── Health / AI disclaimer card ────────────────────────────────────────────
  // Distinct from the friendly bgNote above. Uses the theme's secondary
  // (steel blue) so it reads as an informational notice — still calm, but
  // visually distinct from the pink primary and the warm tip card.
  disclaimerCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(75, 107, 143, 0.35)',     // secondary at ~35% opacity
    backgroundColor: 'rgba(75, 107, 143, 0.10)', // secondary at ~10% opacity
    padding: 14,
    marginBottom: 24,
  },
  disclaimerTitle: {
    fontSize: 11, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.secondary, letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 6, textAlign: 'center',
  },
  disclaimerBody: {
    fontSize: 12, fontWeight: '400', fontFamily: FF.regular,
    color: colors.textMid, textAlign: 'center', lineHeight: 18,
  },

  // ── Bottom ─────────────────────────────────────────────────────────────────
  bottom: { paddingHorizontal: 24, paddingBottom: 16 + BOTTOM_INSET, alignItems: 'center' },
  cancelBtn: {
    paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, marginBottom: 12,
  },
  cancelText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },
  powered: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint },
});
