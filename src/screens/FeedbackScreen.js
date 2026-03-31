/**
 * FeedbackScreen — submit bug reports, feature requests, support, or general feedback.
 * Stores in Supabase via the /api/feedback endpoint.
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { colors, fontFamily } from '../theme';
import { api } from '../services/api';
import analytics from '../services/analyticsService';

const FF = fontFamily;

const CATEGORIES = [
  { id: 'bug',     label: 'Bug Report',      icon: '\uD83D\uDC1B', desc: 'Something isn\u2019t working right' },
  { id: 'feature', label: 'Feature Request',  icon: '\uD83D\uDCA1', desc: 'I\u2019d love to see\u2026' },
  { id: 'support', label: 'Support',          icon: '\uD83C\uDD98', desc: 'I need help with something' },
  { id: 'general', label: 'General Feedback',  icon: '\uD83D\uDCAC', desc: 'Thoughts, ideas, or praise' },
];

const PLACEHOLDERS = {
  bug:     'What happened? What did you expect to happen instead?\n\nSteps to reproduce:\n1. \n2. \n3. ',
  feature: 'What would you like to see in Etapa? How would it help your training?',
  support: 'What do you need help with? Include as much detail as possible.',
  general: 'We\u2019d love to hear from you. What\u2019s on your mind?',
};

export default function FeedbackScreen({ navigation }) {
  const [category, setCategory] = useState(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const appVersion = Constants.expoConfig?.version || '0.0.0';
  const deviceInfo = `${Platform.OS} ${Platform.Version}`;

  const handleSubmit = async () => {
    if (!category) {
      Alert.alert('Choose a category', 'Please select what type of feedback you\u2019re sending.');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Add a message', 'Please describe your feedback before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      await api.feedback.submit({
        category,
        message: message.trim(),
        appVersion,
        deviceInfo,
      });
      analytics.events.feedbackSubmitted(category);
      setSubmitted(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to submit feedback. Please try again.');
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <View style={s.container}>
        <SafeAreaView style={s.safe}>
          <View style={s.successContainer}>
            <Text style={s.successIcon}>{'\u2705'}</Text>
            <Text style={s.successTitle}>Thank you!</Text>
            <Text style={s.successMessage}>
              Your feedback has been submitted. We read every message and appreciate you helping make Etapa better.
            </Text>
            <TouchableOpacity style={s.successBtn} onPress={() => navigation.goBack()}>
              <Text style={s.successBtnText}>Back to Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.successBtn, s.successBtnSecondary]}
              onPress={() => { setSubmitted(false); setCategory(null); setMessage(''); }}
            >
              <Text style={[s.successBtnText, s.successBtnSecondaryText]}>Send More Feedback</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={s.header}>
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
                <Text style={s.backArrow}>{'\u2190'}</Text>
              </TouchableOpacity>
              <Text style={s.headerTitle}>Feedback</Text>
              <View style={{ width: 32 }} />
            </View>

            <Text style={s.subtitle}>
              Help us improve Etapa. Your feedback goes directly to the team.
            </Text>

            {/* Category picker */}
            <Text style={s.sectionLabel}>WHAT'S THIS ABOUT?</Text>
            <View style={s.categories}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[s.catCard, category === cat.id && s.catCardActive]}
                  onPress={() => setCategory(cat.id)}
                  activeOpacity={0.7}
                >
                  <Text style={s.catIcon}>{cat.icon}</Text>
                  <View style={s.catText}>
                    <Text style={[s.catLabel, category === cat.id && s.catLabelActive]}>
                      {cat.label}
                    </Text>
                    <Text style={s.catDesc}>{cat.desc}</Text>
                  </View>
                  {category === cat.id && (
                    <Text style={s.catCheck}>{'\u2713'}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Message input */}
            {category && (
              <>
                <Text style={s.sectionLabel}>DETAILS</Text>
                <TextInput
                  style={s.input}
                  placeholder={PLACEHOLDERS[category]}
                  placeholderTextColor={colors.textFaint}
                  multiline
                  textAlignVertical="top"
                  value={message}
                  onChangeText={setMessage}
                  maxLength={2000}
                  autoFocus
                />
                <Text style={s.charCount}>{message.length}/2000</Text>
              </>
            )}

            {/* Submit */}
            {category && (
              <TouchableOpacity
                style={[s.submitBtn, (!message.trim() || submitting) && s.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!message.trim() || submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.submitBtnText}>Submit Feedback</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Version info */}
            <Text style={s.versionText}>
              Etapa v{appVersion} {'\u00B7'} {deviceInfo}
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: { paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, textAlign: 'center' },

  subtitle: { fontSize: 14, fontFamily: FF.regular, color: colors.textMid, paddingHorizontal: 20, marginBottom: 20, lineHeight: 20 },

  sectionLabel: {
    fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted,
    letterSpacing: 0.6, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10,
  },

  categories: { paddingHorizontal: 16, gap: 8 },
  catCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border,
  },
  catCardActive: { borderColor: colors.primary, backgroundColor: '#1A120A' },
  catIcon: { fontSize: 22, width: 36, textAlign: 'center' },
  catText: { flex: 1, marginLeft: 8 },
  catLabel: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  catLabelActive: { color: colors.primary },
  catDesc: { fontSize: 12, fontFamily: FF.regular, color: colors.textMuted, marginTop: 2 },
  catCheck: { fontSize: 16, color: colors.primary, fontWeight: '700', marginLeft: 8 },

  input: {
    marginHorizontal: 16, backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, padding: 16,
    fontSize: 15, fontFamily: FF.regular, color: colors.text,
    minHeight: 160, maxHeight: 300,
  },
  charCount: { fontSize: 11, fontFamily: FF.regular, color: colors.textFaint, textAlign: 'right', paddingHorizontal: 20, marginTop: 4 },

  submitBtn: {
    marginHorizontal: 16, marginTop: 20, backgroundColor: colors.primary,
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },

  versionText: { fontSize: 11, fontFamily: FF.regular, color: colors.textFaint, textAlign: 'center', marginTop: 20 },

  // Success state
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  successIcon: { fontSize: 48, marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 8 },
  successMessage: { fontSize: 15, fontFamily: FF.regular, color: colors.textMid, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  successBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center', marginBottom: 12 },
  successBtnText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  successBtnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  successBtnSecondaryText: { color: colors.textMid },
});
