/**
 * ExportInstructionsModal — "Send your workout" bottom sheet.
 *
 * What this modal does (and doesn't):
 *
 *   IT DOES: produce the workout file (.zwo / .fit) and hand it to the
 *   OS share sheet so the rider can route it into Zwift / Rouvy /
 *   Wahoo SYSTM / intervals.icu / Files.
 *
 *   IT DOES NOT: speak to the trainer over Bluetooth and play back a
 *   workout. Smart trainers don't store .zwo files — they receive
 *   real-time power commands from a trainer app while you ride. We
 *   considered building a BLE + FTMS playback engine; that's a separate
 *   product (a Zwift competitor) and not the bet we're making.
 *
 * So the modal is honest about what it produces (a file) and where the
 * file needs to go to actually become a ride. Two phases:
 *
 *   1. PICK — rider chooses a destination. We group by reality, not by
 *      brand: phone-only options (intervals.icu) are separate from
 *      desktop-required options (Zwift / Wahoo / Rouvy) so a rider on
 *      their phone in the kitchen doesn't pick Zwift, hit a wall, and
 *      think the app is broken.
 *
 *   2. STEPS — once they've picked, we show 2-3 numbered steps + one
 *      "Save & share" button. No accordion, no don't-show-again, no
 *      legacy-format fallback. Single CTA.
 *
 * Same external interface as before so callers (ActivityDetailScreen)
 * don't change:
 *
 *   visible           boolean
 *   onProceed(format) fires with 'zwo' | 'fit' — the calling screen
 *                     handles the actual file write + share-sheet open
 *   onCancel()        dismissed without exporting
 *   workout?          { title, distanceKm, durationMins, effort } —
 *                     optional subtitle line so the rider sees what
 *                     they're sending
 *
 * Removed in this rewrite (intentionally):
 *   - bleTrainerService and TrainerPairingSheet (BLE was a mock; we
 *     decided against shipping a half-built version that pretends to
 *     "send to trainer" when it just opens a share sheet)
 *   - "Don't show this again" + the universal step list it was hiding
 *   - .mrc legacy format (CompuTrainer / GoldenCheetah users represent
 *     <1% of riders — if anyone needs it we add a Settings affordance)
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily } from '../theme';
import analytics from '../services/analyticsService';

const FF = fontFamily;

// Each destination knows: badge styling, the file format we save it as,
// and the steps the rider needs to follow once the file lands. The
// `phoneOnly` flag drives the visual grouping in phase 1 — if it's true,
// the rider can complete this entirely on their phone; if false, they
// need a laptop somewhere in the loop and we say so up front.
//
// Steps are deliberately short. Three lines max. Each step is one
// concrete action ("save the file", "open the dashboard", "drop it in
// the workouts folder"). No marketing copy.
const DESTINATIONS = [
  {
    key: 'intervals',
    name: 'intervals.icu',
    badgeColor: '#3478F6',
    badgeLetter: 'i',
    format: 'zwo',
    formatLabel: '.zwo',
    phoneOnly: true,
    tagline: 'Free, works phone-only, syncs to Zwift / Garmin / Wahoo',
    steps: {
      ios: [
        'Tap "Save & share" below.',
        'In the share sheet, save to Files (or open intervals.icu and use the upload affordance).',
        'In intervals.icu → Workouts → Calendar, drag the .zwo onto a date.',
      ],
      android: [
        'Tap "Save & share" below.',
        'The file lands in Downloads (or your chosen share target).',
        'Open intervals.icu in your browser → Workouts → Calendar → upload the .zwo onto a date.',
      ],
    },
    extraTip: 'Once you connect intervals.icu to Zwift / Garmin / Wahoo (one-time, in their settings), every workout you upload syncs through automatically.',
  },
  {
    key: 'zwift',
    name: 'Zwift',
    badgeColor: '#FC6719',
    badgeLetter: 'Z',
    format: 'zwo',
    formatLabel: '.zwo',
    phoneOnly: false,
    tagline: 'Custom workouts folder. Needs a laptop.',
    steps: {
      ios: [
        'Tap "Save & share" below, save to Files → iCloud Drive.',
        'On a laptop, drop the file into Documents/Zwift/Workouts/[your-id]/.',
        'Open Zwift → Custom Workouts → Etapa folder.',
      ],
      android: [
        'Tap "Save & share" below — the file lands in Downloads.',
        'Move it to a laptop (USB / Drive / email) and drop it into Documents/Zwift/Workouts/[your-id]/.',
        'Open Zwift → Custom Workouts → Etapa folder.',
      ],
    },
    iosWarning: '"Copy to Zwift" sometimes appears in the share sheet. Ignore it — Zwift\'s mobile app does not import workouts. The Files route above is the only one that works.',
  },
  {
    key: 'rouvy',
    name: 'Rouvy',
    badgeColor: '#0F1F19',
    badgeLetter: 'R',
    format: 'zwo',
    formatLabel: '.zwo',
    phoneOnly: false,
    tagline: 'Web upload, then syncs to mobile + desktop.',
    steps: {
      ios: [
        'Tap "Save & share" below, save to Files.',
        'On a laptop, sign in at my.rouvy.com → Workouts → Add → upload the .zwo.',
        'Syncs to the Rouvy app on next launch.',
      ],
      android: [
        'Tap "Save & share" below — the file lands in Downloads.',
        'On a laptop, sign in at my.rouvy.com → Workouts → Add → upload the .zwo.',
        'Syncs to the Rouvy app on next launch.',
      ],
    },
  },
  {
    key: 'wahoo',
    name: 'Wahoo SYSTM',
    badgeColor: '#0066B3',
    badgeLetter: 'W',
    format: 'fit',
    formatLabel: '.fit',
    phoneOnly: false,
    tagline: 'Web import, syncs to SYSTM app.',
    steps: {
      ios: [
        'Tap "Save & share" below, save to Files.',
        'On a laptop, sign in at systm.wahoofitness.com → Workouts → Custom → Import.',
        'Syncs to the SYSTM app on next launch.',
      ],
      android: [
        'Tap "Save & share" below — the file lands in Downloads.',
        'On a laptop, sign in at systm.wahoofitness.com → Workouts → Custom → Import.',
        'Syncs to the SYSTM app on next launch.',
      ],
    },
  },
  {
    key: 'other',
    name: 'Other / save to Files',
    badgeColor: '#5F5E5A',
    badgeLetter: '?',
    format: 'zwo',
    formatLabel: '.zwo',
    phoneOnly: false,
    tagline: 'Save the file and import it manually wherever you ride.',
    steps: {
      ios: [
        'Tap "Save & share" below — pick "Save to Files" or any app you like.',
        'Open your trainer app and look for "Workouts → Import" (it\'s called something close to that everywhere).',
        'Drop the .zwo in.',
      ],
      android: [
        'Tap "Save & share" below — the file lands in Downloads.',
        'Open your trainer app and look for "Workouts → Import" (it\'s called something close to that everywhere).',
        'Drop the .zwo in.',
      ],
    },
  },
];

export default function ExportInstructionsModal({ visible, onProceed, onCancel, workout }) {
  // Two-phase state: null = picker, otherwise the selected destination key.
  // We reset to null whenever `visible` flips off so re-opening the modal
  // is always a clean picker, not a stuck-on-the-last-app state.
  const [picked, setPicked] = useState(null);

  // useEffect-equivalent without the import: reset on close. Cheap because
  // the modal is mounted via the `visible` prop — when it's false we
  // return null and the picker state is moot anyway.
  if (!visible && picked !== null) {
    // Reset only when transitioning out. Using `setPicked` here would
    // loop, so we use the inline guard pattern: next render sees null.
    setTimeout(() => setPicked(null), 0);
  }

  if (!visible) return null;

  const isAndroid = Platform.OS === 'android';
  const dest = picked ? DESTINATIONS.find(d => d.key === picked) || null : null;
  const steps = dest ? (isAndroid ? dest.steps.android : dest.steps.ios) : null;
  const showIosWarning = dest && !isAndroid && dest.iosWarning;

  const handlePick = (key) => {
    setPicked(key);
    analytics.events.exportAppPicked?.({ app: key });
  };

  const handleSaveShare = () => {
    if (!dest) return;
    analytics.events.exportProceeded?.({ app: dest.key, format: dest.format });
    onProceed?.(dest.format);
  };

  const handleBackToPicker = () => setPicked(null);

  // Workout meta line — small subtitle so the rider sees what they're
  // about to send. Drops cleanly when no `workout` prop is passed.
  const workoutMeta = workout ? [
    workout.title,
    workout.distanceKm ? `${Math.round(workout.distanceKm)} km` : null,
    workout.durationMins ? `${workout.durationMins} min` : null,
    workout.effort,
  ].filter(Boolean).join(' \u00B7 ') : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.grab} />

          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>
                {dest ? `Send to ${dest.name}` : 'Send your workout'}
              </Text>
              {workoutMeta ? (
                <Text style={s.subtitle} numberOfLines={1}>{workoutMeta}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={onCancel} hitSlop={HIT}>
              <MaterialCommunityIcons name="close" size={20} color={colors.textMid} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ── PHASE 1: picker ─────────────────────────────────────
                Two visual groups so the rider's first decision is
                framed by their reality, not by brand: do you have a
                laptop nearby or are you on your phone? Phone-only =
                intervals.icu. Needs-desktop = the rest. */}
            {!dest && (
              <>
                <Text style={s.preamble}>
                  We'll save the workout file and open the share sheet. Pick where you ride.
                </Text>

                <Text style={s.groupLabel}>Phone only</Text>
                {DESTINATIONS.filter(d => d.phoneOnly).map(d => (
                  <DestinationTile
                    key={d.key}
                    destination={d}
                    onPress={() => handlePick(d.key)}
                    accent
                  />
                ))}

                <Text style={[s.groupLabel, { marginTop: 16 }]}>Needs a laptop somewhere</Text>
                {DESTINATIONS.filter(d => !d.phoneOnly).map(d => (
                  <DestinationTile
                    key={d.key}
                    destination={d}
                    onPress={() => handlePick(d.key)}
                  />
                ))}

                <Text style={s.honestNote}>
                  Why we don't "send straight to your trainer": smart trainers don't play back workout files — a trainer app does that while you ride. We make the file. The apps above ride it.
                </Text>
              </>
            )}

            {/* ── PHASE 2: steps for the picked destination ───────────
                Numbered list, one CTA, one back link. The iOS Zwift
                gotcha (share sheet "Copy to Zwift" doesn't actually
                import) gets surfaced before the steps so a rider
                following them isn't tripped up by it. */}
            {dest && (
              <>
                <TouchableOpacity
                  style={s.backLink}
                  onPress={handleBackToPicker}
                  hitSlop={HIT}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="chevron-left" size={16} color={colors.textMid} />
                  <Text style={s.backLinkText}>Pick a different app</Text>
                </TouchableOpacity>

                <Text style={s.formatLine}>
                  We'll save this as a <Text style={s.formatStrong}>{dest.formatLabel}</Text> file.
                </Text>

                {showIosWarning && (
                  <View style={s.warning}>
                    <MaterialCommunityIcons name="alert" size={14} color="#F0B72F" style={{ marginTop: 1 }} />
                    <Text style={s.warningText}>{dest.iosWarning}</Text>
                  </View>
                )}

                <View style={s.stepsCard}>
                  {steps.map((step, i) => (
                    <View key={i} style={s.stepRow}>
                      <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
                      <Text style={s.stepText}>{step}</Text>
                    </View>
                  ))}
                </View>

                {dest.extraTip && (
                  <Text style={s.extraTip}>{dest.extraTip}</Text>
                )}

                <TouchableOpacity
                  style={s.primaryBtn}
                  onPress={handleSaveShare}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons name="share-variant" size={16} color="#FFFFFF" />
                  <Text style={s.primaryBtnText}>Save & share</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>

          <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Destination row tile. `accent` = pink-tinted variant for the
// phone-only group so it visually distinguishes itself from the
// laptop-required ones without resorting to emoji or icons.
function DestinationTile({ destination, onPress, accent }) {
  const { name, badgeColor, badgeLetter, formatLabel, tagline } = destination;
  return (
    <TouchableOpacity
      style={[s.tile, accent && s.tileAccent]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Send to ${name}`}
    >
      <View style={[s.tileBadge, { backgroundColor: badgeColor }]}>
        <Text style={s.tileBadgeText}>{badgeLetter}</Text>
      </View>
      <View style={s.tileText}>
        <View style={s.tileNameRow}>
          <Text style={s.tileName}>{name}</Text>
          <Text style={s.tileFormat}>{formatLabel}</Text>
        </View>
        <Text style={s.tileTagline}>{tagline}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 6, paddingBottom: 18,
    borderTopWidth: 0.5, borderColor: colors.border,
    maxHeight: '92%',
  },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 6 },

  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12,
    borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
  },
  title: { fontSize: 17, fontWeight: '600', color: colors.text, fontFamily: FF.semibold, marginBottom: 4 },
  subtitle: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, lineHeight: 17 },

  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 12 },

  // ── Phase 1: picker ─────────────────────────────────────────────────
  preamble: {
    fontSize: 13, color: colors.textMid, fontFamily: FF.regular,
    lineHeight: 19, marginTop: 14, marginBottom: 14,
  },
  groupLabel: {
    fontSize: 10, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
    fontFamily: FF.medium,
    marginBottom: 8,
  },

  // Tile: row layout with badge / text / chevron. Accent variant for
  // the phone-only group is a subtle pink-tinted bg + pink left border.
  tile: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 12, marginBottom: 6,
    backgroundColor: colors.surfaceLight,
    borderWidth: 0.5, borderColor: colors.border,
  },
  tileAccent: {
    backgroundColor: colors.primary + '14',
    borderColor: colors.primary + '50',
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  tileBadge: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  tileBadgeText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12, fontFamily: FF.semibold },
  tileText: { flex: 1 },
  tileNameRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  tileName: { fontSize: 14, fontWeight: '500', color: colors.text, fontFamily: FF.medium },
  tileFormat: { fontSize: 11, color: colors.textMuted, fontFamily: FF.regular },
  tileTagline: { fontSize: 11, color: colors.textMid, fontFamily: FF.regular, marginTop: 3, lineHeight: 15 },

  // Honest note about why we don't "send to trainer". Italic + muted so
  // it doesn't compete with the picker, but visible enough that anyone
  // wondering gets the real answer.
  honestNote: {
    fontSize: 11, color: colors.textMuted, fontFamily: FF.regular,
    fontStyle: 'italic', lineHeight: 16,
    marginTop: 18, paddingTop: 14,
    borderTopWidth: 0.5, borderTopColor: colors.borderLight,
  },

  // ── Phase 2: steps ─────────────────────────────────────────────────
  backLink: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', marginTop: 12, marginBottom: 6,
    paddingVertical: 4, paddingRight: 8,
  },
  backLinkText: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular },

  formatLine: {
    fontSize: 13, color: colors.textMid, fontFamily: FF.regular,
    lineHeight: 19, marginBottom: 12,
  },
  formatStrong: { color: colors.text, fontWeight: '600', fontFamily: FF.semibold },

  warning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12, marginBottom: 12,
    backgroundColor: 'rgba(240, 183, 47, 0.08)',
    borderWidth: 0.5, borderColor: 'rgba(240, 183, 47, 0.4)',
    borderLeftWidth: 2, borderLeftColor: '#F0B72F',
    borderRadius: 8,
  },
  warningText: {
    flex: 1, fontSize: 12, color: colors.textMid, fontFamily: FF.regular, lineHeight: 17,
  },

  stepsCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12, padding: 14,
    borderWidth: 0.5, borderColor: colors.border,
    marginBottom: 12,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  stepNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { color: '#FFFFFF', fontWeight: '700', fontSize: 11, fontFamily: FF.semibold },
  stepText: { flex: 1, fontSize: 13, color: colors.text, fontFamily: FF.regular, lineHeight: 19 },

  extraTip: {
    fontSize: 11, color: colors.textMuted, fontFamily: FF.regular,
    fontStyle: 'italic', lineHeight: 16,
    marginBottom: 14, paddingHorizontal: 2,
  },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, paddingVertical: 14,
    borderRadius: 12,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', fontFamily: FF.semibold },

  cancelBtn: {
    paddingVertical: 14, alignItems: 'center', marginTop: 6,
    paddingHorizontal: 18,
  },
  cancelText: { fontSize: 13, color: colors.textMuted, fontFamily: FF.regular },
});
