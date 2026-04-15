/**
 * Shared wizard shell — provides the dark background, progress bar,
 * back/close buttons, and bottom "Continue" button seen in the Runna-style
 * onboarding flow.
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, fontFamily } from '../theme';

const FF = fontFamily;

export default function WizardShell({
  step,
  totalSteps,
  title,
  subtitle,
  onBack,
  onClose,
  onContinue,
  accentColor = colors.primary,
  continueLabel = 'Continue',
  continueDisabled = false,
  skipLabel,
  onSkip,
  children,
}) {
  const pct = totalSteps > 0 ? (step / totalSteps) * 100 : 0;

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={s.safe}>
        {/* Top bar: back, progress, close */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={onBack} style={s.topBtn} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>

          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: accentColor }]} />
          </View>

          <TouchableOpacity onPress={onClose} style={s.topBtn} hitSlop={HIT}>
            <Text style={s.closeX}>{'\u2715'}</Text>
          </TouchableOpacity>
        </View>

        {/* Title */}
        <View style={s.header}>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>

        {/* Content */}
        <View style={s.content}>
          {children}
        </View>

        {/* Bottom continue */}
        <View style={s.bottom}>
          <TouchableOpacity
            style={[s.continueBtn, { backgroundColor: accentColor }, continueDisabled && s.continueBtnDisabled]}
            onPress={onContinue}
            disabled={continueDisabled}
            activeOpacity={0.85}
          >
            <Text style={[s.continueText, continueDisabled && s.continueTextDisabled]}>
              {continueLabel}
            </Text>
          </TouchableOpacity>
          {skipLabel && onSkip && (
            <TouchableOpacity onPress={onSkip} style={s.skipBtn} activeOpacity={0.7}>
              <Text style={s.skipText}>{skipLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

// ── Option card (reusable for wizard choices) ────────────────────────────────

export function OptionCard({ label, description, emoji, selected, onPress, style }) {
  return (
    <TouchableOpacity
      style={[s.optionCard, selected && s.optionCardSelected, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={s.optionRow}>
        {emoji ? <Text style={s.optionEmoji}>{emoji}</Text> : null}
        <View style={s.optionTextWrap}>
          <Text style={[s.optionLabel, selected && s.optionLabelSelected]}>{label}</Text>
          {description ? <Text style={s.optionDesc}>{description}</Text> : null}
        </View>
        {selected && <View style={s.radioSelected}><View style={s.radioInner} /></View>}
        {!selected && <View style={s.radio} />}
      </View>
    </TouchableOpacity>
  );
}

export function CheckCard({ label, emoji, checked, onPress, style }) {
  return (
    <TouchableOpacity
      style={[s.checkCard, checked && s.checkCardChecked, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {emoji ? <Text style={s.checkEmoji}>{emoji}</Text> : null}
      <Text style={[s.checkLabel, checked && s.checkLabelChecked]}>{label}</Text>
      <View style={[s.checkbox, checked && s.checkboxChecked]}>
        {checked && <Text style={s.checkMark}>{'\u2713'}</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  topBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 22, color: colors.text },
  closeX: { fontSize: 18, color: colors.textMuted },

  progressTrack: { flex: 1, height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },

  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 26, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, lineHeight: 32 },
  subtitle: { fontSize: 15, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 6, lineHeight: 21 },

  content: { flex: 1, paddingHorizontal: 16 },

  bottom: { paddingHorizontal: 24, paddingBottom: 12, paddingTop: 8, gap: 4 },
  skipBtn: { alignItems: 'center', paddingVertical: 10 },
  skipText: { fontSize: 14, fontFamily: FF.medium, color: colors.textMuted },
  continueBtn: { backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  continueBtnDisabled: { backgroundColor: colors.border },
  continueText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  continueTextDisabled: { color: colors.textFaint },

  // Option cards
  optionCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1.5, borderColor: colors.border,
  },
  optionCardSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceLight },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionEmoji: { fontSize: 22, width: 32, textAlign: 'center' },
  optionTextWrap: { flex: 1 },
  optionLabel: { fontSize: 16, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  optionLabelSelected: { color: colors.text },
  optionDesc: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 2 },

  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.textFaint },
  radioSelected: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },

  // Check cards
  checkCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1.5, borderColor: colors.border,
  },
  checkCardChecked: { borderColor: colors.primary, backgroundColor: colors.surfaceLight },
  checkEmoji: { fontSize: 18, width: 28, textAlign: 'center' },
  checkLabel: { flex: 1, fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  checkLabelChecked: { color: colors.text },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.textFaint, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkMark: { fontSize: 14, color: '#fff', fontWeight: '700' },
});
