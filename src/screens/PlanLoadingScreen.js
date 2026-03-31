/**
 * Plan loading screen — minimalist animated progress while the plan generates.
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { generatePlanWithLLM } from '../services/llmPlanService';
import { savePlan } from '../services/storageService';

const FF = fontFamily;

export default function PlanLoadingScreen({ navigation, route }) {
  const { goal, config } = route.params;
  const [message, setMessage] = useState('Preparing your plan...');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Three animated dots
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 500, useNativeDriver: true,
    }).start();

    // Pulsing dots sequence
    const pulseDot = (dot, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      );

    pulseDot(dot1, 0).start();
    pulseDot(dot2, 200).start();
    pulseDot(dot3, 400).start();

    generate();
  }, []);

  const generate = async () => {
    try {
      const plan = await generatePlanWithLLM(goal, config, setMessage);
      await savePlan(plan);
      navigation.replace('PlanReady', { planId: plan.id });
    } catch (err) {
      setMessage('Something went wrong. Retrying...');
      setTimeout(() => navigation.goBack(), 2000);
    }
  };

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <Animated.View style={[s.center, { opacity: fadeAnim }]}>
          {/* Logo with pulsing dots */}
          <View style={s.logoWrap}>
            <Image source={require('../../assets/icon.png')} style={s.logoImage} />
          </View>
          <View style={s.dotsRow}>
            <Animated.View style={[s.dot, { opacity: dot1 }]} />
            <Animated.View style={[s.dot, { opacity: dot2 }]} />
            <Animated.View style={[s.dot, { opacity: dot3 }]} />
          </View>

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
    overflow: 'hidden', marginBottom: 16,
    shadowColor: '#D97706', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 20, elevation: 8,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.2)',
  },
  logoImage: { width: 80, height: 80 },
  dotsRow: { flexDirection: 'row', gap: 6, marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },

  title: { fontSize: 22, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 10 },
  message: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, textAlign: 'center', lineHeight: 20, minHeight: 40 },

  progressTrack: { width: '100%', height: 3, backgroundColor: colors.border, borderRadius: 1.5, overflow: 'hidden', marginTop: 28 },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 1.5 },

  powered: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, textAlign: 'center', paddingBottom: 24 },
});
