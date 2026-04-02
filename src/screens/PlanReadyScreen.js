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
import { getPlans, getGoals, getWeekActivities, getPlanConfig, savePlan } from '../services/storageService';
import { assessPlan } from '../services/llmPlanService';
import { isSubscribed } from '../services/subscriptionService';

const ADJUSTMENT_SUGGESTIONS = [
  {
    key: 'more_strength',
    icon: '🏋️',
    title: 'More strength',
    description: 'Add extra gym sessions for power & injury prevention',
    adjustments: { addStrength: 1 },
  },
  {
    key: 'more_volume',
    icon: '📈',
    title: 'More volume',
    description: 'Increase weekly ride time for deeper endurance',
    adjustments: { volumeMultiplier: 1.15 },
  },
  {
    key: 'higher_mileage',
    icon: '🚴',
    title: 'Higher mileage',
    description: 'Push longer distances on your key rides',
    adjustments: { mileageMultiplier: 1.2 },
  },
];

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
  const [assessment, setAssessment] = useState(null);
  const assessFade = useRef(new Animated.Value(0)).current;

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
        const g = goals.find(g => g.id === p.goalId) || null;
        setGoal(g);

        // Fetch coach assessment in background
        if (p.configId) {
          const cfg = await getPlanConfig(p.configId);
          const result = await assessPlan(p, g, cfg);
          if (result && result.successChance) {
            setAssessment(result);
            // Persist assessment to the plan
            p.assessment = result;
            await savePlan(p);
            Animated.timing(assessFade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
          }
        }
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
            <View style={s.aiBadge}>
              <Text style={s.aiBadgeText}>{'\u2728'} AI-generated plan</Text>
            </View>
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

          {/* Coach assessment */}
          {assessment && (
            <Animated.View style={[s.assessCard, { opacity: assessFade }]}>
              <Text style={s.assessTitle}>Coach's Assessment</Text>

              {/* Success meter */}
              <View style={s.assessMeter}>
                <View style={s.assessMeterTrack}>
                  <View style={[s.assessMeterFill, { width: `${assessment.successChance}%` }]} />
                </View>
                <Text style={s.assessPercent}>{assessment.successChance}%</Text>
              </View>
              <Text style={s.assessSummary}>{assessment.summary}</Text>

              {/* Strengths */}
              {assessment.strengths?.length > 0 && (
                <View style={s.assessSection}>
                  <Text style={s.assessSectionTitle}>Strengths</Text>
                  {assessment.strengths.map((str, i) => (
                    <View key={i} style={s.assessRow}>
                      <Text style={s.assessTick}>{'\u2713'}</Text>
                      <Text style={s.assessText}>{str}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Recommendations */}
              {assessment.recommendations?.length > 0 && (
                <View style={s.assessSection}>
                  <Text style={s.assessSectionTitle}>Recommendations</Text>
                  {assessment.recommendations.map((rec, i) => (
                    <View key={i} style={s.assessRow}>
                      <View style={[s.assessDot, {
                        backgroundColor: rec.type === 'training' ? colors.primary
                          : rec.type === 'nutrition' ? '#22C55E'
                          : rec.type === 'strength' ? '#8B5CF6'
                          : rec.type === 'mental' ? '#3B82F6'
                          : '#64748B',
                      }]} />
                      <Text style={s.assessText}>{rec.text}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Risk factors */}
              {assessment.riskFactors?.length > 0 && (
                <View style={s.assessSection}>
                  <Text style={s.assessSectionTitle}>Watch out for</Text>
                  {assessment.riskFactors.map((risk, i) => (
                    <View key={i} style={s.assessRow}>
                      <Text style={s.assessWarn}>{'\u26A0'}</Text>
                      <Text style={s.assessText}>{risk}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Animated.View>
          )}

          {/* Plan adjustment suggestions */}
          {assessment && (
            <Animated.View style={[s.suggestionsCard, { opacity: assessFade }]}>
              <Text style={s.suggestionsTitle}>Want to adjust?</Text>
              <Text style={s.suggestionsSubtitle}>Tweak your plan before you start</Text>
              {ADJUSTMENT_SUGGESTIONS.map((sug) => (
                <TouchableOpacity
                  key={sug.key}
                  style={s.suggestionRow}
                  activeOpacity={0.7}
                  onPress={async () => {
                    // Navigate to PlanConfig with adjustment context to reassign days
                    const cfg = plan.configId ? await getPlanConfig(plan.configId) : null;
                    navigation.navigate('PlanConfig', {
                      goal,
                      adjustment: sug.key,
                      adjustmentData: sug.adjustments,
                      existingConfig: cfg,
                      planId: plan.id,
                    });
                  }}
                >
                  <Text style={s.suggestionIcon}>{sug.icon}</Text>
                  <View style={s.suggestionContent}>
                    <Text style={s.suggestionName}>{sug.title}</Text>
                    <Text style={s.suggestionDesc}>{sug.description}</Text>
                  </View>
                  <Text style={s.suggestionArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* CTA */}
        <Animated.View style={[s.ctaWrap, { opacity: ctaFade }]}>
          <View style={s.ctaBtnRow}>
            <TouchableOpacity
              style={s.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <Text style={s.backBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.ctaBtn, { flex: 1 }]}
              onPress={async () => {
                const subscribed = await isSubscribed();
                if (!subscribed) {
                  navigation.replace('Paywall', { nextScreen: 'Home' });
                } else {
                  navigation.replace('Home');
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={s.ctaText}>Start training</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={s.detailLink}
            onPress={async () => {
              const subscribed = await isSubscribed();
              if (!subscribed) {
                navigation.replace('Paywall', { nextScreen: 'PlanOverview', nextParams: { planId: plan.id } });
              } else {
                navigation.replace('PlanOverview', { planId: plan.id });
              }
            }}
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
  aiBadge: {
    marginTop: 12, backgroundColor: 'rgba(217,119,6,0.1)', borderRadius: 100,
    paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(217,119,6,0.2)',
  },
  aiBadgeText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },

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

  // Assessment
  assessCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 18, marginTop: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  assessTitle: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 14 },
  assessMeter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  assessMeterTrack: {
    flex: 1, height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden',
  },
  assessMeterFill: {
    height: '100%', backgroundColor: colors.primary, borderRadius: 4,
  },
  assessPercent: { fontSize: 18, fontWeight: '700', fontFamily: FF.semibold, color: colors.primary, minWidth: 44 },
  assessSummary: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 19, marginBottom: 12 },
  assessSection: { marginTop: 8 },
  assessSectionTitle: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  assessRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  assessTick: { color: '#22C55E', fontSize: 13, fontWeight: '600', width: 16, marginTop: 1 },
  assessDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  assessWarn: { fontSize: 12, width: 16, marginTop: 1 },
  assessText: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, flex: 1, lineHeight: 19 },

  // Suggestions
  suggestionsCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 18, marginTop: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  suggestionsTitle: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  suggestionsSubtitle: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginBottom: 14 },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  suggestionIcon: { fontSize: 22, width: 36 },
  suggestionContent: { flex: 1 },
  suggestionName: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 2 },
  suggestionDesc: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },
  suggestionArrow: { fontSize: 22, color: colors.textMid, marginLeft: 8 },

  // CTA
  ctaWrap: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  ctaBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 0 },
  backBtn: {
    backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  backBtnText: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMid },
  ctaBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { fontSize: 17, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  detailLink: { alignItems: 'center', paddingVertical: 12 },
  detailLinkText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
});
