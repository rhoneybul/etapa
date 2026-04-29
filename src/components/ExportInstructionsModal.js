/**
 * ExportInstructionsModal — "Workout file" bottom sheet.
 *
 * Rewrite (v3): the previous version opened the OS share sheet OR the
 * browser via Linking.openURL, both of which kicked the rider out of
 * the app. Riders consistently said this was the worst part of the
 * Etapa experience — they tap "Send to trainer", get bounced into
 * Safari, file lands in Downloads, they have to find it, drag it into
 * Zwift's Workouts folder on a laptop, etc. The picker + per-app
 * instructions made this look more usable than it was.
 *
 * What this version does instead:
 *
 *   1. On open, mints a signed export URL on the server and downloads
 *      the .zwo file directly into FileSystem.documentDirectory using
 *      expo-file-system. NO browser, NO share sheet auto-fired.
 *   2. Displays the workout content in-app — activity meta, parsed
 *      structure (warmup / main / cooldown blocks), filename, file size.
 *   3. Offers a single optional "Share file" button (expo-sharing) for
 *      riders who DO want to push the local file into another app.
 *      That button uses the local file URI so the share sheet shows
 *      file-aware destinations (Save to Files, AirDrop, Mail, etc.) —
 *      not the browser. The rider stays in Etapa unless they opt out.
 *
 * Props:
 *   visible    — boolean, controls Modal mount
 *   activity   — the activity being exported (id, title, structure,
 *                distanceKm, durationMins, effort, type, subType)
 *   planId     — the plan id; needed to mint the signed export URL
 *   onCancel() — dismissed
 *
 * Removed in this rewrite:
 *   - onProceed callback (caller no longer drives the file flow — the
 *     modal owns it end-to-end now)
 *   - destination picker (intervals.icu / Zwift / Rouvy / Wahoo / Other)
 *   - per-app numbered import steps
 *   - the iOS Zwift share-sheet warning (no longer relevant — we don't
 *     fire the share sheet automatically any more)
 *   - .mrc fallback (legacy, <1% of riders, can come back as a Settings
 *     toggle if anyone needs it)
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { colors, fontFamily } from '../theme';
import { buildWorkoutExportUrl } from '../services/api';
import analytics from '../services/analyticsService';

const FF = fontFamily;

// expo-sharing is loaded lazily so the module isn't required when the
// rider doesn't tap Share. Keeps cold-open of this modal cheap.
let _sharing = null;
async function getSharing() {
  if (_sharing) return _sharing;
  try { _sharing = await import('expo-sharing'); } catch { _sharing = null; }
  return _sharing;
}

// Slugify a title into a safe filename. Strips anything outside
// [a-z0-9-_], collapses runs of '-', falls back to a generic name when
// the title would otherwise produce an empty string.
function slugForFile(title) {
  if (!title) return 'workout';
  const base = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || 'workout';
}

function formatBytes(n) {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Pull a short "what's in this workout" preview off activity.structure.
// The schema is { warmup, main: [...], cooldown } where each block has
// duration_mins + a power/HR target description. We render those lines
// as a list — durations on the right, a short label on the left. If
// structure is absent (steady-state ride with no intervals), we synthesise
// a single "steady ride · {durationMins} min · {effort}" row so the
// rider still sees something concrete.
function buildStructureRows(activity) {
  const rows = [];
  const s = activity?.structure || null;

  const formatDuration = (mins) => {
    if (!mins && mins !== 0) return null;
    if (mins < 60) return `${Math.round(mins)} min`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };
  const targetLabel = (block) => {
    if (!block) return '';
    if (block.power_target) return String(block.power_target);
    if (block.hr_target) return String(block.hr_target);
    if (block.rpe) return `RPE ${block.rpe}`;
    if (block.zone) return `Zone ${block.zone}`;
    return '';
  };

  if (s?.warmup) {
    rows.push({
      label: 'Warm-up',
      duration: formatDuration(s.warmup.duration_mins),
      target: targetLabel(s.warmup),
      kind: 'warmup',
    });
  }
  if (Array.isArray(s?.main) && s.main.length > 0) {
    s.main.forEach((b, i) => {
      const reps = b.reps ? ` ×${b.reps}` : '';
      rows.push({
        label: (b.label || b.title || `Interval ${i + 1}`) + reps,
        duration: formatDuration(b.duration_mins),
        target: targetLabel(b),
        kind: 'main',
      });
    });
  }
  if (s?.cooldown) {
    rows.push({
      label: 'Cool-down',
      duration: formatDuration(s.cooldown.duration_mins),
      target: targetLabel(s.cooldown),
      kind: 'cooldown',
    });
  }

  if (rows.length === 0) {
    // Steady-state fallback: no structured intervals, just a single
    // "go ride" block. Pulled from the activity meta the rider already
    // sees on the detail screen.
    const dur = formatDuration(activity?.durationMins);
    if (dur) rows.push({ label: 'Steady ride', duration: dur, target: activity?.effort || '', kind: 'steady' });
  }
  return rows;
}

export default function ExportInstructionsModal({ visible, activity, planId, onCancel }) {
  // phase: 'idle' (modal closed) | 'downloading' | 'ready' | 'error'
  const [phase, setPhase] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [fileInfo, setFileInfo] = useState(null); // { uri, name, sizeBytes }
  const [sharing, setSharing] = useState(false);
  // Track whether we've kicked off a download for the current open
  // session, so a parent re-render with the same props doesn't re-fire.
  const startedRef = useRef(false);

  // Reset state every time the modal closes so the next open starts
  // fresh. We don't auto-cleanup the file on disk — riders who later
  // browse "On My iPhone → Etapa" via Files should still find it there.
  useEffect(() => {
    if (!visible) {
      setPhase('idle');
      setErrorMsg('');
      setFileInfo(null);
      startedRef.current = false;
    }
  }, [visible]);

  // Kick off the download on first render where visible flips true and
  // we have what we need.
  useEffect(() => {
    if (!visible || startedRef.current) return;
    if (!activity?.id || !planId) return;
    startedRef.current = true;
    void runDownload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, activity?.id, planId]);

  const runDownload = async () => {
    setPhase('downloading');
    setErrorMsg('');
    try {
      const url = await buildWorkoutExportUrl(planId, activity.id, 'zwo');
      if (!url) {
        setErrorMsg('Sign-in expired. Pull-to-refresh on Home, then try again.');
        setPhase('error');
        return;
      }

      // Ensure a workouts dir exists under the app's documentDirectory.
      // documentDirectory is iOS-visible-in-Files when the app sets
      // UIFileSharingEnabled — that means riders can browse to the file
      // later via Files → On My iPhone → Etapa.
      const dir = FileSystem.documentDirectory + 'workouts/';
      try { await FileSystem.makeDirectoryAsync(dir, { intermediates: true }); } catch {}

      const filename = `${slugForFile(activity.title)}.zwo`;
      const localUri = dir + filename;

      const result = await FileSystem.downloadAsync(url, localUri);
      if (!result?.uri || (result.status && result.status >= 400)) {
        setErrorMsg('Couldn\'t save the file. Try again in a moment.');
        setPhase('error');
        return;
      }

      // Best-effort size lookup so we can show the rider how big the
      // file is. Failing this is non-fatal — we just leave size blank.
      let sizeBytes = 0;
      try {
        const info = await FileSystem.getInfoAsync(result.uri, { size: true });
        sizeBytes = info?.size || 0;
      } catch {}

      analytics.events.activityExported?.({
        activityId: activity.id, format: 'zwo', reused: false, mode: 'in_app',
      });

      setFileInfo({ uri: result.uri, name: filename, sizeBytes });
      setPhase('ready');
    } catch (err) {
      console.warn('[export-modal] download failed:', err?.message || err);
      setErrorMsg('Couldn\'t save the file. Try again in a moment.');
      setPhase('error');
    }
  };

  const handleShare = async () => {
    if (!fileInfo?.uri || sharing) return;
    setSharing(true);
    try {
      const sh = await getSharing();
      if (!sh || typeof sh.shareAsync !== 'function') {
        setErrorMsg('Sharing isn\'t available on this device. The file is still saved.');
        return;
      }
      const isAvailable = sh.isAvailableAsync ? await sh.isAvailableAsync() : true;
      if (!isAvailable) {
        setErrorMsg('Sharing isn\'t available on this device. The file is still saved.');
        return;
      }
      await sh.shareAsync(fileInfo.uri, {
        dialogTitle: 'Share workout file',
        mimeType: 'application/xml',
        UTI: 'public.xml',
      });
      analytics.events.exportShared?.({ activityId: activity.id, format: 'zwo' });
    } catch (err) {
      // Cancellation is not an error — only surface real errors.
      const msg = err?.message || '';
      if (!/cancel/i.test(msg)) {
        setErrorMsg('Share failed. The file is saved — try opening Files instead.');
      }
    } finally {
      setSharing(false);
    }
  };

  if (!visible) return null;

  const metaLine = activity ? [
    activity.title,
    activity.distanceKm ? `${Math.round(activity.distanceKm)} km` : null,
    activity.durationMins ? `${activity.durationMins} min` : null,
    activity.effort,
  ].filter(Boolean).join(' \u00B7 ') : '';

  const rows = phase === 'ready' ? buildStructureRows(activity) : [];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.grab} />

          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Workout file</Text>
              {metaLine ? <Text style={s.subtitle} numberOfLines={2}>{metaLine}</Text> : null}
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
            {/* ── Downloading ─────────────────────────────────────── */}
            {phase === 'downloading' && (
              <View style={s.statusBlock}>
                <ActivityIndicator color={colors.primary} />
                <Text style={s.statusText}>Saving to Etapa…</Text>
              </View>
            )}

            {/* ── Error ───────────────────────────────────────────── */}
            {phase === 'error' && (
              <View style={s.errorBlock}>
                <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#F0B72F" />
                <Text style={s.errorText}>{errorMsg || 'Something went wrong.'}</Text>
                <TouchableOpacity
                  style={s.retryBtn}
                  onPress={() => { startedRef.current = false; runDownload(); }}
                  activeOpacity={0.85}
                >
                  <Text style={s.retryBtnText}>Try again</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Ready: file saved + workout content ─────────────── */}
            {phase === 'ready' && fileInfo && (
              <>
                {/* Saved-to-Etapa confirmation card. Pink-tinted so the
                    rider's eye lands on the "yes, it worked" signal
                    before they read the structure below. */}
                <View style={s.savedCard}>
                  <View style={s.savedIcon}>
                    <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.savedTitle}>Saved to Etapa</Text>
                    <Text style={s.savedSub}>
                      {fileInfo.name}{fileInfo.sizeBytes ? ` \u00B7 ${formatBytes(fileInfo.sizeBytes)}` : ''}
                    </Text>
                  </View>
                </View>

                {/* Workout structure — read from activity.structure if
                    present, else a single "steady ride" row from the
                    activity duration. Each row shows the block label,
                    target zone/power, and duration. Cool-down rows get
                    the same visual weight as warm-up so the shape of
                    the ride is symmetric. */}
                {rows.length > 0 && (
                  <>
                    <Text style={s.sectionLabel}>What&apos;s in this workout</Text>
                    <View style={s.structureCard}>
                      {rows.map((r, i) => (
                        <View
                          key={i}
                          style={[
                            s.structureRow,
                            i < rows.length - 1 && s.structureRowBorder,
                          ]}
                        >
                          <View style={[s.structureDot, r.kind === 'main' && s.structureDotMain]} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.structureLabel}>{r.label}</Text>
                            {r.target ? <Text style={s.structureTarget}>{r.target}</Text> : null}
                          </View>
                          {r.duration ? <Text style={s.structureDuration}>{r.duration}</Text> : null}
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {/* Where the file lives — single line, plain English.
                    On iOS this directory is exposed via the Files app
                    (On My iPhone → Etapa) so riders who prefer to
                    drag-drop from there can find it without us nudging
                    them out of the app. */}
                <Text style={s.fileLocationText}>
                  This file is saved inside Etapa. Tap <Text style={{ fontWeight: '600' }}>Share</Text> below to send it to Zwift, Rouvy, Wahoo, Files, or any other app.
                </Text>

                <TouchableOpacity
                  style={[s.primaryBtn, sharing && { opacity: 0.6 }]}
                  onPress={handleShare}
                  activeOpacity={0.85}
                  disabled={sharing}
                >
                  <MaterialCommunityIcons name="share-variant" size={16} color="#FFFFFF" />
                  <Text style={s.primaryBtnText}>{sharing ? 'Opening…' : 'Share'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.ghostBtn}
                  onPress={onCancel}
                  activeOpacity={0.7}
                >
                  <Text style={s.ghostBtnText}>Done</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
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
  scrollContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12 },

  // Loading + error blocks. Same vertical rhythm so the swap doesn't
  // jolt the layout.
  statusBlock: { paddingVertical: 36, alignItems: 'center', gap: 12 },
  statusText: { fontSize: 13, color: colors.textMid, fontFamily: FF.regular },

  errorBlock: { paddingVertical: 28, alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  errorText: {
    fontSize: 13, color: colors.textMid, fontFamily: FF.regular,
    lineHeight: 19, textAlign: 'center',
  },
  retryBtn: {
    marginTop: 6, paddingVertical: 10, paddingHorizontal: 18,
    borderRadius: 10, borderWidth: 0.5, borderColor: colors.border,
  },
  retryBtnText: { fontSize: 13, color: colors.text, fontFamily: FF.medium, fontWeight: '500' },

  // Saved-to-Etapa card. Pink-tinted with a small filled circle icon.
  savedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.primary + '14',
    borderWidth: 0.5, borderColor: colors.primary + '50',
    borderLeftWidth: 3, borderLeftColor: colors.primary,
    borderRadius: 12, padding: 12,
    marginBottom: 16,
  },
  savedIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  savedTitle: { fontSize: 13, fontWeight: '600', color: colors.text, fontFamily: FF.semibold },
  savedSub: { fontSize: 11, color: colors.textMid, fontFamily: FF.regular, marginTop: 2 },

  sectionLabel: {
    fontSize: 10, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
    fontFamily: FF.medium,
    marginBottom: 8,
  },

  // Structure card — list of warmup → main → cooldown rows. Pink dot
  // marks the "main set" rows so the eye can pick them out at a glance.
  structureCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 0.5, borderColor: colors.border,
    paddingVertical: 4, paddingHorizontal: 12,
    marginBottom: 16,
  },
  structureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
  },
  structureRowBorder: {
    borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
  },
  structureDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.border,
  },
  structureDotMain: { backgroundColor: colors.primary },
  structureLabel: { fontSize: 13, color: colors.text, fontFamily: FF.medium, fontWeight: '500' },
  structureTarget: { fontSize: 11, color: colors.textMid, fontFamily: FF.regular, marginTop: 2 },
  structureDuration: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular },

  fileLocationText: {
    fontSize: 12, color: colors.textMid, fontFamily: FF.regular,
    lineHeight: 17, marginBottom: 14,
  },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, paddingVertical: 14,
    borderRadius: 12,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', fontFamily: FF.semibold },

  ghostBtn: {
    paddingVertical: 13, marginTop: 8, borderRadius: 12,
    borderWidth: 0.5, borderColor: colors.border,
    alignItems: 'center',
  },
  ghostBtnText: { fontSize: 13, color: colors.textMid, fontFamily: FF.regular },
});
