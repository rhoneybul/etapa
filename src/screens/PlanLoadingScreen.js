/**
 * Plan loading screen — minimalist animated progress while the plan generates.
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { generatePlanWithLLM } from '../services/llmPlanService';
import { savePlan } from '../services/storageService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

export default function PlanLoadingScreen({ navigation, route }) {
  const { goal, config, requirePaywall } = route.params;
  const [message, setMessage] = useState('Preparing your plan...');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

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

    generate();
  }, []);

  const generate = async () => {
    analytics.events.planGenerationStarted({ weeks: config.weeks, coachId: config.coachId });
    try {
      const plan = await generatePlanWithLLM(goal, config, setMessage);
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

          <ProgressBar />
        </Animated.View>

        <Text style={s.powered}>Powered by AI</Text>
      </SafeAreaView>
    </View>
  );
}

function ProgressBar() {
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: 1, duration: 4500, easing: Easing.out(Easing.quad), useNativeDriver: false,
    }).start();
  }, []);

  const w = width.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '95%'],
  });

  return (
    <View style={s.progressTrack}>
      <Animated.View style={[s.progressFill, { width: w }]} />
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
