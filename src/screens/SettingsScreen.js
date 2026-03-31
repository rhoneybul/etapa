/**
 * Settings screen — Strava connect/disconnect, reset plan, sign out.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { signOut } from '../services/authService';
import { clearPlan, getPlans, deletePlan } from '../services/storageService';
import { connectStrava, disconnectStrava, isStravaConnected, isStravaConfigured, getStravaTokens } from '../services/stravaService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

export default function SettingsScreen({ navigation }) {
  const [stravaOk, setStravaOk] = useState(false);
  const [stravaName, setStravaName] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkStrava();
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


  const handleSignOut = async () => {
    analytics.events.signedOut();
    analytics.reset();
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

        {/* Strava */}
        <Text style={s.sectionLabel}>CONNECTIONS</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>{'\uD83D\uDEB4'}</Text>
              <View>
                <Text style={s.rowTitle}>Strava</Text>
                <Text style={s.rowSub}>
                  {stravaOk ? `Connected${stravaName ? ` as ${stravaName}` : ''}` : 'Not connected'}
                </Text>
              </View>
            </View>
            {stravaOk ? (
              <TouchableOpacity onPress={handleDisconnectStrava}>
                <Text style={s.disconnectText}>Disconnect</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.connectBtn} onPress={handleConnectStrava} disabled={loading}>
                <Text style={s.connectBtnText}>{loading ? 'Connecting...' : 'Connect'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Coaching */}
        <Text style={s.sectionLabel}>COACHING</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={() => navigation.navigate('ChangeCoach')}>
            <View style={s.rowLeft}>
              <Text style={s.rowIcon}>{'\uD83C\uDFC5'}</Text>
              <View>
                <Text style={s.rowTitle}>Change Coach</Text>
                <Text style={s.rowSub}>Switch your AI coaching personality</Text>
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
              <Text style={s.rowIcon}>{'\uD83D\uDCAC'}</Text>
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
              <Text style={s.rowIcon}>{'\uD83D\uDEAA'}</Text>
              <Text style={[s.rowTitle, { color: '#EF4444' }]}>Sign out</Text>
            </View>
            <Text style={s.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
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
  rowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  rowSub: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 1 },
  chevron: { fontSize: 20, color: colors.textFaint, fontWeight: '300' },

  connectBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  connectBtnText: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  disconnectText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: '#EF4444' },
});
