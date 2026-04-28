/**
 * ExportInstructionsModal — first-time popup explaining how to actually
 * land a Send-to-trainer .zwo / .mrc file inside the rider's chosen
 * trainer app.
 *
 * Why it exists in this shape: the previous version stacked every app's
 * instructions on one long screen — riders trying to get a workout into
 * Zwift had to scroll past Wahoo, Rouvy, TrainerRoad, intervals.icu,
 * and a CompuTrainer mention before finding their bit. Now we ask once
 * — "I use:" — and reveal only that app's specific path.
 *
 * Two-step universal flow up top so a rider who just wants the gist
 * gets it in 12 seconds:
 *   1. Save the file to your phone.
 *   2. Upload it on the app's web dashboard.
 *
 * iOS specifically pre-empts the "Copy to Zwift" share-sheet illusion —
 * it sometimes appears even though Zwift's mobile app doesn't actually
 * import the file. Better to call it out before the rider tries.
 *
 * MRC fallback exposed as a small link at the bottom — most riders never
 * see it; legacy-trainer-software users can find it.
 *
 * Props:
 *   visible       boolean
 *   onProceed(format)  fires the actual export with the chosen format
 *                      ('zwo' | 'mrc'). 'zwo' is the default; the modal
 *                      flips to 'mrc' if the rider taps the legacy link.
 *   onCancel()    dismissed without exporting
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform,
} from 'react-native';
import { colors, fontFamily } from '../theme';
import { setUserPrefs } from '../services/storageService';
import analytics from '../services/analyticsService';

const FF = fontFamily;

// Apps the rider can pick. Each entry knows: badge colour + initial,
// the iOS-specific path, and the Android-specific path. Both paths are
// kept short — 2-3 numbered steps. Long-form context lives below in a
// "Why this is the path" footer the rider can ignore.
const APP_OPTIONS = [
  {
    key: 'zwift',
    name: 'Zwift',
    badgeColor: '#FC6719',
    badgeLetter: 'Z',
    iosSteps: [
      'Save to Files → iCloud Drive.',
      'On a desktop, open the file and drag it into Documents/Zwift/Workouts/{your-id}/.',
      'Open Zwift on any device — appears under Custom Workouts → Etapa.',
    ],
    androidSteps: [
      'File saves to your Downloads folder.',
      'Move it to a desktop (USB / Drive / email).',
      'Drop into Documents/Zwift/Workouts/{your-id}/. Appears in Zwift on next launch.',
    ],
    iosWarning: '"Copy to Zwift" sometimes appears in the share sheet — ignore it. Zwift\'s mobile app doesn\'t actually import the file.',
    fasterPath: 'Phone-only? Use intervals.icu — it\'s free, takes mobile uploads, and has built-in Zwift sync.',
  },
  {
    key: 'wahoo',
    name: 'Wahoo SYSTM',
    badgeColor: '#0066B3',
    badgeLetter: 'W',
    iosSteps: [
      'Save to Files → iCloud Drive.',
      'On a laptop, sign in at systm.wahoofitness.com → Workouts → Custom → Import.',
      'Syncs to the SYSTM app on next launch.',
    ],
    androidSteps: [
      'File saves to Downloads.',
      'Sign in at systm.wahoofitness.com → Workouts → Custom → Import.',
      'Syncs to SYSTM on next launch.',
    ],
  },
  {
    key: 'rouvy',
    name: 'Rouvy',
    badgeColor: '#0F1F19',
    badgeLetter: 'R',
    iosSteps: [
      'Save to Files.',
      'On a laptop, sign in at my.rouvy.com → Workouts → Add → upload the .zwo.',
      'Syncs to mobile and desktop.',
    ],
    androidSteps: [
      'File saves to Downloads.',
      'Sign in at my.rouvy.com → Workouts → Add → upload the .zwo.',
      'Syncs to mobile and desktop.',
    ],
  },
  {
    key: 'trainerroad',
    name: 'TrainerRoad',
    badgeColor: '#E73B3F',
    badgeLetter: 'TR',
    iosSteps: [
      'Save to Files.',
      'On a laptop, sign in at trainerroad.com → Workouts → Workout Creator → Import.',
    ],
    androidSteps: [
      'File saves to Downloads.',
      'Sign in at trainerroad.com → Workouts → Workout Creator → Import.',
    ],
  },
  {
    key: 'intervals',
    name: 'intervals.icu',
    badgeColor: '#3478F6',
    badgeLetter: 'i',
    iosSteps: [
      'Save to Files.',
      'Sign in at intervals.icu → Workouts → Calendar → drag the .zwo onto a date.',
      'Optional: connect intervals.icu → Zwift / Garmin / Wahoo for automatic sync.',
    ],
    androidSteps: [
      'File saves to Downloads.',
      'Sign in at intervals.icu → Workouts → Calendar → upload the .zwo.',
      'Free — and the only path that works mobile-only with sync to Zwift / Garmin / Wahoo.',
    ],
    badge: 'Recommended for mobile-only riders',
  },
  {
    key: 'other',
    name: 'Other / not sure',
    badgeColor: '#5F5E5A',
    badgeLetter: '?',
    iosSteps: [
      'Save to Files.',
      'Open your trainer app\'s web dashboard from a laptop.',
      'Look for "Workouts → Import" or similar.',
    ],
    androidSteps: [
      'File saves to Downloads.',
      'Open your trainer app\'s web dashboard from a laptop.',
      'Look for "Workouts → Import" or similar.',
    ],
  },
];

export default function ExportInstructionsModal({ visible, onProceed, onCancel }) {
  const [selectedApp, setSelectedApp] = useState(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [useMrc, setUseMrc] = useState(false);

  // Reset selection when the modal opens — fresh start each time.
  useEffect(() => { if (visible) { setSelectedApp(null); setDontShowAgain(false); setUseMrc(false); } }, [visible]);

  if (!visible) return null;

  const isAndroid = Platform.OS === 'android';
  const app = APP_OPTIONS.find(a => a.key === selectedApp) || null;
  const steps = app ? (isAndroid ? app.androidSteps : app.iosSteps) : null;
  const showZwiftWarning = app?.key === 'zwift' && !isAndroid && app.iosWarning;

  const handleProceed = async () => {
    if (dontShowAgain) {
      try { await setUserPrefs({ hideExportInstructions: true }); } catch {}
      analytics.events.exportInstructionsOptedOut?.();
    }
    if (selectedApp) analytics.events.exportAppPicked?.({ app: selectedApp });
    onProceed?.(useMrc ? 'mrc' : 'zwo');
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.grab} />

          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Save for your trainer app</Text>
              <Text style={s.subtitle}>
                Two steps: save the file, then upload it on your trainer app's web dashboard. Pick which app you ride with for the specific path.
              </Text>
            </View>
            <TouchableOpacity onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={s.closeX}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
            {/* App picker grid — selecting an app reveals only that app's
                specific steps below. Less wall-of-text, more useful per
                rider. */}
            <Text style={s.sectionLabel}>I use</Text>
            <View style={s.appGrid}>
              {APP_OPTIONS.map(a => {
                const sel = a.key === selectedApp;
                return (
                  <TouchableOpacity
                    key={a.key}
                    style={[s.appOption, sel && s.appOptionSelected]}
                    onPress={() => setSelectedApp(a.key)}
                    activeOpacity={0.7}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                  >
                    <View style={[s.appBadge, { backgroundColor: a.badgeColor }]}>
                      <Text style={s.appBadgeText}>{a.badgeLetter}</Text>
                    </View>
                    <Text style={[s.appName, sel && s.appNameSelected]} numberOfLines={1}>{a.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {app?.badge && (
              <View style={s.recommendedBadge}>
                <Text style={s.recommendedBadgeText}>{app.badge}</Text>
              </View>
            )}

            {/* iOS-only Zwift gotcha — surfaces BEFORE the steps so a
                rider following them doesn't get tripped up by the
                share-sheet illusion. */}
            {showZwiftWarning && (
              <View style={s.warning}>
                <Text style={s.warningTitle}>Heads-up</Text>
                <Text style={s.warningBody}>{app.iosWarning}</Text>
              </View>
            )}

            {/* Per-app numbered steps. Replaces the old single-screen
                wall of every app's path stacked. */}
            {steps ? (
              <View style={s.stepsCard}>
                {steps.map((step, i) => (
                  <View key={i} style={s.stepRow}>
                    <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
                    <Text style={s.stepText}>{step}</Text>
                  </View>
                ))}
                {app?.fasterPath && (
                  <View style={s.fasterPathRow}>
                    <Text style={s.fasterPathText}>{app.fasterPath}</Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={s.pickPrompt}>Pick an app above to see the specific steps.</Text>
            )}

            {/* Universal footnote — same for every app. Kept short. */}
            {selectedApp && (
              <Text style={s.footnote}>
                Power targets are a percentage of your FTP, so set your FTP inside the trainer app once and every imported workout plays back at the right watts. Garmin Edge / Wahoo ELEMNT head units don't read .zwo directly — route through intervals.icu.
              </Text>
            )}

            {/* MRC fallback — discovered, not in-the-way. */}
            {selectedApp && (
              <TouchableOpacity
                style={s.mrcRow}
                onPress={() => setUseMrc(v => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: useMrc }}
              >
                <View style={[s.checkBox, useMrc && s.checkBoxOn]}>
                  {useMrc && <Text style={s.checkTick}>{'\u2713'}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.mrcLabel}>Use the older .mrc format instead</Text>
                  <Text style={s.mrcSub}>For CompuTrainer, PerfPro, ErgVideo, GoldenCheetah and other legacy software.</Text>
                </View>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Footer pinned at bottom */}
          <View style={s.footer}>
            <TouchableOpacity
              style={s.checkRow}
              onPress={() => setDontShowAgain(v => !v)}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: dontShowAgain }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={[s.checkBox, dontShowAgain && s.checkBoxOn]}>
                {dontShowAgain && <Text style={s.checkTick}>{'\u2713'}</Text>}
              </View>
              <Text style={s.checkLabel}>Don't show this again. (You can re-enable in Settings.)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.primaryBtn, !selectedApp && s.primaryBtnDisabled]}
              onPress={handleProceed}
              disabled={!selectedApp}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>
                {selectedApp ? `Got it — export ${useMrc ? '.mrc' : '.zwo'}` : 'Pick an app first'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 6, paddingBottom: 24,
    borderTopWidth: 0.5, borderColor: colors.border,
    maxHeight: '92%',
  },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 6 },

  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10,
    borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
  },
  title: { fontSize: 17, fontWeight: '600', color: colors.text, fontFamily: FF.semibold, marginBottom: 4 },
  subtitle: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, lineHeight: 17 },
  closeX: { fontSize: 18, color: colors.textMid, padding: 2 },

  scroll: { flexGrow: 0 },

  sectionLabel: {
    fontSize: 10, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
    fontFamily: FF.medium,
    marginHorizontal: 18, marginTop: 16, marginBottom: 8,
  },

  // Three-column app grid. 2 rows of 3 → all six options visible
  // without scrolling on standard phones.
  appGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 14, gap: 8,
  },
  appOption: {
    width: '31%',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    padding: 10,
    alignItems: 'center', gap: 6,
    minHeight: 66,
  },
  appOptionSelected: { backgroundColor: colors.primary + '14', borderColor: colors.primary, borderWidth: 1.5 },
  appBadge: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  appBadgeText: { color: '#fff', fontWeight: '700', fontSize: 11, letterSpacing: 0.4 },
  appName: { fontSize: 11, fontWeight: '500', color: colors.textMid, fontFamily: FF.medium, textAlign: 'center' },
  appNameSelected: { color: colors.text, fontWeight: '600', fontFamily: FF.semibold },

  recommendedBadge: {
    alignSelf: 'flex-start',
    marginHorizontal: 18, marginTop: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: colors.primary + '14',
    borderRadius: 999,
    borderWidth: 0.5, borderColor: colors.primary + '50',
  },
  recommendedBadgeText: {
    fontSize: 10, fontWeight: '600', color: colors.primary,
    fontFamily: FF.semibold, letterSpacing: 0.4,
  },

  warning: {
    marginHorizontal: 18, marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(240, 183, 47, 0.08)',
    borderWidth: 0.5, borderColor: 'rgba(240, 183, 47, 0.4)',
    borderLeftWidth: 2, borderLeftColor: '#F0B72F',
    borderRadius: 0,
  },
  warningTitle: {
    fontSize: 11, fontWeight: '600', color: '#F0B72F',
    fontFamily: FF.semibold, letterSpacing: 0.4,
    textTransform: 'uppercase', marginBottom: 4,
  },
  warningBody: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, lineHeight: 17 },

  stepsCard: {
    marginHorizontal: 18, marginTop: 14,
    backgroundColor: colors.surfaceLight,
    borderRadius: 12, padding: 14,
    borderWidth: 0.5, borderColor: colors.border,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  stepNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { color: '#fff', fontWeight: '700', fontSize: 11, fontFamily: FF.semibold },
  stepText: { flex: 1, fontSize: 13, color: colors.text, fontFamily: FF.regular, lineHeight: 19 },
  fasterPathRow: {
    marginTop: 6, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  fasterPathText: {
    fontSize: 11, fontStyle: 'italic',
    color: colors.textMid, fontFamily: FF.regular, lineHeight: 16,
  },

  pickPrompt: {
    fontSize: 13, color: colors.textMuted, fontFamily: FF.regular,
    textAlign: 'center', paddingVertical: 24, paddingHorizontal: 18,
  },

  footnote: {
    marginHorizontal: 18, marginTop: 14,
    fontSize: 11, color: colors.textMuted, fontFamily: FF.regular,
    lineHeight: 16, fontStyle: 'italic',
  },

  mrcRow: {
    marginHorizontal: 18, marginTop: 14,
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: colors.surfaceLight,
    borderWidth: 0.5, borderColor: colors.border,
    borderRadius: 10,
  },
  mrcLabel: { fontSize: 12, fontWeight: '500', color: colors.text, fontFamily: FF.medium },
  mrcSub: { fontSize: 11, color: colors.textMuted, fontFamily: FF.regular, lineHeight: 15, marginTop: 3 },

  footer: {
    paddingHorizontal: 18, paddingTop: 12,
    borderTopWidth: 0.5, borderTopColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, marginBottom: 4 },
  checkBox: {
    width: 18, height: 18, borderRadius: 5,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkTick: { color: '#fff', fontSize: 11, fontWeight: '700' },
  checkLabel: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, flex: 1, lineHeight: 16 },

  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { fontSize: 14, fontWeight: '600', color: '#fff', fontFamily: FF.semibold },
  cancelBtn: { paddingVertical: 10, alignItems: 'center' },
  cancelText: { fontSize: 13, color: colors.textMuted, fontFamily: FF.regular },
});
