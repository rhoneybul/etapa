/**
 * MaintenanceScreen — shown when remote config has maintenance_mode.enabled = true.
 * Displays the title and message set in the admin dashboard.
 * Pull-to-refresh to re-check.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Image, RefreshControl, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';

const FF = fontFamily;

export default function MaintenanceScreen({ title, message, onRetry }) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRetry?.();
    } catch {}
    // Small delay so the spinner is visible even if the check is instant
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          <View style={s.content}>
            {/* Logo */}
            <Image
              source={require('../../assets/icon.png')}
              style={s.logo}
            />

            {/* Title + message from admin dashboard */}
            <Text style={s.title}>
              {title || "We'll be back soon"}
            </Text>
            <Text style={s.message}>
              {message || 'Etapa is currently undergoing scheduled maintenance. We\'ll be back shortly.'}
            </Text>

            {/* Pull hint */}
            <Text style={s.pullHint}>Pull down to check again</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingBottom: 60,
  },

  logo: {
    width: 64, height: 64, borderRadius: 18, marginBottom: 32,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.2)',
  },

  title: {
    fontSize: 24, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.text, marginBottom: 12, textAlign: 'center',
  },
  message: {
    fontSize: 15, fontFamily: FF.regular, color: colors.textMid,
    textAlign: 'center', lineHeight: 22, maxWidth: 320,
  },

  pullHint: {
    marginTop: 32,
    fontSize: 13, fontFamily: FF.regular, color: colors.textFaint,
    textAlign: 'center',
  },
});
