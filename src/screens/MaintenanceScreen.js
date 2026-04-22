/**
 * MaintenanceScreen — shown when remote config has maintenance_mode.enabled = true.
 * Displays the title and message set in the admin dashboard.
 * Pull-to-refresh to re-check. Includes support ticket submission and email.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Image, RefreshControl, ScrollView,
  TextInput, TouchableOpacity, Linking, Alert, KeyboardAvoidingView,
  Platform, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';

const FF = fontFamily;
const SUPPORT_EMAIL = 'helloetapa@gmail.com';

export default function MaintenanceScreen({ title, message, onRetry }) {
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRetry?.();
    } catch {}
    setTimeout(() => setRefreshing(false), 800);
  };

  const handleSubmitTicket = async () => {
    if (!email.trim() || !body.trim()) {
      Alert.alert('Missing info', 'Please enter your email and a message.');
      return;
    }
    setSending(true);
    try {
      // Open the user's mail client with a pre-filled support email
      const subject = encodeURIComponent('Support Request — Etapa (Maintenance)');
      const mailBody = encodeURIComponent(`From: ${email.trim()}\n\n${body.trim()}`);
      const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${mailBody}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        setShowForm(false);
        setEmail('');
        setBody('');
      } else {
        Alert.alert('Cannot open mail', `Please email us directly at ${SUPPORT_EMAIL}`);
      }
    } catch {
      Alert.alert('Error', `Something went wrong. Please email us at ${SUPPORT_EMAIL}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : (StatusBar.currentHeight ?? 0)}
        >
          <ScrollView
            contentContainerStyle={s.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
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

              {/* Support section */}
              <View style={s.supportSection}>
                {!showForm ? (
                  <TouchableOpacity
                    style={s.supportBtn}
                    onPress={() => setShowForm(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.supportBtnText}>Contact Support</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={s.formCard}>
                    <Text style={s.formTitle}>Send us a message</Text>
                    <TextInput
                      style={s.input}
                      placeholder="Your email"
                      placeholderTextColor={colors.textFaint}
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TextInput
                      style={[s.input, s.inputMulti]}
                      placeholder="How can we help?"
                      placeholderTextColor={colors.textFaint}
                      value={body}
                      onChangeText={setBody}
                      multiline
                      textAlignVertical="top"
                    />
                    <TouchableOpacity
                      style={[s.submitBtn, sending && { opacity: 0.6 }]}
                      onPress={handleSubmitTicket}
                      activeOpacity={0.85}
                      disabled={sending}
                    >
                      {sending
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={s.submitBtnText}>Send</Text>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowForm(false)}>
                      <Text style={s.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Direct email link */}
                <TouchableOpacity
                  onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
                  activeOpacity={0.7}
                >
                  <Text style={s.emailLink}>or email us at {SUPPORT_EMAIL}</Text>
                </TouchableOpacity>
              </View>
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
  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingBottom: 60,
  },

  logo: {
    width: 64, height: 64, borderRadius: 18, marginBottom: 32,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.2)',
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

  /* Support section */
  supportSection: {
    marginTop: 36, alignItems: 'center', width: '100%', maxWidth: 320,
  },
  supportBtn: {
    backgroundColor: colors.card || '#1c1c1e',
    paddingVertical: 14, paddingHorizontal: 28,
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  supportBtnText: {
    fontSize: 15, fontFamily: FF.medium, color: colors.primary,
    textAlign: 'center',
  },

  /* Form */
  formCard: {
    width: '100%', backgroundColor: colors.card || '#1c1c1e',
    borderRadius: 14, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  formTitle: {
    fontSize: 16, fontFamily: FF.semibold, color: colors.text,
    marginBottom: 14, textAlign: 'center',
  },
  input: {
    backgroundColor: colors.bg, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: FF.regular, color: colors.text,
    marginBottom: 10, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  inputMulti: { height: 90, paddingTop: 12 },
  submitBtn: {
    backgroundColor: colors.primary, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  submitBtnText: {
    fontSize: 15, fontFamily: FF.semibold, color: '#fff',
  },
  cancelText: {
    marginTop: 12, fontSize: 14, fontFamily: FF.regular,
    color: colors.textFaint, textAlign: 'center',
  },

  emailLink: {
    marginTop: 16, fontSize: 13, fontFamily: FF.regular,
    color: colors.textFaint, textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
