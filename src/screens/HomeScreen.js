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
import { getPlans, getGoals, getWeekProgress, getWeekActivities, getWeekMonthLabel, deletePlan, savePlan, getPlanConfig, getUserPrefs, setUserPrefs, isOnboardingDone, setOnboardingDone, saveGoal, markActivityComplete, getActivityDate } from '../services/storageService';
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
import LoadingSplash from '../components/LoadingSplash';
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
  // Days left in the user's PAID free trial (distinct from previewDaysLeft,
  // which is the pre-purchase preview window). null = not trialing. Derived
  // from subscription.status === 'trialing' + currentPeriodEnd at load time.
  // Surfaces as a banner at the top of Home so users know the 7-day clock
  // is running and when it flips to a paid charge.
  const [trialDaysLeft, setTrialDaysLeft] = useState(null);
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
  // ── Week module display mode ──────────────────────────────────────────
  // Single source of truth for the week section. Was previously two
  // overlapping views (horizontal cards rail + a 7-day calendar strip
  // below). Now the user picks one — Cards (horizontal carousel) or List
  // (vertical day rows) — and the choice persists per-user via
  // setUserPrefs so it survives app restarts. Calendar icon in the
  // unified header is the entry point to the full Calendar screen.
  const [viewMode, setViewMode] = useState('cards');
  const setViewModeAndPersist = useCallback((next) => {
    setViewMode(next);
    // Fire-and-forget — UI doesn't wait on the persistence write. If the
    // write fails the choice still applies in-session; only resilience
    // across an app restart is lost, which is acceptable for a UI prefs.
    setUserPrefs({ homeViewMode: next }).catch(() => {});
    analytics.events.homeViewModeChanged?.(next);
  }, []);
  // Scroll refs — tapping a day in the top week strip scrolls the outer
  // ScrollView to that day's row in the inline week list below. Without
  // this, the selection highlight moves but the actual session can be
  // below the fold. weekListYRef holds the weekList container's Y offset
  // inside the outer scroll; dayRowYRef is a Map of dayIdx → row Y
  // offset INSIDE the weekList. Both are populated via onLayout and
  // summed to compute the absolute scroll target.
  const mainScrollRef = useRef(null);
  const weekListYRef = useRef(0);
  const dayRowYRef = useRef(new Map());
  // Live refs to each rendered day-row View so handleDayPress can
  // measureInWindow at click time (not cached). onLayout caching was
  // unreliable because it measures Y relative to the row's PARENT (not
  // the ScrollView content) — missing one or more wrapper offsets — and
  // goes stale after the user scrolls. Fresh screen-space measurements
  // plus the tracked scroll offset give an exact target every time.
  const dayRowRefs = useRef(new Map());
  // Current scroll offset, updated on every scroll event. Used to
  // translate the row's screen-space Y (from measureInWindow) back into
  // a scrollTo-compatible content-space Y.
  const lastScrollYRef = useRef(0);
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
  // ── Rail drag-and-drop (the upcoming-day cards) ───────────────────────────
  // The week-list rows below have their own dropZones (keyed by dayOfWeek
  // within currentWeek). The rail spans days that may belong to TWO
  // different plan weeks (when the rail starts mid-week), so it needs a
  // separate dropzone map keyed by the date itself, with the (week,
  // dayOfWeek) baked in.
  const railDropZonesRef = useRef({}); // { dateKey: { x, y, width, height, week, dayOfWeek } }
  const [hoveredRailKey, setHoveredRailKey] = useState(null);
  const hoveredRailKeyRef = useRef(null);

  const dateKeyOf = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  const registerRailDropZone = (dateKey, week, dayOfWeek, ref) => {
    if (!ref || !ref.measureInWindow) return;
    ref.measureInWindow((x, y, w, h) => {
      railDropZonesRef.current[dateKey] = { x, y, width: w, height: h, week, dayOfWeek };
    });
  };

  const findRailDropTargetAtXY = (absX, absY) => {
    for (const [key, zone] of Object.entries(railDropZonesRef.current)) {
      if (absX >= zone.x && absX <= zone.x + zone.width &&
          absY >= zone.y && absY <= zone.y + zone.height) {
        return { key, week: zone.week, dayOfWeek: zone.dayOfWeek };
      }
    }
    return null;
  };

  // Generalised place: takes explicit (week, dayOfWeek) pairs so we can
  // move across weeks (e.g. drag from a Sunday card to next Monday's
  // card when the rail spans the boundary).
  const handleRailPlaceActivity = async (activity, sourceWeek, sourceDayOfWeek, targetWeek, targetDayOfWeek) => {
    if (!activePlan) return;
    if (sourceWeek === targetWeek && sourceDayOfWeek === targetDayOfWeek) return; // no-op
    // Optimistic in-memory update so the card visually moves the moment
    // the finger releases. Persist in the background.
    setPlans((prev) => prev.map((p) => {
      if (p.id !== activePlan.id) return p;
      return {
        ...p,
        activities: (p.activities || []).map((a) =>
          a.id === activity.id
            ? { ...a, week: targetWeek, dayOfWeek: targetDayOfWeek }
            : a
        ),
      };
    }));
    try {
      const allPlans = await getPlans();
      const plan = allPlans.find(p => p.id === activePlan.id);
      if (plan) {
        const act = plan.activities.find(a => a.id === activity.id);
        if (act) {
          act.week = targetWeek;
          act.dayOfWeek = targetDayOfWeek;
          await savePlan(plan);
        }
      }
    } catch (e) {
      console.warn('[home] rail place activity persist failed:', e?.message);
    }
  };

  const makeRailDragGesture = (activity, sourceWeek, sourceDayOfWeek) => {
    let didActivate = false;
    return Gesture.Pan()
      .activateAfterLongPress(350)
      .runOnJS(true)
      .onStart((e) => {
        didActivate = true;
        setDragActivity(activity);
        dragPos.setValue({ x: e.absoluteX - 140, y: e.absoluteY - 24 });
      })
      .onChange((e) => {
        dragPos.setValue({ x: e.absoluteX - 140, y: e.absoluteY - 24 });
        const target = findRailDropTargetAtXY(e.absoluteX, e.absoluteY);
        const newKey = target?.key || null;
        if (newKey !== hoveredRailKeyRef.current) {
          hoveredRailKeyRef.current = newKey;
          setHoveredRailKey(newKey);
        }
      })
      .onEnd(async (e) => {
        const target = findRailDropTargetAtXY(e.absoluteX, e.absoluteY);
        setDragActivity(null);
        setHoveredRailKey(null);
        hoveredRailKeyRef.current = null;
        justDraggedRef.current = true;
        setTimeout(() => { justDraggedRef.current = false; }, 300);
        if (target) {
          await handleRailPlaceActivity(activity, sourceWeek, sourceDayOfWeek, target.week, target.dayOfWeek);
        }
      })
      .onFinalize(() => {
        if (didActivate) {
          setDragActivity(null);
          setHoveredRailKey(null);
          hoveredRailKeyRef.current = null;
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

    // Restore the user's last week-module view mode (cards/list). Done
    // here rather than in a separate effect so it lands in the same
    // tick as the rest of the prefs hydration — avoids a single-frame
    // flash where Cards is visible before swapping to List on a user
    // who'd previously chosen List.
    if (isMounted.current && userPrefs?.homeViewMode === 'list') {
      setViewMode('list');
    }

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

    // Debug log — one-line summary of what the server is actually
    // returning for this user's subscription. Useful for diagnosing
    // "my trial banner isn't showing" reports: flip on `LOG_SUB_DEBUG`
    // (or just read the dev console) to see active/status/plan/end.
    if (__DEV__) {
      console.log('[home] subscription status', {
        active: subStatus?.active,
        status: subStatus?.status,
        plan: subStatus?.plan,
        currentPeriodEnd: subStatus?.currentPeriodEnd,
        source: subStatus?.source,
      });
    }

    // Time-limited entitlement detection — surface a top-of-screen
    // banner whenever the user is on a paid plan that will LAPSE on a
    // known date. Two cases we care about:
    //   1. Free trial (status === 'trialing'): 7-day trial on a
    //      monthly / annual / lifetime purchase.
    //   2. Starter plan: one-time £14.99 purchase that grants 3 months
    //      of access. Its `currentPeriodEnd` is the 3-month cutoff.
    //
    // Perpetual subs (monthly / annual / lifetime past their trial) do
    // NOT show this banner — they renew silently and a countdown would
    // be noise. We rely on plan === 'starter' rather than checking a
    // separate "starter trial" flag because starter is the only
    // plan-flavour we expose that's both active AND time-limited.
    //
    // Fallback: if the subscription is starter-active but
    // `currentPeriodEnd` is missing (server payload incomplete or
    // RevenueCat hiccup), we STILL surface the banner — we just use a
    // sentinel of 0 so the UI knows to show a generic "Starter plan
    // active" line without a specific day count. Previously missing
    // currentPeriodEnd silently hid the banner, which is the bug Rob
    // just reported ("I can't see it").
    const isTimeLimitedEntitlement = subStatus?.active && (
      subStatus.status === 'trialing' || subStatus.plan === 'starter'
    );
    if (isTimeLimitedEntitlement) {
      if (subStatus.currentPeriodEnd) {
        const msLeft = new Date(subStatus.currentPeriodEnd).getTime() - Date.now();
        setTrialDaysLeft(msLeft > 0 ? Math.ceil(msLeft / (1000 * 60 * 60 * 24)) : null);
      } else {
        // Active + time-limited but no cutoff date. Show the banner
        // with 0 as a signal: the render branch below treats
        // `trialDaysLeft === 0` as "show the static label without
        // a day count" rather than "last day".
        setTrialDaysLeft(0);
      }
    } else {
      setTrialDaysLeft(null);
    }

    // Fetch live prices (non-blocking) — only update state if still mounted
    getPrices().then(prices => {
      if (isMounted.current && prices?.starter) setStarterPriceLabel(prices.starter.formatted);
    }).catch(() => {});

    const displayName = userPrefs?.displayName || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || null;
    if (!isMounted.current) return;
    setName(displayName);
    setPlans(p);
    setGoals(g);

    // Show onboarding tour on the user's first Home visit, regardless of
    // whether they already have plans. The "done" flag is per-USER (see
    // isOnboardingDone — it reads from server preferences, not just
    // AsyncStorage) so re-installs / new devices don't re-trigger the
    // tour for an account that's already seen it, and brand-new accounts
    // on an old device DO see it even if a previous account on that
    // device completed it. Gated on `!initialLoadDone.current` so it
    // fires once per session, not on every focus.
    if (!initialLoadDone.current) {
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

  // Fresh planConfig on focus, INDEPENDENT of the load() plan-hash
  // short-circuit. Background: changing the coach updates the
  // plan_configs row but NOT the parent plan row — so plan.updatedAt
  // is unchanged, load() bails via the cache check, and the Home
  // coach card keeps showing the old coach. Fetching planConfig
  // directly on focus side-steps the short-circuit. `refreshingConfig`
  // drives a brief spinner on the CoachChatCard so the swap from old
  // to new coach isn't a silent, confusing jump.
  const [refreshingConfig, setRefreshingConfig] = useState(false);
  const refreshActiveConfig = useCallback(async () => {
    const p = plans?.[selectedPlanIdx];
    if (!p?.configId) return;
    setRefreshingConfig(true);
    try {
      const cfg = await getPlanConfig(p.configId);
      if (isMounted.current && cfg) setActivePlanConfig(cfg);
    } finally {
      if (isMounted.current) setRefreshingConfig(false);
    }
  }, [plans, selectedPlanIdx]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', refreshActiveConfig);
    return unsub;
  }, [navigation, refreshActiveConfig]);

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

  // Unread coach-reply count, drives the "1" badge on the CoachChatCard.
  // Refreshes on focus so returning from CoachChat (which marks replies
  // as read) clears the badge. Silent-fail if offline — badge just
  // stays at 0 until the next successful poll.
  const [coachUnread, setCoachUnread] = useState(0);
  const refreshCoachUnread = useCallback(async () => {
    try {
      const res = await api.notifications.unreadCount('coach_reply');
      setCoachUnread(Number(res?.count) || 0);
    } catch {}
  }, []);
  useEffect(() => { refreshCoachUnread(); }, [refreshCoachUnread]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', refreshCoachUnread);
    return unsub;
  }, [navigation, refreshCoachUnread]);

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
    // Shared LoadingSplash component — same render path as the
    // post-delete state below, guaranteeing both screens are
    // pixel-identical (the whole "it doesn't look the same" class of
    // bug goes away at compile time). No label on cold-start because
    // the user knows what they just did.
    return <LoadingSplash />;
  }

  // ── Delete-in-progress overlay ────────────────────────────────────────────
  // Short (well under a second) gap between `deletePlan` resolving and
  // `load()` repopulating `plans`. Rendering the full page during that window
  // can hit stale state (see Sentry "Cannot read property 'weeks' of
  // undefined"). We return a dedicated spinner screen so no downstream
  // component renders against an inconsistent world.
  if (deleting) {
    return (
      // Same LoadingSplash as cold-start, just with a label — exactly
      // the user's ask: "confirm it's the same screen and component
      // for loading + loading after deleting plan". Both paths now
      // render the identical component, so any future tweak to the
      // splash treatment updates both at once.
      <LoadingSplash label="Deleting plan…" />
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
    //
    // CRITICAL: render <OnboardingTour /> here too. Previously the tour
    // was only mounted in the populated-Home branch (~line 2350), which
    // meant new users never saw it — they hit the empty-state early
    // return BEFORE the tour element rendered, then by the time they
    // came back from plan creation `initialLoadDone.current` had already
    // flipped true and the gate was closed. Surfacing the tour as a
    // sibling here means it fires the moment a brand-new user lands on
    // Home, on top of the Welcome screen, which is exactly when "first
    // login" is. Tour is a Modal so it stacks above WelcomeScreen
    // without breaking layout.
    return (
      <>
        <WelcomeScreen navigation={navigation} firstName={firstName} />
        <OnboardingTour
          visible={showOnboarding}
          onComplete={async () => {
            setShowOnboarding(false);
            try { await setOnboardingDone(); } catch {}
            // See the populated-state branch below — same reason: pull
            // the freshly-typed display name back into local state so
            // the WelcomeScreen greeting reflects what the user just
            // entered, not the Apple Sign-In fallback.
            try {
              const fresh = await getUserPrefs();
              if (fresh?.displayName && isMounted.current) {
                setName(fresh.displayName);
              }
            } catch {}
          }}
        />
      </>
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

  // Build the 7-day rail for the currently-selected week.
  //
  // Three modes:
  //   - Plan running, viewing CURRENT week: anchor on TODAY, then
  //     forward 6 days. Today is the hero card with View + Ask CTAs.
  //   - Plan running, viewing OTHER week: show Mon → Sun of that
  //     selected week. Today is NOT in this view (user is browsing,
  //     not acting on now), all cards are uniform previews.
  //   - Plan NOT yet started: anchor on the plan's Monday-of-week-1.
  //     This is the new behaviour: previously we anchored on today
  //     even pre-start, which meant a plan starting tomorrow showed
  //     "Today · Rest" + "Tomorrow · first session" + a tail of empty
  //     days. Anchoring on the plan start instead surfaces the whole
  //     first proper week of the plan, which is what the user actually
  //     wants to see when they're inspecting "what's coming".
  const UPCOMING_DAY_COUNT = 7;
  const upcomingDays = (() => {
    if (!activePlan?.startDate) return [];
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const sameDate = (d, t) =>
      d.getFullYear() === t.getFullYear()
      && d.getMonth() === t.getMonth()
      && d.getDate() === t.getDate();
    const isCurrentWeek = planHasStarted && currentWeek === realTodayWeek;
    const days = [];

    let anchor;
    let anchorWeek; // which plan week the anchor falls in (1-indexed)
    if (!planHasStarted) {
      // Pre-plan-start: anchor on the plan's first Monday so the user
      // sees the actual plan week ahead (not today + dead days).
      const planMonday = snapToMonday(parseDateLocal(activePlan.startDate));
      anchor = new Date(planMonday);
      anchor.setHours(12, 0, 0, 0);
      anchorWeek = 1;
    } else if (isCurrentWeek) {
      anchor = new Date(now);
      anchorWeek = currentWeek;
    } else {
      const planMonday = snapToMonday(parseDateLocal(activePlan.startDate));
      anchor = new Date(planMonday);
      anchor.setDate(anchor.getDate() + (currentWeek - 1) * 7);
      anchor.setHours(12, 0, 0, 0);
      anchorWeek = currentWeek;
    }

    for (let i = 0; i < UPCOMING_DAY_COUNT; i++) {
      const target = new Date(anchor);
      target.setDate(target.getDate() + i);
      const dayActivities = allPlanActivities.filter(a => {
        if (a.dayOfWeek == null || a.week == null) return false;
        return sameDate(getActivityDate(activePlan.startDate, a.week, a.dayOfWeek), target);
      });
      const primary = dayActivities.find(a => a.type === 'ride') || dayActivities[0] || null;
      const isToday = sameDate(target, now);
      let eyebrow;
      if (isCurrentWeek && i === 0) eyebrow = 'TODAY';
      else if (isCurrentWeek && i === 1) eyebrow = 'TOMORROW';
      else eyebrow = target.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
      // dayOfWeek is 0=Mon..6=Sun for the activity model. When the
      // anchor is today it might land mid-week (e.g. Wed), so we
      // can't just use `i` directly — compute it from the JS Date.
      const jsDay = target.getDay(); // 0=Sun..6=Sat
      const dayOfWeek = (jsDay + 6) % 7; // 0=Mon..6=Sun
      // The plan-relative week number for this card. Days drift across
      // week boundaries when the rail starts mid-week (current-week
      // mode), so we compute it from the date rather than `anchorWeek`.
      const planWeekForDate = (() => {
        const planMonday = snapToMonday(parseDateLocal(activePlan.startDate));
        const diffDays = Math.round((target - planMonday) / 86400000);
        return Math.max(1, Math.floor(diffDays / 7) + 1);
      })();
      days.push({
        date: target,
        primary,
        eyebrow,
        isToday,
        // Drag target metadata — every card knows what (week, dayOfWeek)
        // it represents so a drop here can compute the destination.
        week: planWeekForDate,
        dayOfWeek,
      });
    }
    return days;
  })();

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
    setSelectedDayIdx(prev => {
      const next = prev === dayIdx ? null : dayIdx;
      // Only scroll when SELECTING a day (not when deselecting) —
      // otherwise tapping again would snap you somewhere unexpected.
      //
      // Scroll math: we want the week strip AND the target day row both
      // visible, with the strip pinned near the top of the viewport and
      // the selected row sitting just below the day-list divider. We
      // measure both the row and the ScrollView in screen space at
      // click time (NOT from cached onLayout values — those were broken
      // because they measured Y relative to the row's immediate parent
      // instead of the ScrollView content, missing one or more wrapper
      // offsets). Translating the row's current on-screen Y back into
      // content-space Y = currentScrollY + (rowPageY - scrollViewPageY).
      if (next !== null && mainScrollRef.current) {
        const rowRef = dayRowRefs.current.get(dayIdx);
        if (rowRef?.measureInWindow && mainScrollRef.current?.measureInWindow) {
          requestAnimationFrame(() => {
            mainScrollRef.current?.measureInWindow((svX, svY, svW, svH) => {
              rowRef.measureInWindow((rX, rY, rW, rH) => {
                // ~200pt of headroom keeps the week strip (date chips +
                // bike-km indicators) comfortably visible above the
                // selected row, matching the "full This Week card"
                // layout Rob approved in the mockup.
                const HEADROOM = 200;
                const yInViewport = rY - svY;
                const currentScroll = lastScrollYRef.current || 0;
                const target = Math.max(0, currentScroll + yInViewport - HEADROOM);
                mainScrollRef.current?.scrollTo({ y: target, animated: true });
              });
            });
          });
        }
      }
      return next;
    });
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

  // Hoisted "+ New plan" handler so both the full empty-state button
  // and the compact "+" in the YOUR PLANS header share identical
  // behaviour: weekly plan-limit guard → confirm dialog → navigate.
  // Previously this lived inline in the JSX.
  const handleNewPlanPress = () => {
    if (planLimits && !planLimits.unlimited && planLimits.remaining === 0) {
      Alert.alert(
        'Weekly plan limit reached',
        `You've generated ${planLimits.used} of ${planLimits.limit} plans in the last 7 days. The count resets as individual plans age out. If you need more, contact support.`,
        [{ text: 'OK' }],
      );
      return;
    }
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
          ref={mainScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 + BOTTOM_INSET }}
          onScroll={(e) => { lastScrollYRef.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
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

          {/* Top-of-home banner — four variants, all rendered through
              the same TouchableOpacity so the visual slot is stable:
                1. PAID TRIAL — subscribed via `trialing` status with
                   clock still running.
                2. STARTER PLAN — subscribed, one-time 3-month purchase.
                3. PRE-PURCHASE PREVIEW — not yet subscribed, inside
                   the remote-configurable preview window.
                4. SUBSCRIBE NUDGE — has a plan but no sub and (likely)
                   no preview left either.
              Shown whenever the user is NOT on a perpetual auto-
              renewing sub. The only case we skip: active monthly /
              annual / lifetime where `trialDaysLeft` is null and
              `subscribed === true`. That block is intentionally
              silent — those users don't need a nag.
              Logging: dev-only console line so "why isn't my banner
              showing" reports can be answered from the log output
              instead of guessing. */}
          {(() => {
            const isPerpetualActiveSub =
              subscribed && trialDaysLeft === null &&
              (subPlan === 'monthly' || subPlan === 'annual' || subPlan === 'lifetime');
            const shouldShowBanner = plans.length > 0 && !isPerpetualActiveSub;
            if (__DEV__) {
              console.log('[home] banner decision', {
                plansCount: plans.length,
                subscribed,
                subPlan,
                trialDaysLeft,
                previewDaysLeft,
                isPerpetualActiveSub,
                shouldShowBanner,
              });
            }
            return shouldShowBanner;
          })() && (
            <TouchableOpacity
              style={s.subscribeBanner}
              onPress={() => {
                if (trialDaysLeft !== null) {
                  // Trialing user — send to Settings to manage, not paywall.
                  navigation.navigate('Settings');
                  return;
                }
                // Not-yet-subscribed — send to paywall, with beginners
                // routed straight to the starter plan picker.
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
                  {(() => {
                    // Priority: trial/starter countdown > preview >
                    // generic subscribe nudge. Every branch returns
                    // a string so the <Text> is never empty (an
                    // empty Text can render as a 0-height element
                    // that looks like the banner has "disappeared"
                    // — hence the fallback at the end).
                    if (trialDaysLeft !== null) {
                      const onStarter = subPlan === 'starter';
                      if (trialDaysLeft === 0) {
                        return onStarter ? 'Starter plan active' : 'Free trial active';
                      }
                      const lastDay = trialDaysLeft <= 1;
                      if (onStarter) {
                        return lastDay ? 'Starter plan · last day' : `Starter plan · ${trialDaysLeft} days left`;
                      }
                      return lastDay ? 'Free trial · last day' : `Free trial · ${trialDaysLeft} days left`;
                    }
                    if (previewDaysLeft !== null) {
                      return previewDaysLeft <= 1 ? 'Last day of preview' : `${previewDaysLeft} days of preview left`;
                    }
                    if (!subscribed) return 'Subscribe to start training';
                    // Fallback — shouldn't normally hit this branch given
                    // the render gate above, but belt-and-braces so we
                    // never ship a zero-height banner.
                    return 'Tap to manage your subscription';
                  })()}
                </Text>
                <Text style={s.subscribeBannerSub}>
                  {trialDaysLeft !== null
                    ? (subPlan === 'starter'
                        ? 'Tap to upgrade to monthly, annual, or lifetime'
                        : 'Tap to manage your subscription')
                    : trialConfig.bannerMessage}
                </Text>
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
          {/* "+ New plan" — full-pill button only when the user has NO
              plans yet (empty state, biggest CTA on the screen). Once
              they have a plan, the action moves to a small "+" icon
              inside the YOUR PLANS header row to save vertical space.
              The handler itself is hoisted to handleNewPlanPress so
              both surfaces share identical behaviour (limit warning,
              confirm dialog, navigation). */}
          {plans.length === 0 && (
            <TouchableOpacity
              style={[s.newPlanBtn, planLimits && !planLimits.unlimited && planLimits.remaining === 0 && { opacity: 0.5 }]}
              onPress={handleNewPlanPress}
              activeOpacity={0.8}
            >
              <Text style={s.newPlanBtnPlus}>+</Text>
              <Text style={s.newPlanBtnText}>New plan</Text>
            </TouchableOpacity>
          )}

          {/* Plan tabs — always visible, scrollable */}
          {plans.length > 0 && (
            <View>
              {/* Header row: label + dots + "+ new plan" icon button.
                  The standalone full-pill "New plan" button above this
                  was eating ~60pt of vertical space on every load —
                  ALL users have at least one plan once they're past
                  the empty state, so it was permanent chrome. Compact
                  icon button here keeps the action one tap away
                  without the weight. */}
              <View style={s.planTabsHeader}>
                {/* Label + "+" grouped together on the left so the
                    button reads as part of the section header instead
                    of floating across the screen. The dots (when
                    multiple plans) push to the right. */}
                <View style={s.planTabsHeaderLeft}>
                  <Text style={s.planTabsLabel}>YOUR PLANS</Text>
                  <TouchableOpacity
                    onPress={handleNewPlanPress}
                    style={[s.newPlanIconBtn, planLimits && !planLimits.unlimited && planLimits.remaining === 0 && { opacity: 0.5 }]}
                    hitSlop={HIT}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
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
              unreadCount={coachUnread}
              refreshing={refreshingConfig}
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

          {/* ── Unified week module header ─────────────────────────────────
              ONE header for the whole week section: prev/next week
              navigation, Cards/List view toggle, and the Calendar shortcut.
              This replaces what used to be three separate header rows
              (week-toggle above the rail, weekHeader above the 7-day
              calendar strip, and a separate weekStrip calendar button)
              all of which competed for the same screen real estate.
              Renders whenever the rail OR the list would render — the
              same condition both downstream blocks use. */}
          {(planHasStarted || todayActivities.length > 0 || tomorrowActivities.length > 0) && effectivePlanRunning && (() => {
            const totalWeeks = activePlan?.weeks || 1;
            const canPrev = currentWeek > 1;
            const canNext = currentWeek < totalWeeks;
            return (
              <View style={s.unifiedWeekHeader}>
                <TouchableOpacity
                  onPress={() => {
                    if (!canPrev) return;
                    const to = Math.max(1, currentWeek - 1);
                    analytics.events.weekNavigated('prev', currentWeek, to);
                    setCurrentWeek(to);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  disabled={!canPrev}
                  style={[s.weekToggleArrow, !canPrev && s.weekToggleArrowDisabled]}
                >
                  <Text style={[s.weekToggleArrowText, !canPrev && s.weekToggleArrowTextDisabled]}>{'\u2039'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => navigation.navigate('WeekView', { week: currentWeek, planId: activePlan.id })}
                  hitSlop={HIT}
                  activeOpacity={0.7}
                  style={s.unifiedWeekLabelTap}
                >
                  <Text style={s.weekToggleLabel}>Week {currentWeek} of {totalWeeks}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (!canNext) return;
                    const to = Math.min(totalWeeks, currentWeek + 1);
                    analytics.events.weekNavigated('next', currentWeek, to);
                    setCurrentWeek(to);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  disabled={!canNext}
                  style={[s.weekToggleArrow, !canNext && s.weekToggleArrowDisabled]}
                >
                  <Text style={[s.weekToggleArrowText, !canNext && s.weekToggleArrowTextDisabled]}>{'\u203A'}</Text>
                </TouchableOpacity>
                {/* Cards / List segmented toggle. Pink-tinted active
                    chip echoes the brand colour without competing with
                    the calendar pill. Two-segment so labels stay
                    readable; doesn't expand when the screen is narrow. */}
                <View style={s.viewModeToggle}>
                  <TouchableOpacity
                    onPress={() => setViewModeAndPersist('cards')}
                    style={[s.viewModeBtn, viewMode === 'cards' && s.viewModeBtnActive]}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.viewModeBtnText, viewMode === 'cards' && s.viewModeBtnTextActive]}>Cards</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setViewModeAndPersist('list')}
                    style={[s.viewModeBtn, viewMode === 'list' && s.viewModeBtnActive]}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.viewModeBtnText, viewMode === 'list' && s.viewModeBtnTextActive]}>List</Text>
                  </TouchableOpacity>
                </View>
                {/* Calendar shortcut — same target as the old corner
                    button on the week strip. Kept the pink-tinted bg so
                    users who'd learned the previous icon position still
                    recognise it here. */}
                <TouchableOpacity
                  onPress={() => navigation.navigate('Calendar')}
                  style={s.unifiedCalendarBtn}
                  hitSlop={HIT}
                  activeOpacity={0.7}
                  accessibilityLabel="View calendar"
                >
                  <MaterialCommunityIcons name="calendar-month-outline" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            );
          })()}

          {/* This week progress — one pink dot per planned session,
              filled when complete, hollow when not. Sits directly under
              the unified header and above the cards / list view. The
              dots scale to whatever the user's week looks like (3 for
              a beginner, 9 for an advanced multi-session week) and
              wrap to a second row past 7 sessions so the count chip on
              the right doesn't get pushed off-screen on a narrow phone.
              Pink because the brand colour does the work — green felt
              like a Strava/done-button signal that didn't fit the warm
              "this is your training" tone. Hidden pre-plan-start
              because "0/0 done" before a plan starts is noise, not
              information. */}
          {activePlan && effectivePlanRunning && progress.total > 0 && (
            <View style={s.weekDotsRow}>
              <Text style={s.weekDotsLabel}>This week</Text>
              <View style={s.weekDotsTrack}>
                {Array.from({ length: progress.total }).map((_, i) => (
                  <View
                    key={i}
                    style={[s.weekDot, i < progress.done && s.weekDotDone]}
                  />
                ))}
              </View>
            </View>
          )}

          {/* ── Upcoming days rail (Cards mode only) ─────────────────────
              Horizontal scroll of the next 7 days. Today + Tomorrow are
              equal-width compressed cards; the rest are the same width
              for a consistent rhythm in the rail. Tap any card →
              ActivityDetail. Long-press → drag to move. Mark-done
              circle is inline in the action row. */}
          {viewMode === 'cards' && (planHasStarted || todayActivities.length > 0 || tomorrowActivities.length > 0) && (() => {
            const coach = getCoach(activePlanConfig?.coachId);
            const coachFirstName = (coach?.name || 'your coach').split(' ')[0];
            // Equal-width compressed cards. Previously Today was a wider
            // hero (~62%) with the rest at ~46%, but Rob (Apr 27 design
            // pass) flagged the cards still felt oversized and the
            // unequal sizing made the rail look uneven during scroll.
            // 48% across the board lets the user see Today + Tomorrow
            // side-by-side at rest, with Wed peeking in. Today still
            // pops via the pink border and TODAY eyebrow rather than
            // dimensional difference.
            const screenW = Dimensions.get('window').width;
            const compactCardWidth = Math.min(screenW * 0.48, 200);

            const renderUpcomingCard = (day, idx) => {
              const isToday = day.isToday;
              const cardWidth = compactCardWidth;
              const a = day.primary;
              const isRest = !a;
              const isDone = !!a?.completed;
              const metaParts = [];
              if (a?.distanceKm) metaParts.push(formatDistance(a.distanceKm));
              if (a?.durationMins) metaParts.push(`${a.durationMins} min`);
              if (a?.effort) metaParts.push(a.effort);
              const meta = metaParts.join(' \u00B7 ');

              // Type pill — monochrome (no colour encoding). Picks the
              // icon from the existing app-wide icon system so an
              // endurance ride here matches the same icon on Calendar
              // / WeekView / ActivityDetail. Rest days get a sleep
              // glyph + REST tag. The pill background is a faint white
              // tint, same for every type — colour was deliberately
              // dropped because it added rainbow-noise to the rail.
              const typeIcon = isRest ? 'sleep' : getActivityIcon(a);
              const typeTag = isRest ? 'REST' : (getSessionTag(a) || 'RIDE');

              // Drag setup. Cards with no activity (rest days) aren't
              // draggable — there's nothing to move. Cards WITH an
              // activity get a Pan gesture that activates after a 350ms
              // long-press, so a normal tap still navigates to detail.
              const dateKey = dateKeyOf(day.date);
              const isHovered = hoveredRailKey === dateKey && dragActivity && dragActivity.id !== a?.id;
              const isDragSource = dragActivity?.id === a?.id;
              const draggable = !!a;
              // Callback ref + onLayout: the layout fires after the
              // node is mounted AND laid out in the rail's horizontal
              // ScrollView, which is the right moment to measureInWindow
              // and register this card as a rail drop zone. Storing
              // the node in a closure-local var so the onLayout callback
              // can find it.
              let cardNode = null;
              const setCardNode = (node) => { cardNode = node; };
              const onCardLayout = () => {
                if (!cardNode) return;
                // Defer one tick so the parent ScrollView has measured.
                setTimeout(() => registerRailDropZone(dateKey, day.week, day.dayOfWeek, cardNode), 0);
              };

              const cardInner = (
                <TouchableOpacity
                  ref={setCardNode}
                  onLayout={onCardLayout}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (justDraggedRef.current) return;
                    if (a) navigation.navigate('ActivityDetail', { activityId: a.id });
                  }}
                  style={[
                    s.upcomingCard,
                    { width: cardWidth, marginRight: idx === UPCOMING_DAY_COUNT - 1 ? 20 : 10 },
                    isToday && s.upcomingCardToday,
                    isDone && isToday && s.todayHeroDone,
                    isHovered && s.upcomingCardHovered,
                    isDragSource && s.upcomingCardDragSource,
                  ]}
                >
                  <View style={s.upcomingCardHeader}>
                    <Text style={[s.upcomingCardLabel, isToday && s.upcomingCardLabelToday]}>{day.eyebrow}</Text>
                    <View style={s.upcomingTypePill}>
                      <MaterialCommunityIcons
                        name={typeIcon}
                        size={10}
                        color={colors.textMid}
                      />
                      <Text style={s.upcomingTypePillText}>{typeTag}</Text>
                    </View>
                  </View>
                  <Text style={s.upcomingCardTitle} numberOfLines={1}>
                    {isRest ? 'Rest day' : a.title}
                  </Text>
                  <Text style={s.upcomingCardMeta} numberOfLines={1}>
                    {isRest
                      ? 'Recovery is training too.'
                      : meta}
                  </Text>
                  {/* Action row — single line on every card. View on the
                      left for non-rest, Ask? bridges to the coach (label
                      kept short and coach-agnostic so it doesn't wrap
                      with longer coach names like "Matteo"), and the
                      mark-done circle on the right. The circle works
                      for rest days too (some users like checking off
                      rest days as a "I actually rested" affirmation). */}
                  <View style={s.upcomingCardActions}>
                    {!isRest && (
                      <TouchableOpacity
                        style={s.todayHeroCta}
                        onPress={() => navigation.navigate('ActivityDetail', { activityId: a.id })}
                        activeOpacity={0.85}
                      >
                        <Text style={s.todayHeroCtaText}>View</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[s.todayHeroCoachBtn, isRest && s.todayHeroCoachBtnRest]}
                      onPress={() => navigation.navigate('CoachChat', { planId: activePlan.id })}
                      activeOpacity={0.85}
                    >
                      <Text style={s.todayHeroCoachBtnText}>Ask?</Text>
                    </TouchableOpacity>
                    {!isRest && (
                      <TouchableOpacity
                        onPress={async (e) => {
                          e.stopPropagation?.();
                          if (!a) return;
                          await markActivityComplete(a.id);
                          // force:true bypasses load()'s plan-hash cache
                          // (matches the same pattern used by the weekList
                          // mark-done at the bottom of this screen).
                          await load({ force: true });
                        }}
                        style={[s.cardDoneCircle, isDone && s.cardDoneCircleDone]}
                        hitSlop={HIT}
                        activeOpacity={0.7}
                      >
                        {isDone ? <Text style={s.cardDoneTick}>{'\u2713'}</Text> : null}
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Drag handle hint — only on cards that have a real
                      activity. The ≡-and-text affordance is the same
                      visual vocabulary the Calendar list uses, so users
                      who've moved sessions there will recognise it. */}
                  {draggable && (
                    <View style={s.upcomingDragHint}>
                      <MaterialCommunityIcons
                        name="drag-horizontal-variant"
                        size={11}
                        color={colors.textMuted}
                      />
                      <Text style={s.upcomingDragHintText}>Hold to move</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );

              // Wrap in a GestureDetector when the card has a draggable
              // activity. Long-press 350ms activates Pan; quick taps
              // still navigate via the inner TouchableOpacity's onPress.
              if (draggable) {
                return (
                  <GestureDetector
                    key={idx}
                    gesture={makeRailDragGesture(a, day.week, day.dayOfWeek)}
                  >
                    <View>{cardInner}</View>
                  </GestureDetector>
                );
              }
              return <View key={idx}>{cardInner}</View>;
            };

            return (
              <>
                {/* Week navigation + view toggle moved to a dedicated
                    unified header below — rendered for both Cards and
                    List modes so the controls don't disappear when the
                    user toggles. See `s.unifiedWeekHeader` block. */}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingLeft: 20, paddingVertical: 4 }}
                  style={{ marginBottom: 16 }}
                  snapToAlignment="start"
                  decelerationRate="fast"
                  // Snap on the compact-card width because that's the
                  // dominant card size in the rail (Today is the only
                  // wider card). Snapping on the wider value would feel
                  // sluggish past the first card.
                  // All cards share one width now that Today is no longer a
                  // wider hero — snap on the unified width so the rail
                  // pages cleanly card-by-card.
                  snapToInterval={compactCardWidth + 10}
                >
                  {upcomingDays.map(renderUpcomingCard)}
                </ScrollView>
              </>
            );
          })()}

          {/* Legacy todayHero block — left commented as a fallback to
              restore the old layout if the rail above causes issues.
              Delete after a release of bake-time. */}
          {false && (planHasStarted || todayActivities.length > 0) && (() => {
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

          {/* (Tomorrow preview + "Tomorrow · Rest" hint deleted —
              Tomorrow is now the second card inside the upcoming-day
              rail above. Showing it twice was redundant and ate vertical
              space without adding information.) */}

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

          {/* List mode — the inline vertical week view. The previous
              7-day calendar strip (day-circles + activity icons) and the
              separate weekHeader (title + calendar btn) lived here too,
              both of which duplicated info now consolidated in the
              unified week header above and the cards rail. The list
              still owns drag-to-day, mark-done, and full session detail
              — it's just rendered when the user toggles to List, not
              alongside Cards. */}
          {effectivePlanRunning && viewMode === 'list' && (
          <View style={s.weekListWrap}>
            {/* "Go to today" — only when we've drifted off the current
                week in list mode. Smaller and inline since the unified
                header above handles primary navigation. */}
            {(!viewingToday && (planHasStarted ? currentWeek !== realTodayWeek : currentWeek !== 1)) && (
              <TouchableOpacity
                onPress={() => {
                  setCurrentWeek(planHasStarted ? realTodayWeek : 1);
                }}
                hitSlop={HIT}
                style={s.goTodayBtnInline}
              >
                <Text style={s.goTodayText}>{planHasStarted ? 'Go to today' : 'Go to start'}</Text>
              </TouchableOpacity>
            )}

            {/* Inline week list — full session titles for every day so the
                user sees the whole week at a glance without tapping through
                to the calendar. Today highlighted in pink.
                onLayout captures this list's Y position inside the outer
                ScrollView so tapping a day in the week strip above can
                auto-scroll to the matching day row below. */}
            <View
              style={s.weekList}
              onLayout={(e) => { weekListYRef.current = e.nativeEvent.layout.y; }}
            >
              {/* Gesture hint — moved INSIDE the weekList so it sits
                  below the divider (the weekList's borderTop). Prior
                  placement above the divider made it ambiguous whether
                  "tap a session" referred to the week-strip chips at
                  the top or the day rows below. Sitting under the
                  divider makes the reference unambiguously the day
                  rows. Copy still switches mid-move to guide the user. */}
              <Text style={s.weekListHint}>
                {movingActivity
                  ? 'Tap a day to drop the session there · long-press Cancel to bail'
                  : 'Tap a session to open · press and hold to move'}
              </Text>
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
                      ref={(r) => {
                        registerDropZone(i, r);
                        if (r) dayRowRefs.current.set(i, r);
                        else dayRowRefs.current.delete(i);
                      }}
                      onLayout={(e) => { dayRowYRef.current.set(i, e.nativeEvent.layout.y); }}
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
                    onLayout={(e) => { dayRowYRef.current.set(i, e.nativeEvent.layout.y); }}
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

          {/* This-week progress block moved to the TOP of the unified
              week module — see the block right after the unified
              header above. Reads as a section intro rather than an
              afterthought below the cards/list. */}

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

      {/* Onboarding tour — shown once on first launch for users who have
          no plan yet AND haven't seen it before. Was previously imported
          and had its state wired up, but the <OnboardingTour /> element
          was never actually rendered — which is why first-time users
          weren't seeing the 5-step walkthrough. Fixed April 2026.
          onComplete marks the onboarding-done flag so the modal never
          re-shows, even if the user lands back on Home before creating
          a plan. */}
      <OnboardingTour
        visible={showOnboarding}
        onComplete={async () => {
          setShowOnboarding(false);
          try { await setOnboardingDone(); } catch {}
          // Re-read userPrefs so the name the user just typed in the
          // final tour step replaces the Apple Sign-In `full_name`
          // fallback that was loaded at first mount. Without this,
          // Home would keep showing the user's Apple name (e.g.
          // "Robert") even though they typed "Rob" in onboarding —
          // looked like the name hadn't been saved at all.
          try {
            const fresh = await getUserPrefs();
            if (fresh?.displayName && isMounted.current) {
              setName(fresh.displayName);
            }
          } catch {}
        }}
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
  // Loading + delete-overlay styles were removed when both states moved
  // to the shared LoadingSplash component — see src/components/LoadingSplash.js.
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
  planTabsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 10, gap: 12 },
  // Left cluster — label sits next to the compact "+" button so
  // they read as a single header unit instead of two unrelated
  // controls separated by a stretch of empty space.
  planTabsHeaderLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  // Compact "+" icon button in the YOUR PLANS header — replaces the
  // standalone full-pill "+ New plan" button for users who already
  // have at least one plan. Sized down (24×24) so it sits beside the
  // 10pt YOUR PLANS label without dwarfing it.
  newPlanIconBtn: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(232,69,139,0.10)',
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.30)',
    alignItems: 'center', justifyContent: 'center',
  },
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
  // ── Upcoming-day cards (horizontal rail) ──────────────────────────
  // First card (today) gets the pink accent border + slightly stronger
  // background. Subsequent cards are quieter previews.
  upcomingCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  upcomingCardToday: {
    borderColor: 'rgba(232,69,139,0.5)',
    backgroundColor: 'rgba(232,69,139,0.06)',
  },
  upcomingCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  upcomingCardLabel: {
    fontSize: 9, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase',
  },
  upcomingCardLabelToday: { color: colors.primary },
  upcomingCardTitle: {
    fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.text,
    lineHeight: 16, marginBottom: 2,
  },
  upcomingCardMeta: {
    fontSize: 10, fontFamily: FF.regular, color: colors.textMid, lineHeight: 14,
    marginBottom: 2,
  },
  upcomingCardActions: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
  },

  // Hovered state — applied while a drag is in progress and the finger
  // is inside this card's hit zone. Pink dashed-feel border + soft pink
  // tint so the user clearly sees "this is where it'll land".
  upcomingCardHovered: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: 'rgba(232,69,139,0.12)',
  },
  // Source card while being dragged — fade slightly so the ghost is
  // visually distinct from the card it lifted off.
  upcomingCardDragSource: {
    opacity: 0.4,
  },
  // ≡ Hold to move — small caption inside every draggable card so the
  // affordance is obvious without users having to discover it.
  upcomingDragHint: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 8, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)',
  },
  upcomingDragHintText: {
    fontSize: 10, fontFamily: FF.medium, fontWeight: '500',
    color: colors.textMuted, letterSpacing: 0.3,
  },

  // Type pill — monochrome icon + tag, sits in the top-right of every
  // upcoming-day card. Same shape and colour for every session type so
  // the rail reads as a clean grid instead of a rainbow.
  upcomingTypePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)',
  },
  upcomingTypePillText: {
    fontSize: 9, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.textMid, letterSpacing: 0.5,
  },

  // ── Unified week module header ────────────────────────────────────
  // Single row: week prev/next, week label (tap → WeekView), Cards/List
  // segmented toggle, calendar shortcut. Replaces what used to be three
  // separate header rows that all lived above the rail and the 7-day
  // calendar strip. Sits in margin (not a card) so the rail / list
  // beneath does the visual work — same approach as the old
  // weekToggleRow.
  unifiedWeekHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, marginBottom: 10,
  },
  unifiedWeekLabelTap: {
    flex: 1, alignItems: 'center', paddingVertical: 4,
  },
  viewModeToggle: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999, padding: 2,
  },
  viewModeBtn: {
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: 999, minWidth: 44, alignItems: 'center',
  },
  viewModeBtnActive: {
    backgroundColor: 'rgba(232,69,139,0.18)',
  },
  viewModeBtnText: {
    fontSize: 11, fontFamily: FF.medium, fontWeight: '500',
    color: colors.textMid,
  },
  viewModeBtnTextActive: {
    color: colors.primary, fontWeight: '600',
  },
  unifiedCalendarBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(232,69,139,0.1)',
  },
  // ── Mark-done circle on rail cards ────────────────────────────────
  // Same visual vocabulary as the list-mode mark-done circle below
  // (s.weekListDoneCircle) so users see the affordance is the same
  // control. Smaller because it lives on a compressed card.
  cardDoneCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardDoneCircleDone: {
    backgroundColor: '#2bb673',
    borderColor: '#2bb673',
  },
  cardDoneTick: {
    fontSize: 12, color: '#FFFFFF', fontWeight: '600',
  },

  // ── Wrapper for the list-mode block ───────────────────────────────
  // Replaces the old s.weekStrip card. The list itself owns its own
  // padding and divider via s.weekList further down — this is just
  // the outer container so a "Go to today" inline shortcut has a
  // place to sit above the list.
  weekListWrap: {
    paddingHorizontal: 20, marginBottom: 14,
  },
  goTodayBtnInline: {
    alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 10,
    marginBottom: 6,
  },

  // Week toggle row (legacy — kept because the styles are still
  // referenced by the unified header above for the prev/next arrows).
  weekToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingHorizontal: 20, marginBottom: 10,
  },
  weekToggleArrow: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  weekToggleArrowDisabled: {
    backgroundColor: 'transparent',
  },
  weekToggleArrowText: {
    fontSize: 18, color: colors.text, lineHeight: 20, fontFamily: FF.medium,
  },
  weekToggleArrowTextDisabled: {
    color: colors.textFaint,
  },
  weekToggleLabel: {
    fontSize: 13, fontFamily: FF.medium, fontWeight: '500',
    color: colors.text,
  },

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
  // Compact CTAs sized for the compressed rail cards (Apr 27 2026
  // redesign — Rob flagged the originals as too tall for ~48% width
  // cards). Padding, font and radius all dropped a step. The legacy
  // todayHero block further down references the same names but it's
  // gated behind `{false && …}` so this resize doesn't affect anything
  // currently rendering.
  todayHeroCta: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  todayHeroCtaDone: {
    backgroundColor: colors.surfaceLight,
  },
  todayHeroCtaText: {
    fontSize: 12, fontWeight: '600', fontFamily: FF.semibold,
    color: '#FFFFFF',
  },
  todayHeroCtaArrow: {
    fontSize: 14, fontWeight: '400', color: '#FFFFFF', lineHeight: 14,
  },
  todayHeroCoachBtn: {
    flex: 1,
    paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 4,
  },
  // Rest day variant — coach button takes full width on rest cards
  // (no View CTA to share the row with).
  todayHeroCoachBtnRest: {
    flex: 1,
  },
  todayHeroCoachBtnText: {
    fontSize: 12, fontWeight: '500', fontFamily: FF.medium,
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

  // Hint line telling users about the long-press gesture. Lives
  // INSIDE weekList (below its borderTop divider) so the "tap a
  // session" reference unambiguously points at the day rows below it
  // rather than the week-strip chips above the divider. Small bottom
  // margin separates it from the first day row without feeling
  // cramped; no top margin because the weekList's paddingTop handles
  // the gap from the divider.
  weekListHint: {
    marginBottom: 8, paddingHorizontal: 4,
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
    fontSize: 13, fontWeight: '500', fontFamily: FF.medium,
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
  // Selected cell used to paint a solid pink rectangle behind the whole
  // column (number + icons + metric), which felt heavy and fought with
  // the overall dark theme. Selection is now conveyed ONLY by the pink
  // circle around the day number — consistent with the "today" treatment
  // and much lighter visually. The rectangle style is retained but
  // emptied so the merge-in on line 1553 is a no-op.
  dayCellSelected: {},
  dayCellDropTarget: { borderWidth: 1, borderColor: 'rgba(232,69,139,0.4)', borderStyle: 'dashed' },
  dayLabelText: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },
  dayLabelToday: { color: colors.primary },
  // No pink rectangle any more, so white-on-dark would be invisible.
  // Tint the label pink to mirror the circle underneath it — matches
  // the "today" treatment exactly.
  dayLabelSelected: { color: colors.primary },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayCircleToday: { backgroundColor: colors.primary },
  // Selected circle now mirrors today's: solid brand-pink fill rather
  // than the old translucent white-on-pink trick (which only worked
  // because the whole cell background was pink).
  dayCircleSelected: { backgroundColor: colors.primary },
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
  // ── Dot-style week progress ───────────────────────────────────────
  // One dot per planned session this week. Pink fill when complete,
  // hollow ring when not. Replaces the bar-style progress block above
  // the cards/list — dots feel discrete (matches "I have 3 sessions
  // and did 1") rather than a percentage abstraction. flexWrap so a
  // 9-session week can spill onto a second row instead of squashing
  // dots smaller than the touch / readability minimum.
  weekDotsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, marginBottom: 14, marginTop: 2,
  },
  weekDotsLabel: {
    fontSize: 12, fontFamily: FF.medium, fontWeight: '500',
    color: colors.textMid,
  },
  weekDotsTrack: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    flexWrap: 'wrap', rowGap: 4,
  },
  weekDot: {
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'transparent',
  },
  weekDotDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  weekDotsCount: {
    fontSize: 12, fontFamily: FF.medium, fontWeight: '500',
    color: colors.textMid,
  },

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
