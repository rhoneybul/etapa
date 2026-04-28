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

// Per-app instructions describe what ACTUALLY works in practice.
// The earlier copy claimed "Pick Copy to Zwift" on the share sheet —
// that doesn't reliably work because Zwift mobile doesn't register
// .zwo as an importable document type on iOS or Android. The honest
// path for Zwift is: send the .zwo to a desktop and drop it into the
// Zwift workouts folder, OR use intervals.icu / TrainingPeaks as a
// sync bridge (they push workouts into Zwift on next launch). For
// everything else (Wahoo SYSTM, Rouvy, TrainerRoad), the import lives
// on the web dashboard.
const PER_APP_INSTRUCTIONS = [
  {
    name: 'Zwift',
    badgeColor: '#FC6719',
    badgeLetter: 'Z',
    iosFlow: 'Pick "Save to Files" → iCloud Drive. On a desktop or laptop, open the file and drag it into Documents/Zwift/Workouts/{your-id}/ — it appears under Custom Workouts on next Zwift launch. Quicker route: connect intervals.icu (free) to Zwift, then upload the .zwo to intervals.icu and it syncs.',
    androidFlow: 'File saves to Downloads. Move it to a computer (USB / Drive / email) and drop it into Documents/Zwift/Workouts/{your-id}/ — it appears under Custom Workouts. Or upload to intervals.icu (free), which has a Zwift sync that pushes workouts in for you.',
  },
  {
    name: 'Wahoo SYSTM',
    badgeColor: '#0066B3',
    badgeLetter: 'W',
    iosFlow: 'Pick "Save to Files" → iCloud Drive. Then on a laptop sign in at systm.wahoofitness.com → Workouts → Custom → Import. Workout syncs to the SYSTM app on next launch.',
    androidFlow: 'File saves to Downloads. Sign in at systm.wahoofitness.com → Workouts → Custom → Import. Syncs to the SYSTM app on next launch.',
  },
  {
    name: 'Rouvy',
    badgeColor: '#0F1F19',
    badgeLetter: 'R',
    iosFlow: 'Pick "Save to Files". On a laptop sign in at my.rouvy.com → Workouts → Add → upload the .zwo. Syncs to your mobile and desktop Rouvy apps.',
    androidFlow: 'File saves to Downloads. Sign in at my.rouvy.com → Workouts → Add → upload the .zwo. Syncs to mobile and desktop.',
  },
  {
    name: 'TrainerRoad',
    badgeColor: '#E73B3F',
    badgeLetter: 'TR',
    iosFlow: 'Pick "Save to Files". On a laptop sign in at trainerroad.com → Workouts → Workout Creator → Import.',
    androidFlow: 'File saves to Downloads. Sign in at trainerroad.com → Workouts → Workout Creator → Import.',
  },
  {
    name: 'intervals.icu',
    badgeColor: '#3478F6',
    badgeLetter: 'i',
    iosFlow: 'Pick "Save to Files". Sign in at intervals.icu → Workouts → Calendar → drop the .zwo onto a date. Free. Has built-in sync to Zwift, Garmin, and Wahoo head units — workouts you upload here appear inside those apps automatically.',
    androidFlow: 'File saves to Downloads. Sign in at intervals.icu → Workouts → Calendar → upload the .zwo. Free, and syncs to Zwift, Garmin, and Wahoo head units. The fastest way to get a workout into Zwift on Android.',
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
                We generate a real workout file. Getting it into Zwift / SYSTM / Rouvy is a quick web-dashboard upload — not a share-sheet handoff. Here's the realistic path per app.
              </Text>
            </View>
            <TouchableOpacity onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={s.closeX}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
            {/* Platform banners — phone-only riders need to know the
                reliable path is via a web dashboard, not a share-sheet
                handoff. Zwift in particular doesn't read .zwo from
                mobile share sheets. The fastest mobile-only path is
                intervals.icu (free, syncs to Zwift). Everything else
                needs a web import on a laptop or other device. */}
            {isAndroid && (
              <View style={s.androidBanner}>
                <Text style={s.androidBannerTitle}>You're on Android</Text>
                <Text style={s.androidBannerBody}>
                  Trainer apps on Android don't accept .zwo files from the share sheet. Tap export, the file lands in your Downloads folder, then upload it via the app's web dashboard from a laptop. Phone-only? Use intervals.icu — free, takes uploads on mobile, syncs to Zwift / Garmin / Wahoo automatically.
                </Text>
              </View>
            )}

            {!isAndroid && (
              <View style={s.iosNote}>
                <Text style={s.iosNoteTitle}>Heads-up</Text>
                <Text style={s.iosNoteBody}>
                  Zwift's mobile app doesn't pick up .zwo files from the iOS share sheet — even though "Copy to Zwift" sometimes appears, it doesn't reliably import. The dependable paths are: (1) Save to Files → iCloud Drive → drop into Zwift's desktop workouts folder, or (2) use intervals.icu (free) as a sync bridge — upload there on iOS and it pushes the workout into Zwift for you.
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
