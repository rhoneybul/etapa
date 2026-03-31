/**
 * Plan Ready — shown immediately after plan generation.
 * Gives the user a celebratory "here's your plan" summary before
 * they start training. Shows key stats, a mini volume chart,
 * and a prominent CTA to begin.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Animated, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { getPlans, getGoals, getWeekActivities } from '../services/storageService';

const FF = fontFamily;

function getWeekVolume(plan, weekNum) {
  const acts = getWeekActivities(plan, weekNum);
  const totalKm = acts.reduce((s, a) => s + (a.distanceKm || 0), 0);
  const totalMins = acts.reduce((s, a) => s + (a.durationMins || 0), 0);
  const rideCount = acts.filter(a => a.type === 'ride').length;
  const strengthCount = acts.filter(a => a.type === 'strength').length;
  return { totalKm, totalMins, rideCount, strengthCount, total: acts.length };
}

export default function PlanReadyScreen({ navigation, route }) {
  const planId = route.params?.planId;
  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);

  // Animations
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;
  const statsFade = useRef(new Animated.Value(0)).current;
  const chartFade = useRef(new Animated.Value(0)).current;
  const ctaFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const plans = await getPlans();
      const p = plans.find(pl => pl.id === planId) || plans[0];
      setPlan(p);
      if (p) {
        const goals = await getGoals();
        setGoal(goals.find(g => g.id === p.goalId) || null);
      }
    })();
  }, [planId]);

  useEffect(() => {
    if (!plan) return;
    // Staggered entrance animation
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(slideUp, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.timing(statsFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(chartFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(ctaFade, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [plan]);

  if (!plan) return <View style={s.container} />;

  const weekVolumes = Array.from({ length: plan.weeks }, (_, i) => getWeekVolume(plan, i + 1));
  const maxKm = Math.max(...weekVolumes.map(v => v.totalKm), 1);

  const totalKm = weekVolumes.reduce((s, v) => s + v.totalKm, 0);
  const totalSessions = plan.activities?.length || 0;
  const totalHours = weekVolumes.reduce((s, v) => s + v.totalMins, 0) / 60;
  const totalRides = plan.activities?.filter(a => a.type === 'ride').length || 0;
  const totalStrength = plan.activities?.filter(a => a.type === 'strength').length || 0;

  const start = new Date(plan.startDate);
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + (plan.weeks * 7) - 1);
  const formatShort = (d) => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  };

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>

          {/* Hero */}
          <Animated.View style={[s.hero, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
            <View style={s.checkCircle}>
              <Text style={s.checkMark}>{'\u2713'}</Text>
            </View>
            <Text style={s.heroTitle}>Your plan is ready</Text>
            <Text style={s.heroSub}>
              {plan.weeks} weeks of structured training{'\n'}
              {formatShort(start)} {'\u2013'} {formatShort(endDate)}
            </Text>
          </Animated.View>

          {/* Stats grid */}
          <Animated.View style={[s.statsGrid, { opacity: statsFade }]}>
            <View style={s.statCard}>
              <Text style={s.statValue}>{Math.round(totalKm)}</Text>
              <Text style={s.statLabel}>Total km</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statValue}>{totalSessions}</Text>
              <Text style={s.statLabel}>Sessions</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statValue}>{totalHours.toFixed(0)}</Text>
              <Text style={s.statLabel}>Hours</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statValue}>{plan.weeks}</Text>
              <Text style={s.statLabel}>Weeks</Text>
            </View>
          </Animated.View>

          {/* Breakdown */}
          <Animated.View style={[s.breakdownCard, { opacity: statsFade }]}>
            {totalRides > 0 && (
              <View style={s.breakdownRow}>
                <View style={[s.breakdownDot, { backgroundColor: '#D97706' }]} />
                <Text style={s.breakdownLabel}>{totalRides} ride{totalRides !== 1 ? 's' : ''}</Text>
              </View>
            )}
            {totalStrength > 0 && (
              <View style={s.breakdownRow}>
                <View style={[s.breakdownDot, { backgroundColor: '#8B5CF6' }]} />
                <Text style={s.breakdownLabel}>{totalStrength} strength session{totalStrength !== 1 ? 's' : ''}</Text>
              </View>
            )}
            <View style={s.breakdownRow}>
              <View style={[s.breakdownDot, { backgroundColor: '#64748B' }]} />
              <Text style={s.breakdownLabel}>{Math.floor(plan.weeks / 4)} recovery week{Math.floor(plan.weeks / 4) !== 1 ? 's' : ''} built in</Text>
            </View>
          </Animated.View>

          {/* Mini volume chart */}
          <Animated.View style={[s.chartCard, { opacity: chartFade }]}>
            <Text style={s.chartTitle}>Weekly volume build-up</Text>
            <View style={s.chartArea}>
              {weekVolumes.map((v, i) => {
                const h = maxKm > 0 ? Math.max(4, (v.totalKm / maxKm) * 80) : 4;
                const isDeload = (i + 1) % 4 === 0;
                return (
                  <View key={i} style={s.chartCol}>
                    <View style={[
                      s.chartBar,
                      { height: h },
                      isDeload && s.chartBarDeload,
                    ]} />
                  </View>
                );
              })}
            </View>
            {/* Date labels along x-axis */}
            <View style={s.chartDateRow}>
              {weekVolumes.map((_, i) => {
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const weekStart = new Date(start);
                weekStart.setDate(weekStart.getDate() + i * 7);
                // Show label for first, last, and every ~4 weeks
                const showLabel = i === 0 || i === plan.weeks - 1 || (i > 0 && i < plan.weeks - 1 && (i + 1) % 4 === 0);
                const label = `${weekStart.getDate()} ${months[weekStart.getMonth()]}`;
                return (
                  <View key={i} style={s.chartDateCol}>
                    {showLabel ? <Text style={s.chartDateLabel}>{label}</Text> : null}
                  </View>
                );
              })}
            </View>
          </Animated.View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* CTA */}
        <Animated.View style={[s.ctaWrap, { opacity: ctaFade }]}>
          <TouchableOpacity
            style={s.ctaBtn}
            onPress={() => navigation.replace('Home')}
            activeOpacity={0.8}
          >
            <Text style={s.ctaText}>Start training</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.detailLink}
            onPress={() => navigation.replace('PlanOverview', { planId: plan.id })}
            activeOpacity={0.7}
          >
            <Text style={s.detailLinkText}>View full plan details</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },

  // Hero
  hero: { alignItems: 'center', paddingTop: 40, marginBottom: 28 },
  checkCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 2, borderColor: '#22C55E',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  checkMark: { fontSize: 28, color: '#22C55E', fontWeight: '700' },
  heroTitle: { fontSize: 26, fontWeight: '700', fontFamily: FF.semibold, color: colors.text, marginBottom: 8 },
  heroSub: { fontSize: 15, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, textAlign: 'center', lineHeight: 22 },

  // Stats
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1, alignItems: 'center', paddingVertical: 16,
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  statValue: { fontSize: 22, fontWeight: '700', fontFamily: FF.semibold, color: colors.text },
  statLabel: { fontSize: 10, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Breakdown
  breakdownCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  breakdownDot: { width: 8, height: 8, borderRadius: 4 },
  breakdownLabel: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid },

  // Chart
  chartCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  chartTitle: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 12 },
  chartArea: { flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 2 },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  chartBar: { width: '80%', backgroundColor: colors.primary, borderRadius: 2, minHeight: 4 },
  chartBarDeload: { backgroundColor: '#64748B' },
  chartDateRow: { flexDirection: 'row', marginTop: 6, gap: 2 },
  chartDateCol: { flex: 1, alignItems: 'center' },
  chartDateLabel: { fontSize: 8, fontWeight: '500', fontFamily: FF.medium, color: colors.textFaint },

  // CTA
  ctaWrap: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  ctaBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { fontSize: 17, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  detailLink: { alignItems: 'center', paddingVertical: 12 },
  detailLinkText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
});
