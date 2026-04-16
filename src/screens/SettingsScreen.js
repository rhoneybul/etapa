/**
 * Settings screen — Strava connect/disconnect, reset plan, sign out.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch, Linking, TextInput, Platform,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { signOut } from '../services/authService';
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
  const [userPrefs, setUserPrefsState] = useState({ units: 'km', displayName: '' });
  const [editingName, setEditingName] = useState(false);
  const [comingSoonConfig, setComingSoonConfig] = useState(null);
  const [stravaEnabled, setStravaEnabled] = useState(true); // default to enabled

  // Guard against double-tap paywall navigation
  const navigatingRef = useRef(false);
  const goPaywall = useCallback((params) => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    navigation.navigate('Paywall', params);
    setTimeout(() => { navigatingRef.current = false; }, 1000);
  }, [navigation]);
  const [nameInput, setNameInput] = useState('');
  const [hasBeginnerPlan, setHasBeginnerPlan] = useState(false);

  useEffect(() => {
    checkStrava();
    getSubscriptionStatus().then(setSubscription).catch(() => {});
    getPrices().catch(() => {});
    api.notifications.unreadCount().then(d => setUnreadCount(d?.count || 0)).catch(() => {});
    api.preferences.get().then(setPreferences).catch(() => {});
    getUserPrefs().then(p => { setUserPrefsState(p); setNameInput(p.displayName || ''); }).catch(() => {});
    Notifications.getPermissionsAsync().then(({ status }) => setNotifPermission(status)).catch(() => {});
    api.appConfig.get().then(cfg => {
      if (cfg?.coming_soon) setComingSoonConfig(cfg.coming_soon);
      if (cfg?.strava_enabled !== undefined) setStravaEnabled(!!cfg.strava_enabled);
    }).catch(() => {});
    // Check if user has a beginner (Get into Cycling) plan — if so, upgrade should show starter only
    getPlans().then(plans => {
      const hasBeginner = plans.some(p => p.name && p.name.startsWith('Get into Cycling'));
      setHasBeginnerPlan(hasBeginner);
    }).catch(() => {});
  }, []);

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

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Profile */}
        <Text style={s.sectionLabel}>PROFILE</Text>
        <View style={s.card}>
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

        {/* Subscription */}
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
                trackColor={{ false: colors.border, true: colors.primaryDark }}
                thumbColor={preferences?.push_notifications !== 'disabled' ? colors.primary : colors.textMid}
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
        </View>

        {/* Support */}
        <Text style={s.sectionLabel}>SUPPORT</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={() => navigation.navigate('Feedback')}>
            <View style={s.rowLeft}>
              <Text style={s.rowTitle}>Send Feedback</Text>
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
});
