/**
 * BikeTypePickerModal — first leg of the per-session bike-swap flow.
 *
 * Opens when the rider taps the bike chip on Home / WeekView /
 * ActivityDetail. Lists every bike type as a tappable row (excluding
 * the one already selected for this session). Picking a row closes
 * this modal and hands control to BikeSwapModal, which shows the
 * coach's distance/duration recommendation.
 *
 * Why a proper modal over the OS action sheet: the action sheet was
 * iOS-good, Android-mediocre, and felt off-brand sitting between two
 * branded sheets (BikeSwapModal, RecurringRideSheet). Aligning on a
 * single modal style means the per-session flow looks the same on
 * both platforms and matches the rest of the app's bottom-sheet
 * vocabulary.
 *
 * Props:
 *   visible       boolean
 *   activity      the activity being swapped (used for the title only)
 *   currentBike   bike key currently set on the activity
 *   onPick(bike)  rider picked a target bike
 *   onCancel()    dismissed without picking
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily } from '../theme';
import { BIKE_LABELS, BIKE_KEYS } from '../utils/bikeSwap';

const FF = fontFamily;

// MCI icon mapping per bike type. `bike-fast` stands in for indoor /
// trainer (no dedicated trainer glyph in MCI). All others have direct
// glyphs that read clearly at 22px without the cartoonish quality of
// emoji.
const BIKE_ICONS = {
  road:   'bike',
  gravel: 'bike',
  mtb:    'bike',
  ebike:  'bike-electric',
  indoor: 'bike-fast',
};

// Short subtitle so the rider knows what each bike maps to in the
// plan. Stays under one line on every device.
const BIKE_SUBTITLES = {
  road:   'Pavement, faster average pace.',
  gravel: 'Mixed surface, slightly slower.',
  mtb:    'Trails, technical, slower again.',
  ebike:  'Flatter effort curve, longer range.',
  indoor: 'Trainer or smart bike.',
};

export default function BikeTypePickerModal({ visible, activity, currentBike, onPick, onCancel }) {
  if (!visible) return null;

  const others = BIKE_KEYS.filter((b) => b !== currentBike);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.grab} />
          <Text style={s.title}>Switch bike for this session</Text>
          <Text style={s.subtitle}>
            {activity?.title ? `${activity.title}` : 'Pick a different bike'}
            {currentBike ? ` — currently on ${(BIKE_LABELS[currentBike] || currentBike).toLowerCase()}.` : '.'}
          </Text>

          <View style={s.list}>
            {others.map((bike) => (
              <TouchableOpacity
                key={bike}
                style={s.row}
                onPress={() => onPick?.(bike)}
                activeOpacity={0.7}
                accessibilityLabel={`Switch to ${BIKE_LABELS[bike]}`}
              >
                <View style={s.rowIconWrap}>
                  <MaterialCommunityIcons
                    name={BIKE_ICONS[bike] || 'bike'}
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={s.rowText}>
                  <Text style={s.rowLabel}>{BIKE_LABELS[bike] || bike}</Text>
                  <Text style={s.rowSubtitle}>{BIKE_SUBTITLES[bike] || ''}</Text>
                </View>
                <Text style={s.rowChevron}>{'\u203A'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
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
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 24,
    borderTopWidth: 0.5,
    borderColor: colors.border,
  },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 10 },

  title: { fontSize: 17, fontWeight: '600', color: colors.text, fontFamily: FF.semibold, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textMid, fontFamily: FF.regular, lineHeight: 19, marginBottom: 14 },

  list: { borderRadius: 14, borderWidth: 0.5, borderColor: colors.border, overflow: 'hidden', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceLight,
  },
  rowIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: colors.text, fontFamily: FF.semibold, marginBottom: 2 },
  rowSubtitle: { fontSize: 12, color: colors.textMuted, fontFamily: FF.regular },
  rowChevron: { fontSize: 18, color: colors.textMuted, fontFamily: FF.regular, marginLeft: 8 },

  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelText: { fontSize: 13, color: colors.textMuted, fontFamily: FF.regular },
});
