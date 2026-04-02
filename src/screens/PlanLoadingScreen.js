/**
 * Plan loading screen — minimalist animated progress while the plan generates.
 * Progress bar is driven by actual generation progress, not a fixed timer,
 * so it doesn't stall at the end.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { generatePlanWithLLM } from '../services/llmPlanService';
import { savePlan } from '../services/storageService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

// Progress stages — each message maps to a target bar percentage.
// The bar smoothly animates between stages instead of using a fixed timer.
const PROGRESS_STAGES = {
  'Preparing your plan...':               0.05,
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
  const [message, setMessage] = useState('Preparing your plan...');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0.02)).current;

  // Slow creep — while waiting for the AI response, the bar drifts
  // slowly forward so it never looks completely frozen.
  const creepRef = useRef(null);
  const currentTarget = useRef(0.05);

  const startCreep = useCallback((from, ceiling) => {
    // Gradually move from `from` towards `ceiling` over ~30s
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
    currentTarget.current = target;

    const duration = target >= 1.0 ? 300 : 600;
    Animated.timing(progressAnim, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(() => {
      // After reaching this stage, start creeping towards a bit more
      // so the bar never looks stuck between messages.
      if (target < 0.88) {
        startCreep(target, Math.min(target + 0.08, 0.92));
      }
    });
  }, [progressAnim, startCreep]);

  const handleProgress = useCallback((msg) => {
    setMessage(msg);
    const target = PROGRESS_STAGES[msg];
    if (target !== undefined) {
      jumpTo(target);
    }
  }, [jumpTo]);

  useEffect(() => {
    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 500, useNativeDriver: true,
    }).start();

    // Pulsing icon animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    // Start the initial creep right away so the bar moves immediately
    startCreep(0.02, 0.12);

    generate();
  }, []);

  const generate = async () => {
    analytics.events.planGenerationStarted({ weeks: config.weeks, coachId: config.coachId });
    try {
      const plan = await generatePlanWithLLM(goal, config, handleProgress);
      // Carry payment status from config to plan (for starter deferred payment)
      if (config.paymentStatus) {
        plan.paymentStatus = config.paymentStatus;
      }
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
      if (requirePaywall) {
        navigation.replace('Paywall', { nextScreen: 'PlanReady', nextParams: { planId: plan.id } });
      } else {
        navigation.replace('PlanReady', { planId: plan.id });
      }
    } catch (err) {
      analytics.events.planGenerationFailed(err.message);
      setMessage('Something went wrong. Retrying...');
      setTimeout(() => navigation.goBack(), 2000);
    }
  };

  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <Animated.View style={[s.center, { opacity: fadeAnim }]}>
          {/* Pulsing logo */}
          <Animated.View style={[s.logoWrap, { transform: [{ scale: pulseAnim }] }]}>
            <Image source={require('../../assets/icon.png')} style={s.logoImage} />
          </Animated.View>

          <Text style={s.title}>Building your plan</Text>
          <Text style={s.message}>{message}</Text>

          <View style={s.progressTrack}>
            <Animated.View style={[s.progressFill, { width: barWidth }]} />
          </View>
        </Animated.View>

        <Text style={s.powered}>Powered by AI</Text>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },

  logoWrap: {
    width: 80, height: 80, borderRadius: 22,
    overflow: 'hidden', marginBottom: 28,
    shadowColor: '#D97706', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 20, elevation: 8,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.2)',
  },
  logoImage: { width: 80, height: 80 },

  title: { fontSize: 22, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 10 },
  message: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, textAlign: 'center', lineHeight: 20, minHeight: 40 },

  progressTrack: { width: '100%', height: 3, backgroundColor: colors.border, borderRadius: 1.5, overflow: 'hidden', marginTop: 28 },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 1.5 },

  powered: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, textAlign: 'center', paddingBottom: 24 },
});
