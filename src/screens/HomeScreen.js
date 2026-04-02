/**
 * Home screen — dark theme with amber accents.
 * Shows all plans, week calendar with toggle, today's activities.
 * If no plan exists, shows "Make me a plan" CTA.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, TextInput, Image, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { getCurrentUser } from '../services/authService';
import { getPlans, getGoals, getWeekProgress, getWeekActivities, getWeekMonthLabel, deletePlan, savePlan, getPlanConfig } from '../services/storageService';
import { isSubscribed, getSubscriptionStatus, upgradeStarter, openCheckout } from '../services/subscriptionService';
import UpgradePrompt from '../components/UpgradePrompt';
import { isStravaConnected } from '../services/stravaService';
import { getSessionColor, getSessionLabel, getMetricLabel, getCrossTrainingForDay, CROSS_TRAINING_COLOR } from '../utils/sessionLabels';
import { getCoach } from '../data/coaches';
import analytics from '../services/analyticsService';

const FF = fontFamily;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CYCLING_LABELS = { road: 'Road', gravel: 'Gravel', mtb: 'MTB', mixed: 'Mixed' };

/**
 * Compute total plan distance and weekly hours from activities.
 */
function getPlanStats(plan) {
  if (!plan?.activities) return { totalKm: 0, weeklyHrs: 0, sessionsPerWeek: 0 };
  let totalKm = 0;
  let totalMins = 0;
  plan.activities.forEach(a => {
    if (a.distanceKm) totalKm += a.distanceKm;
    if (a.durationMins) totalMins += a.durationMins;
  });
  const weeks = plan.weeks || 1;
  return {
    totalKm: Math.round(totalKm),
    weeklyHrs: (totalMins / weeks / 60).toFixed(1),
    sessionsPerWeek: Math.round(plan.activities.length / weeks),
  };
}

export default function HomeScreen({ navigation }) {
  const [name, setName] = useState(null);
  const [plans, setPlans] = useState([]);
  const [goals, setGoals] = useState([]);
  const [selectedPlanIdx, setSelectedPlanIdx] = useState(0);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [stravaOk, setStravaOk] = useState(false);
  const [activePlanConfig, setActivePlanConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [subPlan, setSubPlan] = useState(null); // 'starter' | 'monthly' | 'annual' | null
  const [unlocking, setUnlocking] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [user, p, g, strava] = await Promise.all([
      getCurrentUser(), getPlans(), getGoals(), isStravaConnected(),
    ]);

    // Gate: if user has plans but no subscription, go straight to paywall.
    // We return without clearing loading so the loading screen stays visible
    // until the navigation completes — no flash of the plans page.
    if (p.length > 0) {
      const subscribed = await isSubscribed();
      if (!subscribed) {
        navigation.replace('Paywall', { fromHome: true, nextScreen: 'Home' });
        return;
      }
    }

    // Fetch subscription plan type (starter, monthly, annual)
    const subStatus = await getSubscriptionStatus();
    setSubPlan(subStatus?.plan || null);

    const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || null;
    setName(displayName);
    setPlans(p);
    setGoals(g);
    setStravaOk(strava);

    if (p.length > 0) {
      const plan = p[selectedPlanIdx] || p[0];
      if (plan?.startDate) {
        const start = new Date(plan.startDate);
        const now = new Date();
        const daysSince = Math.floor((now - start) / (1000 * 60 * 60 * 24));
        const wk = Math.max(1, Math.min(Math.floor(daysSince / 7) + 1, plan.weeks));
        setCurrentWeek(wk);
        analytics.events.planViewed({ planId: plan.id, currentWeek: wk, totalWeeks: plan.weeks });
      }
      if (plan?.configId) {
        const cfg = await getPlanConfig(plan.configId);
        setActivePlanConfig(cfg);
      }
    }
    setLoading(false);
  }, [selectedPlanIdx, navigation]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const firstName = name?.split(' ')[0] ?? null;
  const activePlan = plans[selectedPlanIdx] || null;
  const activeGoal = activePlan ? goals.find(g => g.id === activePlan.goalId) : null;

  // Enter the plan creation flow — paywall is shown after the plan is generated
  const handleMakePlan = async () => {
    // Starter users can only have the beginner plan — prompt upgrade
    if (subPlan === 'starter') {
      setShowUpgrade(true);
      return;
    }
    navigation.navigate('GoalSetup');
  };

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const result = await upgradeStarter();
      if (result.success) {
        setShowUpgrade(false);
        setSubPlan('annual');
        navigation.navigate('GoalSetup');
      }
    } catch {
      Alert.alert('Upgrade failed', 'Something went wrong. Please try again.');
    } finally {
      setUpgrading(false);
    }
  };

  /** Pay for a pending (locked) plan to unlock it */
  const handleUnlockPlan = async (plan) => {
    setUnlocking(true);
    try {
      const result = await openCheckout('starter');
      if (result.success) {
        plan.paymentStatus = 'paid';
        await savePlan(plan);
        await load();
      }
    } catch {
      Alert.alert('Payment failed', 'Something went wrong. Please try again.');
    } finally {
      setUnlocking(false);
    }
  };

  /** Cancel a pending (unpaid) plan */
  const handleCancelPendingPlan = (plan) => {
    Alert.alert(
      'Cancel plan?',
      'This will remove your unpaid plan. You can always set it up again later.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel plan',
          style: 'destructive',
          onPress: async () => {
            await deletePlan(plan.id);
            setSelectedPlanIdx(0);
            await load();
          },
        },
      ],
    );
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.container}>
        <SafeAreaView style={[s.safe, s.loadingWrap]}>
          <Animated.View style={[s.loadingLogoWrap, { transform: [{ scale: pulseAnim }] }]}>
            <Image source={require('../../assets/icon.png')} style={s.loadingLogo} />
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  // ── No plan state ─────────────────────────────────────────────────────────
  if (plans.length === 0) {
    return (
      <View style={s.container}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Image source={require('../../assets/icon.png')} style={s.headerLogo} />
              <View>
                <Text style={s.appName}>Etapa</Text>
                {firstName && <Text style={s.greeting}>Hi, {firstName}</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Settings')} hitSlop={HIT}>
              <View style={s.iconBtn}><Text style={s.iconBtnText}>{'\u2022\u2022\u2022'}</Text></View>
            </TouchableOpacity>
          </View>

          {/* Beginner program card */}
          <TouchableOpacity
            style={s.beginnerCard}
            onPress={() => navigation.navigate('BeginnerProgram')}
            activeOpacity={0.85}
          >
            <View style={s.beginnerBadge}>
              <Text style={s.beginnerBadgeText}>NEW</Text>
            </View>
            <Text style={s.beginnerTitle}>Get into Cycling</Text>
            <Text style={s.beginnerSub}>A friendly 12-week program for complete beginners. No experience needed.</Text>
          </TouchableOpacity>

          <View style={s.emptyPlanWrap}>
            <View style={s.emptyIconCircle}>
              <Text style={s.emptyIcon}>{'\u2192'}</Text>
            </View>
            <Text style={s.emptyTitle}>A new plan awaits{firstName ? `, ${firstName}` : ''}</Text>
            <Text style={s.emptySub}>Set a goal and we'll build your training plan</Text>

            <TouchableOpacity
              style={s.createBtn}
              onPress={handleMakePlan}
              activeOpacity={0.88}
            >
              <Text style={s.createBtnText}>Make me a plan</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
        <UpgradePrompt
          visible={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          onUpgrade={handleUpgrade}
          upgrading={upgrading}
        />
      </View>
    );
  }

  // ── Active plan state ─────────────────────────────────────────────────────
  const progress = getWeekProgress(activePlan, currentWeek);
  const weekActivities = getWeekActivities(activePlan, currentWeek);
  const monthLabel = activePlan ? getWeekMonthLabel(activePlan.startDate, currentWeek) : '';

  const jsDay = new Date().getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1;

  // Group activities by day for the week strip
  const activitiesByDay = {};
  weekActivities.forEach(a => {
    if (a.dayOfWeek != null) {
      if (!activitiesByDay[a.dayOfWeek]) activitiesByDay[a.dayOfWeek] = [];
      activitiesByDay[a.dayOfWeek].push(a);
    }
  });

  const todayActivities = weekActivities.filter(a => a.dayOfWeek === todayIdx);

  const crossTraining = activePlanConfig?.crossTrainingDaysFull || {};

  // Structured summary for a day's activities: returns array of { label, metric, color }
  const getDayItems = (dayIdx) => {
    const items = [];
    const acts = activitiesByDay[dayIdx];
    if (acts && acts.length > 0) {
      acts.forEach(a => items.push({
        label: getSessionLabel(a),
        metric: getMetricLabel(a),
        color: getSessionColor(a),
      }));
    }
    // Add cross-training items
    const ctItems = getCrossTrainingForDay(crossTraining, dayIdx);
    ctItems.forEach(ct => items.push({
      label: ct.label,
      metric: null,
      color: CROSS_TRAINING_COLOR,
      isCrossTraining: true,
    }));
    return items;
  };

  const handleDayPress = (dayIdx) => {
    const acts = activitiesByDay[dayIdx];
    if (!acts || acts.length === 0) return;
    if (acts.length === 1) {
      navigation.navigate('ActivityDetail', { activityId: acts[0].id });
    } else {
      navigation.navigate('WeekView', { week: currentWeek, planId: activePlan.id });
    }
  };

  const handleDeletePlan = (targetPlan, targetGoal) => {
    const planName = targetPlan.name || targetGoal?.eventName || (targetGoal?.targetDistance ? `${targetGoal.targetDistance} km plan` : 'this plan');
    Alert.alert(
      'Delete plan?',
      `This will permanently delete "${planName}" and all its progress.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const completed = (targetPlan.activities || []).filter(a => a.completed).length;
            const total = (targetPlan.activities || []).length;
            analytics.events.planDeleted({ weeks: targetPlan.weeks, completionPct: total > 0 ? Math.round((completed / total) * 100) : 0 });
            await deletePlan(targetPlan.id);
            setSelectedPlanIdx(0);
            await load();
          },
        },
      ],
    );
  };

  const handlePlanLongPress = (targetPlan, targetGoal) => {
    const planName = targetPlan.name || targetGoal?.eventName || (targetGoal?.targetDistance ? `${targetGoal.targetDistance} km plan` : 'this plan');
    Alert.alert(
      planName,
      null,
      [
        {
          text: 'Rename',
          onPress: () => {
            const currentName = targetPlan.name || targetGoal?.eventName || (targetGoal?.targetDistance ? `${targetGoal.targetDistance} km` : 'Plan');
            Alert.prompt(
              'Rename plan',
              'Enter a name for this plan',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Save',
                  onPress: async (name) => {
                    if (name?.trim()) {
                      targetPlan.name = name.trim();
                      await savePlan(targetPlan);
                      await load();
                    }
                  },
                },
              ],
              'plain-text',
              currentName,
            );
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const completed = (targetPlan.activities || []).filter(a => a.completed).length;
            const total = (targetPlan.activities || []).length;
            analytics.events.planDeleted({ weeks: targetPlan.weeks, completionPct: total > 0 ? Math.round((completed / total) * 100) : 0 });
            await deletePlan(targetPlan.id);
            setSelectedPlanIdx(0);
            await load();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Image source={require('../../assets/icon.png')} style={s.headerLogo} />
              <View>
                <Text style={s.appName}>Etapa</Text>
                {firstName && <Text style={s.greeting}>Hi, {firstName}</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Settings')} hitSlop={HIT}>
              <View style={s.iconBtn}><Text style={s.iconBtnText}>{'\u2022\u2022\u2022'}</Text></View>
            </TouchableOpacity>
          </View>

          {/* Beginner program card — only show if no beginner plan exists */}
          {!plans.some(p => p.name === 'Get into Cycling') && (
            <TouchableOpacity
              style={s.beginnerCardCompact}
              onPress={() => navigation.navigate('BeginnerProgram')}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.beginnerCompactTitle}>Get into Cycling</Text>
                <Text style={s.beginnerCompactSub}>12-week beginner program</Text>
              </View>
              <View style={s.beginnerBadge}>
                <Text style={s.beginnerBadgeText}>NEW</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* New plan button */}
          <TouchableOpacity
            style={s.newPlanBtn}
            onPress={handleMakePlan}
            activeOpacity={0.8}
          >
            <Text style={s.newPlanBtnPlus}>+</Text>
            <Text style={s.newPlanBtnText}>New plan</Text>
          </TouchableOpacity>

          {/* Plan tabs — always visible, scrollable */}
          {plans.length > 0 && (
            <View>
              {/* Header row: label + dots */}
              <View style={s.planTabsHeader}>
                <Text style={s.planTabsLabel}>YOUR PLANS</Text>
                {plans.length > 1 && (
                  <View style={s.planDots}>
                    {plans.map((_, i) => (
                      <View key={i} style={[s.planDot, i === selectedPlanIdx && s.planDotActive]} />
                    ))}
                    <Text style={s.planDotsHint}>swipe {'\u00B7'} hold to manage</Text>
                  </View>
                )}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.planTabs}
                contentContainerStyle={s.planTabsContent}
                snapToAlignment="start"
                decelerationRate="fast"
              >
                {plans.map((p, i) => {
                  const g = goals.find(gl => gl.id === p.goalId);
                  const stats = getPlanStats(p);
                  const title = p.name
                    || g?.eventName
                    || (g?.goalType === 'distance' ? `${g.targetDistance} km` : null)
                    || (CYCLING_LABELS[g?.cyclingType] || 'Plan');
                  const meta = [
                    stats.totalKm > 0 ? `${stats.totalKm} km` : null,
                    `${p.weeks} wks`,
                    stats.weeklyHrs > 0 ? `~${stats.weeklyHrs} h/wk` : null,
                  ].filter(Boolean).join(' \u00B7 ');
                  const isActive = i === selectedPlanIdx;

                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[s.planTab, isActive && s.planTabActive]}
                      onPress={() => setSelectedPlanIdx(i)}
                      onLongPress={() => handlePlanLongPress(p, g)}
                      activeOpacity={0.8}
                      delayLongPress={400}
                    >
                      <Text style={[s.planTabTitle, isActive && s.planTabTitleActive]} numberOfLines={1}>{title}</Text>
                      <Text style={[s.planTabMeta, isActive && s.planTabMetaActive]} numberOfLines={1}>{meta}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* ── Locked plan view (payment pending) ─────────────────────── */}
          {activePlan?.paymentStatus === 'pending' && (
            <View style={s.lockedWrap}>
              <View style={s.lockedCard}>
                <View style={s.lockedBadge}>
                  <Text style={s.lockedBadgeText}>PAYMENT REQUIRED</Text>
                </View>
                <Text style={s.lockedTitle}>{activePlan.name || 'Get into Cycling'}</Text>
                <Text style={s.lockedMeta}>{activePlan.weeks} weeks {'\u00B7'} starts {new Date(activePlan.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>

                {/* High-level overview */}
                <View style={s.lockedOverview}>
                  <Text style={s.lockedOverviewTitle}>Plan overview</Text>
                  <Text style={s.lockedOverviewText}>
                    {activePlan.activities?.length || 0} sessions across {activePlan.weeks} weeks
                    {activePlanConfig?.daysPerWeek ? ` \u00B7 ${activePlanConfig.daysPerWeek} days/week` : ''}
                  </Text>
                  <Text style={s.lockedOverviewHint}>
                    Pay to unlock the full plan with detailed sessions, coach chat, and progress tracking.
                  </Text>
                </View>

                {/* Actions */}
                <TouchableOpacity
                  style={[s.lockedPayBtn, unlocking && { opacity: 0.5 }]}
                  onPress={() => handleUnlockPlan(activePlan)}
                  disabled={unlocking}
                  activeOpacity={0.85}
                >
                  <Text style={s.lockedPayBtnText}>{unlocking ? 'Processing...' : 'Pay $50 and unlock'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.lockedCancelBtn}
                  onPress={() => handleCancelPendingPlan(activePlan)}
                  disabled={unlocking}
                  activeOpacity={0.7}
                >
                  <Text style={s.lockedCancelBtnText}>Cancel plan</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Goal summary — at top (only for paid plans) */}
          {activeGoal && activePlan?.paymentStatus !== 'pending' && (
            <View style={s.goalCard}>
              <Text style={s.goalLabel}>YOUR GOAL</Text>
              <Text style={s.goalTitle}>
                {activeGoal.goalType === 'race'
                  ? activeGoal.eventName || 'Race'
                  : activeGoal.goalType === 'distance'
                    ? `Ride ${activeGoal.targetDistance} km`
                    : 'Improve my cycling'}
              </Text>
              <Text style={s.goalMeta}>
                {CYCLING_LABELS[activeGoal.cyclingType] || activeGoal.cyclingType} {'\u00B7'} {activePlan.weeks} week plan
                {activeGoal.targetDate ? ` ${'\u00B7'} Target: ${activeGoal.targetDate}` : ''}
              </Text>
            </View>
          )}

          {/* Full plan content — only shown for paid plans */}
          {activePlan?.paymentStatus !== 'pending' && (<>
          {/* Week calendar strip with navigation */}
          <View style={s.weekStrip}>
            <View style={s.weekNav}>
              <TouchableOpacity
                onPress={() => { const to = Math.max(1, currentWeek - 1); analytics.events.weekNavigated('prev', currentWeek, to); setCurrentWeek(to); }}
                disabled={currentWeek <= 1}
                hitSlop={HIT}
              >
                <Text style={[s.weekNavArrow, currentWeek <= 1 && s.weekNavDisabled]}>{'\u2039'}</Text>
              </TouchableOpacity>
              <View style={s.weekNavCenter}>
                <Text style={s.weekLabel}>Week {currentWeek}/{activePlan.weeks}</Text>
                <Text style={s.monthLabel}>{monthLabel}</Text>
              </View>
              <TouchableOpacity
                onPress={() => { const to = Math.min(activePlan.weeks, currentWeek + 1); analytics.events.weekNavigated('next', currentWeek, to); setCurrentWeek(to); }}
                disabled={currentWeek >= activePlan.weeks}
                hitSlop={HIT}
              >
                <Text style={[s.weekNavArrow, currentWeek >= activePlan.weeks && s.weekNavDisabled]}>{'\u203A'}</Text>
              </TouchableOpacity>
            </View>
            <View style={s.dayRow}>
              {DAY_LABELS.map((d, i) => {
                const items = getDayItems(i);
                const hasActs = items.length > 0;
                const CellWrap = hasActs ? TouchableOpacity : View;
                const cellProps = hasActs ? { onPress: () => handleDayPress(i), activeOpacity: 0.7 } : {};
                return (
                  <CellWrap key={i} style={s.dayCell} {...cellProps}>
                    <Text style={[s.dayLabelText, i === todayIdx && s.dayLabelToday]}>{d}</Text>
                    <View style={[s.dayCircle, i === todayIdx && s.dayCircleToday]}>
                      <Text style={[s.dayNumber, i === todayIdx && s.dayNumberToday]}>
                        {getDayDate(activePlan.startDate, currentWeek, i)}
                      </Text>
                    </View>
                    {items.map((item, idx) => (
                      <View key={idx} style={s.daySummaryRow}>
                        <View style={[s.daySummaryDot, { backgroundColor: item.color }]} />
                        <Text style={[s.daySummaryLabel, { color: item.color }]}>
                          {item.metric || item.label}
                        </Text>
                      </View>
                    ))}
                  </CellWrap>
                );
              })}
            </View>
            {/* Calendar button */}
            <TouchableOpacity
              style={s.calendarBtn}
              onPress={() => navigation.navigate('Calendar')}
              activeOpacity={0.8}
            >
              <Text style={s.calendarBtnText}>View calendar</Text>
              <Text style={s.calendarBtnArrow}>{'\u203A'}</Text>
            </TouchableOpacity>
          </View>

          {/* Today's workouts */}
          {todayActivities.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Today</Text>
              {todayActivities.map(activity => (
                <TouchableOpacity
                  key={activity.id}
                  style={s.todayCard}
                  onPress={() => navigation.navigate('ActivityDetail', { activityId: activity.id })}
                  activeOpacity={0.8}
                >
                  <View style={[s.todayAccent, { backgroundColor: getSessionColor(activity) }]} />
                  <View style={s.todayBody}>
                    <View style={s.todayTitleRow}>
                      <View style={s.todayTypeCol}>
                        <View style={[s.todayTypeBadge, { backgroundColor: getSessionColor(activity) + '18' }]}>
                          <Text style={[s.todayTypeText, { color: getSessionColor(activity) }]}>{getSessionLabel(activity)}</Text>
                        </View>
                      </View>
                      <View style={s.todayTitleWrap}>
                        <Text style={s.todayTitle}>{activity.title}</Text>
                        <Text style={s.todayMeta}>
                          {activity.distanceKm ? `${activity.distanceKm} km` : ''}
                          {activity.distanceKm && activity.durationMins ? ' \u00B7 ' : ''}
                          {activity.durationMins ? `${activity.durationMins} min` : ''}
                          {activity.effort ? ` \u00B7 ${activity.effort}` : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {activity.completed
                    ? <View style={s.doneBadge}><Text style={s.doneMark}>{'\u2713'}</Text></View>
                    : <Text style={s.todayArrow}>{'\u203A'}</Text>
                  }
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Coach chat — prominent card */}
          {activePlan && (() => {
            const coach = getCoach(activePlanConfig?.coachId);
            const coachName = coach?.name || 'Your coach';
            const coachColor = coach?.avatarColor || colors.primary;
            const coachInitials = coach?.avatarInitials || '?';
            return (
              <TouchableOpacity
                style={s.coachCard}
                onPress={() => navigation.navigate('CoachChat', { planId: activePlan.id })}
                activeOpacity={0.8}
              >
                <View style={s.coachCardTop}>
                  <View style={[s.coachAvatar, { backgroundColor: coachColor }]}>
                    <Text style={s.coachAvatarText}>{coachInitials}</Text>
                  </View>
                  <View style={s.coachCardTextWrap}>
                    <Text style={s.coachCardName}>{coachName}</Text>
                    <Text style={s.coachCardHint}>Chat with your coach</Text>
                  </View>
                  <View style={s.coachCardArrowWrap}>
                    <Text style={s.coachCardArrow}>{'\u203A'}</Text>
                  </View>
                </View>
                <Text style={s.coachCardSub}>Get advice, tweak your plan, ask anything about your training</Text>
              </TouchableOpacity>
            );
          })()}

          {/* Week progress */}
          <View style={s.section}>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>This week</Text>
              <Text style={s.sectionMeta}>{progress.done}/{progress.total} done</Text>
            </View>
            <View style={s.weekProgressTrack}>
              <View style={[s.weekProgressFill, { width: `${progress.pct}%` }]} />
            </View>
          </View>

          {/* View full week + View full plan — side by side */}
          <View style={s.viewBtnRow}>
            <TouchableOpacity
              style={s.viewBtnHalf}
              onPress={() => navigation.navigate('WeekView', { week: currentWeek, planId: activePlan.id })}
              activeOpacity={0.85}
            >
              <Text style={s.viewBtnText}>View full week</Text>
              <Text style={s.viewBtnArrow}>{'\u203A'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.viewBtnHalf}
              onPress={() => navigation.navigate('PlanOverview', { planId: activePlan.id })}
              activeOpacity={0.85}
            >
              <Text style={s.viewBtnText}>View full plan</Text>
              <Text style={s.viewBtnArrow}>{'\u203A'}</Text>
            </TouchableOpacity>
          </View>

          {/* Manage plan — bottom of screen */}
          {activePlan && (
            <View style={s.planActions}>
              <TouchableOpacity
                style={s.planActionBtn}
                onPress={() => {
                  const p = plans[selectedPlanIdx];
                  const g = p ? goals.find(gl => gl.id === p.goalId) : null;
                  if (p) handlePlanLongPress(p, g);
                }}
              >
                <Text style={s.planActionText}>{'\u2022\u2022\u2022'} Manage plan</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
          </>)}
        </ScrollView>
      </SafeAreaView>
      <UpgradePrompt
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onUpgrade={handleUpgrade}
        upgrading={upgrading}
      />
    </View>
  );
}

function getDayDate(startDateStr, week, dayIdx) {
  const start = new Date(startDateStr);
  const offset = (week - 1) * 7 + dayIdx;
  const d = new Date(start);
  d.setDate(d.getDate() + offset);
  return d.getDate();
}

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingLogoWrap: {
    width: 80, height: 80, borderRadius: 22, overflow: 'hidden',
    shadowColor: '#D97706', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 20, elevation: 8,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.2)',
  },
  loadingLogo: { width: 80, height: 80 },
  safe:      { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerLogo: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(217,119,6,0.2)' },
  appName: { fontSize: 24, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, letterSpacing: 0.5 },
  greeting: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 1 },

  // Minimalist icon button (three dots)
  iconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 14, color: colors.textMuted, letterSpacing: 1 },

  // New plan button
  newPlanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginLeft: 20, marginBottom: 12,
    paddingVertical: 7, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  newPlanBtnPlus: { fontSize: 16, fontWeight: '400', color: colors.primary },
  newPlanBtnText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },

  // Plan tabs
  planTabsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8 },
  planTabsLabel: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  planDots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  planDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  planDotActive: { backgroundColor: colors.primary, width: 16, borderRadius: 3 },
  planDotsHint: { fontSize: 10, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginLeft: 4 },
  planTabs: { marginBottom: 12, maxHeight: 80 },
  planTabsContent: { paddingHorizontal: 16, gap: 8 },
  planTab: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    minWidth: 130,
  },
  planTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  planTabTitle: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 2 },
  planTabTitleActive: { color: '#fff' },
  planTabMeta: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },
  planTabMetaActive: { color: 'rgba(255,255,255,0.7)' },
  planActions: { paddingHorizontal: 20, marginTop: 8, alignItems: 'center' },
  planActionBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  planActionText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.textFaint },

  // Strava connect
  stravaCard: {
    backgroundColor: colors.surface, marginHorizontal: 20, borderRadius: 16, padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  stravaTitle: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  stravaSub: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },

  // Beginner program card (empty state)
  beginnerCard: {
    marginHorizontal: 20, borderRadius: 16, padding: 20, marginBottom: 16,
    backgroundColor: 'rgba(34,197,94,0.06)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
  },
  beginnerBadge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(34,197,94,0.15)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 10,
  },
  beginnerBadgeText: { fontSize: 10, fontWeight: '700', fontFamily: FF.semibold, color: '#22C55E', letterSpacing: 1 },
  beginnerTitle: { fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  beginnerSub: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 19 },

  // Beginner program card (compact — when plans exist)
  beginnerCardCompact: {
    marginHorizontal: 20, borderRadius: 14, padding: 16, marginBottom: 12,
    backgroundColor: 'rgba(34,197,94,0.06)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
    flexDirection: 'row', alignItems: 'center',
  },
  beginnerCompactTitle: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 2 },
  beginnerCompactSub: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },

  // Empty plan state
  emptyPlanWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 40 },
  emptyIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(217,119,6,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(217,119,6,0.15)' },
  emptyIcon: { fontSize: 28, color: colors.primary },
  emptyTitle: { fontSize: 22, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, textAlign: 'center', marginBottom: 8 },
  emptySub: { fontSize: 15, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, textAlign: 'center', marginBottom: 28 },
  createBtn: { backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 40, shadowColor: '#D97706', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 6 },
  createBtnText: { fontSize: 17, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },

  // Week calendar strip
  weekStrip: { backgroundColor: colors.surface, marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  weekNavCenter: { alignItems: 'center' },
  weekNavArrow: { fontSize: 28, color: colors.text, fontWeight: '300', paddingHorizontal: 8 },
  weekNavDisabled: { color: colors.textFaint },
  weekLabel: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  monthLabel: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginTop: 2 },
  calendarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(217,119,6,0.08)', borderWidth: 1, borderColor: 'rgba(217,119,6,0.15)',
  },
  calendarBtnText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  calendarBtnArrow: { fontSize: 18, color: colors.primary, fontWeight: '300' },
  dayRow: { flexDirection: 'row', justifyContent: 'space-around' },
  dayCell: { alignItems: 'center', minWidth: 40, gap: 3 },
  dayLabelText: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },
  dayLabelToday: { color: colors.primary },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayCircleToday: { backgroundColor: colors.primary },
  dayNumber: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
  dayNumberToday: { color: '#fff' },
  daySummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  daySummaryDot: { width: 5, height: 5, borderRadius: 2.5 },
  daySummaryLabel: { fontSize: 9, fontWeight: '600', fontFamily: FF.semibold },

  // Section
  section: { paddingHorizontal: 20, marginBottom: 16 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 10 },
  sectionMeta: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },

  // Today's cards
  todayCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14,
    overflow: 'hidden', marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  todayAccent: { width: 4, alignSelf: 'stretch' },
  todayBody: { flex: 1, padding: 14 },
  todayTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  todayTypeCol: { alignItems: 'center' },
  todayTypeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  todayTypeText: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, textTransform: 'uppercase', letterSpacing: 0.3 },
  todayTitleWrap: { flex: 1 },
  todayTitle: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  todayMeta: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 2 },
  todayArrow: { fontSize: 24, color: colors.textFaint, paddingRight: 14, fontWeight: '300' },
  doneBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  doneMark: { fontSize: 14, color: '#fff', fontWeight: '700' },

  // Week progress
  weekProgressTrack: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  weekProgressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },

  // View buttons — side by side
  viewBtnRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 16 },
  viewBtnHalf: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  viewBtnText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  viewBtnArrow: { fontSize: 20, color: colors.primary, fontWeight: '300' },

  // Coach chat card — prominent
  coachCard: {
    marginHorizontal: 20, marginBottom: 20, borderRadius: 16,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: 'rgba(217,119,6,0.3)',
    padding: 16, shadowColor: '#D97706', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
  },
  coachCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coachAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  coachAvatarText: { fontSize: 14, fontWeight: '700', color: '#fff', fontFamily: FF.semibold },
  coachCardTextWrap: { flex: 1 },
  coachCardName: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  coachCardHint: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.primary, marginTop: 1 },
  coachCardArrowWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(217,119,6,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  coachCardArrow: { fontSize: 20, color: colors.primary, fontWeight: '600' },
  coachCardSub: {
    fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted,
    marginTop: 10, lineHeight: 17,
  },

  // Goal card
  goalCard: {
    backgroundColor: colors.surface, marginHorizontal: 20, borderRadius: 16, padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  goalLabel: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  goalTitle: { fontSize: 17, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  goalMeta: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },

  // Locked plan (payment pending)
  lockedWrap: { paddingHorizontal: 20, marginTop: 8 },
  lockedCard: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: colors.border,
  },
  lockedBadge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(217,119,6,0.12)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 14,
  },
  lockedBadgeText: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary, letterSpacing: 1 },
  lockedTitle: { fontSize: 20, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 6 },
  lockedMeta: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginBottom: 20 },
  lockedOverview: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: colors.border, marginBottom: 24,
  },
  lockedOverviewTitle: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  lockedOverviewText: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.text, marginBottom: 8 },
  lockedOverviewHint: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, lineHeight: 19 },
  lockedPayBtn: {
    backgroundColor: '#22C55E', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginBottom: 10,
  },
  lockedPayBtnText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  lockedCancelBtn: { alignItems: 'center', paddingVertical: 8 },
  lockedCancelBtnText: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },

});
