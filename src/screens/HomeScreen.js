/**
 * Home screen — dark theme with amber accents.
 * Shows all plans, week calendar with toggle, today's activities.
 * If no plan exists, shows "Make me a plan" CTA.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, TextInput, Image, Animated, RefreshControl, Platform, Dimensions, PanResponder,
} from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily, BOTTOM_INSET } from '../theme';
import useScreenGuard from '../hooks/useScreenGuard';
import { getCurrentUser } from '../services/authService';
import { getPlans, getGoals, getWeekProgress, getWeekActivities, getWeekMonthLabel, deletePlan, savePlan, getPlanConfig, getUserPrefs, isOnboardingDone, setOnboardingDone, saveGoal, markActivityComplete, getActivityDate } from '../services/storageService';
import OnboardingTour from '../components/OnboardingTour';
import { isSubscribed, getSubscriptionStatus, openCheckout, getPrices } from '../services/subscriptionService';
import UpgradePrompt from '../components/UpgradePrompt';
import { isStravaConnected } from '../services/stravaService';
import { syncStravaActivities, getStravaActivitiesForWeek, getStravaActivitiesForDate } from '../services/stravaSyncService';
import { getSessionColor, getSessionLabel, getSessionTag, getMetricLabel, getCrossTrainingForDay, getActivityIcon, CROSS_TRAINING_COLOR } from '../utils/sessionLabels';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { getCoach } from '../data/coaches';
import analytics from '../services/analyticsService';
import api from '../services/api';
import remoteConfig from '../services/remoteConfig';
import { t } from '../services/strings';
import ComingSoon from '../components/ComingSoon';
import StravaLogo from '../components/StravaLogo';
import CoachChatCard from '../components/CoachChatCard';
import { useUnits } from '../utils/units';
import { triggerMaintenanceMode } from '../../App';
import { syncPlansToServer } from '../services/storageService';
import WelcomeScreen from './WelcomeScreen';

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
  // Distance unit preference (km / mi) — formatter pulls from user prefs.
  const { formatDistance } = useUnits();

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
  // ── Drag-and-drop state ─────────────────────────────────────────────
  // dragActivity = the session currently being dragged (null = no drag)
  // dragPos = animated XY the ghost card follows; updated on finger move
  // dropZonesRef = screen-coordinate { y, height, dayOfWeek } for each
  //                week-list row. Populated via onLayout + measureInWindow
  //                so we can figure out which row the finger is over at
  //                release time. Keyed by dayOfWeek (0–6) for a stable
  //                lookup as the list re-renders.
  const [dragActivity, setDragActivity] = useState(null);
  const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dropZonesRef = useRef({});
  // Which dayOfWeek is the finger currently hovering over. Only set
  // during an active drag and only the hovered row gets the pink glow
  // — we don't flag every row as a "drop here" target because users
  // found that visually noisy. We debounce via a ref-compare so we
  // only re-render when the hovered zone actually changes.
  const [hoveredDayIdx, setHoveredDayIdx] = useState(null);
  const hoveredDayIdxRef = useRef(null);
  // After a drag, the underlying TouchableOpacity's onPress still fires
  // once the gesture ends — the RNGH Pan doesn't cancel the native
  // touchable's tap. This ref suppresses that onPress so a release from
  // a drag doesn't navigate the user to ActivityDetail as if they'd
  // tapped the card. Reset on a timer just long enough to swallow the
  // trailing onPress event.
  const justDraggedRef = useRef(false);
  // Register/measure a drop zone. Called from each week-list row's
  // onLayout + measureInWindow so we have screen-space coordinates
  // (flex layout alone gives relative-to-parent, useless for hit-testing
  // a finger at pageY).
  const registerDropZone = (dayOfWeek, ref) => {
    if (!ref || !ref.measureInWindow) return;
    ref.measureInWindow((x, y, w, h) => {
      dropZonesRef.current[dayOfWeek] = { y, height: h };
    });
  };
  // Given a screen-space Y, find which dayOfWeek the finger is over.
  // Returns null if the finger isn't over any tracked drop zone.
  const findDropTargetAtY = (pageY) => {
    for (const [dayOfWeek, zone] of Object.entries(dropZonesRef.current)) {
      if (pageY >= zone.y && pageY <= zone.y + zone.height) {
        return parseInt(dayOfWeek, 10);
      }
    }
    return null;
  };
  // Build the composed gesture for a session row. Long-press (350ms)
  // activates pan capture — from that point the finger drives dragPos
  // (which the floating ghost card follows) until release, where we
  // match the release Y against dropZonesRef to pick a target day.
  // runOnJS(true) executes callbacks on the JS thread so we can use
  // regular React state + Animated.Value (no reanimated needed).
  const makeDragGesture = (activity) => {
    // Tracks whether THIS gesture actually activated (i.e. the user
    // held for 350ms and then dragged). Without this, onFinalize would
    // fire for every touch — including quick taps that never hit the
    // long-press threshold — and set justDraggedRef true, which made
    // the TouchableOpacity's onPress bail and taps stopped navigating.
    let didActivate = false;
    return Gesture.Pan()
      .activateAfterLongPress(350)
      .runOnJS(true)
      .onStart((e) => {
        didActivate = true;
        setDragActivity(activity);
        setMovingActivity({ activity });
        dragPos.setValue({ x: e.absoluteX - 140, y: e.absoluteY - 24 });
      })
      .onChange((e) => {
        dragPos.setValue({ x: e.absoluteX - 140, y: e.absoluteY - 24 });
        // Hit-test against drop zones on every frame but only re-render
        // when the hovered zone ACTUALLY changes. This gives a "live"
        // pink highlight that follows the finger into a row without
        // spamming setState on every pixel of drag movement.
        const target = findDropTargetAtY(e.absoluteY);
        if (target !== hoveredDayIdxRef.current) {
          hoveredDayIdxRef.current = target;
          setHoveredDayIdx(target);
        }
      })
      .onEnd(async (e) => {
        const target = findDropTargetAtY(e.absoluteY);
        setDragActivity(null);
        setHoveredDayIdx(null);
        hoveredDayIdxRef.current = null;
        justDraggedRef.current = true;
        setTimeout(() => { justDraggedRef.current = false; }, 300);
        if (target != null) {
          await handlePlaceActivity(target);
        } else {
          setMovingActivity(null);
        }
      })
      .onFinalize(() => {
        if (didActivate) {
          setDragActivity(null);
          setHoveredDayIdx(null);
          hoveredDayIdxRef.current = null;
          justDraggedRef.current = true;
          setTimeout(() => { justDraggedRef.current = false; }, 300);
        }
        didActivate = false;
      });
  };
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
        // Normally clamp to [1, totalWeeks]. But if the user has moved
        // activities to a pre-plan-start calendar week (week 0 or
        // negative), we want the home screen to default to THAT week
        // so the Today hero + week strip line up with reality.
        const rawWeek = Math.floor(daysSince / 7) + 1;
        const hasPreStartActivities = rawWeek < 1 && (plan.activities || []).some(a => a.week === rawWeek);
        let wk;
        if (hasPreStartActivities) {
          wk = rawWeek; // allow week 0 / negative
        } else {
          wk = Math.max(1, Math.min(rawWeek, totalWeeks));
        }
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
  // Render the exact same splash image the OS just showed. This is the only
  // way to guarantee the app-icon doesn't shift/resize in the hand-off from
  // native splash → first React screen. DO NOT change this to a separate
  // icon.png + flex-centre layout — that was the old behaviour and it caused
  // a visible icon-jump bug that Rob raised twice (see task #9 and #124).
  //
  // Throb: we overlay a second copy of the same splash image and animate
  // ONLY its scale. Because both layers are the same pixel-for-pixel image
  // and the icon is close to the image's centre, scaling the overlay makes
  // the icon appear to breathe without moving out of alignment. The static
  // base layer keeps the position locked so nothing ever jumps.
  if (loading) {
    // Platform-match: iOS gets splash.png (portrait 1284×2778), Android gets
    // splash-android.png (1440×3120). Using Platform.select keeps the two
    // code paths symmetric with app.json's splash config.
    const splashImg = Platform.OS === 'android'
      ? require('../../assets/splash-android.png')
      : require('../../assets/splash.png');
    return (
      <View style={[s.container, { backgroundColor: '#000000' }]}>
        {/* Base layer — never moves. Holds the exact splash pixels the OS
            just rendered so nothing jumps in the hand-off. */}
        <Image
          source={splashImg}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
        />
        {/* Throb layer — same image, animated scale only. Pulses 1.00 → 1.05
            → 1.00 on a 2-second cycle. Scaling around the layer's centre
            keeps the icon (which is near centre in the source image) pulsing
            in place. `pulseAnim` is driven by the existing animation loop
            further up in this file so no extra setup is needed here. */}
        <Animated.Image
          source={splashImg}
          style={[StyleSheet.absoluteFill, { transform: [{ scale: pulseAnim }] }]}
          resizeMode="contain"
        />
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
    // Guided PlanPicker intake is the default empty-state flow. The Skip
    // Empty-state home → WelcomeScreen inline. The user has one primary
    // action (Get started → intake) and one escape ("I already know what I
    // want" → PlanSelection). The legacy three-card layout is gone — its
    // role is now covered by PlanSelection which renders the same cards
    // from either path of the welcome.
    return (
      <WelcomeScreen navigation={navigation} firstName={firstName} />
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
  // May return 0 or negative when the plan hasn't started AND the user has
  // moved activities into the current calendar week — we want the week strip
  // to render that calendar week (not clamp to plan week 1).
  const realTodayWeek = (() => {
    if (!activePlan?.startDate) return currentWeek;
    const monday = snapToMonday(parseDateLocal(activePlan.startDate));
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const diffDays = Math.floor((now - monday) / (1000 * 60 * 60 * 24));
    return Math.min(Math.floor(diffDays / 7) + 1, activePlan.weeks || 1);
  })();
  const planHasStarted = (() => {
    if (!activePlan?.startDate) return true;
    const monday = snapToMonday(parseDateLocal(activePlan.startDate));
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    return now >= monday;
  })();
  // Has the user got ANY activities in the current calendar week? When true,
  // we show the usual week strip + progress (even if the plan technically
  // hasn't started yet) rather than the "Plan starts Mon Apr 27" placeholder
  // card. This covers the edge case where the user drags a session to a
  // pre-plan-start day and expects to see it in the usual week view.
  const hasActivitiesThisCalendarWeek = (() => {
    if (!activePlan?.startDate || !activePlan.activities) return false;
    return activePlan.activities.some(a => a.week === realTodayWeek);
  })();
  // Effective "treat the plan as running" flag — used by the UI gate.
  const effectivePlanRunning = planHasStarted || hasActivitiesThisCalendarWeek;
  // How many days until the plan's Week 1 Monday, for the pre-start card.
  // Positive = future; 0 = today is the start day; negative = past (in which
  // case planHasStarted would already be true).
  const daysUntilPlanStart = (() => {
    if (!activePlan?.startDate) return 0;
    const monday = snapToMonday(parseDateLocal(activePlan.startDate));
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    return Math.round((monday - now) / (1000 * 60 * 60 * 24));
  })();
  const viewingToday = planHasStarted && currentWeek === realTodayWeek;

  // ── Today / Tomorrow activity lookup by CALENDAR DATE ──────────────────
  // Previously we filtered by (week, dayOfWeek). That broke when an activity
  // was moved to a pre-plan-start day (week=0 or negative) because
  // realTodayWeek clamps to 1, so the Today card never saw week-0 sessions.
  // Filtering by actual date instead makes "today" mean "today", regardless
  // of which week number the activity is tagged with.
  const buildActivityMatchers = () => {
    const now = new Date(); now.setHours(12, 0, 0, 0);
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const sameDate = (d, target) =>
      d.getFullYear() === target.getFullYear()
      && d.getMonth() === target.getMonth()
      && d.getDate() === target.getDate();
    return {
      isToday: (a) => {
        if (!activePlan?.startDate || a.dayOfWeek == null || a.week == null) return false;
        return sameDate(getActivityDate(activePlan.startDate, a.week, a.dayOfWeek), now);
      },
      isTomorrow: (a) => {
        if (!activePlan?.startDate || a.dayOfWeek == null || a.week == null) return false;
        return sameDate(getActivityDate(activePlan.startDate, a.week, a.dayOfWeek), tomorrow);
      },
    };
  };
  const { isToday: matchesToday, isTomorrow: matchesTomorrow } = buildActivityMatchers();
  const allPlanActivities = activePlan?.activities || [];
  const todayActivities = allPlanActivities.filter(matchesToday);
  const tomorrowActivities = allPlanActivities.filter(matchesTomorrow);

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

  // Open ActivityDetail directly in edit mode so the user can tweak distance /
  // duration / effort / day without first tapping "Edit" on the detail screen.
  const handleActionEdit = () => {
    if (!actionActivity) return;
    const id = actionActivity.activity.id;
    setActionActivity(null);
    setSelectedDayIdx(null);
    navigation.navigate('ActivityDetail', { activityId: id, initialEditing: true });
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
    // Optimistic UI update — mutate the in-memory `plans` state FIRST
    // so the moved card appears on the new day the moment the finger
    // releases, not after the async storage round-trip. The save +
    // re-hydrate happens in the background. Without this the user
    // sees a ~200ms gap where the card disappears.
    setPlans((prevPlans) => prevPlans.map((p) => {
      if (p.id !== activePlan.id) return p;
      return {
        ...p,
        activities: (p.activities || []).map((a) =>
          a.id === activity.id
            ? { ...a, week: currentWeek, dayOfWeek: targetDayIdx }
            : a
        ),
      };
    }));
    setMovingActivity(null);
    // Persist in the background.
    try {
      const allPlans = await getPlans();
      const plan = allPlans.find((p) => p.id === activePlan.id);
      if (plan) {
        const act = plan.activities.find((a) => a.id === activity.id);
        if (act) {
          act.week = currentWeek;
          act.dayOfWeek = targetDayIdx;
          await savePlan(plan);
        }
      }
    } catch (e) {
      console.warn('[home] place activity persist failed:', e?.message);
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

          {/* New plan button — goes to PlanSelection (three-card picker,
              no recommendation). Returning users already know they want a
              plan, so we skip the welcome + intake.
              Plan-limit UX (April 2026): we no longer show an always-on
              "N of M plans left this week" hint below this button — it was
              noisy chrome for something most users never hit. The remaining
              count is instead surfaced as a confirmation dialog at the
              moment of creation so the user sees it exactly when it
              matters. If they've already hit the limit, same dialog path
              but with a different tone. */}
          <TouchableOpacity
            style={[s.newPlanBtn, planLimits && !planLimits.unlimited && planLimits.remaining === 0 && { opacity: 0.5 }]}
            onPress={() => {
              // Blocked — already out of plans this week.
              if (planLimits && !planLimits.unlimited && planLimits.remaining === 0) {
                Alert.alert(
                  'Weekly plan limit reached',
                  `You've generated ${planLimits.used} of ${planLimits.limit} plans in the last 7 days. The count resets as individual plans age out. If you need more, contact support.`,
                  [{ text: 'OK' }],
                );
                return;
              }
              // Confirm — "are you sure?" style dialog that also tells the
              // user what this will cost them against their weekly quota.
              // Users with unlimited plans bypass the confirm entirely
              // (there's nothing to warn them about).
              if (planLimits && !planLimits.unlimited) {
                const after = Math.max(0, planLimits.remaining - 1);
                Alert.alert(
                  'Create a new plan?',
                  `This will use 1 of your ${planLimits.limit} plans this week. You'll have ${after} left after this.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Create plan', onPress: () => navigation.navigate('PlanSelection') },
                  ],
                );
                return;
              }
              navigation.navigate('PlanSelection');
            }}
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
              {/* Single plan = no horizontal scroll. The ScrollView was
                  letting the card drift off-screen when the title was
                  long. For 1 plan we render the card in a plain View so
                  the card is width-constrained by its parent and the
                  title can wrap onto 2 lines if needed. Multi-plan users
                  still get a horizontal snap-scroll between plans. */}
              {(() => {
                const renderCard = (p, i) => {
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
                  const goalLine = (() => {
                    if (!g) return null;
                    const headline = g.goalType === 'race'
                      ? (g.eventName || 'Race')
                      : g.goalType === 'distance'
                        ? `Ride ${g.targetDistance} km`
                        : g.goalType === 'beginner' && g.targetDistance
                          ? `Ride ${g.targetDistance} km`
                          : 'Improve my cycling';
                    const cyclingLabel = CYCLING_LABELS[g.cyclingType] || g.cyclingType;
                    const parts = [headline, cyclingLabel, g.targetDate ? `by ${g.targetDate}` : null].filter(Boolean);
                    return parts.join(' \u00B7 ');
                  })();
                  const isActive = i === selectedPlanIdx;
                  const activeSubtitle = isActive
                    ? [goalLine, meta].filter(Boolean).join(' \u00B7 ')
                    : meta;
                  // Multi-plan: fixed card width so snap-scroll works.
                  // Single plan: no width — card fills its parent View
                  // and the title wraps naturally.
                  const cardWidth = plans.length > 1
                    ? Math.min(Dimensions.get('window').width, 500) - 40
                    : null;
                  return (
                    // Outer container is a plain View so sibling Touchables
                    // (body + manage button) each handle their OWN taps
                    // without bubbling. React Native's gesture responder
                    // doesn't support stopPropagation on onPress — so a
                    // nested Touchable-in-Touchable would fire both, which
                    // is why the manage button appeared to do nothing
                    // (navigate + sheet open were racing each other).
                    <View
                      key={p.id}
                      style={[
                        s.planTab,
                        isActive && s.planTabActive,
                        cardWidth ? { width: cardWidth } : null,
                      ]}
                    >
                      {isActive && <View style={s.planTabAccent} />}
                      {/* Body = the tappable card area → PlanOverview (or
                          select-as-active for inactive tabs). */}
                      <TouchableOpacity
                        style={s.planTabBody}
                        onPress={() => {
                          if (isActive) {
                            navigation.navigate('PlanOverview', { planId: p.id });
                          } else {
                            setSelectedPlanIdx(i);
                          }
                        }}
                        onLongPress={() => handlePlanLongPress(p, g)}
                        activeOpacity={0.8}
                        delayLongPress={400}
                      >
                        <Text style={[s.planTabTitle, isActive && s.planTabTitleActive]} numberOfLines={2}>{title}</Text>
                        <Text style={[s.planTabMeta, isActive && s.planTabMetaActive]} numberOfLines={2}>{activeSubtitle}</Text>
                      </TouchableOpacity>
                      {isActive && (
                        <View style={s.planTabActions}>
                          <TouchableOpacity
                            onPress={() => handlePlanLongPress(p, g)}
                            style={s.planTabManageDots}
                            hitSlop={HIT}
                            activeOpacity={0.7}
                          >
                            <MaterialCommunityIcons name="dots-horizontal" size={18} color={colors.primary} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                };
                if (plans.length > 1) {
                  return (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={s.planTabs}
                      contentContainerStyle={s.planTabsContent}
                      snapToAlignment="start"
                      decelerationRate="fast"
                    >
                      {plans.map(renderCard)}
                    </ScrollView>
                  );
                }
                return (
                  <View style={s.planTabsSingle}>
                    {plans.map(renderCard)}
                  </View>
                );
              })()}
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
          {activePlan && activePlan.paymentStatus !== 'pending' && (
            <CoachChatCard
              coach={getCoach(activePlanConfig?.coachId)}
              onPress={() => navigation.navigate('CoachChat', { planId: activePlan.id })}
              style={s.coachCardWrap}
            />
          )}

          {/* Goal summary merged into the active plan tab above — see
              goalLine in the plans.map block. The standalone "YOUR GOAL"
              card was removed April 2026 because it duplicated info the
              plan card already carried. Headline, cycling type, and target
              date now render on the active plan tab itself. */}

          {/* Full plan content — only shown for paid plans */}
          {activePlan?.paymentStatus !== 'pending' && (<>

          {/* Moving banner is now rendered as a floating overlay at the
              BOTTOM of the screen (see actionBar-sibling block below
              the ScrollView) so it stays visible while the user scrolls
              the week list to drop the activity. The inline top banner
              disappeared behind the fold during a drag. */}

          {/* ── Today hero card ─────────────────────────────────────────────
              The first thing a returning user should see: "here's what you're
              doing today." Strong CTA to open the session, secondary CTA to
              ask the coach. Three states: active ride, rest day, done.
              Renders when the plan has started OR when the user has moved
              an activity to today (pre-plan-start) — the old gate hid
              moved-to-today sessions. The "Rest day" fallback only shows
              once the plan is running; pre-plan-start users shouldn't
              see a Rest Day card for every day before their plan begins. */}
          {(planHasStarted || todayActivities.length > 0) && (() => {
            const primary = todayActivities.find(a => a.type === 'ride') || todayActivities[0] || null;
            const coach = getCoach(activePlanConfig?.coachId);
            const coachFirstName = (coach?.name || 'your coach').split(' ')[0];

            // ── Rest day (only shown once the plan is actually running) ────
            if (!primary) {
              if (!planHasStarted) return null;
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
            if (primary.distanceKm) metaParts.push(formatDistance(primary.distanceKm));
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
                  {/* Primary CTA opens the ACTIVITY DETAIL (not the
                      whole week view) so users land on the specific
                      session and can tick it off / edit / chat about
                      it. "View details" is the honest label since no
                      actual ride-tracking happens in-app. */}
                  <TouchableOpacity
                    style={[s.todayHeroCta, isDone && s.todayHeroCtaDone]}
                    onPress={() => navigation.navigate('ActivityDetail', { activityId: primary.id })}
                    activeOpacity={0.85}
                  >
                    <Text style={s.todayHeroCtaText}>View details</Text>
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

          {/* ── Tomorrow preview ───────────────────────────────────────
              Sits directly below the Today hero so the user sees both
              "what am I doing now" and "what's next" without scrolling.
              Compact card — just the tag + title + metrics — because
              Tomorrow is FYI, not the primary action. Tapping opens the
              activity detail; tapping through to the week list still
              works below for anyone who wants to see the full context. */}
          {planHasStarted && tomorrowActivities.length > 0 && (
            <View style={s.tomorrowSection}>
              <Text style={s.tomorrowLabel}>TOMORROW</Text>
              {tomorrowActivities.map((activity) => (
                <TouchableOpacity
                  key={activity.id}
                  style={s.tomorrowCard}
                  onPress={() => navigation.navigate('ActivityDetail', { activityId: activity.id })}
                  activeOpacity={0.85}
                >
                  <View style={s.tomorrowCardBody}>
                    <View style={[s.todayTypeBadge, { backgroundColor: ACTIVITY_BLUE + '18', alignSelf: 'flex-start' }]}>
                      <Text style={[s.todayTypeText, { color: ACTIVITY_BLUE }]}>{getSessionLabel(activity)}</Text>
                    </View>
                    <Text style={s.tomorrowTitle}>{activity.title}</Text>
                    <Text style={s.tomorrowMeta}>
                      {activity.distanceKm ? formatDistance(activity.distanceKm) : ''}
                      {activity.distanceKm && activity.durationMins ? ' \u00B7 ' : ''}
                      {activity.durationMins ? `${activity.durationMins} min` : ''}
                      {activity.effort ? ` \u00B7 ${activity.effort}` : ''}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* Also show "Tomorrow · Rest" as a tiny hint when tomorrow
              is a rest day — helps users who check the app before bed
              know they can have a lie-in. */}
          {planHasStarted && tomorrowActivities.length === 0 && (
            <View style={s.tomorrowRestWrap}>
              <Text style={s.tomorrowRestText}>Tomorrow · Rest day</Text>
            </View>
          )}

          {/* ── This week progress ─────────────────────────────────────
              The sibling "View full week" / "View full plan" buttons were
              removed April 2026 — tapping the pink plan card goes to
              PlanOverview, tapping the week label inside the week strip
              goes to WeekView. Keeping just the progress bar here so the
              user has a quick "where am I this week" glance without extra
              chrome. Hidden pre-plan-start because "0/0 done" for a plan
              that hasn't started is noise, not information. */}
          {activePlan && effectivePlanRunning && (
            <View style={s.section}>
              <View style={s.sectionRow}>
                <Text style={s.sectionTitle}>This week</Text>
                <Text style={s.sectionMeta}>{progress.done}/{progress.total} done</Text>
              </View>
              <View style={s.weekProgressTrack}>
                <View style={[s.weekProgressFill, { width: `${progress.pct}%` }]} />
              </View>
            </View>
          )}

          {/* Pre-plan-start card — shown in place of the Week 1/12 strip
              when the plan hasn't started yet. Previously the home screen
              showed Week 1 of the plan immediately, which was misleading:
              "This week" was actually "next week" and the week-strip
              header implied the plan was already running. Now we honour
              the calendar: until the plan's Monday arrives, we tell the
              user when it starts and give them a quick shortcut to
              preview week 1 via the full week view. Today/Tomorrow hero
              cards above still surface any activities the user has
              moved to pre-plan-start days (week 0 / negative weeks). */}
          {!effectivePlanRunning && activePlan && (() => {
            const startDate = parseDateLocal(activePlan.startDate);
            const startLabel = startDate.toLocaleDateString('en-GB', {
              weekday: 'long', day: 'numeric', month: 'long',
            });
            const daysCopy = daysUntilPlanStart === 0
              ? 'starting today'
              : daysUntilPlanStart === 1
                ? 'in 1 day'
                : `in ${daysUntilPlanStart} days`;
            return (
              <View style={s.preStartCard}>
                {/* Calendar access — absolutely positioned top-right to
                    match the pattern on the running-plan week strip
                    (s.weekHeaderCalendarBtn). Hiding the strip pre-start
                    would otherwise strip the only home-screen entry to
                    the Calendar, leaving users no way to scrub ahead to
                    future weeks or place activities before their plan
                    starts without leaving this screen. */}
                <TouchableOpacity
                  onPress={() => navigation.navigate('Calendar')}
                  style={s.preStartCalendarBtn}
                  hitSlop={HIT}
                  activeOpacity={0.7}
                  accessibilityLabel="View calendar"
                >
                  <MaterialCommunityIcons name="calendar-month-outline" size={18} color={colors.primary} />
                </TouchableOpacity>

                <Text style={s.preStartEyebrow}>YOUR PLAN</Text>
                <Text style={s.preStartTitle}>Starts {startLabel}</Text>
                <Text style={s.preStartSub}>
                  Your first session is {daysCopy}. Until then, take it easy — or get a feel for what's coming.
                </Text>
                <TouchableOpacity
                  style={s.preStartCta}
                  onPress={() => navigation.navigate('WeekView', { week: 1, planId: activePlan.id })}
                  activeOpacity={0.85}
                >
                  <Text style={s.preStartCtaText}>Go to start of plan</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            );
          })()}

          {/* Week calendar strip with navigation — only once the plan is
              actually running. See the pre-plan-start card above for the
              pre-start treatment.
              Layout convention — iOS / Material mobile pattern:
                - Nav arrows flank the week title (prev / title / next)
                - The title itself is the primary tap target → WeekView
                - Secondary actions (here: open full Calendar screen) sit
                  in the top-right corner of the card, NOT competing
                  with the navigation bar for space
              This stops the header row overflowing on narrow screens. */}
          {effectivePlanRunning && (
          <View style={s.weekStrip}>
            {/* Header row — title CENTERED, calendar icon on the right.
                An invisible spacer (same width as the calendar button)
                on the left balances the layout so the title sits at the
                visual centre of the card despite the icon on one side.
                Standard iOS app-bar pattern. Week 1/12 is the primary
                tap target (→ WeekView); calendar opens the full
                Calendar screen. Prev/next chevrons live in the day row
                below, not in this header. */}
            <View style={s.weekHeader}>
              <View style={s.weekHeaderSpacer} />
              <TouchableOpacity
                onPress={() => navigation.navigate('WeekView', { week: currentWeek, planId: activePlan.id })}
                hitSlop={HIT}
                activeOpacity={0.7}
                style={s.weekLabelInnerRow}
              >
                <Text style={s.weekLabel}>Week {currentWeek}/{activePlan.weeks}</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate('Calendar')}
                style={s.weekHeaderCalendarBtn}
                hitSlop={HIT}
                activeOpacity={0.7}
                accessibilityLabel="View calendar"
              >
                <MaterialCommunityIcons name="calendar-month-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={s.monthLabel}>{monthLabel}</Text>
            {(!viewingToday && (planHasStarted ? currentWeek !== realTodayWeek : currentWeek !== 1)) && (
              <TouchableOpacity
                onPress={() => {
                  setCurrentWeek(planHasStarted ? realTodayWeek : 1);
                }}
                hitSlop={HIT}
                style={s.goTodayBtn}
              >
                <Text style={s.goTodayText}>{planHasStarted ? 'Go to today' : 'Go to start'}</Text>
              </TouchableOpacity>
            )}
            {/* Day row + prev/next chevrons on the same horizontal line,
                flanking the 7-day grid. Lowers the chevrons so they
                don't compete with the title on the header row, and puts
                them right where users' thumbs naturally swipe to
                navigate between weeks. */}
            <View style={s.dayRowWithNav}>
              <TouchableOpacity
                onPress={() => { const to = Math.max(1, currentWeek - 1); analytics.events.weekNavigated('prev', currentWeek, to); setCurrentWeek(to); }}
                disabled={currentWeek <= 1}
                hitSlop={HIT}
                style={s.weekNavSideBtn}
              >
                <Text style={[s.weekNavArrow, currentWeek <= 1 && s.weekNavDisabled]}>{'\u2039'}</Text>
              </TouchableOpacity>
              <View style={[s.dayRow, { flex: 1 }]}>
              {DAY_LABELS.map((d, i) => {
                const items = getDayItems(i);
                const isSelected = i === selectedDayIdx;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[s.dayCell, isSelected && s.dayCellSelected]}
                    onPress={() => {
                      // Day strip up here is a PREVIEW only. When the user
                      // is mid-move, drops must happen on the larger week
                      // list below (where each session row is clearly
                      // labelled "Drop here · Mon" etc.). Ignoring taps
                      // up here avoids users accidentally dropping on the
                      // tiny 40pt day cells when their thumb was aiming
                      // for a highlighted session row.
                      if (movingActivity) return;
                      handleDayPress(i);
                    }}
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
              <TouchableOpacity
                onPress={() => { const to = Math.min(activePlan.weeks, currentWeek + 1); analytics.events.weekNavigated('next', currentWeek, to); setCurrentWeek(to); }}
                disabled={currentWeek >= activePlan.weeks}
                hitSlop={HIT}
                style={s.weekNavSideBtn}
              >
                <Text style={[s.weekNavArrow, currentWeek >= activePlan.weeks && s.weekNavDisabled]}>{'\u203A'}</Text>
              </TouchableOpacity>
            </View>

            {/* Gesture hint — sits above the inline list so it's the
                FIRST thing users see in the week section. Was previously
                at the bottom which made the gesture hard to discover.
                Copy switches mid-move so the user is guided through. */}
            <Text style={s.weekListHint}>
              {movingActivity
                ? 'Tap a day to drop the session there · long-press Cancel to bail'
                : 'Tap a session to open · press and hold to move'}
            </Text>

            {/* Inline week list — full session titles for every day so the
                user sees the whole week at a glance without tapping through
                to the calendar. Today highlighted in pink. */}
            <View style={s.weekList}>
              {DAY_LABELS.map((dLabel, i) => {
                const dayActs = activitiesByDay[i] || [];
                const isTodayRow = viewingToday && i === todayIdx;
                const isRest = dayActs.length === 0 || dayActs.every(a => a.type === 'rest');
                const isSelectedRow = selectedDayIdx === i;
                const formatMeta = (a) => {
                  if (!a) return '';
                  const bits = [];
                  if (a.distanceKm) bits.push(formatDistance(a.distanceKm));
                  if (a.durationMins) {
                    const h = Math.floor(a.durationMins / 60);
                    const m = a.durationMins % 60;
                    bits.push(h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m} min`);
                  }
                  return bits.join(' \u00B7 ');
                };

                // Only the HOVERED row (the one the finger is over right
                // now) shows the pink drop-target highlight. Previously
                // every row was dashed-outlined in drag mode which read
                // as noisy. Now it behaves like a native drag — the
                // specific target lights up live as the finger moves.
                //
                // Skip the source day — dropping on the day you lifted
                // from is a no-op, so highlighting it as a valid drop
                // target is misleading. (Also fixes the "two big pink
                // boxes stacked" look on pick-up, where both the source
                // card AND its row were going pink at once.)
                const isSourceDay = movingActivity?.activity?.dayOfWeek === i;
                const isHovered = movingActivity && hoveredDayIdx === i && !isSourceDay;

                if (isRest) {
                  return (
                    <TouchableOpacity
                      key={`wl-${i}`}
                      ref={(r) => registerDropZone(i, r)}
                      style={[
                        s.weekListRow,
                        isTodayRow && s.weekListRowToday,
                        isSelectedRow && s.weekListRowSelected,
                        isHovered && s.weekListRowDropTarget,
                      ]}
                      onPress={() => handleDayPress(i)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.weekListDay, isTodayRow && s.weekListDayToday]}>{dLabel.slice(0, 3)}</Text>
                      <View style={s.weekListContent}>
                        <Text style={s.weekListRest}>Rest</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }

                return (
                  <View
                    key={`wl-${i}`}
                    ref={(r) => registerDropZone(i, r)}
                    style={[
                      s.weekListDayBlock,
                      isTodayRow && s.weekListRowToday,
                      isSelectedRow && s.weekListRowSelected,
                      isHovered && s.weekListRowDropTarget,
                    ]}
                  >
                    <Text style={[s.weekListDay, isTodayRow && s.weekListDayToday, s.weekListDayTop]}>{dLabel.slice(0, 3)}</Text>
                    <View style={s.weekListSessions}>
                      {dayActs.map((act, sIdx) => {
                        const tag = getSessionTag(act);
                        const isDone = !!act.completed;
                        const isMovingSource = movingActivity?.activity?.id === act.id;
                        // Composed gesture: tap navigates to ActivityDetail,
                        // long-press-then-drag enters drag mode and follows
                        // the finger. Gesture.Pan().activateAfterLongPress
                        // means the same continuous touch can start as a
                        // press, escalate to a drag, and resolve on release
                        // — no finger-lift between pick up and drop.
                        const dragGesture = makeDragGesture(act);
                        return (
                          <GestureDetector key={act.id || sIdx} gesture={dragGesture}>
                          <TouchableOpacity
                            onPress={() => {
                              // Swallow the tap that fires immediately after
                              // a drag ends — the native Touchable doesn't
                              // know the Pan gesture took priority.
                              if (justDraggedRef.current) return;
                              if (movingActivity) { handleDayPress(i); return; }
                              navigation.navigate('ActivityDetail', { activityId: act.id });
                            }}
                            activeOpacity={0.7}
                            style={[
                              s.weekListSession,
                              sIdx > 0 && s.weekListSessionStacked,
                              // Lifted-card styling on the source while
                              // dragging (pink border + shadow + slight
                              // scale). See weekListSessionMoving style.
                              isMovingSource && s.weekListSessionMoving,
                            ]}
                          >
                            <View style={s.weekListSessionBody}>
                              {tag ? (
                                <View style={s.weekListTag}>
                                  <Text style={s.weekListTagText}>{tag}</Text>
                                </View>
                              ) : null}
                              <Text style={[
                                s.weekListTitle,
                                isTodayRow && s.weekListTitleToday,
                                isDone && s.weekListTitleDone,
                              ]} numberOfLines={1}>
                                {act.title || 'Session'}
                              </Text>
                              {!!formatMeta(act) && (
                                <Text style={s.weekListMeta} numberOfLines={1}>{formatMeta(act)}</Text>
                              )}
                            </View>
                            {isTodayRow && sIdx === 0 && (
                              <View style={s.weekListTodayPill}>
                                <Text style={s.weekListTodayPillText}>TODAY</Text>
                              </View>
                            )}
                            <TouchableOpacity
                              onPress={async (e) => {
                                e.stopPropagation?.();
                                await markActivityComplete(act.id);
                                // force:true bypasses load()'s plan-hash
                                // cache, which only tracks plan id / updatedAt
                                // / activity count — toggling `completed` on
                                // a single activity doesn't change any of
                                // those so a plain load() would short-
                                // circuit and the UI wouldn't update.
                                await load({ force: true });
                              }}
                              style={[s.weekListDoneCircle, isDone && s.weekListDoneCircleDone]}
                              hitSlop={HIT}
                              activeOpacity={0.7}
                            >
                              {isDone ? <Text style={s.weekListDoneTick}>{'\u2713'}</Text> : null}
                            </TouchableOpacity>
                          </TouchableOpacity>
                          </GestureDetector>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Hint + calendar button moved — hint is now above the day
                strip (more discoverable at the top of the list), and the
                calendar action became a small icon inside the week
                header row itself (see weekNavCenter above). */}
          </View>
          )}

          {/* Selected-day panel removed April 2026 — tapping a day in the
              strip now just highlights the corresponding row in the week
              list above (see weekListRowSelected style). The separate
              panel duplicated what the week list already showed and made
              the home screen feel cluttered. */}

          {/* Today's workouts section — REMOVED and consolidated with
              the Today hero card at the top of the screen (see above).
              Previously the screen had two Today blocks competing
              (compact hero + full card below the week strip) which was
              redundant. Tomorrow now sits next to Today at the top. */}

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

          {/* Moved up to sit directly after the Today hero card. See the
              matching block earlier in this render. */}

          {/* Standalone "Manage plan" link removed — the ••• button on the
              active plan card at the top of the page now owns this action,
              alongside the › chevron for "view plan". Keeps all the plan-level
              controls in one predictable place instead of sprinkling them
              across the page. */}

          {/* ── Footer ─────────────────────────────────────────────────
              Rounds out the bottom of the scroll. Two elements:
                - "Send feedback" link (→ FeedbackScreen) so users can
                  tell us what's broken / missing without digging in settings
                - The Etapa wordmark + logo, centered + muted — subtle
                  brand moment + signals end of content
              Version line intentionally omitted — it's already in Settings
              (the canonical place) and the app.json value shown here
              doesn't always match the shipped build version after the
              release script rewrites it. */}
          <View style={s.homeFooter}>
            <TouchableOpacity
              style={s.homeFooterLink}
              onPress={() => navigation.navigate('Feedback')}
              activeOpacity={0.7}
              hitSlop={HIT}
            >
              <MaterialCommunityIcons name="message-text-outline" size={14} color={colors.textMuted} />
              <Text style={s.homeFooterLinkText}>Send feedback</Text>
            </TouchableOpacity>
            <View style={s.homeFooterBrandRow}>
              <Image source={require('../../assets/icon.png')} style={s.homeFooterLogo} />
              <Text style={s.homeFooterBrand}>Etapa</Text>
            </View>
            {/* App version + build — pulls from expo-constants so this
                matches whatever is installed on the device. Useful
                reference when users report bugs ("v0.95.11 build 116"). */}
            <Text style={s.homeFooterVersion}>
              {(() => {
                const v = Constants?.expoConfig?.version || '—';
                const iosBuild = Constants?.expoConfig?.ios?.buildNumber;
                const androidCode = Constants?.expoConfig?.android?.versionCode;
                const build = Platform.OS === 'ios' ? iosBuild : androidCode;
                return `v${v}${build ? ` · build ${build}` : ''}`;
              })()}
            </Text>
          </View>

          <View style={{ height: 24 }} />
          </>)}
        </ScrollView>

        {/* Floating "Moving…" banner — anchored at the bottom of the
            screen so it's always visible while the user scrolls to a
            drop target. Was previously at the top and disappeared above
            the fold during the drag. */}
        {movingActivity && (
          <View style={s.moveBannerFloating}>
            <MaterialCommunityIcons name="cursor-move" size={16} color="#fff" />
            <Text style={s.moveBannerText} numberOfLines={1}>
              Moving: {movingActivity.activity.title}
            </Text>
            {/* Cancel is now a filled pill with high contrast against the
                pink banner. Bigger tap target, clear visual weight, not
                hidden in the banner text. */}
            <TouchableOpacity
              onPress={() => setMovingActivity(null)}
              style={s.moveBannerCancelBtn}
              hitSlop={HIT}
              activeOpacity={0.8}
            >
              <Text style={s.moveBannerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Floating drag ghost — renders while a row is being dragged
            via the composed Pan gesture. The Animated.View reads from
            dragPos (updated in the gesture's onChange) so the card
            follows the user's finger in real time. pointerEvents:'none'
            so the ghost never steals the touch from the underlying row
            that might be the drop target. */}
        {dragActivity && (
          <Animated.View
            pointerEvents="none"
            style={[
              s.dragGhost,
              {
                transform: [
                  { translateX: dragPos.x },
                  { translateY: dragPos.y },
                ],
              },
            ]}
          >
            <Text style={s.dragGhostTitle} numberOfLines={1}>{dragActivity.title || 'Session'}</Text>
            {(dragActivity.distanceKm || dragActivity.durationMins) && (
              <Text style={s.dragGhostMeta} numberOfLines={1}>
                {dragActivity.distanceKm ? formatDistance(dragActivity.distanceKm) : ''}
                {dragActivity.distanceKm && dragActivity.durationMins ? ' \u00B7 ' : ''}
                {dragActivity.durationMins ? `${dragActivity.durationMins} min` : ''}
              </Text>
            )}
          </Animated.View>
        )}

        {/* Activity action bar — shown on long-press */}
        {actionActivity && !movingActivity && (
          <View style={s.actionBar}>
            <Text style={s.actionBarTitle} numberOfLines={1}>{actionActivity.activity.title}</Text>
            <View style={s.actionBarBtns}>
              <TouchableOpacity style={s.actionBarBtn} onPress={handleActionEdit} activeOpacity={0.7}>
                <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.text} />
                <Text style={s.actionBarBtnText}>Edit</Text>
              </TouchableOpacity>
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
    marginLeft: 20, marginBottom: 24,
    paddingVertical: 7, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  newPlanBtnPlus: { fontSize: 16, fontWeight: '400', color: colors.primary },
  newPlanBtnText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
  // (planLimitHint styles removed April 2026 — quota confirmation now
  //  lives as an Alert at the moment of creation, not an always-on hint.)

  // Plan tabs
  planTabsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 10 },
  planTabsLabel: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  planDots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  planDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  planDotActive: { backgroundColor: colors.primary, width: 16, borderRadius: 3 },
  planDotsHint: { fontSize: 10, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginLeft: 4 },
  // maxHeight was 80 which clipped the active card once we added the goal
  // line + action pills. Uncapping — the scroll view will fit its content.
  // Bumped to marginHorizontal: 20 on each card (see planTab below) so
  // the plan card's right edge aligns with the coach card / other
  // surfaces — the ••• button on the plan card and the › on the coach
  // card now sit at the same visual x-position.
  planTabs: { marginBottom: 12 },
  planTabsContent: { paddingHorizontal: 20, gap: 8 },
  // Single-plan wrapper — plain View (no horizontal scroll). Matches
  // the coach card's horizontal margins so the card sits flush with
  // other screen-edge cards. When multiple plans exist we use the
  // ScrollView branch instead (see planTabsContent above).
  planTabsSingle: { marginHorizontal: 20, marginBottom: 12 },
  // Plan card — redesigned April 2026 from a pink-flood CTA to a calm
  // context card. Rationale: this surface is plan METADATA + a nav
  // target ("what am I training for, tap for detail, ••• to manage"),
  // not a daily-action CTA like Today or Chat with Your Coach. Pink
  // flood made it compete with those. Now dark-surface like the coach
  // card, with a thin pink left-stripe as the active-plan accent.
  planTab: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderRadius: 16,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    gap: 12,
    overflow: 'hidden',
  },
  // Active state — no background change, just the pink accent stripe
  // (see planTabAccent). Keeps this card the same weight as an inactive
  // one so it doesn't shout.
  planTabActive: {},
  // Pink left-stripe on the active card. Absolutely positioned so it
  // bleeds to the card edges regardless of padding.
  planTabAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 3, backgroundColor: colors.primary,
  },
  planTabBody: { flex: 1, minWidth: 0 },
  planTabTitle: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 3 },
  // Active title no longer white-on-pink; just stays the default text
  // colour with a touch more emphasis via fontSize above.
  planTabTitleActive: { color: colors.text },
  planTabMeta: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, lineHeight: 17 },
  planTabMetaActive: { color: colors.textMid },
  // Action cluster on the active plan card — just the ••• manage
  // button now. Tapping the rest of the card navigates to PlanOverview,
  // so no redundant chevron is needed. Filled circle with pink icon
  // matches the calendar button in the week-strip header for visual
  // consistency across the home screen's secondary actions.
  planTabActions: {
    flexDirection: 'row', alignItems: 'center',
  },
  planTabManageDots: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(232,69,139,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  // (planActions / planActionBtn / planActionText removed April 2026 —
  //  the standalone "Manage plan" link at the bottom of the page was
  //  replaced by the ••• button on the active plan card itself.)

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

  // ── Pre-plan-start card ────────────────────────────────────────────────
  // Shown in place of the Week 1/12 strip when the plan's Monday is still
  // in the future. Compact: eyebrow · start-date headline · days-until
  // supporting line · CTA. Shares marginHorizontal with the weekStrip so
  // the transition feels seamless on the Monday the plan starts.
  preStartCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 16, marginBottom: 16,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    padding: 18,
  },
  preStartEyebrow: {
    fontSize: 11, fontWeight: '700', fontFamily: FF.semibold,
    color: colors.primary, letterSpacing: 2, marginBottom: 8,
  },
  preStartTitle: {
    fontSize: 22, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.text, marginBottom: 6,
  },
  preStartSub: {
    fontSize: 13, fontWeight: '400', fontFamily: FF.regular,
    color: colors.textMuted, lineHeight: 19, marginBottom: 14,
  },
  preStartCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  preStartCtaText: {
    fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: '#fff',
  },
  // Calendar icon button in the top-right corner of the pre-start card.
  // Matches the weekHeaderCalendarBtn treatment on the running-plan strip
  // (pink tint + rounded square) so the two states read as consistent.
  preStartCalendarBtn: {
    position: 'absolute', top: 14, right: 14,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(232,69,139,0.12)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 1,
  },

  weekStrip: {
    backgroundColor: colors.surface,
    marginHorizontal: 16, marginBottom: 16,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    padding: 16,
  },
  // Top row of the week strip — title CENTERED, calendar icon on the
  // right. Uses space-between with a spacer on the left matching the
  // calendar button's 32pt width so the title is visually centred
  // across the card. Standard iOS navigation-bar pattern (spacer ·
  // title · action).
  weekHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4,
  },
  weekHeaderSpacer: { width: 32 },
  weekHeaderCalendarBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(232,69,139,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  // Container row for the day grid with its flanking chevrons — the
  // convention used by Google Calendar / Apple Calendar. Chevrons sit
  // at the same y as the day numbers so they read as "move the grid
  // left / right". Generous horizontal spacing so the Sun cell never
  // feels like it's bumping up against the next-week chevron.
  dayRowWithNav: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  // Bigger tap target around each side chevron (36pt = Apple HIG
  // minimum 44 minus a bit for the card edge) plus internal padding so
  // the chevron has air on both sides.
  weekNavSideBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  // (weekNavCenter unused — structure moved to weekHeader + dayRowWithNav.)
  goTodayBtn: {
    // alignSelf:'center' shrinks the button to its content instead of
    // stretching to fill the card width. Before the week-strip rewrite
    // this was inside a wrapper with alignItems:'center' — now it's a
    // direct child, so it has to set alignSelf itself.
    alignSelf: 'center',
    backgroundColor: 'rgba(232,69,139,0.12)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 4,
    marginTop: 6,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.25)',
  },
  goTodayText: { fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary },
  weekNavArrow: { fontSize: 28, color: colors.text, fontWeight: '300', paddingHorizontal: 8 },
  weekNavDisabled: { color: colors.textFaint },
  weekLabel: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  // Link row for the week header — label + pink-tint arrow badge, matched
  // to the coach card and active plan card so taps-to-navigate all feel
  // like the same affordance across the page.
  // "Week 1/12 ›" tap row — label + chevron hugged together as a single
  // disclosure-style link. No separate pink-tinted badge; following the
  // mobile convention where the chevron is part of the title line, not
  // a button.
  weekLabelInnerRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },

  // (weekStripCornerBtn removed — the calendar icon is no longer
  //  absolutely-positioned in the corner. It now sits inline on the
  //  weekHeader row, aligned with the Week title. See weekHeaderCalendarBtn.)
  monthLabel: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginTop: 2, textAlign: 'center' },
  calendarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(232,69,139,0.08)', borderWidth: 1, borderColor: 'rgba(232,69,139,0.15)',
  },
  calendarBtnText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  calendarBtnArrow: { fontSize: 18, color: colors.primary, fontWeight: '300' },

  // ── Home footer ────────────────────────────────────────────────────
  // "Send feedback" link + Etapa wordmark + version, sits at the bottom
  // of the scroll so the screen doesn't trail off into empty space.
  homeFooter: {
    marginTop: 32, marginBottom: 16, paddingHorizontal: 20,
    alignItems: 'center', gap: 14,
  },
  homeFooterLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  homeFooterLinkText: {
    fontSize: 13, fontWeight: '500', fontFamily: FF.medium,
    color: colors.textMuted,
  },
  homeFooterBrandRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    opacity: 0.55,
  },
  homeFooterLogo: { width: 22, height: 22, borderRadius: 5 },
  homeFooterBrand: {
    fontSize: 14, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.textMid, letterSpacing: 0.3,
  },
  // Version + build — now includes the build number so support can
  // reference the specific shipped artifact, not just the release
  // tree's app.json value. Still matches what Settings shows.
  homeFooterVersion: {
    fontSize: 10, fontWeight: '400', fontFamily: FF.regular,
    color: colors.textFaint, letterSpacing: 0.3,
  },

  // Hint line under the week list telling users about the long-press
  // gesture. Placed once, low-contrast, so it's discoverable without
  // being naggy chrome.
  weekListHint: {
    marginTop: 10, paddingHorizontal: 4,
    fontSize: 11, fontWeight: '400', fontFamily: FF.regular,
    color: colors.textFaint, fontStyle: 'italic', textAlign: 'center',
  },
  // Session row in move mode — the dragged card just dims slightly so
  // it's clear which one was picked up. The floating ghost card follows
  // the finger and carries the "this is being moved" signal, so the
  // source doesn't need a pink border, scale, padding, or shadow — all
  // of which were stacking with the row drop-highlight and reading as
  // a second "big pink box" next to the hovered row.
  weekListSessionMoving: {
    opacity: 0.35,
  },
  // Drop-target highlight — applied ONLY to the row the finger is
  // currently hovering over (live, not all rows). Stronger tint +
  // border than before because now it's a single focused indicator
  // rather than 7 competing ones. Reads as "this is where it'll land
  // if you release now".
  weekListRowDropTarget: {
    backgroundColor: 'rgba(232,69,139,0.18)',
    borderWidth: 1.5, borderColor: colors.primary,
    borderRadius: 12,
  },

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
  // Container for a session day that may hold MULTIPLE activities. The
  // day abbreviation sits in a left column and each session stacks in
  // the right column. Using a plain View (not a row-Touchable) so each
  // session gets its own tap/long-press handlers inside.
  weekListDayBlock: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: 10, gap: 12,
  },
  weekListDayTop: {
    // When stacked against multiple sessions the day abbrev should align
    // with the first session's tag, not the centre of the whole block.
    paddingTop: 4,
  },
  weekListSessions: { flex: 1, gap: 10 },
  weekListSession: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  // Subsequent sessions in the same day get a thin divider above so the
  // user can visually separate "morning ride" from "evening strength".
  weekListSessionStacked: {
    borderTopWidth: 0.5, borderTopColor: colors.border,
    paddingTop: 10,
  },
  weekListSessionBody: { flex: 1, gap: 2 },
  weekListRowToday: {
    backgroundColor: 'rgba(232,69,139,0.08)',
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.18)',
  },
  // Selected-day highlight — lighter than today so the two can coexist.
  // Applied when the user taps a day in the week-strip above; replaces
  // the old "selected day panel" block which duplicated this info.
  weekListRowSelected: {
    backgroundColor: 'rgba(232,69,139,0.05)',
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.28)',
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
  // Completed activity — strike-through + muted so the row clearly reads
  // as "done" at a glance. Pairs with the filled pink circle on the right.
  weekListTitleDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  weekListMeta: {
    fontSize: 12, fontWeight: '400', fontFamily: FF.regular,
    color: colors.textFaint,
  },
  weekListRest: {
    fontSize: 14, fontWeight: '400', fontFamily: FF.regular,
    color: colors.textFaint,
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
  // Circular done/undone toggle on the right of each session row.
  // Small by design — it's a secondary affordance on a dense list, not a
  // CTA. Originally 26pt but the filled-state pink-with-✓ looked like a
  // shouting button at that size; 22pt with a lighter tick reads more
  // like a checkbox and sits more quietly in the row.
  weekListDoneCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  weekListDoneCircleDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  weekListDoneTick: { color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 14 },
  dayRow: { flexDirection: 'row' },
  // Each cell takes 1/7 of the row's width (flex:1) instead of having a
  // fixed minWidth — the old minWidth:40 × 7 = 280pt was wider than the
  // space left between the prev/next chevrons, so cells overflowed and
  // Sun crashed into the `›` next-week chevron.
  dayCell: { flex: 1, alignItems: 'center', gap: 3, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 2 },
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
  // Tomorrow preview — sits directly below the Today hero. Compact,
  // low-contrast so Today is still the hero. Tap → ActivityDetail.
  tomorrowSection: {
    marginHorizontal: 20, marginTop: -4, marginBottom: 16,
  },
  tomorrowLabel: {
    fontSize: 10, fontWeight: '700', fontFamily: FF.semibold,
    color: colors.textFaint, letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 6, marginLeft: 2,
  },
  tomorrowCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 6,
  },
  tomorrowCardBody: { flex: 1, gap: 4 },
  tomorrowTitle: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  tomorrowMeta: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },
  tomorrowRestWrap: {
    marginHorizontal: 20, marginTop: -4, marginBottom: 16,
    alignItems: 'center',
  },
  tomorrowRestText: {
    fontSize: 12, fontWeight: '500', fontFamily: FF.medium,
    color: colors.textFaint, letterSpacing: 0.3,
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

  // (View full week / View full plan button pair removed April 2026 —
  //  tap the plan card for PlanOverview, tap the Week N/N label for
  //  WeekView. Styles deleted to keep the sheet clean.)

  // Coach chat card margins — the card visuals now live in the shared
  // <CoachChatCard /> component (src/components/CoachChatCard.js) so
  // Home / Week view / Activity detail all read as the same element.
  // The wrapper only supplies screen-local spacing.
  coachCardWrap: { marginHorizontal: 20, marginBottom: 20 },

  // (Goal card styles removed April 2026 — goal info now lives on the
  //  active plan tab. See planTabGoal / planTabGoalActive above.)

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

  // Moving mode — floating banner anchored to the bottom of the screen
  // so it stays in view while the user scrolls through the week list
  // looking for a drop target. Absolute-positioned sibling of the
  // ScrollView at the bottom, above the safe-area inset.
  moveBannerFloating: {
    position: 'absolute',
    left: 12, right: 12, bottom: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: colors.primary, borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 12,
  },
  moveBannerText: { flex: 1, fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: '#fff' },
  // Filled white-on-pink pill — much more visible than the old faint
  // text Cancel that users couldn't see / tap reliably on the mid-drag banner.
  moveBannerCancelBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  moveBannerCancelText: { fontSize: 13, fontWeight: '700', fontFamily: FF.semibold, color: '#fff' },
  // Ghost card that follows the user's finger while dragging — picks
  // up the session they long-pressed and renders a shadowed copy at
  // the cursor position. The cursor-follow transform is applied via
  // an Animated.View in JSX (see renderDragGhost).
  dragGhost: {
    position: 'absolute',
    left: 0, top: 0,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.primary,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35, shadowRadius: 18, elevation: 16,
    minWidth: 180, maxWidth: 280,
  },
  dragGhostTitle: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  dragGhostMeta: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 2 },
});
