/**
 * Home screen — dark theme with amber accents.
 * Shows all plans, week calendar with toggle, today's activities.
 * If no plan exists, shows "Make me a plan" CTA.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, TextInput, Image, ImageBackground, Animated, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily, BOTTOM_INSET } from '../theme';
import useScreenGuard from '../hooks/useScreenGuard';
import { getCurrentUser } from '../services/authService';
import { getPlans, getGoals, getWeekProgress, getWeekActivities, getWeekMonthLabel, deletePlan, savePlan, getPlanConfig, getUserPrefs, isOnboardingDone, setOnboardingDone, saveGoal } from '../services/storageService';
import OnboardingTour from '../components/OnboardingTour';
import { isSubscribed, getSubscriptionStatus, openCheckout, getPrices } from '../services/subscriptionService';
import UpgradePrompt from '../components/UpgradePrompt';
import { isStravaConnected } from '../services/stravaService';
import { syncStravaActivities, getStravaActivitiesForWeek, getStravaActivitiesForDate } from '../services/stravaSyncService';
import { getSessionColor, getSessionLabel, getSessionTag, getMetricLabel, getCrossTrainingForDay, getActivityIcon, CROSS_TRAINING_COLOR } from '../utils/sessionLabels';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCoach } from '../data/coaches';
import analytics from '../services/analyticsService';
import api from '../services/api';
import remoteConfig from '../services/remoteConfig';
import { t } from '../services/strings';
import ComingSoon from '../components/ComingSoon';
import StravaLogo from '../components/StravaLogo';
import { triggerMaintenanceMode } from '../../App';
import { syncPlansToServer } from '../services/storageService';
import PlanPickerScreen from './PlanPickerScreen';

const FF = fontFamily;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CYCLING_LABELS = { road: 'Road', gravel: 'Gravel', mtb: 'MTB', ebike: 'E-Bike', mixed: 'Mixed' };

// Suggestion category colours — primary (training/action), secondary (info/support), neutral (recovery)
// Uniform dark blue for all activity indicators in the week strip & calendar
const ACTIVITY_BLUE = '#A0A8B4';

const SUGGEST_COLORS = {
  training:      '#E8458B', // primary
  nutrition:     ACTIVITY_BLUE,
  strength:      ACTIVITY_BLUE,
  cross_training:ACTIVITY_BLUE,
  mental:        ACTIVITY_BLUE,
  recovery:      '#64748B', // neutral slate
};

function getSuggestIcon(type) {
  switch (type) {
    case 'training':       return 'bike';
    case 'strength':       return 'dumbbell';
    case 'cross_training': return 'run';
    case 'nutrition':      return 'food-apple';
    case 'mental':         return 'brain';
    case 'recovery':       return 'sleep';
    default:               return 'star-four-points';
  }
}

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

export default function HomeScreen({ navigation, route }) {
  // Remote kill-switch / redirect — see WORKFLOWS.md.
  const _screenGuard = useScreenGuard('HomeScreen', navigation);

  // When arriving from plan creation, freshPlanId is set — skip the Home
  // pulsing-logo loading state AND the no-plan empty state until the new
  // plan has loaded into local state. Without this guard, the user sees
  // a brief flash of Home's loader (or worse, the "no plan" CTA) between
  // PlanLoadingScreen and the populated plan view.
  const freshPlanId = route?.params?.freshPlanId || null;
  const [name, setName] = useState(null);
  const [plans, setPlans] = useState([]);
  const [goals, setGoals] = useState([]);
  const [selectedPlanIdx, setSelectedPlanIdx] = useState(0);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [stravaOk, setStravaOk] = useState(false);
  const [activePlanConfig, setActivePlanConfig] = useState(null);
  // If freshPlanId is set, suppress the pulsing-logo initial loader —
  // PlanLoadingScreen has just shown the user a polished loading UI, and we
  // don't want a jarring second loader on top of it.
  const [loading, setLoading] = useState(!freshPlanId);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [planLimits, setPlanLimits] = useState(null); // { used, limit, remaining, unlimited }
  const [upgrading, setUpgrading] = useState(false);
  const [subPlan, setSubPlan] = useState(null); // 'starter' | 'monthly' | 'annual' | null
  const [unlocking, setUnlocking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [starterPriceLabel, setStarterPriceLabel] = useState(null); // fetched from server
  const [subscribed, setSubscribed] = useState(true); // assumed true until checked
  const [previewDaysLeft, setPreviewDaysLeft] = useState(null); // null = subscribed / no limit
  const [trialConfig, setTrialConfig] = useState({ days: 7, bannerMessage: 'Subscribe to unlock full training access' });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [comingSoonConfig, setComingSoonConfig] = useState(null);
  // PlanPicker (guided intake) visibility — starts true on mount if the
  // remote flag is on AND no plans exist. User can "Skip" to fall back to
  // the legacy three-card empty state. Flag defaults to false so this is
  // strictly opt-in until turned on via remote config.
  const [pickerDismissed, setPickerDismissed] = useState(false);
  // Delete-in-progress overlay. When truthy, we render a full-screen spinner
  // on top of whatever the home would otherwise show. Also prevents downstream
  // components from rendering against stale state during the reload (seen in
  // Sentry as "Cannot read property 'weeks' of undefined" on delete).
  const [deleting, setDeleting] = useState(false);
  const [stravaActivities, setStravaActivities] = useState([]);
  const [selectedDayIdx, setSelectedDayIdx] = useState(null); // tapped day in the week strip
  const [movingActivity, setMovingActivity] = useState(null); // { activity } when hold-to-move
  const [actionActivity, setActionActivity] = useState(null); // { activity } when action bar shown
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const cachedPlanHash = useRef(null); // Track plan state to avoid unnecessary reloads
  const initialLoadDone = useRef(false);
  const isMounted = useRef(true); // Guard against setState after unmount

  useEffect(() => {
    isMounted.current = true;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => {
      isMounted.current = false;
      anim.stop(); // prevent accessing deallocated native nodes after unmount
    };
  }, []);

  const load = useCallback(async ({ force = false } = {}) => {
    // On focus, only reload if plan data may have changed
    if (!force && initialLoadDone.current) {
      const p = await getPlans();
      const hash = JSON.stringify(p.map(pl => ({ id: pl.id, updatedAt: pl.updatedAt, actLen: pl.activities?.length })));
      if (hash === cachedPlanHash.current) return; // No changes — skip reload
    }
    setLoading(!initialLoadDone.current); // Only show loading spinner on first load
    const [user, p, g, strava, userPrefs, remoteConfig] = await Promise.all([
      getCurrentUser(), getPlans(), getGoals(), isStravaConnected(), getUserPrefs(),
      api.appConfig.get().catch(() => ({})),
    ]);

    // Push any locally-stored plans to the server (idempotent upsert — safe to run every load).
    // This ensures the admin dashboard always has up-to-date data even if earlier syncs failed.
    if (p.length > 0) syncPlansToServer().catch(() => {});

    // Sync remote trial config into state so the banner message updates
    const remoteTrial = remoteConfig?.trial_config;
    const resolvedTrialConfig = {
      days: remoteTrial?.days ?? 7,
      bannerMessage: remoteTrial?.bannerMessage ?? 'Subscribe to unlock full training access',
    };
    if (isMounted.current) setTrialConfig(resolvedTrialConfig);

    // Load coming soon config (only shown if showOnHome is true)
    if (remoteConfig?.coming_soon && isMounted.current) {
      setComingSoonConfig(remoteConfig.coming_soon);
    }

    // Check subscription status — unsubscribed users get a remote-configurable preview window
    if (p.length > 0) {
      const subCheck = await isSubscribed();
      if (!isMounted.current) return; // component unmounted during async call
      if (!subCheck) {
        // Find the oldest plan's creation date to start the trial clock
        const sortedByDate = [...p].sort((a, b) => {
          const da = new Date(a.createdAt || a.startDate || 0);
          const db = new Date(b.createdAt || b.startDate || 0);
          return da - db;
        });
        const firstCreatedAt = sortedByDate[0]?.createdAt || sortedByDate[0]?.startDate;
        const daysSinceFirst = firstCreatedAt
          ? Math.floor((Date.now() - new Date(firstCreatedAt).getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        const PREVIEW_DAYS = resolvedTrialConfig.days;
        if (daysSinceFirst > PREVIEW_DAYS) {
          // Preview window expired — require subscription.
          // If the user has a beginner ("Get into Cycling") plan, send them straight
          // to the starter plan paywall rather than the full plan-picker.
          const hasBeginnerPlan = p.some(pl => pl.name?.startsWith('Get into Cycling'))
            || g.some(gl => gl.goalType === 'beginner');
          navigation.replace('Paywall', {
            fromHome: true,
            nextScreen: 'Home',
            source: 'trial_expired',
            ...(hasBeginnerPlan && { defaultPlan: 'starter' }),
          });
          return;
        }
        setPreviewDaysLeft(Math.max(0, PREVIEW_DAYS - daysSinceFirst));
        setSubscribed(false);
      } else {
        setSubscribed(true);
        setPreviewDaysLeft(null);
      }
    } else {
      setSubscribed(true);
      setPreviewDaysLeft(null);
    }

    // Fetch subscription plan type (starter, monthly, annual)
    const subStatus = await getSubscriptionStatus();
    if (!isMounted.current) return;
    setSubPlan(subStatus?.plan || null);

    // Fetch live prices (non-blocking) — only update state if still mounted
    getPrices().then(prices => {
      if (isMounted.current && prices?.starter) setStarterPriceLabel(prices.starter.formatted);
    }).catch(() => {});

    const displayName = userPrefs?.displayName || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || null;
    if (!isMounted.current) return;
    setName(displayName);
    setPlans(p);
    setGoals(g);

    // Show onboarding tour for first-time users (no plans and hasn't seen it)
    if (p.length === 0 && !initialLoadDone.current) {
      const obDone = await isOnboardingDone();
      if (!obDone && isMounted.current) setShowOnboarding(true);
    }
    setStravaOk(strava);
    cachedPlanHash.current = JSON.stringify(p.map(pl => ({ id: pl.id, updatedAt: pl.updatedAt, actLen: pl.activities?.length })));
    initialLoadDone.current = true;

    if (p.length > 0) {
      const plan = p[selectedPlanIdx] || p[0];
      if (plan?.startDate) {
        const start = parseDateLocal(plan.startDate);
        const now = new Date();
        const daysSince = Math.round((now - start) / (1000 * 60 * 60 * 24));
        const totalWeeks = (typeof plan.weeks === 'number' && !isNaN(plan.weeks) && plan.weeks > 0) ? plan.weeks : 8;
        const wk = Math.max(1, Math.min(Math.floor(daysSince / 7) + 1, totalWeeks));
        setCurrentWeek(isNaN(wk) ? 1 : wk);
        analytics.events.planViewed({ planId: plan.id, currentWeek: wk, totalWeeks });
      }
      if (plan?.configId) {
        const cfg = await getPlanConfig(plan.configId);
        if (!isMounted.current) return;
        setActivePlanConfig(cfg);
      }
      // Sync Strava activities (non-blocking — falls back to cache)
      if (strava) {
        syncStravaActivities(plan, { force }).then(async (result) => {
          if (!isMounted.current) return;
          if (result?.stravaActivities) setStravaActivities(result.stravaActivities);
          // If activities were auto-completed by Strava match, reload plan to reflect changes
          if (result?.matchedCount > 0) {
            const refreshedPlans = await getPlans();
            if (isMounted.current) {
              setPlans(refreshedPlans);
              cachedPlanHash.current = JSON.stringify(refreshedPlans.map(pl => ({ id: pl.id, updatedAt: pl.updatedAt, actLen: pl.activities?.length })));
            }
          }
        }).catch(() => {});
      }
    }
    if (isMounted.current) setLoading(false);
  }, [selectedPlanIdx, navigation]);

  useEffect(() => { load({ force: true }); }, [load]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => load());
    return unsub;
  }, [navigation, load]);

  // Fetch rate-limit usage so we can show the user how many plans they have
  // remaining today. Refresh on focus so it stays accurate.
  const refreshPlanLimits = useCallback(async () => {
    try {
      const res = await api.users.limits();
      if (res?.plans) setPlanLimits(res.plans);
    } catch {}
  }, []);
  useEffect(() => { refreshPlanLimits(); }, [refreshPlanLimits]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', refreshPlanLimits);
    return unsub;
  }, [navigation, refreshPlanLimits]);

  // Deselect day when navigating to a different week
  useEffect(() => { setSelectedDayIdx(null); }, [currentWeek]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Check remote config for maintenance mode on every refresh
    try {
      const config = await api.appConfig.get();
      const maint = config?.maintenance_mode;
      if (maint?.enabled) {
        triggerMaintenanceMode(maint);
        setRefreshing(false);
        return;
      }
    } catch {}
    await load({ force: true });
    // Force Strava re-sync on pull-to-refresh
    if (stravaOk && plans[selectedPlanIdx]) {
      syncStravaActivities(plans[selectedPlanIdx], { force: true }).then(result => {
        if (isMounted.current && result?.stravaActivities) setStravaActivities(result.stravaActivities);
      }).catch(() => {});
    }
    setRefreshing(false);
  }, [load, stravaOk, plans, selectedPlanIdx]);

  const firstName = name?.split(' ')[0] ?? null;
  const activePlan = plans[selectedPlanIdx] || null;
  const activeGoal = activePlan ? goals.find(g => g.id === activePlan.goalId) : null;

  // Enter the plan creation flow — paywall is shown after the plan is generated
  const handleMakePlan = async () => {
    // Client-side guard: show a friendly alert if the user is at the weekly
    // plan cap. Server also enforces this (429), but this saves the user
    // from walking through the full goal-setup wizard only to hit a wall
    // at the end.
    if (planLimits && !planLimits.unlimited && planLimits.remaining === 0) {
      Alert.alert(
        'Weekly plan limit reached',
        `You've generated ${planLimits.used} of ${planLimits.limit} plans in the last 7 days. The count resets as individual plans age out. If you need more, contact support.`,
        [{ text: 'OK' }],
      );
      return;
    }
    const subscribed = __DEV__ ? false : await isSubscribed();
    navigation.navigate('GoalSetup', { requirePaywall: !subscribed });
  };

  // Third pathway — "Just get better". Skips the goal wizard (no target
  // distance / event name / target date to pick), but still goes through
  // the full PlanConfigScreen so the user can pick training types, long
  // ride day, schedule sessions, duration, and coach — same UI as the
  // other flows, just with the target-specific questions removed.
  const handleQuickPlan = async () => {
    const subscribed = __DEV__ ? false : await isSubscribed();
    try {
      const goal = await saveGoal({
        cyclingType: 'mixed',
        goalType: 'improve',
        planName: 'Keep improving',
        targetDistance: null,
        targetElevation: null,
        targetTime: null,
        targetDate: null,
        eventName: null,
      });
      analytics.events?.quickPlanStarted?.({ entry: 'home_card' });
      navigation.navigate('PlanConfig', { goal, requirePaywall: !subscribed });
    } catch (err) {
      console.error('[handleQuickPlan] saveGoal failed:', err);
      // Fall back to the old minimal screen if the goal save fails for any
      // reason — better than a dead-end tap.
      navigation.navigate('QuickPlan', { requirePaywall: !subscribed });
    }
  };

  const handleUpgrade = () => {
    setShowUpgrade(false);
    navigation.navigate('Paywall', { nextScreen: 'Home', source: 'home_upgrade_banner' });
  };

  /** Pay for a pending (locked) plan to unlock it */
  const handleUnlockPlan = async (plan) => {
    setUnlocking(true);
    try {
      // Auto-apply the starter promo code
      const result = await openCheckout('starter', null, 'promo_1TI5VkAmoVZFfAwUakin4FXz');
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

  // ── Delete-in-progress overlay ────────────────────────────────────────────
  // Short (well under a second) gap between `deletePlan` resolving and
  // `load()` repopulating `plans`. Rendering the full page during that window
  // can hit stale state (see Sentry "Cannot read property 'weeks' of
  // undefined"). We return a dedicated spinner screen so no downstream
  // component renders against an inconsistent world.
  if (deleting) {
    return (
      <View style={s.container}>
        <SafeAreaView style={[s.safe, s.loadingWrap]}>
          <View style={s.deletingCard}>
            <Animated.View style={[s.loadingLogoWrap, { transform: [{ scale: pulseAnim }], marginBottom: 12 }]}>
              <Image source={require('../../assets/icon.png')} style={s.loadingLogoSmall} />
            </Animated.View>
            <Text style={s.deletingText}>Deleting plan…</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── No plan state ─────────────────────────────────────────────────────────
  // Guard: if we just arrived from plan generation (`freshPlanId`) and plans
  // haven't hydrated yet, don't flash the empty-state "Make me a plan" CTA.
  // Render a blank matching surface for the handful of frames it takes for
  // getPlans() to populate `plans`.
  if (plans.length === 0 && freshPlanId) {
    return <View style={[s.container, { backgroundColor: colors.bg }]} />;
  }

  if (plans.length === 0) {
    // Guided PlanPicker flow — opt-in via remote config. Defaults off so the
    // legacy three-card layout below keeps working exactly as it did until
    // `features.planPicker.enabled` is flipped to true.
    const pickerOn = remoteConfig.getBool('features.planPicker.enabled', false);
    if (pickerOn && !pickerDismissed) {
      return (
        <PlanPickerScreen
          navigation={navigation}
          onDismiss={() => setPickerDismissed(true)}
        />
      );
    }
    return (
      <ImageBackground
        source={require('../../assets/bg-mountain.jpg')}
        style={s.container}
        imageStyle={s.bgImage}
        resizeMode="cover"
      >
        {/* Dark overlay to make the photo very faint */}
        <View style={s.bgOverlay} />
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

          <ScrollView contentContainerStyle={s.emptyPlanWrap} showsVerticalScrollIndicator={false}>
            <Text style={s.emptyTitle}>
              {firstName ? `Hey ${firstName}, let's ride` : "Let's ride"}
            </Text>
            <Text style={s.emptySub}>{t('home.chooseSub')}</Text>

            {/* Pathway 1 — Getting into cycling (beginner program) */}
            {remoteConfig.getBool('features.beginnerProgram.enabled', true) && (
            <TouchableOpacity
              style={s.beginnerCard}
              onPress={() => navigation.navigate('BeginnerProgram')}
              activeOpacity={0.88}
            >
              <View style={s.beginnerBadge}>
                <Text style={s.beginnerBadgeText}>{t('home.pathway.beginner.badge')}</Text>
              </View>
              <Text style={s.beginnerTitle}>{t('home.pathway.beginner.title')}</Text>
              <Text style={s.beginnerSub} numberOfLines={2}>
                {t('home.pathway.beginner.description')}
              </Text>
              <View style={s.cardFeatureRow}>
                {['12-week programme', 'Couch to 100k', 'No experience needed'].map(f => (
                  <View key={f} style={s.cardFeaturePill}>
                    <Text style={s.cardFeaturePillText}>{f}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
            )}

            {/* Pathway 2 — Building a plan (goal-driven) */}
            <TouchableOpacity
              style={s.createBtn}
              onPress={handleMakePlan}
              activeOpacity={0.88}
            >
              <View style={s.beginnerBadge}>
                <Text style={s.beginnerBadgeText}>{t('home.pathway.plan.badge')}</Text>
              </View>
              <Text style={s.createBtnTitle}>{t('home.pathway.plan.title')}</Text>
              <Text style={s.createBtnSub} numberOfLines={2}>
                {t('home.pathway.plan.description')}
              </Text>
              <View style={s.cardFeatureRow}>
                {['Pick your target date', 'Built around your week', 'Adjusts as you go'].map(f => (
                  <View key={f} style={s.cardFeaturePill}>
                    <Text style={s.cardFeaturePillText}>{f}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>

            {/* Pathway 3 — Just want to improve (quick plan) */}
            {remoteConfig.getBool('features.quickPlan.enabled', true) && (
            <TouchableOpacity
              style={s.createBtn}
              onPress={handleQuickPlan}
              activeOpacity={0.88}
            >
              <View style={s.beginnerBadge}>
                <Text style={s.beginnerBadgeText}>{t('home.pathway.quick.badge')}</Text>
              </View>
              <Text style={s.createBtnTitle}>{t('home.pathway.quick.title')}</Text>
              <Text style={s.createBtnSub} numberOfLines={2}>
                {t('home.pathway.quick.description')}
              </Text>
              <View style={s.cardFeatureRow}>
                {['Ongoing plan', 'Flexible', '2 minutes to set up'].map(f => (
                  <View key={f} style={s.cardFeaturePill}>
                    <Text style={s.cardFeaturePillText}>{f}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
        <UpgradePrompt
          visible={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          onUpgrade={handleUpgrade}
          upgrading={upgrading}
        />
        <OnboardingTour
          visible={showOnboarding}
          onComplete={() => {
            setShowOnboarding(false);
            setOnboardingDone();
          }}
          onCreatePlan={handleMakePlan}
        />
      </ImageBackground>
    );
  }

  // ── Active plan state ─────────────────────────────────────────────────────
  const progress = getWeekProgress(activePlan, currentWeek);
  const weekActivities = getWeekActivities(activePlan, currentWeek);
  const monthLabel = activePlan ? getWeekMonthLabel(activePlan.startDate, currentWeek) : '';

  const jsDay = new Date().getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1;

  // ── Real today's week — independent of which week the user is browsing ────
  // We compute this so "Today" always shows actual today's sessions, not whatever
  // week happens to be selected in the strip.
  const realTodayWeek = (() => {
    if (!activePlan?.startDate) return currentWeek;
    const monday = snapToMonday(parseDateLocal(activePlan.startDate));
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const diffDays = Math.floor((now - monday) / (1000 * 60 * 60 * 24));
    // If the plan hasn't started yet, "today" isn't inside the plan timeline.
    // In that case, treat the "go to today" control as "go to start".
    if (diffDays < 0) return 1;
    return Math.min(Math.floor(diffDays / 7) + 1, activePlan.weeks || 1);
  })();
  const planHasStarted = (() => {
    if (!activePlan?.startDate) return true;
    const monday = snapToMonday(parseDateLocal(activePlan.startDate));
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    return now >= monday;
  })();
  const viewingToday = planHasStarted && currentWeek === realTodayWeek;

  // Today's activities always come from the real today's week
  const todayWeekActivities = viewingToday
    ? weekActivities
    : getWeekActivities(activePlan, realTodayWeek);
  const todayActivities = todayWeekActivities.filter(a => a.dayOfWeek === todayIdx);
  const todayDateStr = activePlan?.startDate ? getDayDateStr(activePlan.startDate, realTodayWeek, todayIdx) : null;
  const todayStravaRides = todayDateStr
    ? getStravaActivitiesForDate(stravaActivities, todayDateStr).filter(sa =>
        !todayActivities.some(a => a.stravaActivityId === sa.stravaId)
      )
    : [];

  // Group activities by day for the week strip (still from currently-viewed week)
  const activitiesByDay = {};
  weekActivities.forEach(a => {
    const d = a.dayOfWeek ?? 0;
    if (!activitiesByDay[d]) activitiesByDay[d] = [];
    activitiesByDay[d].push(a);
  });

  const crossTraining = activePlanConfig?.crossTrainingDaysFull || {};

  // Get Strava activities for the current week
  const stravaForWeek = getStravaActivitiesForWeek(stravaActivities, currentWeek);

  // Selected day (tapped in week strip) — activities, strava, cross-training
  const selectedDayActivities = selectedDayIdx !== null ? (activitiesByDay[selectedDayIdx] || []) : [];
  const selectedDayDateStr = selectedDayIdx !== null && activePlan?.startDate
    ? getDayDateStr(activePlan.startDate, currentWeek, selectedDayIdx) : null;
  const selectedDayStrava = selectedDayDateStr
    ? getStravaActivitiesForDate(stravaActivities, selectedDayDateStr).filter(
        sa => !selectedDayActivities.some(a => a.stravaActivityId === sa.stravaId)
      )
    : [];
  const selectedDayCT = selectedDayIdx !== null ? getCrossTrainingForDay(crossTraining, selectedDayIdx) : [];
  const selectedDayHasContent = selectedDayActivities.length > 0 || selectedDayStrava.length > 0 || selectedDayCT.length > 0;
  // Nice display label for selected day: e.g. "Tuesday · 8 Apr"
  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const selectedDayDisplayLabel = (() => {
    if (selectedDayIdx === null || !activePlan?.startDate) return null;
    const monday = snapToMonday(parseDateLocal(activePlan.startDate));
    const d = new Date(monday);
    d.setDate(d.getDate() + (currentWeek - 1) * 7 + selectedDayIdx);
    return `${DAY_LABELS[selectedDayIdx]} \u00B7 ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
  })();

  // Structured summary for a day's activities: returns array of { label, metric, color }
  const getDayItems = (dayIdx) => {
    const items = [];
    const acts = activitiesByDay[dayIdx];
    if (acts && acts.length > 0) {
      acts.forEach(a => items.push({
        label: getSessionLabel(a),
        metric: getMetricLabel(a),
        color: getSessionColor(a),
        _activity: a,
      }));
    }
    // Add Strava rides that don't already match a planned activity
    const dayDate = getDayDateStr(activePlan.startDate, currentWeek, dayIdx);
    const stravaForDay = getStravaActivitiesForDate(stravaActivities, dayDate);
    stravaForDay.forEach(sa => {
      // Skip if this Strava activity already matched a planned activity (shown above)
      const alreadyMatched = acts?.some(a => a.stravaActivityId === sa.stravaId);
      if (!alreadyMatched) {
        items.push({
          label: sa.name || 'Ride',
          metric: sa.distanceKm ? `${sa.distanceKm}km` : null,
          color: '#FC4C02', // Strava orange
          isStrava: true,
        });
      }
    });
    // Add cross-training items
    const ctItems = getCrossTrainingForDay(crossTraining, dayIdx);
    ctItems.forEach(ct => items.push({
      label: ct.label,
      metric: null,
      color: CROSS_TRAINING_COLOR,
      isCrossTraining: true,
      ctKey: ct.key,
    }));
    return items;
  };

  const handleDayPress = (dayIdx) => {
    if (movingActivity) {
      handlePlaceActivity(dayIdx);
      return;
    }
    // Toggle: tap same day again to deselect
    setSelectedDayIdx(prev => prev === dayIdx ? null : dayIdx);
  };

  // Long-press an activity — show move/delete options
  const handleActivityLongPress = (activity) => {
    setActionActivity({ activity });
  };

  const handleActionMove = () => {
    if (!actionActivity) return;
    setMovingActivity({ activity: actionActivity.activity });
    setSelectedDayIdx(null);
    setActionActivity(null);
  };

  const handleActionDelete = async () => {
    if (!actionActivity || !activePlan) return;
    const allPlans = await getPlans();
    const plan = allPlans.find(p => p.id === activePlan.id);
    if (!plan) return;
    plan.activities = (plan.activities || []).filter(a => a.id !== actionActivity.activity.id);
    await savePlan(plan);
    setActionActivity(null);
    setSelectedDayIdx(null);
    load();
  };

  // Place a moving activity on a target day (within current week)
  const handlePlaceActivity = async (targetDayIdx) => {
    if (!movingActivity || !activePlan) { setMovingActivity(null); return; }
    const { activity } = movingActivity;
    // Same day — cancel
    if (targetDayIdx === activity.dayOfWeek && currentWeek === activity.week) {
      setMovingActivity(null);
      return;
    }
    const allPlans = await getPlans();
    const plan = allPlans.find(p => p.id === activePlan.id);
    if (!plan) { setMovingActivity(null); return; }
    const act = plan.activities.find(a => a.id === activity.id);
    if (act) {
      act.week = currentWeek;
      act.dayOfWeek = targetDayIdx;
      await savePlan(plan);
    }
    setMovingActivity(null);
    load();
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
            setDeleting(true);
            try {
              await deletePlan(targetPlan.id);
              setSelectedPlanIdx(0);
              await load();
            } finally {
              setDeleting(false);
            }
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
            setDeleting(true);
            try {
              await deletePlan(targetPlan.id);
              setSelectedPlanIdx(0);
              await load();
            } finally {
              setDeleting(false);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  if (_screenGuard.blocked) return _screenGuard.render();

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 + BOTTOM_INSET }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        >
          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Image source={require('../../assets/icon.png')} style={s.headerLogo} />
              <View>
                <View style={s.appNameRow}>
                  <Text style={s.appName}>Etapa</Text>
                  {/* Lifetime chip — shown once the user has both a plan AND
                      lifetime access, so new lifetime grantees see it land
                      the moment their first plan generates. */}
                  {subPlan === 'lifetime' && plans.length > 0 && (
                    <View style={s.lifetimeChip}>
                      <Text style={s.lifetimeChipText}>LIFETIME</Text>
                    </View>
                  )}
                </View>
                {firstName && <Text style={s.greeting}>Hi, {firstName}</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Settings')} hitSlop={HIT}>
              <View style={s.iconBtn}><Text style={s.iconBtnText}>{'\u2022\u2022\u2022'}</Text></View>
            </TouchableOpacity>
          </View>

          {/* Subscribe banner — shown when user has a plan but no active subscription */}
          {!subscribed && plans.length > 0 && (
            <TouchableOpacity
              style={s.subscribeBanner}
              onPress={() => {
                // Send beginner ("Get into Cycling") users straight to the starter plan
                // instead of the full monthly/annual/lifetime picker.
                const hasBeginnerPlan = plans.some(pl => pl.name?.startsWith('Get into Cycling'))
                  || goals.some(gl => gl.goalType === 'beginner');
                navigation.navigate('Paywall', {
                  nextScreen: 'Home',
                  source: 'home_subscribe_banner',
                  ...(hasBeginnerPlan && { defaultPlan: 'starter' }),
                });
              }}
              activeOpacity={0.85}
            >
              <View style={s.subscribeBannerLeft}>
                <Text style={s.subscribeBannerTitle}>
                  {previewDaysLeft !== null && previewDaysLeft <= 1
                    ? 'Last day of preview'
                    : previewDaysLeft !== null
                      ? `${previewDaysLeft} days of preview left`
                      : 'Subscribe to start training'}
                </Text>
                <Text style={s.subscribeBannerSub}>{trialConfig.bannerMessage}</Text>
              </View>
              <Text style={s.subscribeBannerArrow}>{'\u203A'}</Text>
            </TouchableOpacity>
          )}

          {/* Coming Soon — only on home when admin sets showOnHome */}
          {comingSoonConfig?.showOnHome && <ComingSoon config={comingSoonConfig} />}

          {/* New plan button */}
          <TouchableOpacity
            style={[s.newPlanBtn, planLimits && !planLimits.unlimited && planLimits.remaining === 0 && { opacity: 0.5 }]}
            onPress={handleMakePlan}
            activeOpacity={0.8}
          >
            <Text style={s.newPlanBtnPlus}>+</Text>
            <Text style={s.newPlanBtnText}>New plan</Text>
          </TouchableOpacity>
          {/* Rolling 24h plan usage — always visible when non-unlimited, so the
              user can see their remaining quota before starting a generation. */}
          {planLimits && !planLimits.unlimited && (
            <Text style={[
              s.planLimitHint,
              planLimits.remaining === 0 && s.planLimitHintBlocked,
              planLimits.remaining > 0 && planLimits.remaining <= 2 && s.planLimitHintWarning,
            ]}>
              {planLimits.remaining === 0
                ? `Weekly limit reached \u2014 ${planLimits.used}/${planLimits.limit} plans in last 7 days`
                : `${planLimits.remaining} of ${planLimits.limit} plans left this week`}
            </Text>
          )}

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
                <Text style={s.lockedMeta}>{activePlan?.weeks ?? '—'} weeks {'\u00B7'} starts {activePlan?.startDate ? parseDateLocal(activePlan.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</Text>

                {/* High-level overview */}
                <View style={s.lockedOverview}>
                  <Text style={s.lockedOverviewTitle}>Plan overview</Text>
                  <Text style={s.lockedOverviewText}>
                    {activePlan?.activities?.length || 0} sessions across {activePlan?.weeks ?? '—'} weeks
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
                  <Text style={s.lockedPayBtnText}>{unlocking ? 'Processing...' : `Pay ${starterPriceLabel || '$39.99'} and unlock`}</Text>
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

          {/* Coach chat card — moved ABOVE the goal card so it's the first
              thing the user sees after the header. Coach chat is the single
              highest-value interaction on the home screen (advice, plan
              tweaks, quick questions) but was previously buried below the
              week strip + Today. Discoverability hit reported via TestFlight
              + user research. */}
          {activePlan && activePlan.paymentStatus !== 'pending' && (() => {
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

          {/* Goal summary — at top (only for paid plans) */}
          {activeGoal && activePlan?.paymentStatus !== 'pending' && (
            <View style={s.goalCard}>
              <Text style={s.goalLabel}>YOUR GOAL</Text>
              <Text style={s.goalTitle}>
                {activeGoal.goalType === 'race'
                  ? activeGoal.eventName || 'Race'
                  : activeGoal.goalType === 'distance'
                    ? `Ride ${activeGoal.targetDistance} km`
                    : activeGoal.goalType === 'beginner' && activeGoal.targetDistance
                      ? `Ride ${activeGoal.targetDistance} km`
                      : 'Improve my cycling'}
              </Text>
              <Text style={s.goalMeta}>
                {CYCLING_LABELS[activeGoal.cyclingType] || activeGoal.cyclingType} {'\u00B7'} {activePlan?.weeks ?? '—'} week plan
                {activeGoal.targetDate ? ` ${'\u00B7'} Target: ${activeGoal.targetDate}` : ''}
              </Text>
            </View>
          )}

          {/* Full plan content — only shown for paid plans */}
          {activePlan?.paymentStatus !== 'pending' && (<>

          {/* Moving activity banner */}
          {movingActivity && (
            <View style={s.moveBanner}>
              <MaterialCommunityIcons name="cursor-move" size={16} color="#fff" />
              <Text style={s.moveBannerText} numberOfLines={1}>
                Moving: {movingActivity.activity.title}
              </Text>
              <TouchableOpacity onPress={() => setMovingActivity(null)} hitSlop={HIT}>
                <Text style={s.moveBannerCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Today hero card ─────────────────────────────────────────────
              The first thing a returning user should see: "here's what you're
              doing today." Strong CTA to open the session, secondary CTA to
              ask the coach. Three states: active ride, rest day, done. Only
              renders when the plan has actually started (pre-start users see
              the week strip start hint instead). */}
          {planHasStarted && (() => {
            const primary = todayActivities.find(a => a.type === 'ride') || todayActivities[0] || null;
            const coach = getCoach(activePlanConfig?.coachId);
            const coachFirstName = (coach?.name || 'your coach').split(' ')[0];

            // ── Rest day ────────────────────────────────────────────────
            if (!primary) {
              return (
                <View style={s.todayHero}>
                  <Text style={s.todayHeroLabel}>TODAY</Text>
                  <Text style={s.todayHeroTitle}>Rest day</Text>
                  <Text style={s.todayHeroSub}>Recovery is training too. Your legs will thank you tomorrow.</Text>
                  <View style={s.todayHeroActions}>
                    <TouchableOpacity
                      style={s.todayHeroCoachBtn}
                      onPress={() => navigation.navigate('CoachChat', { planId: activePlan.id })}
                      activeOpacity={0.85}
                    >
                      <Text style={s.todayHeroCoachBtnText}>Ask {coachFirstName}</Text>
                      <Text style={s.todayHeroCoachBtnArrow}>{'\u203A'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }

            // ── Active / completed ride ─────────────────────────────────
            const metaParts = [];
            if (primary.distanceKm) metaParts.push(`${primary.distanceKm} km`);
            if (primary.durationMins) metaParts.push(`${primary.durationMins} min`);
            if (primary.effort) metaParts.push(primary.effort);
            const meta = metaParts.join(' \u00B7 ');
            const isDone = !!primary.completed;

            return (
              <View style={[s.todayHero, isDone && s.todayHeroDone]}>
                <View style={s.todayHeroHeader}>
                  <Text style={s.todayHeroLabel}>TODAY</Text>
                  {isDone && (
                    <View style={s.todayHeroDoneBadge}>
                      <Text style={s.todayHeroDoneBadgeText}>{'\u2713'} DONE</Text>
                    </View>
                  )}
                </View>
                <Text style={s.todayHeroTitle} numberOfLines={2}>{primary.title}</Text>
                {meta ? <Text style={s.todayHeroSub}>{meta}</Text> : null}
                <View style={s.todayHeroActions}>
                  <TouchableOpacity
                    style={[s.todayHeroCta, isDone && s.todayHeroCtaDone]}
                    onPress={() => navigation.navigate('WeekView', { week: realTodayWeek, planId: activePlan.id })}
                    activeOpacity={0.85}
                  >
                    <Text style={s.todayHeroCtaText}>{isDone ? 'View session' : 'See session'}</Text>
                    <Text style={s.todayHeroCtaArrow}>{'\u203A'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.todayHeroCoachBtn}
                    onPress={() => navigation.navigate('CoachChat', { planId: activePlan.id })}
                    activeOpacity={0.85}
                  >
                    <Text style={s.todayHeroCoachBtnText}>Ask {coachFirstName}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}

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
                {(!viewingToday && (planHasStarted ? currentWeek !== realTodayWeek : currentWeek !== 1)) && (
                  <TouchableOpacity
                    onPress={() => {
                      // If the plan hasn't started yet, jump to week 1 (plan start week).
                      // Otherwise, jump to the actual week containing today's date.
                      setCurrentWeek(planHasStarted ? realTodayWeek : 1);
                    }}
                    hitSlop={HIT}
                    style={s.goTodayBtn}
                  >
                    <Text style={s.goTodayText}>{planHasStarted ? 'Go to today' : 'Go to start'}</Text>
                  </TouchableOpacity>
                )}
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
                const isSelected = i === selectedDayIdx;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[s.dayCell, isSelected && s.dayCellSelected, movingActivity && s.dayCellDropTarget]}
                    onPress={() => handleDayPress(i)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.dayLabelText, viewingToday && i === todayIdx && s.dayLabelToday, isSelected && s.dayLabelSelected]}>{d}</Text>
                    <View style={[s.dayCircle, viewingToday && i === todayIdx && s.dayCircleToday, isSelected && s.dayCircleSelected]}>
                      <Text style={[s.dayNumber, viewingToday && i === todayIdx && s.dayNumberToday, isSelected && s.dayNumberSelected]}>
                        {getDayDate(activePlan.startDate, currentWeek, i)}
                      </Text>
                    </View>
                    {items.map((item, idx) => {
                      const iconName = item.isCrossTraining
                        ? getActivityIcon(item.ctKey || 'other')
                        : getActivityIcon(item._activity);
                      const iconColor = isSelected ? 'rgba(255,255,255,0.9)' : ACTIVITY_BLUE;
                      const metricText = item.metric || '';
                      return (
                        <View key={idx} style={s.daySummaryCol}>
                          <MaterialCommunityIcons
                            name={iconName}
                            size={10}
                            color={iconColor}
                          />
                          {metricText ? (
                            <Text style={[s.daySummaryMetric, { color: iconColor }]} numberOfLines={1}>
                              {metricText}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Inline week list — full session titles for every day so the
                user sees the whole week at a glance without tapping through
                to the calendar. Today highlighted in pink. */}
            <View style={s.weekList}>
              {DAY_LABELS.map((dLabel, i) => {
                const dayActs = activitiesByDay[i] || [];
                const isTodayRow = viewingToday && i === todayIdx;
                const rides = dayActs.filter(a => a.type === 'ride');
                const strengths = dayActs.filter(a => a.type === 'strength');
                const other = dayActs.filter(a => a.type !== 'ride' && a.type !== 'strength');
                const isRest = dayActs.length === 0 || dayActs.every(a => a.type === 'rest');
                const primary = rides[0] || strengths[0] || other[0] || null;
                const extras = dayActs.length - (primary ? 1 : 0);
                const formatMeta = (a) => {
                  if (!a) return '';
                  const bits = [];
                  if (a.distanceKm) bits.push(`${a.distanceKm} km`);
                  if (a.durationMins) {
                    const h = Math.floor(a.durationMins / 60);
                    const m = a.durationMins % 60;
                    bits.push(h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m} min`);
                  }
                  return bits.join(' \u00B7 ');
                };
                return (
                  <TouchableOpacity
                    key={`wl-${i}`}
                    style={[s.weekListRow, isTodayRow && s.weekListRowToday]}
                    onPress={() => handleDayPress(i)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.weekListDay, isTodayRow && s.weekListDayToday]}>{dLabel.slice(0, 3)}</Text>
                    <View style={s.weekListContent}>
                      {isRest ? (
                        <Text style={s.weekListRest}>Rest</Text>
                      ) : (
                        <>
                          {/* Tiny-caps session-type tag — matches the pill
                              already used on the Today card ("STRENGTH"). Tells
                              the user at a glance what kind of session the day
                              is without them having to parse a coach-named
                              session title like "Melt". Monochrome. */}
                          {(() => {
                            const tag = getSessionTag(primary);
                            return tag ? (
                              <View style={s.weekListTag}>
                                <Text style={s.weekListTagText}>{tag}</Text>
                              </View>
                            ) : null;
                          })()}
                          <Text style={[s.weekListTitle, isTodayRow && s.weekListTitleToday]} numberOfLines={1}>
                            {primary?.title || 'Session'}
                            {extras > 0 ? <Text style={s.weekListExtra}>  +{extras} more</Text> : null}
                          </Text>
                          {!!formatMeta(primary) && (
                            <Text style={s.weekListMeta} numberOfLines={1}>{formatMeta(primary)}</Text>
                          )}
                        </>
                      )}
                    </View>
                    {isTodayRow && <View style={s.weekListTodayPill}><Text style={s.weekListTodayPillText}>TODAY</Text></View>}
                  </TouchableOpacity>
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

          {/* Selected day panel — shown when user taps a day in the strip */}
          {selectedDayIdx !== null && (
            <View style={s.section}>
              <View style={s.selectedDayHeader}>
                <Text style={s.sectionTitle}>{selectedDayDisplayLabel}</Text>
              </View>
              {!selectedDayHasContent && (
                <View style={s.restDayCard}>
                  <MaterialCommunityIcons name="sleep" size={16} color={colors.textFaint} />
                  <Text style={s.restDayText}>Rest day — no activities scheduled</Text>
                </View>
              )}
              {selectedDayCT.map((ct, idx) => (
                <View key={`sel-ct-${idx}`} style={s.todayCard}>
                  <View style={[s.todayAccent, { backgroundColor: ACTIVITY_BLUE }]} />
                  <View style={s.todayBody}>
                    <View style={s.todayTitleRow}>
                      <View style={s.todayTypeCol}>
                        <View style={[s.todayTypeBadge, { backgroundColor: ACTIVITY_BLUE + '24' }]}>
                          <Text style={[s.todayTypeText, { color: ACTIVITY_BLUE }]}>YOUR ACTIVITY</Text>
                        </View>
                      </View>
                      <View style={s.todayTitleWrap}>
                        <Text style={s.todayTitle}>{ct.label}</Text>
                        <Text style={s.todayMeta}>Factored into plan recovery</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
              {selectedDayActivities.map(activity => (
                <TouchableOpacity
                  key={activity.id}
                  style={[s.todayCard, actionActivity?.activity?.id === activity.id && s.todayCardActive]}
                  onPress={() => actionActivity ? setActionActivity(null) : navigation.navigate('ActivityDetail', { activityId: activity.id })}
                  onLongPress={() => handleActivityLongPress(activity)}
                  delayLongPress={400}
                  activeOpacity={0.8}
                >
                  <View style={[s.todayAccent, { backgroundColor: ACTIVITY_BLUE }]} />
                  <View style={s.todayBody}>
                    <View style={s.todayTitleRow}>
                      <View style={s.todayTypeCol}>
                        <View style={[s.todayTypeBadge, { backgroundColor: ACTIVITY_BLUE + '18' }]}>
                          <Text style={[s.todayTypeText, { color: ACTIVITY_BLUE }]}>{getSessionLabel(activity)}</Text>
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
                    : <MaterialCommunityIcons name="dots-vertical" size={18} color={colors.textFaint} style={{ paddingRight: 10 }} />
                  }
                </TouchableOpacity>
              ))}
              {selectedDayStrava.map(sa => (
                <View key={sa.stravaId} style={s.todayCard}>
                  <View style={[s.todayAccent, { backgroundColor: '#FC4C02' }]} />
                  <View style={s.todayBody}>
                    <View style={s.todayTitleRow}>
                      <View style={s.todayTypeCol}>
                        <View style={[s.todayTypeBadge, { backgroundColor: 'rgba(252,76,2,0.12)' }]}>
                          <Text style={[s.todayTypeText, { color: '#FC4C02' }]}>STRAVA</Text>
                        </View>
                      </View>
                      <View style={s.todayTitleWrap}>
                        <Text style={s.todayTitle}>{sa.name || 'Ride'}</Text>
                        <Text style={s.todayMeta}>
                          {sa.distanceKm ? `${sa.distanceKm} km` : ''}
                          {sa.distanceKm && sa.durationMins ? ' \u00B7 ' : ''}
                          {sa.durationMins ? `${sa.durationMins} min` : ''}
                          {sa.avgSpeedKmh ? ` \u00B7 ${sa.avgSpeedKmh} km/h` : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.stravaRideLogo}><StravaLogo size={18} /></View>
                </View>
              ))}
            </View>
          )}

          {/* Today's workouts — shown only when no day is explicitly selected */}
          {selectedDayIdx === null && (todayActivities.length > 0 || todayStravaRides.length > 0) && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Today</Text>
              {todayActivities.map(activity => (
                <TouchableOpacity
                  key={activity.id}
                  style={[s.todayCard, actionActivity?.activity?.id === activity.id && s.todayCardActive]}
                  onPress={() => actionActivity ? setActionActivity(null) : navigation.navigate('ActivityDetail', { activityId: activity.id })}
                  onLongPress={() => handleActivityLongPress(activity)}
                  delayLongPress={400}
                  activeOpacity={0.8}
                >
                  <View style={[s.todayAccent, { backgroundColor: ACTIVITY_BLUE }]} />
                  <View style={s.todayBody}>
                    <View style={s.todayTitleRow}>
                      <View style={s.todayTypeCol}>
                        <View style={[s.todayTypeBadge, { backgroundColor: ACTIVITY_BLUE + '18' }]}>
                          <Text style={[s.todayTypeText, { color: ACTIVITY_BLUE }]}>{getSessionLabel(activity)}</Text>
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
                    </View>
                  </View>
                  {activity.completed
                    ? <View style={s.doneBadge}><Text style={s.doneMark}>{'\u2713'}</Text></View>
                    : <MaterialCommunityIcons name="dots-vertical" size={18} color={colors.textFaint} style={{ paddingRight: 10 }} />
                  }
                </TouchableOpacity>
              ))}
              {/* Unmatched Strava rides — shown with Strava orange accent */}
              {todayStravaRides.map(sa => (
                <View key={sa.stravaId} style={s.todayCard}>
                  <View style={[s.todayAccent, { backgroundColor: '#FC4C02' }]} />
                  <View style={s.todayBody}>
                    <View style={s.todayTitleRow}>
                      <View style={s.todayTypeCol}>
                        <View style={[s.todayTypeBadge, { backgroundColor: 'rgba(252,76,2,0.12)' }]}>
                          <Text style={[s.todayTypeText, { color: '#FC4C02' }]}>STRAVA</Text>
                        </View>
                      </View>
                      <View style={s.todayTitleWrap}>
                        <Text style={s.todayTitle}>{sa.name || 'Ride'}</Text>
                        <Text style={s.todayMeta}>
                          {sa.distanceKm ? `${sa.distanceKm} km` : ''}
                          {sa.distanceKm && sa.durationMins ? ' \u00B7 ' : ''}
                          {sa.durationMins ? `${sa.durationMins} min` : ''}
                          {sa.avgSpeedKmh ? ` \u00B7 ${sa.avgSpeedKmh} km/h` : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.stravaRideLogo}><StravaLogo size={18} /></View>
                </View>
              ))}
            </View>
          )}

          {/* Coach suggestions — always shown when plan has an assessment */}
          {((activePlan?.assessment?.suggestions?.length > 0) || (activePlan?.assessment?.recommendations?.length > 0)) && (
            <View style={s.suggestSection}>
              <View style={s.suggestHeader}>
                <Text style={s.suggestSectionTitle}>Ways to level up</Text>
                <Text style={s.suggestSectionHint}>Tap to apply to your plan</Text>
              </View>
              {(activePlan.assessment.suggestions || activePlan.assessment.recommendations || []).map((sug, i) => {
                const appliedKey = sug.title || sug.text || '';
                const isApplied = (activePlan.appliedSuggestions || []).includes(appliedKey);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[s.suggestCard, isApplied && s.suggestCardApplied]}
                    activeOpacity={isApplied ? 1 : 0.75}
                    onPress={() => {
                      if (isApplied) return;
                      navigation.navigate('ApplySuggestion', {
                        planId: activePlan.id,
                        goalId: activeGoal?.id,
                        suggestion: sug,
                      });
                    }}
                  >
                    <MaterialCommunityIcons
                      name={getSuggestIcon(sug.type)}
                      size={16}
                      color={isApplied ? colors.textMuted : colors.primary}
                    />
                    <View style={s.suggestBody}>
                      <Text style={[s.suggestTitle, isApplied && s.suggestTitleApplied]}>{sug.title || sug.type}</Text>
                      <Text style={[s.suggestText, isApplied && s.suggestTextApplied]} numberOfLines={2}>{sug.text}</Text>
                    </View>
                    {isApplied
                      ? <Text style={s.suggestAppliedLabel}>{'\u2713'}</Text>
                      : <Text style={s.suggestArrow}>{'\u203A'}</Text>
                    }
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

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

        {/* Activity action bar — shown on long-press */}
        {actionActivity && !movingActivity && (
          <View style={s.actionBar}>
            <Text style={s.actionBarTitle} numberOfLines={1}>{actionActivity.activity.title}</Text>
            <View style={s.actionBarBtns}>
              <TouchableOpacity style={s.actionBarBtn} onPress={handleActionMove} activeOpacity={0.7}>
                <MaterialCommunityIcons name="calendar-arrow-right" size={20} color={colors.text} />
                <Text style={s.actionBarBtnText}>Move</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBarBtn, s.actionBarBtnDelete]} onPress={handleActionDelete} activeOpacity={0.7}>
                <MaterialCommunityIcons name="delete-outline" size={20} color="#EF4444" />
                <Text style={[s.actionBarBtnText, { color: '#EF4444' }]}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBarBtn} onPress={() => setActionActivity(null)} activeOpacity={0.7}>
                <MaterialCommunityIcons name="close" size={20} color={colors.textMuted} />
                <Text style={[s.actionBarBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
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
  return d.getDate();
}

/** Returns YYYY-MM-DD for a given plan week + day index */
function getDayDateStr(startDateStr, week, dayIdx) {
  const monday = snapToMonday(parseDateLocal(startDateStr));
  const d = new Date(monday);
  d.setDate(d.getDate() + (week - 1) * 7 + dayIdx);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, maxWidth: 500, width: '100%', alignSelf: 'center' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingLogoWrap: {
    width: 80, height: 80, borderRadius: 22, overflow: 'hidden',
    shadowColor: '#E8458B', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 20, elevation: 8,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.2)',
  },
  loadingLogo: { width: 80, height: 80 },
  loadingLogoSmall: { width: 44, height: 44 },
  // Card used by the delete-in-progress overlay so the spinner reads as
  // explicit, bounded progress rather than "the whole screen is loading".
  deletingCard: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, paddingVertical: 22, paddingHorizontal: 30,
  },
  deletingText: { fontSize: 13, fontFamily: FF.semibold, fontWeight: '500', color: colors.text },
  safe:      { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerLogo: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(232,69,139,0.2)' },
  appName: { fontSize: 24, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, letterSpacing: 0.5 },
  appNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Subtle magenta chip so lifetime owners feel the glow every time they
  // open the app, without it shouting over the rest of the header.
  lifetimeChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(232,69,139,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(232,69,139,0.35)',
  },
  lifetimeChipText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: FF.semibold,
    color: colors.primary,
    letterSpacing: 0.8,
  },
  greeting: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 1 },

  // Minimalist icon button (three dots)
  iconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(232,69,139,0.2)', alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 14, color: colors.textMid, letterSpacing: 1 },

  // Subscribe banner (shown when unsubscribed with a plan)
  subscribeBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 12,
    backgroundColor: colors.primary + '12',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.primary + '30',
  },
  subscribeBannerLeft: { flex: 1 },
  subscribeBannerTitle: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary, marginBottom: 2 },
  subscribeBannerSub: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 17 },
  subscribeBannerArrow: { fontSize: 22, color: colors.primary, fontWeight: '300', marginLeft: 8 },

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
  planLimitHint: {
    marginLeft: 20, marginBottom: 16, marginTop: -4,
    fontSize: 11, fontWeight: '400', fontFamily: FF.regular,
    color: colors.textFaint,
  },
  planLimitHintWarning: { color: colors.primary },
  planLimitHintBlocked: { color: '#ef4444', fontWeight: '500' },

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

  // Coach suggestions section
  suggestSection: { marginHorizontal: 20, marginBottom: 16 },
  suggestHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  suggestSectionTitle: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  suggestSectionHint: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint },
  suggestCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  suggestCardApplied: { opacity: 0.45 },
  suggestDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  suggestBody: { flex: 1 },
  suggestTitle: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 2 },
  suggestTitleApplied: { color: colors.textMuted },
  suggestText: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 17 },
  suggestTextApplied: { color: colors.textFaint },
  suggestArrow: { fontSize: 20, color: colors.textMid, fontWeight: '300' },
  suggestAppliedLabel: { fontSize: 14, color: '#64748B', fontWeight: '600', fontFamily: FF.semibold },

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
    backgroundColor: 'rgba(232,69,139,0.06)', borderWidth: 1, borderColor: 'rgba(232,69,139,0.22)',
  },
  beginnerBadge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(232,69,139,0.14)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 10,
  },
  beginnerBadgeText: { fontSize: 10, fontWeight: '700', fontFamily: FF.semibold, color: colors.primary, letterSpacing: 1 },
  beginnerTitle: { fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  beginnerSub: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 19 },

  // Beginner program card (compact — when plans exist)
  beginnerCardCompact: {
    marginHorizontal: 20, borderRadius: 14, padding: 16, marginBottom: 12,
    backgroundColor: 'rgba(232,69,139,0.06)', borderWidth: 1, borderColor: 'rgba(232,69,139,0.22)',
    flexDirection: 'row', alignItems: 'center',
  },
  beginnerCompactTitle: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 2 },
  beginnerCompactSub: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },

  // Background image for empty state
  bgImage: { opacity: 0.08 },
  bgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.15)' },

  // Empty plan state — compacted so all three pathway cards fit in one viewport
  // on standard phone sizes (~820pt tall). Previous sizing pushed the third
  // "Just get better" card below the fold, making it effectively invisible.
  emptyPlanWrap: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 32 },
  emptyTitle: { fontSize: 22, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  emptySub: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginBottom: 16 },
  beginnerCard: {
    backgroundColor: 'rgba(232,69,139,0.06)', borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: 'rgba(232,69,139,0.22)', marginBottom: 10,
  },
  beginnerBadge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(232,69,139,0.14)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8,
  },
  beginnerBadgeText: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary, letterSpacing: 0.8 },
  beginnerTitle: { fontSize: 17, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  beginnerSub: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 18, marginBottom: 0 },
  createBtn: {
    // Same pink family as beginner card but inverted — solid-ish border, slightly brighter surface
    backgroundColor: 'rgba(232,69,139,0.04)', borderRadius: 16, padding: 16,
    borderWidth: 2, borderColor: 'rgba(232,69,139,0.35)', marginBottom: 10,
  },
  createBtnTitle: { fontSize: 17, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  createBtnSub: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 18, marginBottom: 0 },

  // Feature pills shared between cards — smaller so three cards fit on screen
  cardFeatureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 },
  cardFeaturePill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7,
    backgroundColor: 'rgba(232,69,139,0.1)', borderWidth: 1, borderColor: 'rgba(232,69,139,0.18)',
  },
  cardFeaturePillText: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary },

  // Week calendar strip
  // ── Today hero card ────────────────────────────────────────────────────
  // Magenta-accented card that shows the user's session for today at the
  // top of the screen. This is the "do this now" moment — CTA is deliberately
  // loud and the coach ask is a clear second action.
  todayHero: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(232,69,139,0.35)', // subtle magenta glow on the border
    shadowColor: '#E8458B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  todayHeroDone: {
    // De-emphasise once complete — the job is done, don't keep shouting.
    borderColor: colors.border,
    shadowOpacity: 0,
  },
  todayHeroHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6,
  },
  todayHeroLabel: {
    fontSize: 10, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.primary, letterSpacing: 1.2,
  },
  todayHeroDoneBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  todayHeroDoneBadgeText: {
    fontSize: 10, fontWeight: '600', fontFamily: FF.semibold,
    color: '#22C55E', letterSpacing: 0.6,
  },
  todayHeroTitle: {
    fontSize: 20, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.text, marginBottom: 4, lineHeight: 26,
  },
  todayHeroSub: {
    fontSize: 13, fontWeight: '400', fontFamily: FF.regular,
    color: colors.textMid, marginBottom: 14, lineHeight: 19,
  },
  todayHeroActions: {
    flexDirection: 'row', gap: 8, alignItems: 'stretch',
  },
  todayHeroCta: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  todayHeroCtaDone: {
    backgroundColor: colors.surfaceLight,
  },
  todayHeroCtaText: {
    fontSize: 15, fontWeight: '600', fontFamily: FF.semibold,
    color: '#FFFFFF',
  },
  todayHeroCtaArrow: {
    fontSize: 18, fontWeight: '400', color: '#FFFFFF', lineHeight: 18,
  },
  todayHeroCoachBtn: {
    paddingVertical: 13, paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: 'transparent',
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  todayHeroCoachBtnText: {
    fontSize: 14, fontWeight: '500', fontFamily: FF.medium,
    color: colors.text,
  },
  todayHeroCoachBtnArrow: {
    fontSize: 16, color: colors.textMid, lineHeight: 16,
  },

  weekStrip: { backgroundColor: colors.surface, marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  weekNavCenter: { alignItems: 'center', gap: 4 },
  goTodayBtn: {
    backgroundColor: 'rgba(232,69,139,0.12)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.25)',
  },
  goTodayText: { fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary },
  weekNavArrow: { fontSize: 28, color: colors.text, fontWeight: '300', paddingHorizontal: 8 },
  weekNavDisabled: { color: colors.textFaint },
  weekLabel: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  monthLabel: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginTop: 2 },
  calendarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(232,69,139,0.08)', borderWidth: 1, borderColor: 'rgba(232,69,139,0.15)',
  },
  calendarBtnText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  calendarBtnArrow: { fontSize: 18, color: colors.primary, fontWeight: '300' },

  // ── Inline week list (the fix for "what's happening this week at a glance") ──
  weekList: {
    marginTop: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.border,
    gap: 2,
  },
  weekListRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: 10, gap: 12,
  },
  weekListRowToday: {
    backgroundColor: 'rgba(232,69,139,0.08)',
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.18)',
  },
  weekListDay: {
    fontSize: 12, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.textMuted, letterSpacing: 0.8,
    width: 36, textTransform: 'uppercase',
  },
  weekListDayToday: { color: colors.primary },
  weekListContent: { flex: 1, gap: 2 },
  // Tiny-caps session-type tag. Intentionally low-contrast so it reads as a
  // secondary label, not as competition for the session title itself.
  weekListTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceLight,
    borderWidth: 0.5, borderColor: colors.border,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, marginBottom: 3,
  },
  weekListTagText: {
    fontSize: 9, fontWeight: '500', fontFamily: FF.semibold,
    color: colors.textMid, letterSpacing: 0.6,
  },
  weekListTitle: {
    fontSize: 14, fontWeight: '500', fontFamily: FF.medium,
    color: colors.text,
  },
  weekListTitleToday: { color: colors.text },
  weekListMeta: {
    fontSize: 12, fontWeight: '400', fontFamily: FF.regular,
    color: colors.textFaint,
  },
  weekListRest: {
    fontSize: 14, fontWeight: '400', fontFamily: FF.regular,
    color: colors.textFaint, fontStyle: 'italic',
  },
  weekListExtra: {
    fontSize: 12, fontWeight: '400', fontFamily: FF.regular,
    color: colors.textFaint,
  },
  weekListTodayPill: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  weekListTodayPillText: {
    fontSize: 9, fontWeight: '700', fontFamily: FF.semibold,
    color: '#fff', letterSpacing: 0.8,
  },
  dayRow: { flexDirection: 'row', justifyContent: 'space-around' },
  dayCell: { alignItems: 'center', minWidth: 40, gap: 3, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 2 },
  dayCellSelected: { backgroundColor: colors.primary },
  dayCellDropTarget: { borderWidth: 1, borderColor: 'rgba(232,69,139,0.4)', borderStyle: 'dashed' },
  dayLabelText: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },
  dayLabelToday: { color: colors.primary },
  dayLabelSelected: { color: 'rgba(255,255,255,0.8)' },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayCircleToday: { backgroundColor: colors.primary },
  dayCircleSelected: { backgroundColor: 'rgba(255,255,255,0.2)' },
  dayNumber: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
  dayNumberToday: { color: '#fff' },
  dayNumberSelected: { color: '#fff' },
  daySummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  daySummaryCol: { alignItems: 'center', gap: 1, marginTop: 2 },
  daySummaryMetric: { fontSize: 8, fontWeight: '700', fontFamily: FF.semibold, lineHeight: 10, maxWidth: 40 },
  daySummaryDot: { width: 5, height: 5, borderRadius: 2.5 },
  daySummaryLabel: { fontSize: 9, fontWeight: '600', fontFamily: FF.semibold },

  // Selected day panel header
  selectedDayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  goToDayBtn: {
    backgroundColor: 'rgba(232,69,139,0.1)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.2)',
  },
  goToDayText: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary },
  restDayCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  restDayText: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint },

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
  doneMark: { fontSize: 14, color: '#fff', fontWeight: '600', fontFamily: FF.semibold },

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
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: 'rgba(232,69,139,0.3)',
    padding: 16, shadowColor: '#E8458B', shadowOffset: { width: 0, height: 4 },
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
    backgroundColor: 'rgba(232,69,139,0.12)', alignItems: 'center', justifyContent: 'center',
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
    alignSelf: 'flex-start', backgroundColor: 'rgba(232,69,139,0.12)',
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
    backgroundColor: '#E8458B', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginBottom: 10,
  },
  lockedPayBtnText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  lockedCancelBtn: { alignItems: 'center', paddingVertical: 8 },
  lockedCancelBtnText: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },

  // Strava inline badges
  stravaMatchBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4,
    backgroundColor: 'rgba(252,76,2,0.08)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start',
  },
  stravaMatchLogo: {
    width: 14, height: 14,
  },
  stravaMatchText: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: '#FC4C02' },
  stravaRideLogo: {
    paddingRight: 14,
  },

  // Activity action bar
  todayCardActive: { borderColor: colors.primary, borderWidth: 1.5 },
  actionBar: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 + BOTTOM_INSET,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  actionBarTitle: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, marginBottom: 10 },
  actionBarBtns: { flexDirection: 'row', gap: 10 },
  actionBarBtn: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 12,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
  },
  actionBarBtnDelete: { borderColor: 'rgba(239,68,68,0.25)' },
  actionBarBtnText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.text },

  // Moving mode
  moveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: colors.primary, borderRadius: 12,
  },
  moveBannerText: { flex: 1, fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: '#fff' },
  moveBannerCancel: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: 'rgba(255,255,255,0.7)' },
});
