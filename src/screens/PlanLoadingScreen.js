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
import { colors, fontFamily } from '../theme';
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
  const { goal, config, requirePaywall } = route.params;
  const [message, setMessage] = useState('Building your plan...');
  const [activities, setActivities] = useState([]);
  const [tipIndex, setTipIndex] = useState(0);
  const [cancelling, setCancelling] = useState(false);
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

        // Update live activity preview
        if (job.activities?.length > 0) {
          setActivities(job.activities);
        }

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

    // Navigate straight to PlanReady — no "Plan ready!" flash in between
    if (mountedRef.current) {
      navigation.replace('PlanReady', { planId: plan.id, requirePaywall: !!requirePaywall });
    }
  };

  const generate = async () => {
    analytics.events.planGenerationStarted({ weeks: config.weeks, coachId: config.coachId });

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
  const previewActivities = activities.slice(0, 6);

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

          {/* Live activity preview */}
          {previewActivities.length > 0 && (
            <View style={s.previewSection}>
              <Text style={s.previewTitle}>Sessions being planned</Text>
              {previewActivities.map((a, i) => (
                <View key={a.id || i} style={s.previewRow}>
                  <View style={[s.previewDot, { backgroundColor: a.type === 'strength' ? '#2563EB' : colors.primary }]} />
                  <View style={s.previewContent}>
                    <Text style={s.previewName} numberOfLines={1}>{a.title}</Text>
                    <Text style={s.previewMeta}>
                      Week {a.week} · {a.type}{a.durationMins ? ` · ${a.durationMins}m` : ''}{a.distanceKm ? ` · ${a.distanceKm}km` : ''}
                    </Text>
                  </View>
                  <View style={[s.effortDot, { backgroundColor: a.effort === 'easy' ? '#22C55E' : a.effort === 'hard' ? '#EF4444' : colors.primary }]} />
                </View>
              ))}
              {activities.length > 6 && (
                <Text style={s.previewMore}>+{activities.length - 6} more sessions...</Text>
              )}
            </View>
          )}

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

  // ── Bottom ─────────────────────────────────────────────────────────────────
  bottom: { paddingHorizontal: 24, paddingBottom: 16, alignItems: 'center' },
  cancelBtn: {
    paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, marginBottom: 12,
  },
  cancelText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },
  powered: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint },
});
