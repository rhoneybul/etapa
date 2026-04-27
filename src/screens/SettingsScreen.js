/**
 * Settings screen — Strava connect/disconnect, reset plan, sign out.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch, Linking, TextInput, Platform, Animated,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import * as StoreReview from 'expo-store-review';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { signOut, getCurrentUser } from '../services/authService';
import { clearPlan, getPlans, clearUserData, getUserPrefs, setUserPrefs } from '../services/storageService';
import { openBillingPortal, getSubscriptionStatus, restorePurchases, getPrices } from '../services/subscriptionService';
import { logoutRevenueCat, isRevenueCatAvailable } from '../services/revenueCatService';
import { connectStrava, disconnectStrava, isStravaConnected, isStravaConfigured, getStravaTokens } from '../services/stravaService';
import UpgradePrompt from '../components/UpgradePrompt';
import ComingSoon from '../components/ComingSoon';
import analytics from '../services/analyticsService';
import StravaLogo from '../components/StravaLogo';
import { api } from '../services/api';

const FF = fontFamily;

// Shared opacity pulse for skeleton rows. Keeps every skeleton on the
// screen animating in sync (all brighten and dim together) instead of
// a distracting multi-phase flicker when each row mounts at a different
// tick. Returns a single Animated.Value that all skeleton blocks can
// use as their opacity.
function useSkeletonPulse() {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
}

// Row-shaped skeleton. Matches the height of a real `s.row` (title 15pt +
// sub 12pt + 16pt padding top & bottom) so swapping a skeleton for a real
// row causes zero vertical shift. `titleWidth` / `subWidth` fake the
// content widths. `trailing` optionally reserves space on the right for
// a badge or chevron so those don't pop in either.
// Inline value-slot skeleton — drops into a row in place of the real
// `<Text style={s.rowSub}>` while the underlying async data is still
// loading. Sized to match a typical sub-line value so the row's
// vertical rhythm is preserved (the row doesn't shrink and re-grow
// when text replaces the bar). Throbs in sync with every other
// SkelBar / SkeletonRow on the screen via the shared pulse.
function SkelBar({ pulse, width = 120, height = 11, style }) {
  return (
    <Animated.View
      style={[
        {
          width, height,
          borderRadius: 4,
          backgroundColor: 'rgba(232,69,139,0.14)',
          marginTop: 4,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

function SkeletonRow({ pulse, titleWidth = 120, subWidth = 200, trailing = null }) {
  return (
    <View style={sk.row}>
      <View style={{ flex: 1 }}>
        <Animated.View style={[sk.lineTitle, { width: titleWidth, opacity: pulse }]} />
        <Animated.View style={[sk.lineSub, { width: subWidth, opacity: pulse }]} />
      </View>
      {trailing === 'badge' && (
        <Animated.View style={[sk.trailBadge, { opacity: pulse }]} />
      )}
      {trailing === 'chevron' && (
        <Animated.View style={[sk.trailChevron, { opacity: pulse }]} />
      )}
    </View>
  );
}

const sk = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  lineTitle: { height: 15, borderRadius: 4, backgroundColor: 'rgba(232,69,139,0.14)' },
  lineSub:   { height: 11, borderRadius: 4, backgroundColor: 'rgba(232,69,139,0.08)', marginTop: 6 },
  trailBadge: { width: 62, height: 22, borderRadius: 11, backgroundColor: 'rgba(232,69,139,0.1)' },
  trailChevron: { width: 8, height: 14, borderRadius: 2, backgroundColor: 'rgba(232,69,139,0.08)' },
  label:    { fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: 'rgba(232,69,139,0.25)', letterSpacing: 0.6, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  card:     { backgroundColor: '#161418', marginHorizontal: 16, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(232,69,139,0.06)' },
  divider:  { height: 1, backgroundColor: 'rgba(255,255,255,0.04)', marginHorizontal: 16 },
  scrollPad: { paddingBottom: 40 },
});

// Whole-screen skeleton — shown instead of the real content until every
// layout-relevant async call has settled. Reuses the section labels +
// card structure of the real screen so the eventual cross-fade is
// spatially continuous (sections don't slide on arrival). Every row is
// a SkeletonRow sharing the same pulse driver, so the whole screen
// breathes in sync as one unit.
function SettingsSkeleton({ pulse }) {
  return (
    <View style={sk.scrollPad} pointerEvents="none">
      <Text style={sk.label}>PROFILE</Text>
      <View style={sk.card}>
        <SkeletonRow pulse={pulse} titleWidth={46} subWidth={180} />
        <View style={sk.divider} />
        <SkeletonRow pulse={pulse} titleWidth={110} subWidth={80} />
        <View style={sk.divider} />
        <SkeletonRow pulse={pulse} titleWidth={100} subWidth={70} trailing="chevron" />
        <View style={sk.divider} />
        <SkeletonRow pulse={pulse} titleWidth={110} subWidth={90} trailing="chevron" />
        <View style={sk.divider} />
        <SkeletonRow pulse={pulse} titleWidth={80} subWidth={160} trailing="chevron" />
        <View style={sk.divider} />
        <SkeletonRow pulse={pulse} titleWidth={90} subWidth={180} trailing="chevron" />
      </View>

      <Text style={sk.label}>CONNECTIONS</Text>
      <View style={sk.card}>
        <SkeletonRow pulse={pulse} titleWidth={60} subWidth={170} trailing="badge" />
      </View>

      <Text style={sk.label}>COACHING</Text>
      <View style={sk.card}>
        <SkeletonRow pulse={pulse} titleWidth={110} subWidth={190} trailing="chevron" />
      </View>

      <Text style={sk.label}>SUBSCRIPTION</Text>
      <View style={sk.card}>
        <SkeletonRow pulse={pulse} titleWidth={110} subWidth={180} trailing="chevron" />
      </View>

      <Text style={sk.label}>MESSAGES</Text>
      <View style={sk.card}>
        <SkeletonRow pulse={pulse} titleWidth={90} subWidth={210} trailing="chevron" />
      </View>

      <Text style={sk.label}>NOTIFICATIONS</Text>
      <View style={sk.card}>
        <SkeletonRow pulse={pulse} titleWidth={130} subWidth={150} trailing="badge" />
      </View>

      <Text style={sk.label}>SUPPORT &amp; LEGAL</Text>
      <View style={sk.card}>
        <SkeletonRow pulse={pulse} titleWidth={80} subWidth={140} trailing="chevron" />
        <View style={sk.divider} />
        <SkeletonRow pulse={pulse} titleWidth={100} subWidth={160} trailing="chevron" />
      </View>
    </View>
  );
}

export default function SettingsScreen({ navigation }) {
  const [stravaOk, setStravaOk] = useState(false);
  const [stravaName, setStravaName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] = useState(null);
  const [notifPermission, setNotifPermission] = useState(null); // 'granted' | 'denied' | 'undetermined'
  const [togglingNotif, setTogglingNotif] = useState(false);
  const [sendingTestPush, setSendingTestPush] = useState(false);
  const [userPrefs, setUserPrefsState] = useState({ units: 'km', displayName: '' });
  const [editingName, setEditingName] = useState(false);
  // Optional training-intensity fields. When set, interval breakdowns on
  // ActivityDetail render actual bpm / watts instead of % ranges. Blank
  // means "I don't have this" and the UI falls back to % — never gates
  // anything.
  const [editingMaxHr, setEditingMaxHr] = useState(false);
  const [maxHrInput, setMaxHrInput] = useState('');
  const [editingFtp, setEditingFtp] = useState(false);
  const [ftpInput, setFtpInput] = useState('');
  const [comingSoonConfig, setComingSoonConfig] = useState(null);
  const [stravaEnabled, setStravaEnabled] = useState(true); // default to enabled

  // Guard against double-tap paywall navigation
  const navigatingRef = useRef(false);
  const goPaywall = useCallback((params) => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    // Default the source to 'settings' so paywall funnels can segment entry
    // point — individual call sites may override by passing a more specific
    // `source` in params.
    navigation.navigate('Paywall', { source: 'settings', ...params });
    setTimeout(() => { navigatingRef.current = false; }, 1000);
  }, [navigation]);
  const [nameInput, setNameInput] = useState('');
  const [hasBeginnerPlan, setHasBeginnerPlan] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  // "Finished loading" flags — tracked separately from the data itself
  // because `null` is ambiguous (could mean "not fetched yet" OR, for
  // subscription, "fetched + inactive"). Settled by `.finally()` so the
  // render path can cleanly distinguish. Once all the slow async calls
  // that actually move the layout are done, `allLoaded` flips true and
  // the real screen cross-fades in over the skeleton.
  const [authUserLoaded, setAuthUserLoaded] = useState(false);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [appConfigLoaded, setAppConfigLoaded] = useState(false);
  // Shared pulse driver — every skeleton block (SkelBar, SkeletonRow,
  // and the in-place value slots throughout this screen) brightens/
  // dims in sync instead of flickering out-of-phase as each row
  // mounts. Drives a single Animated.Value that's reused everywhere.
  // The previous separate <SettingsSkeleton /> + cross-fade was
  // dropped (April 2026) in favour of this in-place approach so the
  // layout never shifts on data arrival.
  const skeletonPulse = useSkeletonPulse();

  useEffect(() => {
    checkStrava();
    getSubscriptionStatus()
      .then(setSubscription)
      .catch(() => {})
      .finally(() => setSubscriptionLoaded(true));
    getPrices().catch(() => {});
    api.notifications.unreadCount().then(d => setUnreadCount(d?.count || 0)).catch(() => {});
    api.preferences.get()
      .then(setPreferences)
      .catch(() => {})
      .finally(() => setPreferencesLoaded(true));
    getUserPrefs().then(p => {
      setUserPrefsState(p);
      setNameInput(p.displayName || '');
      setMaxHrInput(p.maxHr != null ? String(p.maxHr) : '');
      setFtpInput(p.ftp != null ? String(p.ftp) : '');
    }).catch(() => {});
    Notifications.getPermissionsAsync().then(({ status }) => setNotifPermission(status)).catch(() => {});
    getCurrentUser()
      .then(setAuthUser)
      .catch(() => {})
      .finally(() => setAuthUserLoaded(true));
    api.appConfig.get()
      .then(cfg => {
        if (cfg?.coming_soon) setComingSoonConfig(cfg.coming_soon);
        if (cfg?.strava_enabled !== undefined) setStravaEnabled(!!cfg.strava_enabled);
      })
      .catch(() => {})
      .finally(() => setAppConfigLoaded(true));
    // Check if user has a beginner (Get into Cycling) plan — if so, upgrade should show starter only
    getPlans().then(plans => {
      const hasBeginner = plans.some(p => p.name && p.name.startsWith('Get into Cycling'));
      setHasBeginnerPlan(hasBeginner);
    }).catch(() => {});
  }, []);

  // Format Supabase auth provider for display. "google" → "Google",
  // "apple" → "Apple", "email" → "Email & Password", else capitalise.
  const formatSignInMethod = (user) => {
    if (!user) return 'Not signed in';
    const providers = user.app_metadata?.providers;
    const primary = user.app_metadata?.provider;
    const list = Array.isArray(providers) && providers.length > 0 ? providers : (primary ? [primary] : []);
    if (list.length === 0) return 'Unknown';
    const pretty = list.map(p => {
      if (p === 'google') return 'Google';
      if (p === 'apple') return 'Apple';
      if (p === 'email') return 'Email & Password';
      return p.charAt(0).toUpperCase() + p.slice(1);
    });
    return pretty.join(', ');
  };

  const checkStrava = async () => {
    const connected = await isStravaConnected();
    setStravaOk(connected);
    if (connected) {
      const tokens = await getStravaTokens();
      setStravaName(tokens?.athleteName || null);
    }
  };

  const handleConnectStrava = async () => {
    if (!isStravaConfigured) {
      Alert.alert('Not configured', 'Add EXPO_PUBLIC_STRAVA_CLIENT_ID and EXPO_PUBLIC_STRAVA_CLIENT_SECRET to your .env file.');
      return;
    }
    setLoading(true);
    try {
      await connectStrava();
      analytics.events.stravaConnected();
      await checkStrava();
    } catch (err) {
      Alert.alert('Error', err.message);
    }
    setLoading(false);
  };

  const handleDisconnectStrava = () => {
    Alert.alert('Disconnect Strava?', 'Your synced activities will remain but no new syncs will happen.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: async () => {
        analytics.events.stravaDisconnected();
        await disconnectStrava();
        setStravaOk(false);
        setStravaName(null);
      }},
    ]);
  };


  const handleManagePlan = async () => {
    setPortalLoading(true);
    try {
      await openBillingPortal();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCancelSubscription = () => {
    Alert.alert(
      'Cancel subscription?',
      'Your access will continue until the end of the current billing period. You can resubscribe at any time.',
      [
        { text: 'Keep subscription', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: async () => {
            setPortalLoading(true);
            try {
              await openBillingPortal();
              // Refresh subscription status after user returns from management sheet
              getSubscriptionStatus().then(setSubscription).catch(() => {});
            } catch (err) {
              Alert.alert('Error', err.message);
            } finally {
              setPortalLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleRequestRefund = () => {
    Alert.alert(
      'Request a refund',
      'All purchases include a 7-day full refund guarantee. You\'ll be taken to the App Store or Play Store to complete your refund request.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            if (Platform.OS === 'ios') {
              Linking.openURL('https://reportaproblem.apple.com');
            } else {
              Linking.openURL('https://play.google.com/store/account/subscriptions');
            }
          },
        },
      ],
    );
  };

  const handleTogglePushNotifications = async (value) => {
    if (notifPermission === 'denied') {
      // Can't grant permission programmatically — send user to OS settings
      Alert.alert(
        'Notifications blocked',
        'Push notifications are blocked in your device settings. Tap Open Settings to enable them.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    setTogglingNotif(true);
    try {
      if (value && notifPermission !== 'granted') {
        // Not yet asked — request permission now
        const { status } = await Notifications.requestPermissionsAsync();
        setNotifPermission(status);
        if (status !== 'granted') {
          setTogglingNotif(false);
          return;
        }
      }
      const updated = { push_notifications: value ? 'enabled' : 'disabled' };
      setPreferences(prev => ({ ...prev, ...updated }));
      await api.preferences.update(updated);
    } catch {
      // Revert optimistic update on failure
      setPreferences(prev => ({ ...prev, push_notifications: value ? 'disabled' : 'enabled' }));
    } finally {
      setTogglingNotif(false);
    }
  };

  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'This will permanently delete your account, all training plans, and all associated data. This action cannot be undone.\n\nIf you have an active subscription, please cancel it first using the Cancel Subscription option above.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            // Second confirmation
            Alert.alert(
              'Are you sure?',
              'This is permanent. All your data will be deleted.',
              [
                { text: 'Keep My Account', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      await api.users.deleteAccount();
                      analytics.capture?.('account_deleted');
                      analytics.reset();
                      await logoutRevenueCat().catch(() => {});
                      await clearUserData();
                      await signOut();
                      navigation.replace('SignIn');
                    } catch (err) {
                      Alert.alert('Error', err?.message || 'Could not delete account. Please try again or contact support@getetapa.com.');
                    } finally {
                      setDeleting(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleUpgrade = () => {
    setShowUpgrade(false);
    goPaywall({ nextScreen: 'Home' });
  };

  const handleSignOut = async () => {
    analytics.events.signedOut();
    analytics.reset();
    await logoutRevenueCat().catch(() => {});
    await clearUserData();
    await signOut();
    navigation.replace('SignIn');
  };

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Settings</Text>
          <View style={{ width: 32 }} />
        </View>

        {/*
          Whole-screen skeleton while any of the slow async calls are
          still pending. Shown instead of the real ScrollView so the user
          never sees a half-populated screen (with displayName + units
          filled in but email, sign-in method, and subscription still
          missing). Once `allLoaded` flips true the real content cross-
          fades in via `contentOpacity`.
        */}
        {/*
          IN-PLACE SKELETONS (April 2026 refactor): we used to render a
          separate <SettingsSkeleton /> overlay and cross-fade to the real
          content, but the two layouts didn't perfectly match — section
          dividers shifted by a few pixels on swap, and the cross-fade
          itself drew the eye away from "your settings just appeared".
          Now we render the REAL screen always and inline a small <SkelBar />
          where each async value would go until the data lands. Pixel-
          perfect alignment, no swap moment, no separate skeleton tree to
          maintain. The shared `skeletonPulse` Animated.Value drives the
          opacity throb on every <SkelBar /> so they breathe in sync.
        */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Profile */}
        <Text style={s.sectionLabel}>PROFILE</Text>
        <View style={s.card}>
          {/* Email + Sign-in Method rows render ALWAYS — when authUser
              hasn't resolved yet, the value slot shows a SkelBar of
              the same height as the real text so the layout never
              shifts when data lands. Previously these rows were gated
              on `authUser &&` which made everything below them slide
              down ~110pt when auth resolved. */}
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>Email</Text>
                {authUser ? (
                  <Text style={s.rowSub} numberOfLines={1} ellipsizeMode="tail">
                    {authUser.email || 'Not available'}
                  </Text>
                ) : (
                  <SkelBar pulse={skeletonPulse} width={180} />
                )}
              </View>
            </View>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>Sign-in Method</Text>
                {authUser ? (
                  <Text style={s.rowSub}>{formatSignInMethod(authUser)}</Text>
                ) : (
                  <SkelBar pulse={skeletonPulse} width={70} />
                )}
              </View>
            </View>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>Display Name</Text>
                {editingName ? (
                  <TextInput
                    style={s.nameInput}
                    value={nameInput}
                    onChangeText={setNameInput}
                    placeholder="Enter your name"
                    placeholderTextColor={colors.textFaint}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={async () => {
                      const updated = await setUserPrefs({ displayName: nameInput.trim() });
                      setUserPrefsState(updated);
                      setEditingName(false);
                    }}
                    onBlur={async () => {
                      const updated = await setUserPrefs({ displayName: nameInput.trim() });
                      setUserPrefsState(updated);
                      setEditingName(false);
                    }}
                  />
                ) : (
                  <Text style={s.rowSub}>{userPrefs.displayName || 'Not set'}</Text>
                )}
              </View>
            </View>
            {!editingName && (
              <TouchableOpacity onPress={() => { setNameInput(userPrefs.displayName || ''); setEditingName(true); }}>
                <Text style={s.editText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View>
                <Text style={s.rowTitle}>Distance Units</Text>
                <Text style={s.rowSub}>{userPrefs.units === 'miles' ? 'Miles' : 'Kilometres'}</Text>
              </View>
            </View>
            <View style={s.unitToggle}>
              <TouchableOpacity
                style={[s.unitBtn, userPrefs.units === 'km' && s.unitBtnActive]}
                onPress={async () => {
                  const updated = await setUserPrefs({ units: 'km' });
                  setUserPrefsState(updated);
                }}
              >
                <Text style={[s.unitBtnText, userPrefs.units === 'km' && s.unitBtnTextActive]}>km</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.unitBtn, userPrefs.units === 'miles' && s.unitBtnActive]}
                onPress={async () => {
                  const updated = await setUserPrefs({ units: 'miles' });
                  setUserPrefsState(updated);
                }}
              >
                <Text style={[s.unitBtnText, userPrefs.units === 'miles' && s.unitBtnTextActive]}>mi</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Training intensity fields — optional. When set, interval
              sessions on ActivityDetail show real numbers instead of
              percentages. Absent values are fine; the UI just shows %
              ranges and RPE, which beginners can still follow. */}
          <View style={s.divider} />
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>Max heart rate</Text>
                {editingMaxHr ? (
                  <TextInput
                    style={s.nameInput}
                    value={maxHrInput}
                    onChangeText={setMaxHrInput}
                    placeholder="e.g. 185"
                    placeholderTextColor={colors.textFaint}
                    autoFocus
                    keyboardType="number-pad"
                    returnKeyType="done"
                    onSubmitEditing={async () => {
                      const n = parseInt(maxHrInput, 10);
                      const val = Number.isFinite(n) && n > 100 && n < 230 ? n : null;
                      const updated = await setUserPrefs({ maxHr: val });
                      setUserPrefsState(updated);
                      setEditingMaxHr(false);
                    }}
                    onBlur={async () => {
                      const n = parseInt(maxHrInput, 10);
                      const val = Number.isFinite(n) && n > 100 && n < 230 ? n : null;
                      const updated = await setUserPrefs({ maxHr: val });
                      setUserPrefsState(updated);
                      setEditingMaxHr(false);
                    }}
                  />
                ) : (
                  <Text style={s.rowSub}>
                    {userPrefs.maxHr ? `${userPrefs.maxHr} bpm` : 'Optional — unlocks bpm targets on interval sessions'}
                  </Text>
                )}
              </View>
            </View>
            {!editingMaxHr && (
              <TouchableOpacity onPress={() => { setMaxHrInput(userPrefs.maxHr != null ? String(userPrefs.maxHr) : ''); setEditingMaxHr(true); }}>
                <Text style={s.editText}>{userPrefs.maxHr ? 'Edit' : 'Add'}</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>FTP (power)</Text>
                {editingFtp ? (
                  <TextInput
                    style={s.nameInput}
                    value={ftpInput}
                    onChangeText={setFtpInput}
                    placeholder="e.g. 220"
                    placeholderTextColor={colors.textFaint}
                    autoFocus
                    keyboardType="number-pad"
                    returnKeyType="done"
                    onSubmitEditing={async () => {
                      const n = parseInt(ftpInput, 10);
                      const val = Number.isFinite(n) && n > 50 && n < 600 ? n : null;
                      const updated = await setUserPrefs({ ftp: val });
                      setUserPrefsState(updated);
                      setEditingFtp(false);
                    }}
                    onBlur={async () => {
                      const n = parseInt(ftpInput, 10);
                      const val = Number.isFinite(n) && n > 50 && n < 600 ? n : null;
                      const updated = await setUserPrefs({ ftp: val });
                      setUserPrefsState(updated);
                      setEditingFtp(false);
                    }}
                  />
                ) : (
                  <Text style={s.rowSub}>
                    {userPrefs.ftp ? `${userPrefs.ftp} W` : 'Optional — unlocks watt targets on interval sessions'}
                  </Text>
                )}
              </View>
            </View>
            {!editingFtp && (
              <TouchableOpacity onPress={() => { setFtpInput(userPrefs.ftp != null ? String(userPrefs.ftp) : ''); setEditingFtp(true); }}>
                <Text style={s.editText}>{userPrefs.ftp ? 'Edit' : 'Add'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Strava */}
        <Text style={s.sectionLabel}>CONNECTIONS</Text>
        <View style={s.card}>
          {stravaEnabled ? (
            <TouchableOpacity style={s.row} onPress={stravaOk ? handleDisconnectStrava : handleConnectStrava} activeOpacity={0.7}>
              <View style={s.rowLeft}>
                <View style={s.stravaIconWrap}>
                  <StravaLogo size={20} />
                </View>
                <View>
                  <Text style={s.rowTitle}>Strava</Text>
                  <Text style={s.rowSub}>
                    {stravaOk
                      ? (stravaName ? `Connected as ${stravaName}` : 'Connected')
                      : 'Sync your rides automatically'}
                  </Text>
                </View>
              </View>
              <View style={[s.stravaBadge, stravaOk && s.stravaBadgeConnected]}>
                <Text style={[s.stravaBadgeText, stravaOk && s.stravaBadgeTextConnected]}>
                  {stravaOk ? 'Disconnect' : 'Connect'}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={s.row}>
              <View style={s.rowLeft}>
                <View style={[s.stravaIconWrap, { opacity: 0.5 }]}>
                  <StravaLogo size={20} />
                </View>
                <View>
                  <Text style={[s.rowTitle, { color: colors.textMuted }]}>Strava</Text>
                  <Text style={s.rowSub}>Sync your rides automatically</Text>
                </View>
              </View>
              <View style={s.comingSoonBadge}>
                <Text style={s.comingSoonText}>Coming Soon</Text>
              </View>
            </View>
          )}
        </View>

        {/* Coaching */}
        <Text style={s.sectionLabel}>COACHING</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={() => {
            navigation.navigate('ChangeCoach');
          }}>
            <View style={s.rowLeft}>
              <View>
                <Text style={s.rowTitle}>Change Coach</Text>
                <Text style={s.rowSub}>Switch your AI coaching personality</Text>
              </View>
            </View>
            <Text style={s.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>
        </View>

        {/* Subscription — the biggest layout-shift offender on this screen.
            Before load, we don't know which of four variants will render
            (starter / lifetime / monthly|annual / inactive) so we can't
            reserve the EXACT shape. Instead we reserve a conservative
            "section label + one card + badge" skeleton that matches the
            shortest variant (inactive), which is the closest thing to a
            lowest-common-denominator shape. Variants that render more
            cards below will still grow downward, but the starting offset
            for everything above is preserved and the Messages section
            below no longer pops up out of nowhere. */}
        {!subscriptionLoaded && (
          <>
            <Text style={s.sectionLabel}>SUBSCRIPTION</Text>
            <View style={s.card}>
              <SkeletonRow pulse={skeletonPulse} titleWidth={110} subWidth={180} trailing="chevron" />
            </View>
          </>
        )}
        {subscription?.active && subscription.plan === 'starter' && (
          <>
            <Text style={s.sectionLabel}>SUBSCRIPTION</Text>
            <View style={s.card}>
              <View style={s.row}>
                <View style={s.rowLeft}>
                  <View>
                    <Text style={s.rowTitle}>Starter Plan</Text>
                    <Text style={s.rowSub}>Get into Cycling · 3 months</Text>
                  </View>
                </View>
                <View style={s.starterBadge}>
                  <Text style={s.starterBadgeText}>ACTIVE</Text>
                </View>
              </View>
            </View>
            <View style={[s.card, { marginTop: 8 }]}>
              <TouchableOpacity style={s.row} onPress={() => goPaywall({ nextScreen: 'Home' })}>
                <View style={s.rowLeft}>
                  <View>
                    <Text style={[s.rowTitle, { color: colors.primary }]}>Upgrade Now</Text>
                    <Text style={s.rowSub}>Switch to monthly, annual, or lifetime</Text>
                  </View>
                </View>
                <Text style={s.chevron}>{'\u203A'}</Text>
              </TouchableOpacity>
            </View>
            <View style={[s.card, { marginTop: 8 }]}>
              <TouchableOpacity style={s.row} onPress={handleCancelSubscription} disabled={portalLoading}>
                <View style={s.rowLeft}>
                  <View>
                    <Text style={[s.rowTitle, { color: colors.primary }]}>{portalLoading ? 'Opening...' : 'Cancel Subscription'}</Text>
                    <Text style={s.rowSub}>Cancel without leaving the app</Text>
                  </View>
                </View>
                <Text style={s.chevron}>{'\u203A'}</Text>
              </TouchableOpacity>
            </View>
            <View style={[s.card, { marginTop: 8 }]}>
              <TouchableOpacity style={s.row} onPress={handleRequestRefund}>
                <View style={s.rowLeft}>
                  <View>
                    <Text style={s.rowTitle}>Request Refund</Text>
                    <Text style={s.rowSub}>7-day full refund guarantee on all purchases</Text>
                  </View>
                </View>
                <Text style={s.chevron}>{'\u203A'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        {subscription?.active && subscription.plan === 'lifetime' && (
          <>
            <Text style={s.sectionLabel}>SUBSCRIPTION</Text>
            <View style={s.card}>
              <View style={s.row}>
                <View style={s.rowLeft}>
                  <View>
                    <Text style={s.rowTitle}>Lifetime Access</Text>
                    <Text style={s.rowSub}>You have lifetime access to Etapa — thank you for your support!</Text>
                  </View>
                </View>
              </View>
            </View>
            <View style={[s.card, { marginTop: 8 }]}>
              <TouchableOpacity style={s.row} onPress={handleCancelSubscription} disabled={portalLoading}>
                <View style={s.rowLeft}>
                  <View>
                    <Text style={[s.rowTitle, { color: colors.primary }]}>{portalLoading ? 'Opening...' : 'Cancel Subscription'}</Text>
                    <Text style={s.rowSub}>Manage or cancel via your app store</Text>
                  </View>
                </View>
                <Text style={s.chevron}>{'\u203A'}</Text>
              </TouchableOpacity>
            </View>
            <View style={[s.card, { marginTop: 8 }]}>
              <TouchableOpacity style={s.row} onPress={handleRequestRefund}>
                <View style={s.rowLeft}>
                  <View>
                    <Text style={s.rowTitle}>Request Refund</Text>
                    <Text style={s.rowSub}>7-day full refund guarantee on all purchases</Text>
                  </View>
                </View>
                <Text style={s.chevron}>{'\u203A'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        {subscription?.active && subscription.plan !== 'starter' && subscription.plan !== 'lifetime' && (
          <>
            <Text style={s.sectionLabel}>SUBSCRIPTION</Text>
            <View style={s.card}>
              <TouchableOpacity style={s.row} onPress={handleManagePlan} disabled={portalLoading}>
                <View style={s.rowLeft}>
                  <View>
                    <Text style={s.rowTitle}>{portalLoading ? 'Opening...' : 'Manage Plan'}</Text>
                    <Text style={s.rowSub}>
                      {subscription.plan === 'annual' ? 'Annual' : 'Monthly'} · {subscription.status === 'trialing' ? 'Free trial' : 'Active'}
                    </Text>
                  </View>
                </View>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={[s.card, { marginTop: 8 }]}>
              <TouchableOpacity style={s.row} onPress={handleCancelSubscription} disabled={portalLoading}>
                <View style={s.rowLeft}>
                  <View>
                    <Text style={[s.rowTitle, { color: colors.primary }]}>{portalLoading ? 'Opening...' : 'Cancel Subscription'}</Text>
                    <Text style={s.rowSub}>Cancel without leaving the app</Text>
                  </View>
                </View>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={[s.card, { marginTop: 8 }]}>
              <TouchableOpacity style={s.row} onPress={handleRequestRefund}>
                <View style={s.rowLeft}>
                  <View>
                    <Text style={s.rowTitle}>Request Refund</Text>
                    <Text style={s.rowSub}>7-day full refund guarantee on all purchases</Text>
                  </View>
                </View>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        {subscription && !subscription.active && subscription.status !== 'dev' && (
          <>
            <Text style={s.sectionLabel}>SUBSCRIPTION</Text>
            <View style={s.card}>
              <TouchableOpacity style={s.row} onPress={() => goPaywall({ fromHome: true, nextScreen: 'Home', ...(hasBeginnerPlan ? { defaultPlan: 'starter' } : {}) })}>
                <View style={s.rowLeft}>
                  <View>
                    <Text style={s.rowTitle}>Subscribe</Text>
                    <Text style={s.rowSub}>{hasBeginnerPlan ? 'Get the Starter plan for your cycling programme' : 'Your subscription is inactive'}</Text>
                  </View>
                </View>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Messages */}
        <Text style={s.sectionLabel}>MESSAGES</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={() => {
            if (!subscription?.active) {
              goPaywall({ fromHome: true, nextScreen: 'Home' });
              return;
            }
            setUnreadCount(0);
            navigation.navigate('Notifications');
          }}>
            <View style={s.rowLeft}>
              <View>
                <Text style={s.rowTitle}>Messages</Text>
                <Text style={s.rowSub}>Responses from the team & coach check-ins</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {unreadCount > 0 && (
                <View style={s.unreadBadge}>
                  <Text style={s.unreadBadgeText}>{unreadCount}</Text>
                </View>
              )}
              <Text style={s.chevron}>{'\u203A'}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Notifications */}
        <Text style={s.sectionLabel}>NOTIFICATIONS</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View>
                <Text style={s.rowTitle}>Push Notifications</Text>
                <Text style={s.rowSub}>
                  {notifPermission === 'denied'
                    ? 'Blocked — tap to open Settings'
                    : preferences?.push_notifications === 'disabled'
                      ? 'Off'
                      : 'On'}
                </Text>
              </View>
            </View>
            {notifPermission === 'denied' ? (
              <TouchableOpacity onPress={() => Linking.openSettings()}>
                <Text style={s.openSettingsText}>Open Settings</Text>
              </TouchableOpacity>
            ) : (
              <Switch
                value={preferences?.push_notifications !== 'disabled'}
                onValueChange={handleTogglePushNotifications}
                disabled={togglingNotif}
                // Brand pink track, plain white thumb — default iOS
                // green was bleeding through the previous thumbColor
                // (iOS ignores thumbColor when the switch is ON, so we
                // set the track to full-brand-pink and let the thumb
                // stay its system white). Matches the rest of the
                // pink-accent UI on this screen.
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={colors.border}
              />
            )}
          </View>
          <View style={s.divider} />
          <TouchableOpacity
            style={s.row}
            onPress={() => {
              if (!subscription?.active) {
                goPaywall({ fromHome: true, nextScreen: 'Home' });
                return;
              }
              Alert.alert('Coach Check-ins', 'How often would you like check-ins from your coach?', [
                {
                  text: 'Daily',
                  onPress: async () => {
                    setPreferences(prev => ({ ...prev, coach_checkin: 'after_session' }));
                    await api.preferences.update({ coach_checkin: 'after_session' });
                  },
                },
                {
                  text: 'Weekly',
                  onPress: async () => {
                    setPreferences(prev => ({ ...prev, coach_checkin: 'weekly' }));
                    await api.preferences.update({ coach_checkin: 'weekly' });
                  },
                },
                {
                  text: 'Off',
                  onPress: async () => {
                    setPreferences(prev => ({ ...prev, coach_checkin: 'none' }));
                    await api.preferences.update({ coach_checkin: 'none' });
                  },
                  style: 'destructive',
                },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}
          >
            <View style={s.rowLeft}>
              <View>
                <Text style={s.rowTitle}>Coach Check-ins</Text>
                <Text style={s.rowSub}>
                  {preferences?.coach_checkin === 'none' ? 'Off' : preferences?.coach_checkin === 'after_session' ? 'Daily' : 'Weekly'}
                </Text>
              </View>
            </View>
            <Text style={s.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>

          {/* Test push row — user-initiated diagnostic. Tap fires a
              server-side push at their own device so they can verify
              notifications arrive. The response tells us whether it
              was sent (active token present) or silently dropped
              (no active token on the server). Result alerted inline. */}
          <View style={s.divider} />
          <TouchableOpacity
            style={s.row}
            disabled={sendingTestPush}
            onPress={async () => {
              try {
                setSendingTestPush(true);
                const res = await api.notifications.testPush();
                if (res?.sent) {
                  Alert.alert(
                    'Test push sent',
                    `Sent to ${res.activeTokens || 0} device${res.activeTokens === 1 ? '' : 's'}. If you don't see a banner in the next few seconds, check your device's Focus/DnD settings.`,
                  );
                } else if (!res?.activeTokens) {
                  Alert.alert(
                    'No push token',
                    "We haven't been able to register a push token for this device. Try toggling Push Notifications off and on above.",
                  );
                } else {
                  Alert.alert(
                    'Push attempt failed',
                    'The server tried to send a push but Expo returned an error. Check the server logs, or try re-registering your token by toggling Push Notifications.',
                  );
                }
              } catch (err) {
                Alert.alert('Test push failed', err?.message || 'Network error');
              } finally {
                setSendingTestPush(false);
              }
            }}
          >
            <View style={s.rowLeft}>
              <View>
                <Text style={s.rowTitle}>Send test notification</Text>
                <Text style={s.rowSub}>
                  {sendingTestPush ? 'Sending…' : 'Verify pushes are reaching your device'}
                </Text>
              </View>
            </View>
            <Text style={s.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>
        </View>

        {/* Support */}
        <Text style={s.sectionLabel}>SUPPORT</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={() => Linking.openURL('https://getetapa.com/support')}>
            <View style={s.rowLeft}>
              <View>
                <Text style={s.rowTitle}>Help & FAQs</Text>
                <Text style={s.rowSub}>Troubleshooting, account help, and more</Text>
              </View>
            </View>
            <Text style={s.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity style={s.row} onPress={() => Linking.openURL('mailto:support@getetapa.com')}>
            <View style={s.rowLeft}>
              <View>
                <Text style={s.rowTitle}>Email Support</Text>
                <Text style={s.rowSub}>support@getetapa.com · Usually replies within 24h</Text>
              </View>
            </View>
            <Text style={s.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity style={s.row} onPress={() => navigation.navigate('Feedback')}>
            <View style={s.rowLeft}>
              <View>
                <Text style={s.rowTitle}>Send Feedback</Text>
                <Text style={s.rowSub}>Report a bug or suggest an improvement</Text>
              </View>
            </View>
            <Text style={s.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity style={s.row} onPress={async () => {
            try {
              if (await StoreReview.hasAction()) {
                await StoreReview.requestReview();
              } else {
                const storeUrl = Platform.OS === 'ios'
                  ? 'https://apps.apple.com/app/id6738429498?action=write-review'
                  : 'https://play.google.com/store/apps/details?id=com.etapa.app';
                Linking.openURL(storeUrl);
              }
            } catch {
              const storeUrl = Platform.OS === 'ios'
                ? 'https://apps.apple.com/app/id6738429498?action=write-review'
                : 'https://play.google.com/store/apps/details?id=com.etapa.app';
              Linking.openURL(storeUrl);
            }
          }}>
            <View style={s.rowLeft}>
              <View>
                <Text style={s.rowTitle}>Rate Etapa</Text>
                <Text style={s.rowSub}>Enjoying the app? Leave a review</Text>
              </View>
            </View>
            <Text style={s.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>
        </View>

        {/* About & Legal */}
        <Text style={s.sectionLabel}>ABOUT</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={() => navigation.navigate('About')}>
            <View style={s.rowLeft}>
              <Text style={s.rowTitle}>About Etapa</Text>
              <Text style={s.rowSub}>AI transparency, sources & disclaimers</Text>
            </View>
            <Text style={s.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>
        </View>

        {/* Coming Soon */}
        {comingSoonConfig && <ComingSoon config={comingSoonConfig} />}

        {/* Account */}
        <Text style={s.sectionLabel}>ACCOUNT</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={handleSignOut}>
            <View style={s.rowLeft}>
              <Text style={[s.rowTitle, { color: colors.primary }]}>Sign out</Text>
            </View>
            <Text style={s.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity style={s.row} onPress={handleDeleteAccount} disabled={deleting}>
            <View style={s.rowLeft}>
              <View>
                <Text style={[s.rowTitle, { color: '#EF4444' }]}>
                  {deleting ? 'Deleting...' : 'Delete Account'}
                </Text>
                <Text style={s.rowSub}>Permanently remove all your data</Text>
              </View>
            </View>
            <Text style={[s.chevron, { color: 'rgba(239,68,68,0.35)' }]}>{'\u203A'}</Text>
          </TouchableOpacity>
        </View>

        {/* AI footer disclaimer */}
        <View style={s.aiFooter}>
          <Text style={s.aiFooterText}>
            All training plans and coaching in Etapa are generated by AI (Anthropic Claude). Plans are based on established cycling training science but are not medical advice. Consult a doctor before starting any exercise programme.
          </Text>
        </View>

        {/* App version + OTA update ID. The native build number changes
            only when a fresh TestFlight / App Store binary ships; the
            update tag changes on every OTA. Tapping the line copies it
            to the clipboard — useful for support tickets ("what version
            are you on?") and for verifying an OTA actually landed (the
            update tag flips after force-quit + relaunch). */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            const line = (() => {
              const v = Constants?.expoConfig?.version || Constants?.manifest?.version || '0.0.0';
              const iosBuild = Constants?.expoConfig?.ios?.buildNumber;
              const androidCode = Constants?.expoConfig?.android?.versionCode;
              const build = Platform.OS === 'ios' ? iosBuild : androidCode;
              const updateId = Updates?.updateId;
              const channel = Updates?.channel;
              const tag = updateId ? updateId.slice(0, 7) : 'embedded';
              return `Etapa v${v}${build ? ` (build ${build})` : ''} · ${tag}${channel ? ` · ${channel}` : ''}`;
            })();
            try { Clipboard.setStringAsync?.(line); } catch {}
          }}
        >
          <Text style={s.versionText}>
            {(() => {
              const v = Constants?.expoConfig?.version || Constants?.manifest?.version || '0.0.0';
              const iosBuild = Constants?.expoConfig?.ios?.buildNumber;
              const androidCode = Constants?.expoConfig?.android?.versionCode;
              const build = Platform.OS === 'ios' ? iosBuild : androidCode;
              const updateId = Updates?.updateId;
              const tag = updateId ? updateId.slice(0, 7) : 'embedded';
              return `Etapa v${v}${build ? ` (build ${build})` : ''} · ${tag}`;
            })()}
          </Text>
        </TouchableOpacity>
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

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, textAlign: 'center' },

  sectionLabel: { fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: 'rgba(232,69,139,0.5)', letterSpacing: 0.6, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },

  card: {
    backgroundColor: colors.white, marginHorizontal: 16, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.1)',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  rowSub: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 1 },
  chevron: { fontSize: 20, color: 'rgba(232,69,139,0.35)', fontWeight: '300' },

  connectBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  connectBtnText: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  disconnectText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: '#EF4444' },
  comingSoonBadge: { backgroundColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  comingSoonText: { fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted },
  stravaIconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#FC4C02', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  stravaBadge: { backgroundColor: 'rgba(232,69,139,0.12)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  stravaBadgeConnected: { backgroundColor: 'rgba(232,69,139,0.10)' },
  stravaBadgeText: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary },
  stravaBadgeTextConnected: { color: colors.primary },
  starterBadge: { backgroundColor: 'rgba(232,69,139,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  starterBadgeText: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary, letterSpacing: 0.5 },
  unreadBadge: { backgroundColor: colors.primary, borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  unreadBadgeText: { fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  toggleText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  openSettingsText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  nameInput: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.text, marginTop: 4, padding: 0, borderBottomWidth: 1, borderBottomColor: colors.primary, paddingBottom: 2 },
  editText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  unitToggle: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  unitBtn: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: 'transparent' },
  unitBtnActive: { backgroundColor: colors.primary },
  unitBtnText: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted },
  unitBtnTextActive: { color: '#fff' },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  aiFooter: { paddingVertical: 20, paddingHorizontal: 4 },
  aiFooterText: { fontSize: 11, fontWeight: '300', fontFamily: FF.light || FF.regular, color: colors.textFaint, lineHeight: 17, textAlign: 'center' },
  versionText: {
    fontSize: 11, fontWeight: '400', fontFamily: FF.regular,
    color: colors.textFaint, textAlign: 'center',
    paddingBottom: 24, letterSpacing: 0.3,
  },
});
