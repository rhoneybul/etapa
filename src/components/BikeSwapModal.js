/**
 * BikeSwapModal — confirmation sheet shown when the rider switches the
 * bike on a planned session.
 *
 * Pulls suggested distance/duration adjustments from `utils/bikeSwap.js`
 * (rules from the Etapa coach: keep effort/duration constant, flex
 * distance to match). For combos the coach flags as "won't work well"
 * (e.g. road threshold intervals → MTB) the sheet flips into a warning
 * mode and offers Reschedule / Pick another bike, with override still
 * available one tap away.
 *
 * Props:
 *   visible        boolean
 *   session        the activity being swapped (reads durationMins,
 *                  distanceKm, subType, effort, title)
 *   fromBike       string — current bike for the session ('road' if
 *                  unknown — most plans are road by default)
 *   toBike         string — bike the rider just selected
 *   onApply(values)
 *                  apply the suggested values:
 *                    { bikeType, durationMins, distanceKm }
 *   onApplyOriginal(values)
 *                  rider chose to keep the original distance/duration
 *                  but still swap the bike. Returns same shape.
 *   onCancel()
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { colors, fontFamily } from '../theme';
import { computeBikeSwap, BIKE_LABELS } from '../utils/bikeSwap';

const FF = fontFamily;

export default function BikeSwapModal({
  visible,
  session,
  fromBike,
  toBike,
  onApply,
  onApplyOriginal,
  onCancel,
}) {
  if (!visible || !session || !toBike) return null;

  const result = computeBikeSwap(session, fromBike, toBike);
  const fromLabel = BIKE_LABELS[fromBike] || (fromBike || 'Road');
  const toLabel = BIKE_LABELS[toBike] || toBike;

  const apply = () => {
    onApply?.({
      bikeType: toBike,
      durationMins: result.proposedDuration,
      distanceKm: result.dropDistance ? null : result.proposedDistance,
    });
  };

  const applyOriginal = () => {
    onApplyOriginal?.({
      bikeType: toBike,
      durationMins: session.durationMins ?? null,
      distanceKm: session.distanceKm ?? null,
    });
  };

  // Blocked state: the swap doesn't work well. Primary CTAs nudge to a
  // better choice; override is still one tap away.
  if (result.blocked) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
        {/* Backdrop tap closes the sheet (cancels). Inner Pressable stops propagation so taps on the surface don't dismiss. */}
        <Pressable style={s.backdrop} onPress={onCancel}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.grab} />
            <Text style={[s.title, { color: '#F87171' }]}>This swap won't work well</Text>
            <Text style={s.body}>{result.blockReason}</Text>

            {result.warning ? (
              <View style={s.warnBox}>
                <Text style={s.warnTitle}>If you really must</Text>
                <Text style={s.warnBody}>{result.warning}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={s.primaryBtn} onPress={onCancel} activeOpacity={0.85}>
              <Text style={s.primaryBtnText}>Pick a different bike</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ghostBtn} onPress={onCancel} activeOpacity={0.7}>
              <Text style={s.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.dangerLink} onPress={apply} activeOpacity={0.7}>
              <Text style={s.dangerLinkText}>Override anyway — use the trimmed version</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  // Standard suggestion state.
  const baseDur = session.durationMins;
  const baseDist = session.distanceKm;
  const newDur = result.proposedDuration;
  const newDist = result.dropDistance ? null : result.proposedDistance;
  const distDelta = (baseDist != null && newDist != null) ? Math.round(newDist - baseDist) : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      {/* Backdrop tap closes the sheet (cancels). Inner Pressable stops propagation so taps on the surface don't dismiss. */}
      <Pressable style={s.backdrop} onPress={onCancel}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.grab} />
          <Text style={s.title}>Switching to {toLabel.toLowerCase()}?</Text>
          <Text style={s.body}>
            {result.dropDistance
              ? `Same effort, same time — distance doesn't really mean anything indoors so we'll drop it.`
              : `Same effort, same time — we'll trim the distance so the workout still fits.`}
          </Text>

          <View style={s.deltaCard}>
            <Row label="Duration" oldValue={baseDur != null ? `${baseDur} min` : '—'} newValue={newDur != null ? `${newDur} min` : '—'} note={newDur === baseDur ? 'unchanged' : 'adjusted'} />
            {result.dropDistance ? (
              <Row label="Distance" oldValue={baseDist != null ? `${baseDist} km` : '—'} newValue="—" note="not relevant indoors" />
            ) : (
              <Row
                label="Distance"
                oldValue={baseDist != null ? `${baseDist} km` : '—'}
                newValue={newDist != null ? `${newDist} km` : '—'}
                note={distDelta != null && distDelta !== 0 ? `${distDelta > 0 ? '+' : '−'}${Math.abs(distDelta)} km` : 'unchanged'}
              />
            )}
            <Row label="Effort" oldValue={session.effort || '—'} newValue={session.effort || '—'} note="unchanged" />
          </View>

          {result.warning ? (
            <Text style={s.warning}>{result.warning}</Text>
          ) : null}

          <TouchableOpacity style={s.primaryBtn} onPress={apply} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Use these numbers</Text>
          </TouchableOpacity>
          {!result.dropDistance && baseDist != null ? (
            <TouchableOpacity style={s.ghostBtn} onPress={applyOriginal} activeOpacity={0.7}>
              <Text style={s.ghostBtnText}>Keep original {baseDist} km</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ label, oldValue, newValue, note }) {
  const changed = oldValue !== newValue && note !== 'unchanged';
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.rowValues}>
        {changed ? (
          <>
            <Text style={s.rowOld}>{oldValue}</Text>
            <Text style={s.rowArrow}>{'\u2192'}</Text>
            <Text style={s.rowNew}>{newValue}</Text>
          </>
        ) : (
          <Text style={s.rowNew}>{newValue}</Text>
        )}
        {note ? <Text style={s.rowNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 24,
    borderTopWidth: 0.5,
    borderColor: colors.border,
  },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '600', color: colors.text, fontFamily: FF.semibold, marginBottom: 8 },
  body: { fontSize: 13, color: colors.textMid, fontFamily: FF.regular, lineHeight: 19, marginBottom: 14 },

  deltaCard: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 0.5, borderColor: colors.border,
    borderRadius: 12, padding: 14, marginBottom: 12,
  },
  row: { paddingVertical: 7, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 12, color: colors.textMuted, fontFamily: FF.regular },
  rowValues: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  rowOld: { fontSize: 12, color: colors.textFaint, fontFamily: FF.regular, textDecorationLine: 'line-through' },
  rowArrow: { fontSize: 12, color: colors.textMuted, fontFamily: FF.regular },
  rowNew: { fontSize: 13, color: colors.text, fontWeight: '600', fontFamily: FF.semibold },
  rowNote: { fontSize: 10, color: colors.primary, fontFamily: FF.regular, backgroundColor: colors.primary + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 4, overflow: 'hidden' },

  warning: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, lineHeight: 17, marginBottom: 14, fontStyle: 'italic' },

  warnBox: {
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderWidth: 0.5, borderColor: 'rgba(248,113,113,0.4)',
    borderRadius: 12, padding: 12, marginBottom: 14,
  },
  warnTitle: { fontSize: 11, color: '#F87171', fontWeight: '600', fontFamily: FF.semibold, marginBottom: 5 },
  warnBody: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, lineHeight: 17 },

  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  primaryBtnText: { fontSize: 14, fontWeight: '600', color: '#fff', fontFamily: FF.semibold },
  ghostBtn: { paddingVertical: 12, alignItems: 'center', borderWidth: 0.5, borderColor: colors.border, borderRadius: 12, marginBottom: 8 },
  ghostBtnText: { fontSize: 13, color: colors.textMid, fontFamily: FF.regular },
  cancelBtn: { paddingVertical: 10, alignItems: 'center' },
  cancelText: { fontSize: 13, color: colors.textMuted, fontFamily: FF.regular },

  dangerLink: { paddingVertical: 10, alignItems: 'center' },
  dangerLinkText: { fontSize: 12, color: '#F87171', fontFamily: FF.regular, textDecorationLine: 'underline' },
});
