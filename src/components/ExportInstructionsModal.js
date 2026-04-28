/**
 * ExportInstructionsModal — first-time popup explaining how to actually
 * land a Send-to-trainer .zwo / .mrc file inside Zwift / Wahoo SYSTM /
 * Rouvy / TrainerRoad / etc.
 *
 * Why it exists: the share-sheet "Open in Zwift" magic only works for
 * apps that registered .zwo as a document type. On iOS that's Zwift
 * and MyWhoosh. Everything else (Wahoo SYSTM, Rouvy, TrainerRoad,
 * intervals.icu) needs the rider to Save the file then import via the
 * web dashboard. On Android the share-sheet "Open in" rarely works for
 * any of these apps — Android riders should always plan to download
 * first, then import via the app's web dashboard or in-app file picker.
 *
 * The modal explains the realistic flow, and offers a "Don't show this
 * again" checkbox so power users aren't nagged. The pref is stored via
 * setUserPrefs({ hideExportInstructions: true }) so it persists across
 * launches and devices (we sync display-name-style local prefs).
 *
 * Props:
 *   visible      boolean
 *   onProceed()  user is ready — fire the actual export
 *   onCancel()   dismissed without exporting
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform,
} from 'react-native';
import { colors, fontFamily } from '../theme';
import { setUserPrefs } from '../services/storageService';

const FF = fontFamily;

const PER_APP_INSTRUCTIONS = [
  {
    name: 'Zwift',
    badgeColor: '#FC6719',
    badgeLetter: 'Z',
    iosFlow: 'Pick "Copy to Zwift" on the share sheet. The workout shows up under Custom Workouts → Etapa next time you ride.',
    androidFlow: 'Save the file, then sign in at zwift.com → My Workouts → drop the .zwo into your custom-workouts folder. Syncs to the app.',
  },
  {
    name: 'Wahoo SYSTM',
    badgeColor: '#0066B3',
    badgeLetter: 'W',
    iosFlow: 'Pick "Save to Files" on the share sheet → iCloud Drive. Then sign in at systm.wahoofitness.com → Workouts → Import.',
    androidFlow: 'File downloads to your phone. Sign in at systm.wahoofitness.com → Workouts → Import. Syncs to your phone next launch.',
  },
  {
    name: 'Rouvy',
    badgeColor: '#0F1F19',
    badgeLetter: 'R',
    iosFlow: 'Pick "Save to Files". Sign in at my.rouvy.com → Workouts → Add → upload the .zwo. Syncs to mobile and desktop.',
    androidFlow: 'File downloads. Sign in at my.rouvy.com → Workouts → Add → upload the .zwo. Syncs to mobile and desktop.',
  },
  {
    name: 'TrainerRoad',
    badgeColor: '#E73B3F',
    badgeLetter: 'TR',
    iosFlow: 'Pick "Save to Files". Sign in at trainerroad.com → Workouts → Workout Creator → Import.',
    androidFlow: 'File downloads. Sign in at trainerroad.com → Workouts → Workout Creator → Import.',
  },
  {
    name: 'intervals.icu',
    badgeColor: '#3478F6',
    badgeLetter: 'i',
    iosFlow: 'Pick "Save to Files". Sign in at intervals.icu → Workouts → Import. Free, and syncs to a paired Garmin / Wahoo head unit.',
    androidFlow: 'File downloads. Sign in at intervals.icu → Workouts → Import. Free, and syncs to Garmin / Wahoo head units.',
  },
];

export default function ExportInstructionsModal({ visible, onProceed, onCancel }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!visible) return null;

  const isAndroid = Platform.OS === 'android';

  const handleProceed = async () => {
    if (dontShowAgain) {
      try { await setUserPrefs({ hideExportInstructions: true }); } catch {}
    }
    onProceed?.();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.grab} />

          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Sending this to your trainer</Text>
              <Text style={s.subtitle}>
                We'll generate a workout file, then your phone hands it to your trainer app. Two ways that works in practice.
              </Text>
            </View>
            <TouchableOpacity onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={s.closeX}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
            {/* Platform banner — Android can't rely on the share-sheet magic */}
            {isAndroid && (
              <View style={s.androidBanner}>
                <Text style={s.androidBannerTitle}>You're on Android</Text>
                <Text style={s.androidBannerBody}>
                  Most trainer apps don't accept .zwo through Android's share sheet. The reliable flow is: tap export → file downloads → sign in to the app's web dashboard → import the file there. Workouts then sync to your phone on next launch.
                </Text>
              </View>
            )}

            {!isAndroid && (
              <View style={s.iosNote}>
                <Text style={s.iosNoteTitle}>Two flows on iOS</Text>
                <Text style={s.iosNoteBody}>
                  Zwift and MyWhoosh accept the file directly from the share sheet — pick "Copy to Zwift" and you're done. For everything else (Wahoo SYSTM, Rouvy, TrainerRoad, intervals.icu), pick "Save to Files" and import on the app's web dashboard.
                </Text>
              </View>
            )}

            <Text style={s.sectionLabel}>Per app</Text>
            {PER_APP_INSTRUCTIONS.map(app => (
              <View key={app.name} style={s.appCard}>
                <View style={[s.appBadge, { backgroundColor: app.badgeColor }]}>
                  <Text style={s.appBadgeText}>{app.badgeLetter}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.appName}>{app.name}</Text>
                  <Text style={s.appFlow}>{isAndroid ? app.androidFlow : app.iosFlow}</Text>
                </View>
              </View>
            ))}

            <Text style={s.footnote}>
              Your trainer app needs your FTP set for ERG mode to drive the right watts — set it once inside the app you ride with. Garmin Edge / Wahoo ELEMNT head units don't read .zwo directly; route through Zwift or intervals.icu and let those push to the head unit.
            </Text>
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity
              style={s.checkRow}
              onPress={() => setDontShowAgain(v => !v)}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: dontShowAgain }}
            >
              <View style={[s.checkBox, dontShowAgain && s.checkBoxOn]}>
                {dontShowAgain && <Text style={s.checkTick}>{'\u2713'}</Text>}
              </View>
              <Text style={s.checkLabel}>Don't show this again</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.primaryBtn} onPress={handleProceed} activeOpacity={0.85}>
              <Text style={s.primaryBtnText}>Got it — export the file</Text>
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
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 0, paddingTop: 6, paddingBottom: 24,
    borderTopWidth: 0.5, borderColor: colors.border,
    maxHeight: '92%',
  },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 6 },

  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8,
    borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
  },
  title: { fontSize: 17, fontWeight: '600', color: colors.text, fontFamily: FF.semibold, marginBottom: 4 },
  subtitle: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, lineHeight: 17 },
  closeX: { fontSize: 18, color: colors.textMid, padding: 2 },

  scroll: { flexGrow: 0 },

  androidBanner: {
    marginHorizontal: 18, marginTop: 14, marginBottom: 4,
    padding: 12,
    backgroundColor: colors.secondary + '14',
    borderWidth: 0.5, borderColor: colors.secondary + '50',
    borderRadius: 12,
  },
  androidBannerTitle: {
    fontSize: 11, fontWeight: '600', color: colors.secondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
    fontFamily: FF.semibold, marginBottom: 6,
  },
  androidBannerBody: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, lineHeight: 18 },

  iosNote: {
    marginHorizontal: 18, marginTop: 14, marginBottom: 4,
    padding: 12,
    backgroundColor: colors.primary + '12',
    borderWidth: 0.5, borderColor: colors.primary + '40',
    borderRadius: 12,
  },
  iosNoteTitle: {
    fontSize: 11, fontWeight: '600', color: colors.primary,
    textTransform: 'uppercase', letterSpacing: 0.5,
    fontFamily: FF.semibold, marginBottom: 6,
  },
  iosNoteBody: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, lineHeight: 18 },

  sectionLabel: {
    fontSize: 10, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
    fontFamily: FF.medium,
    marginHorizontal: 18, marginTop: 18, marginBottom: 8,
  },

  appCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 18, paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
  },
  appBadge: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  appBadgeText: {
    color: '#fff', fontWeight: '700', fontSize: 12,
    fontFamily: FF.semibold, letterSpacing: 0.4,
  },
  appName: { fontSize: 13, fontWeight: '600', color: colors.text, fontFamily: FF.semibold, marginBottom: 4 },
  appFlow: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, lineHeight: 17 },

  footnote: {
    marginHorizontal: 18, marginTop: 14,
    fontSize: 11, color: colors.textMuted, fontFamily: FF.regular, lineHeight: 16,
    fontStyle: 'italic',
  },

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
  checkLabel: { fontSize: 13, color: colors.textMid, fontFamily: FF.regular },

  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  primaryBtnText: { fontSize: 14, fontWeight: '600', color: '#fff', fontFamily: FF.semibold },
  cancelBtn: { paddingVertical: 10, alignItems: 'center' },
  cancelText: { fontSize: 13, color: colors.textMuted, fontFamily: FF.regular },
});
