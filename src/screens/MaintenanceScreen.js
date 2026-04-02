/**
 * MaintenanceScreen — shown when remote config has maintenance_mode.enabled = true.
 * Displays a friendly message and a retry button.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';

const FF = fontFamily;

export default function MaintenanceScreen({ title, message, onRetry }) {
  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <View style={s.content}>
          <Text style={s.icon}>{'\u{1F6B4}\u200D\u2642\uFE0F'}</Text>
          <Text style={s.title}>{title || "We'll be right back"}</Text>
          <Text style={s.message}>
            {message || "Sorry, our wheels are spinning \u2014 we will be back soon."}
          </Text>
          <TouchableOpacity style={s.retryBtn} onPress={onRetry} activeOpacity={0.8}>
            <Text style={s.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  icon: { fontSize: 64, marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 15, fontFamily: FF.regular, color: colors.textMid, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  retryBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 },
  retryBtnText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
});
