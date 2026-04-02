/**
 * Settings screen — Strava connect/disconnect, reset plan, sign out.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { signOut } from '../services/authService';
import { clearPlan, getPlans, deletePlan, clearUserData } from '../services/storageService';
import { openBillingPortal, getSubscriptionStatus, upgradeStarter, refundStarter } from '../services/subscriptionService';
import { connectStrava, disconnectStrava, isStravaConnected, isStravaConfigured, getStravaTokens } from '../services/stravaService';
import UpgradePrompt from '../components/UpgradePrompt';
import analytics from '../services/analyticsService';
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
  const [starterPlan, setStarterPlan] = useState(null); // the beginner plan object, if any
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] = useState(null);

  useEffect(() => {
    checkStrava();
    getSubscriptionStatus().then(setSubscription).catch(() => {});
    api.notifications.unreadCount().then(d => setUnreadCount(d?.count || 0)).catch(() => {});
    api.preferences.get().then(setPreferences).catch(() => {});
    // Find starter/beginner plan for refund eligibility
    getPlans().then(plans => {
      const bp = plans.find(p => p.name === 'Get into Cycling' && p.paymentStatus === 'paid');
      setStarterPlan(bp || null);
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

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const result = await upgradeStarter();
      if (result.success) {
        setShowUpgrade(false);
        // Refresh subscription status
        getSubscriptionStatus().then(setSubscription).catch(() => {});
        Alert.alert('Welcome!', 'You\'re now on the annual plan. Go create your next plan!');
      }
    } catch {
      Alert.alert('Upgrade failed', 'Something went wrong. Please try again.');
    } finally {
      setUpgrading(false);
    }
  };

  const handleRefundStarter = () => {
    Alert.alert(
      'Request refund?',
      'You\'ll receive a full $50 refund and your Get into Cycling plan will be cancelled. This can\'t be undone.',
      [
        { text: 'Keep my plan', style: 'cancel' },
        {
          text: 'Refund & cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await refundStarter(starterPlan?.startDate);
              Alert.alert('Refund processed', 'Your $50 refund is on its way. It may take 5–10 business days to appear.');
              // Refresh subscription and plans
              getSubscriptionStatus().then(setSubscription).catch(() => {});
              if (starterPlan) {
                await deletePlan(starterPlan.id);
              }
              setStarterPlan(null);
            } catch (err) {
              Alert.alert('Refund failed', err.message || 'Please contact support.');
            }
          },
        },
      ],
    );
  };

  // Check if starter plan is within 2-week refund window
  const isRefundEligible = (() => {
    if (!starterPlan?.startDate || subscription?.plan !== 'starter') return false;
    const startDate = new Date(starterPlan.startDate);
    const now = new Date();
    const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    return daysSinceStart <= 14;
  })();

  const handleSignOut = async () => {
    analytics.events.signedOut();
    analytics.reset();
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
        {/* Strava */}
        <Text style={s.sectionLabel}>CONNECTIONS</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View>
                <Text style={s.rowTitle}>Strava</Text>
                <Text style={s.rowSub}>Sync your rides automatically</Text>
              </View>
            </View>
            <View style={s.comingSoonBadge}>
              <Text style={s.comingSoonText}>Coming Soon</Text>
            </View>
          </View>
        </View>

        {/* Coaching */}
        <Text style={s.sectionLabel}>COACHING</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={() => navigation.navigate('ChangeCoach')}>
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
              <TouchableOpacity style={s.row} onPress={() => setShowUpgrade(true)}>
                <View style={s.rowLeft}>
                  <View>
                    <Text style={[s.rowTitle, { color: colors.primary }]}>Upgrade to Annual</Text>
                    <Text style={s.rowSub}>50% off + pro-rata refund on starter</Text>
                  </View>
                </View>
                <Text style={s.chevron}>{'\u203A'}</Text>
              </TouchableOpacity>
            </View>
            {isRefundEligible && (
              <View style={[s.card, { marginTop: 8 }]}>
                <TouchableOpacity style={s.row} onPress={handleRefundStarter}>
                  <View style={s.rowLeft}>
                    <View>
                      <Text style={[s.rowTitle, { color: '#EF4444' }]}>Request Refund</Text>
                      <Text style={s.rowSub}>Full $50 refund · available for first 2 weeks</Text>
                    </View>
                  </View>
                  <Text style={s.chevron}>{'\u203A'}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={[s.card, { marginTop: 8 }]}>
              <TouchableOpacity style={s.row} onPress={handleManagePlan} disabled={portalLoading}>
                <View style={s.rowLeft}>
                  <View>
                    <Text style={[s.rowTitle, { color: '#EF4444' }]}>{portalLoading ? 'Opening...' : 'Cancel Subscription'}</Text>
                    <Text style={s.rowSub}>Cancel your plan via Stripe</Text>
                  </View>
                </View>
                <Text style={s.chevron}>{'\u203A'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        {subscription?.active && subscription.plan !== 'starter' && (
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
              <TouchableOpacity style={s.row} onPress={handleManagePlan} disabled={portalLoading}>
                <View style={s.rowLeft}>
                  <View>
                    <Text style={[s.rowTitle, { color: '#EF4444' }]}>{portalLoading ? 'Opening...' : 'Cancel Subscription'}</Text>
                    <Text style={s.rowSub}>Cancel your plan via Stripe</Text>
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
              <TouchableOpacity style={s.row} onPress={() => navigation.navigate('Paywall', { fromHome: true, nextScreen: 'Home' })}>
                <View style={s.rowLeft}>
                  <View>
                    <Text style={s.rowTitle}>Subscribe</Text>
                    <Text style={s.rowSub}>Your subscription is inactive</Text>
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
          <TouchableOpacity style={s.row} onPress={() => { setUnreadCount(0); navigation.navigate('Notifications'); }}>
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
          <TouchableOpacity
            style={s.row}
            onPress={() => {
              const current = preferences?.coach_checkin || 'weekly';
              Alert.alert('Coach Check-ins', 'How often would you like check-ins from your coach?', [
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
                  style: current === 'none' ? 'default' : 'destructive',
                },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}
          >
            <View style={s.rowLeft}>
              <View>
                <Text style={s.rowTitle}>Coach Check-ins</Text>
                <Text style={s.rowSub}>
                  {preferences?.coach_checkin === 'none' ? 'Off' : 'Weekly'}
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
              <View>
                <Text style={s.rowTitle}>Send Feedback</Text>
                <Text style={s.rowSub}>Bug reports, feature requests & support</Text>
              </View>
            </View>
            <Text style={s.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>
        </View>

        {/* Account */}
        <Text style={s.sectionLabel}>ACCOUNT</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={handleSignOut}>
            <View style={s.rowLeft}>
              <Text style={[s.rowTitle, { color: '#EF4444' }]}>Sign out</Text>
            </View>
            <Text style={s.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>
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

  sectionLabel: { fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, letterSpacing: 0.6, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },

  card: {
    backgroundColor: colors.white, marginHorizontal: 16, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  rowSub: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 1 },
  chevron: { fontSize: 20, color: colors.textFaint, fontWeight: '300' },

  connectBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  connectBtnText: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  disconnectText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: '#EF4444' },
  comingSoonBadge: { backgroundColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  comingSoonText: { fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted },
  starterBadge: { backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  starterBadgeText: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: '#22C55E', letterSpacing: 0.5 },
  unreadBadge: { backgroundColor: colors.primary, borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  unreadBadgeText: { fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  toggleText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
});
