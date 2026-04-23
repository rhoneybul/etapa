/**
 * WelcomeScreen — the first screen a user without a plan sees.
 *
 * Simple, personal, single-action. Two paths forward:
 *
 *   - "Get started"       → PlanPickerScreen (intake flow)
 *   - "I already know…"  → PlanSelectionScreen with no recommendation
 *
 * Rendered inline from HomeScreen's empty state (not a navigator screen),
 * mirrors the pattern we already use for PlanPickerScreen. Once the user
 * commits with either CTA we push to the navigator so back-button /
 * swipe-back behaviour works sensibly from there on.
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import analytics from '../services/analyticsService';

const FF = fontFamily;

export default function WelcomeScreen({ navigation, firstName }) {
  const onGetStarted = () => {
    analytics.events.welcomeStarted?.({ action: 'get_started' });
    navigation.navigate('PlanPicker');
  };

  const onSkipToSelection = () => {
    analytics.events.welcomeStarted?.({ action: 'already_know' });
    navigation.navigate('PlanSelection'); // no recommendedPath → neutral 3-card
  };

  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView contentContainerStyle={s.scrollWrap} showsVerticalScrollIndicator={false}>

        <View style={s.headerRow}>
          <Image source={require('../../assets/icon.png')} style={s.logo} />
          <View>
            <Text style={s.appName}>Etapa</Text>
            {firstName ? <Text style={s.greeting}>Hi, {firstName}</Text> : null}
          </View>
        </View>

        <View style={s.heroWrap}>
          <Text style={s.title}>{greeting}{"\n"}let&apos;s ride</Text>
          <Text style={s.body}>Let&apos;s get you on a plan that fits.</Text>
        </View>

        <View style={s.actions}>
          <TouchableOpacity style={s.primaryBtn} onPress={onGetStarted} activeOpacity={0.88}>
            <Text style={s.primaryBtnText}>Get started</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.skipBtn} onPress={onSkipToSelection} activeOpacity={0.7}>
            <Text style={s.skipText}>
              I already know what I want <Text style={s.skipArrow}>→</Text>
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollWrap: { flexGrow: 1, padding: 22, paddingBottom: 28, justifyContent: 'space-between' },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  logo: { width: 34, height: 34, borderRadius: 8 },
  appName: { fontSize: 17, color: colors.text, fontFamily: FF.semibold, fontWeight: '500' },
  greeting: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, marginTop: 1 },

  heroWrap: { flex: 1, justifyContent: 'center', paddingVertical: 40 },
  title: {
    fontSize: 32, fontFamily: FF.semibold, fontWeight: '500',
    color: colors.text, lineHeight: 38, marginBottom: 12,
  },
  body: {
    fontSize: 15, fontFamily: FF.regular, color: colors.textMid, lineHeight: 22,
  },

  actions: { paddingBottom: 8 },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff', fontSize: 15, fontFamily: FF.semibold, fontWeight: '500',
  },
  skipBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  skipText: { fontSize: 13, color: colors.textMid, fontFamily: FF.regular },
  skipArrow: { color: colors.primary, fontFamily: FF.semibold, fontWeight: '500' },
});
