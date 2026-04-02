/**
 * MaintenanceScreen — shown when remote config has maintenance_mode.enabled = true.
 * Displays an informative message, contact email, and option to submit a support request.
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Alert,
  KeyboardAvoidingView, Platform, ScrollView, Linking, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';

const FF = fontFamily;
const SUPPORT_EMAIL = 'helloetapa@gmail.com';

export default function MaintenanceScreen({ title, message, onRetry }) {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleEmailPress = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {});
  };

  const handleSubmitTicket = async () => {
    if (!email.trim() || !body.trim()) {
      Alert.alert('Missing info', 'Please enter your email and a message.');
      return;
    }
    setSending(true);
    try {
      // Try to submit via the API — it may be down during maintenance,
      // so we fall back to opening the user's email client.
      const serverUrl = process.env.EXPO_PUBLIC_API_URL || 'https://etapa-production.up.railway.app';
      const res = await fetch(`${serverUrl}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'support',
          message: `[Maintenance Support Request]\nFrom: ${email.trim()}\n\n${body.trim()}`,
          appVersion: 'maintenance',
          deviceInfo: `${Platform.OS} ${Platform.Version}`,
        }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        // Fallback: open email
        Linking.openURL(
          `mailto:${SUPPORT_EMAIL}?subject=Etapa Support Request&body=${encodeURIComponent(body.trim())}`
        ).catch(() => {});
        setSent(true);
      }
    } catch {
      // API unreachable — open email client instead
      Linking.openURL(
        `mailto:${SUPPORT_EMAIL}?subject=Etapa Support Request&body=${encodeURIComponent(body.trim())}`
      ).catch(() => {});
      setSent(true);
    }
    setSending(false);
  };

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
            <View style={s.content}>
              {/* Logo */}
              <Image
                source={require('../../assets/icon.png')}
                style={s.logo}
              />

              {/* Main message */}
              <Text style={s.title}>
                {title || "We'll be back soon"}
              </Text>
              <Text style={s.message}>
                {message || 'Etapa is currently undergoing scheduled maintenance. We\'re working to improve the app and will be back shortly.'}
              </Text>

              {/* Status info */}
              <View style={s.statusCard}>
                <View style={s.statusRow}>
                  <View style={s.statusDot} />
                  <Text style={s.statusText}>Maintenance in progress</Text>
                </View>
                <Text style={s.statusHint}>
                  All your training data is safe. The app will resume as normal once maintenance is complete.
                </Text>
              </View>

              {/* Retry button */}
              <TouchableOpacity style={s.retryBtn} onPress={onRetry} activeOpacity={0.8}>
                <Text style={s.retryBtnText}>Check again</Text>
              </TouchableOpacity>

              {/* Divider */}
              <View style={s.divider} />

              {/* Contact section */}
              <Text style={s.contactTitle}>Need help?</Text>

              {!showForm && !sent ? (
                <View style={s.contactOptions}>
                  <TouchableOpacity
                    style={s.contactBtn}
                    onPress={() => setShowForm(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.contactBtnText}>Submit a support request</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={s.emailBtn}
                    onPress={handleEmailPress}
                    activeOpacity={0.8}
                  >
                    <Text style={s.emailBtnText}>Or email us at</Text>
                    <Text style={s.emailAddress}>{SUPPORT_EMAIL}</Text>
                  </TouchableOpacity>
                </View>
              ) : sent ? (
                <View style={s.sentCard}>
                  <Text style={s.sentTitle}>Request sent</Text>
                  <Text style={s.sentMessage}>
                    Thanks for reaching out. We'll get back to you as soon as possible.
                  </Text>
                </View>
              ) : (
                <View style={s.formCard}>
                  <Text style={s.formLabel}>YOUR EMAIL</Text>
                  <TextInput
                    style={s.formInput}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.textFaint}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <Text style={s.formLabel}>MESSAGE</Text>
                  <TextInput
                    style={[s.formInput, s.formTextArea]}
                    placeholder="How can we help?"
                    placeholderTextColor={colors.textFaint}
                    value={body}
                    onChangeText={setBody}
                    multiline
                    textAlignVertical="top"
                    maxLength={1000}
                  />

                  <View style={s.formActions}>
                    <TouchableOpacity
                      style={s.formCancelBtn}
                      onPress={() => setShowForm(false)}
                    >
                      <Text style={s.formCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.formSubmitBtn, (!email.trim() || !body.trim() || sending) && s.formSubmitDisabled]}
                      onPress={handleSubmitTicket}
                      disabled={!email.trim() || !body.trim() || sending}
                      activeOpacity={0.8}
                    >
                      <Text style={s.formSubmitText}>
                        {sending ? 'Sending...' : 'Send'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Email always visible at bottom */}
              {(showForm || sent) && (
                <TouchableOpacity
                  style={s.bottomEmail}
                  onPress={handleEmailPress}
                  activeOpacity={0.8}
                >
                  <Text style={s.bottomEmailText}>
                    You can also reach us at{' '}
                    <Text style={s.bottomEmailLink}>{SUPPORT_EMAIL}</Text>
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 32, paddingTop: 60, paddingBottom: 40 },

  logo: {
    width: 64, height: 64, borderRadius: 18, marginBottom: 28,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.2)',
  },

  title: {
    fontSize: 24, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.text, marginBottom: 12, textAlign: 'center',
  },
  message: {
    fontSize: 15, fontFamily: FF.regular, color: colors.textMid,
    textAlign: 'center', lineHeight: 22, marginBottom: 24, maxWidth: 320,
  },

  // Status card
  statusCard: {
    width: '100%', backgroundColor: colors.surface, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 24,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.caution },
  statusText: {
    fontSize: 14, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.caution,
  },
  statusHint: {
    fontSize: 13, fontFamily: FF.regular, color: colors.textMid, lineHeight: 19,
  },

  // Retry
  retryBtn: {
    backgroundColor: colors.primary, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 48, marginBottom: 28,
  },
  retryBtnText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },

  // Divider
  divider: {
    width: 40, height: 1, backgroundColor: colors.border, marginBottom: 28,
  },

  // Contact section
  contactTitle: {
    fontSize: 16, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.text, marginBottom: 16,
  },
  contactOptions: { width: '100%', gap: 12 },
  contactBtn: {
    width: '100%', backgroundColor: colors.surface, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  contactBtnText: {
    fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.primary,
  },
  emailBtn: { alignItems: 'center', paddingVertical: 8 },
  emailBtnText: { fontSize: 13, fontFamily: FF.regular, color: colors.textMuted },
  emailAddress: {
    fontSize: 14, fontWeight: '500', fontFamily: FF.medium,
    color: colors.primary, marginTop: 2,
  },

  // Support form
  formCard: {
    width: '100%', backgroundColor: colors.surface, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: colors.border,
  },
  formLabel: {
    fontSize: 10, fontWeight: '600', fontFamily: FF.semibold,
    color: colors.textMuted, letterSpacing: 0.6, marginBottom: 6, marginTop: 8,
  },
  formInput: {
    backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, fontFamily: FF.regular, color: colors.text,
    borderWidth: 1, borderColor: colors.border, marginBottom: 8,
  },
  formTextArea: { minHeight: 100, maxHeight: 160, textAlignVertical: 'top' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  formCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  formCancelText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },
  formSubmitBtn: {
    flex: 2, backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  formSubmitDisabled: { opacity: 0.4 },
  formSubmitText: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },

  // Sent confirmation
  sentCard: {
    width: '100%', backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 14,
    padding: 20, borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
    alignItems: 'center',
  },
  sentTitle: {
    fontSize: 16, fontWeight: '600', fontFamily: FF.semibold,
    color: '#22C55E', marginBottom: 6,
  },
  sentMessage: {
    fontSize: 14, fontFamily: FF.regular, color: colors.textMid,
    textAlign: 'center', lineHeight: 20,
  },

  // Bottom email
  bottomEmail: { marginTop: 16, paddingVertical: 8 },
  bottomEmailText: { fontSize: 13, fontFamily: FF.regular, color: colors.textMuted, textAlign: 'center' },
  bottomEmailLink: { color: colors.primary, fontWeight: '500', fontFamily: FF.medium },
});
