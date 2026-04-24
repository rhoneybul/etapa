/**
 * OnboardingNameScreen — asks for a preferred display name and (optionally)
 * a separate comms email the first time a user signs in.
 *
 * Why separate from the sign-in email:
 *   - Apple Sign-In returns a relay inbox (random @privaterelay.appleid.com),
 *     which is useless for product updates + training tips.
 *   - Users often sign in with a work Google account but want product emails
 *     at a personal address.
 *
 * Only the name is required — email is optional with a clear Skip action.
 * Written to `user_prefs` via `setUserPrefs` so the value is durable across
 * sessions and also synced to the server for cross-device continuity.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Image, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily, useBottomInset } from '../theme';
import { setUserPrefs } from '../services/storageService';
import { getCurrentUser } from '../services/authService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

function isValidEmail(v) {
  if (!v) return true; // empty is fine — it's optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/**
 * We only prompt for a comms email when the auth account doesn't already
 * give us a usable one. Two cases force the prompt:
 *   1. No email on the account at all (rare, but possible with some
 *      OAuth edge cases or anonymous flows).
 *   2. Apple Sign-In relay address (*.privaterelay.appleid.com) — it
 *      forwards to the user but can't be used for product mail we want
 *      landing in their real inbox.
 * Every other auth email (Google, custom SMTP) is assumed reachable, so
 * we skip the comms-email field entirely.
 */
function shouldAskForCommsEmail(authEmail) {
  if (!authEmail) return true;
  const v = String(authEmail).toLowerCase();
  if (v.endsWith('@privaterelay.appleid.com')) return true;
  return false;
}

export default function OnboardingNameScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // `askEmail` drives whether to render the email block at all. Computed
  // on mount from the signed-in user's account email.
  const [askEmail, setAskEmail] = useState(false);
  const [checkedEmail, setCheckedEmail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await getCurrentUser();
        if (cancelled) return;
        setAskEmail(shouldAskForCommsEmail(user?.email));
      } catch {
        if (!cancelled) setAskEmail(false); // Fail closed — don't nag on error.
      } finally {
        if (!cancelled) setCheckedEmail(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const canContinue = name.trim().length >= 1;

  const onContinue = async () => {
    if (!canContinue) return;
    if (email && !isValidEmail(email)) {
      setError('That email doesn\'t look right. Check the format or leave it blank.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // displayName goes to user_prefs (existing field); commsEmail is new —
      // stored locally and synced to server as `comms_email` on the
      // preferences table. Fire-and-forget for the email so a network blip
      // doesn't block onboarding.
      await setUserPrefs({
        displayName: name.trim(),
        ...(email.trim() && { commsEmail: email.trim() }),
      });
      analytics.events.onboardingNameCompleted?.({ providedEmail: !!email.trim() });
      Keyboard.dismiss();
      navigation.replace('Home');
    } catch (e) {
      setError('Couldn\'t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const onSkipEmail = async () => {
    if (!canContinue) return;
    setError(null);
    setSaving(true);
    try {
      await setUserPrefs({ displayName: name.trim() });
      analytics.events.onboardingNameCompleted?.({ providedEmail: false, skipped: true });
      Keyboard.dismiss();
      navigation.replace('Home');
    } catch {
      setError('Couldn\'t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  // Respect Android's 3-button nav / gesture pill so the Continue CTA
  // at the bottom of the ScrollView doesn't end up clipped. iOS with
  // no home-indicator reports 0 and we fall back to the 40pt scroll
  // padding that was already there.
  const bottomPad = useBottomInset(16);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[s.scrollWrap, { paddingBottom: Math.max(40, bottomPad) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.headerRow}>
            <Image source={require('../../assets/icon.png')} style={s.logo} />
            <Text style={s.appName}>Etapa</Text>
          </View>

          <Text style={s.title}>What should we call you?</Text>
          <Text style={s.subtitle}>
            Your coach will use this to address you. You can change it any time in Settings.
          </Text>

          <Text style={s.fieldLabel}>Your name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Rob"
            placeholderTextColor={colors.textFaint}
            style={s.input}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            returnKeyType="next"
            maxLength={40}
          />

          {/* Comms email is only asked when the auth account can't reach
              the user (no email, or Apple private-relay). Everyone else
              skips this block entirely. */}
          {checkedEmail && askEmail && (
            <>
              <View style={s.divider} />

              <Text style={s.fieldLabel}>
                Email for tips &amp; updates{' '}
                <Text style={s.optional}>(optional)</Text>
              </Text>
              <Text style={s.emailBlurb}>
                Your account doesn&apos;t have a direct email we can reach you on.
                Add one here if you&apos;d like training tips — unsubscribe any time.
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textFaint}
                style={s.input}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={onContinue}
              />
            </>
          )}

          {!!error && <Text style={s.errorText}>{error}</Text>}

          <View style={{ height: 24 }} />

          <TouchableOpacity
            style={[s.primaryBtn, (!canContinue || saving) && s.primaryBtnDisabled]}
            onPress={onContinue}
            disabled={!canContinue || saving}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnText}>{saving ? 'Saving…' : 'Continue'}</Text>
          </TouchableOpacity>

          {checkedEmail && askEmail && (
            <TouchableOpacity
              style={s.skipBtn}
              onPress={onSkipEmail}
              disabled={!canContinue || saving}
              activeOpacity={0.7}
            >
              <Text style={[s.skipBtnText, (!canContinue || saving) && { opacity: 0.4 }]}>
                Skip email for now
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollWrap: { padding: 22, paddingBottom: 40 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  logo: { width: 34, height: 34, borderRadius: 8 },
  appName: { fontSize: 17, color: colors.text, fontFamily: FF.semibold, fontWeight: '500' },

  title: {
    fontSize: 26, fontFamily: FF.semibold, fontWeight: '500',
    color: colors.text, lineHeight: 32, marginBottom: 8,
  },
  subtitle: {
    fontSize: 14, fontFamily: FF.regular,
    color: colors.textMid, lineHeight: 21, marginBottom: 28,
  },

  fieldLabel: {
    fontSize: 11, fontFamily: FF.medium, fontWeight: '500',
    color: colors.textMuted, letterSpacing: 0.5, marginBottom: 6,
    textTransform: 'uppercase',
  },
  optional: {
    fontSize: 11, color: colors.textMuted, textTransform: 'none',
    letterSpacing: 0, fontWeight: '400',
  },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    color: colors.text, fontSize: 16, fontFamily: FF.regular,
  },
  divider: {
    height: 1, backgroundColor: colors.border, marginVertical: 24,
  },
  emailBlurb: {
    fontSize: 12, color: colors.textMid, fontFamily: FF.regular,
    lineHeight: 17, marginBottom: 8,
  },
  errorText: {
    fontSize: 12, color: '#EF4444', fontFamily: FF.regular,
    marginTop: 10,
  },

  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.35 },
  primaryBtnText: {
    color: '#fff', fontSize: 15, fontFamily: FF.semibold, fontWeight: '500',
  },

  skipBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  skipBtnText: {
    color: colors.primary, fontSize: 13, fontFamily: FF.medium, fontWeight: '500',
  },
});
