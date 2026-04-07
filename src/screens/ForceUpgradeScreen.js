/**
 * ForceUpgradeScreen — shown when the running app version is below the
 * minimum required version set in remote config (min_version).
 *
 * Hard-blocks the user — they cannot dismiss this screen. The only action
 * is to tap "Update Now" which opens the appropriate app store, or to
 * tap "Check Again" after updating to re-evaluate the version gate.
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Linking, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';

const FF = fontFamily;

const DEFAULT_IOS_URL = 'https://apps.apple.com/app/etapa/id6738893966';
const DEFAULT_ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.etapa.app';

export default function ForceUpgradeScreen({ message, iosUrl, androidUrl, onRetry }) {
  const storeUrl = Platform.OS === 'ios'
    ? (iosUrl || DEFAULT_IOS_URL)
    : (androidUrl || DEFAULT_ANDROID_URL);

  const handleUpdate = () => {
    Linking.openURL(storeUrl).catch(() => {});
  };

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <View style={s.content}>
          {/* Logo */}
          <Image
            source={require('../../assets/icon.png')}
            style={s.logo}
          />

          {/* Main message */}
          <Text style={s.title}>Update Required</Text>
          <Text style={s.message}>
            {message || 'A new version of Etapa is available with important updates. Please update to continue.'}
          </Text>

          {/* Info card */}
          <View style={s.infoCard}>
            <View style={s.infoRow}>
              <View style={s.infoDot} />
              <Text style={s.infoText}>New version available</Text>
            </View>
            <Text style={s.infoHint}>
              This update includes important improvements and fixes. Your training data is safe and will be waiting for you after the update.
            </Text>
          </View>

          {/* Update button */}
          <TouchableOpacity style={s.updateBtn} onPress={handleUpdate} activeOpacity={0.8}>
            <Text style={s.updateBtnText}>Update Now</Text>
          </TouchableOpacity>

          {/* Check again (after user updates and returns) */}
          <TouchableOpacity style={s.retryBtn} onPress={onRetry} activeOpacity={0.8}>
            <Text style={s.retryBtnText}>I've updated — check again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingBottom: 40,
  },

  logo: {
    width: 64, height: 64, borderRadius: 18, marginBottom: 28,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.2)',
  },

  title: {
    fontSize: 24, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.text, marginBottom: 12, textAlign: 'center',
  },
  message: {
    fontSize: 15, fontFamily: FF.regular, color: colors.textMid,
    textAlign: 'center', lineHeight: 22, marginBottom: 24, maxWidth: 320,
  },

  // Info card
  infoCard: {
    width: '100%', backgroundColor: colors.surface, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 24,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  infoDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  infoText: {
    fontSize: 14, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.primary,
  },
  infoHint: {
    fontSize: 13, fontFamily: FF.regular, color: colors.textMid, lineHeight: 19,
  },

  // Update button
  updateBtn: {
    backgroundColor: colors.primary, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 48, marginBottom: 12,
    width: '100%', alignItems: 'center',
  },
  updateBtnText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },

  // Retry
  retryBtn: {
    paddingVertical: 12, paddingHorizontal: 24,
  },
  retryBtnText: {
    fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted,
  },
});
