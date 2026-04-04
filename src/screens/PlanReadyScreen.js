/**
 * Plan Ready — shown immediately after plan generation.
 * Gives the user a celebratory "here's your plan" summary before
 * they start training. Shows key stats, a mini volume chart,
 * and a prominent CTA to begin.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Animated, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { getPlans, getGoals, getWeekActivities, getPlanConfig, savePlan, getUserPrefs } from '../services/storageService';
import { assessPlan, editPlanWithLLM } from '../services/llmPlanService';
import { isSubscribed } from '../services/subscriptionService';
import { connectStrava, isStravaConnected, isStravaConfigured } from '../services/stravaService';
import { convertDistance, distanceLabel } from '../utils/units';
import StravaLogo from '../components/StravaLogo';

const FF = fontFamily;

const SUGGEST_COLORS = {
  training: '#D97706',
  nutrition: '#22C55E',
  strength: '#8B5CF6',
  cross_training: '#06B6D4',
  mental: '#3B82F6',
  recovery: '#64748B',
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
  const requirePaywall = route.params?.requirePaywall || false;
  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [loadingAssessment, setLoadingAssessment] = useState(false);
  const [units, setUnits] = useState('km');
  const [stravaOk, setStravaOk] = useState(false);
  const [connectingStrava, setConnectingStrava] = useState(false);
  const assessFade = useRef(new Animated.Value(0)).current;

  // Guard against double-tap navigation
  const navigatingRef = useRef(false);

  // Animations
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;
  const statsFade = useRef(new Animated.Value(0)).current;
  const chartFade = useRef(new Animated.Value(0)).current;
  const ctaFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getUserPrefs().then(prefs => setUnits(prefs.units || 'km')).catch(() => {});
    isStravaConnected().then(setStravaOk).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const plans = await getPlans();
      const p = plans.find(pl => pl.id === planId) || plans[0];
      setPlan(p);
      if (p) {
        const goals = await getGoals();
        const g = goals.find(g => g.id === p.goalId) || null;
        setGoal(g);

        // Use cached assessment if available, otherwise fetch
        if (p.assessment && p.assessment.successChance) {
          setAssessment(p.assessment);
          Animated.timing(assessFade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
        } else if (p.configId) {
          setLoadingAssessment(true);
          const cfg = await getPlanConfig(p.configId);
          const result = await assessPlan(p, g, cfg);
          setLoadingAssessment(false);
          if (result && result.successChance) {
            setAssessment(result);
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

  // Refresh plan after returning from suggestion application
  useEffect(() => {
    const unsub = navigation.addListener('focus', async () => {
      if (planId) {
        const plans = await getPlans();
        const p = plans.find(pl => pl.id === planId) || plans[0];
        if (p) setPlan(p);
      }
    });
    return unsub;
  }, [navigation, planId]);

  if (!plan) return <View style={s.container} />;

  const weekVolumes = Array.from({ length: plan.weeks }, (_, i) => getWeekVolume(plan, i + 1));
  const maxKm = Math.max(...weekVolumes.map(v => v.totalKm), 1);

  const totalKm = weekVolumes.reduce((s, v) => s + v.totalKm, 0);
  const totalSessions = plan.activities?.length || 0;
  const totalHours = weekVolumes.reduce((s, v) => s + v.totalMins, 0) / 60;
  const totalRides = plan.activities?.filter(a => a.type === 'ride').length || 0;
  const totalStrength = plan.activities?.filter(a => a.type === 'strength').length || 0;

  const startParts = plan.startDate.split('T')[0].split('-');
  const start = new Date(Number(startParts[0]), Number(startParts[1]) - 1, Number(startParts[2]), 12, 0, 0);
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
              <Text style={s.aiBadgeText}>AI-generated plan</Text>
            </View>
          </Animated.View>

          {/* Stats grid */}
          <Animated.View style={[s.statsGrid, { opacity: statsFade }]}>
            <View style={s.statCard}>
              <Text style={s.statValue}>{convertDistance(totalKm, units)}</Text>
              <Text style={s.statLabel}>Total {distanceLabel(units)}</Text>
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

          {/* Coach assessment — loading state */}
          {loadingAssessment && !assessment && (
            <View style={s.assessCard}>
              <Text style={s.assessTitle}>Coach's Assessment</Text>
              <View style={s.assessLoading}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={s.assessLoadingText}>Your coach is reviewing the plan...</Text>
              </View>
            </View>
          )}

          {/* Coach assessment — loaded */}
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
              <Text style={s.assessReadinessExplain}>
                Readiness score — how well this plan matches your fitness level, available time, and goal. Based on training load progression, recovery balance, and periodisation.
              </Text>
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

              {/* Suggestions — concrete ways to improve, now tappable */}
              {(assessment.suggestions || assessment.recommendations)?.length > 0 && (
                <View style={s.assessSection}>
                  <Text style={s.assessSectionTitle}>Ways to level up</Text>
                  <Text style={s.assessSectionHint}>Tap a suggestion to apply it to your plan</Text>
                  {(assessment.suggestions || assessment.recommendations).map((sug, i) => {
                    const sugColor = SUGGEST_COLORS[sug.type] || '#64748B';
                    const appliedKey = sug.title || sug.text || '';
                    const isApplied = (plan.appliedSuggestions || []).includes(appliedKey);
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[s.suggestCard, isApplied && s.suggestCardApplied]}
                        activeOpacity={isApplied ? 1 : 0.7}
                        onPress={() => {
                          if (isApplied) return;
                          navigation.navigate('ApplySuggestion', {
                            planId: plan.id,
                            goalId: goal?.id,
                            suggestion: sug,
                          });
                        }}
                      >
                        <View style={s.suggestHeader}>
                          <View style={[s.assessDot, { backgroundColor: isApplied ? '#64748B' : sugColor }]} />
                          <Text style={[s.suggestTitle, isApplied && s.suggestTitleApplied]}>{sug.title || sug.type}</Text>
                          {isApplied
                            ? <Text style={s.suggestAppliedLabel}>{'\u2713'} Applied</Text>
                            : <Text style={s.suggestApplyArrow}>{'\u203A'}</Text>
                          }
                        </View>
                        <Text style={[s.assessText, isApplied && s.suggestTextApplied]}>{sug.text}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </Animated.View>
          )}

          {/* Suggestions are now applied via ApplySuggestionScreen */}

          {/* Strava connect prompt — only show if not already connected */}
          {isStravaConfigured && !stravaOk && (
            <Animated.View style={[s.stravaCard, { opacity: ctaFade }]}>
              <View style={s.stravaHeader}>
                <View style={s.stravaLogo}><StravaLogo size={20} color="#fff" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.stravaTitle}>Connect Strava</Text>
                  <Text style={s.stravaSub}>Automatically track your rides and match them to your plan</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[s.stravaBtn, connectingStrava && { opacity: 0.6 }]}
                onPress={async () => {
                  setConnectingStrava(true);
                  try {
                    await connectStrava();
                    setStravaOk(true);
                  } catch {}
                  setConnectingStrava(false);
                }}
                activeOpacity={0.85}
                disabled={connectingStrava}
              >
                {connectingStrava
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.stravaBtnText}>Connect</Text>
                }
              </TouchableOpacity>
            </Animated.View>
          )}
          {stravaOk && (
            <Animated.View style={[s.stravaConnected, { opacity: ctaFade }]}>
              <Text style={s.stravaConnectedIcon}>{'\u2713'}</Text>
              <Text style={s.stravaConnectedText}>Strava connected — your rides will sync automatically</Text>
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
                if (navigatingRef.current) return;
                navigatingRef.current = true;
                try {
                  if (requirePaywall) {
                    navigation.navigate('Paywall', { nextScreen: 'Home' });
                  } else {
                    const subscribed = await isSubscribed();
                    if (!subscribed) {
                      navigation.navigate('Paywall', { nextScreen: 'Home' });
                    } else {
                      navigation.replace('Home');
                    }
                  }
                } finally {
                  // Reset after a short delay so the guard clears when coming back
                  setTimeout(() => { navigatingRef.current = false; }, 1000);
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={s.ctaText}>{requirePaywall ? 'Subscribe to start' : 'Start training'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={s.detailLink}
            onPress={() => navigation.navigate('PlanOverview', { planId: plan.id })}
            activeOpacity={0.7}
          >
            <Text style={s.detailLinkText}>View full plan details</Text>
          </TouchableOpacity>
          {plan.configId && (
            <TouchableOpacity
              style={s.detailLink}
              onPress={async () => {
                const cfg = await getPlanConfig(plan.configId);
                navigation.navigate('CoachChat', { planId: plan.id, coachId: cfg?.coachId });
              }}
              activeOpacity={0.7}
            >
              <Text style={[s.detailLinkText, { color: colors.primary }]}>Ask your coach a question</Text>
            </TouchableOpacity>
          )}
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
  assessLoading: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  assessLoadingText: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },
  assessReadinessExplain: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, lineHeight: 16, marginBottom: 10 },
  assessSectionHint: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginBottom: 10 },
  suggestCard: { backgroundColor: 'rgba(217,119,6,0.04)', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(217,119,6,0.08)' },
  suggestCardApplied: { opacity: 0.45, backgroundColor: 'rgba(100,116,139,0.04)', borderColor: 'rgba(100,116,139,0.08)' },
  suggestTitleApplied: { color: colors.textMuted },
  suggestTextApplied: { color: colors.textFaint },
  suggestAppliedLabel: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: '#64748B' },
  suggestHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  suggestTitle: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, flex: 1 },
  suggestApplyArrow: { fontSize: 22, color: colors.textMid },

  // Day picker
  dayPickerOverlay: {
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 14, padding: 20, marginTop: 16,
  },
  dayPickerCard: { alignItems: 'center' },
  dayPickerTitle: { fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  dayPickerSub: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginBottom: 16 },
  dayPickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  dayPickerBtn: {
    backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: colors.border, minWidth: 60, alignItems: 'center',
  },
  dayPickerBtnText: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  dayPickerCancel: { marginTop: 16, paddingVertical: 10 },
  dayPickerCancelText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },

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

  // Strava connect
  stravaCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 18, marginTop: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  stravaHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  stravaLogo: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: '#FC4C02',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  stravaTitle: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  stravaSub: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, marginTop: 2, lineHeight: 17 },
  stravaBtn: {
    backgroundColor: '#FC4C02', borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  stravaBtnText: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  stravaConnected: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16,
    backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.15)',
  },
  stravaConnectedIcon: { fontSize: 18, color: '#22C55E', fontWeight: '700' },
  stravaConnectedText: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, flex: 1 },
});
