import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, layout, fontFamily } from '../theme';

const P = 20;
const R = 18;
const FF = fontFamily;

// ── Layout ────────────────────────────────────────────────────────────────────

export const Card = ({ children, style }) => (
  <View style={[s.card, style]}>{children}</View>
);

export const SectionHeader = ({ children, style }) => (
  <Text style={[s.sectionHeader, style]}>{children}</Text>
);

// ── Buttons ───────────────────────────────────────────────────────────────────

export const PrimaryButton = ({ label, onPress, style }) => (
  <TouchableOpacity style={[s.primaryBtn, style]} onPress={onPress} activeOpacity={0.85}>
    <Text style={s.primaryBtnText}>{label}</Text>
  </TouchableOpacity>
);

export const GhostButton = ({ label, onPress, style }) => (
  <TouchableOpacity style={[s.ghostBtn, style]} onPress={onPress} activeOpacity={0.7}>
    <Text style={s.ghostBtnText}>{label}</Text>
  </TouchableOpacity>
);

// ── Error State ──────────────────────────────────────────────────────────────

export const ErrorState = ({ error, onRetry, style }) => {
  const msg = typeof error === 'string' ? error : error?.message || 'Something went wrong';
  return (
    <View style={[s.errorStateWrap, style]}>
      <View style={s.errorStateIcon}>
        <Text style={s.errorStateIconText}>!</Text>
      </View>
      <Text style={s.errorStateTitle}>Something Went Wrong</Text>
      <Text style={s.errorStateBody}>{msg}</Text>
      {onRetry && (
        <TouchableOpacity style={s.errorStateRetryBtn} onPress={onRetry} activeOpacity={0.85}>
          <Text style={s.errorStateRetryText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  sectionHeader: { paddingHorizontal: P, paddingTop: 16, paddingBottom: 6, fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7 },

  card: { marginHorizontal: P, marginBottom: 12, backgroundColor: colors.surface, borderRadius: R, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },

  primaryBtn: { marginHorizontal: P, marginBottom: 12, backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4 },
  primaryBtnText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },

  ghostBtn: { marginHorizontal: P, marginBottom: 12, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border },
  ghostBtnText: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },

  errorStateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingVertical: 44, gap: 10 },
  errorStateIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.warnLight, alignItems: 'center', justifyContent: 'center', marginBottom: 6, borderWidth: 1, borderColor: colors.warnBorder },
  errorStateIconText: { fontSize: 22, fontWeight: '700', fontFamily: FF.semibold, color: colors.warn },
  errorStateTitle: { fontSize: 17, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, textAlign: 'center' },
  errorStateBody: { fontSize: 15, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  errorStateRetryBtn: { marginTop: 14, backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 12, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  errorStateRetryText: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
});
