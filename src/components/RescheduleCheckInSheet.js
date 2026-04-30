/**
 * RescheduleCheckInSheet — bottom sheet shown when the rider taps the
 * "Reschedule" pill in the CheckInScreen header. Lets them push the
 * weekly check-in to a later date instead of either submitting now or
 * skipping outright (which used to be the only two paths).
 *
 * Why three preset options + a "Custom" affordance: the vast majority of
 * "I'll do this later" intents are "tomorrow" / "in a few days" / "next
 * week". A native date picker for those cases is friction; presets get
 * 90% of riders home with a single tap. The Custom row falls back to
 * the platform date picker for the long-tail.
 *
 * Persistence: caller supplies `onConfirm(isoDate)` — the screen prefers
 * `api.checkins.reschedule` if it exists, otherwise it stamps the chosen
 * date locally under `@etapa_checkin_rescheduled_<id>` so future loads
 * know to skip the prompt until that date.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Platform, Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily } from '../theme';

const FF = fontFamily;

// Lazy-import the native date picker — it's not a guaranteed dep so we
// guard the require so the component still renders if the package isn't
// installed yet. The "Custom" row is hidden in that case.
let DateTimePicker = null;
try {
  // eslint-disable-next-line global-require
  DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch {
  DateTimePicker = null;
}

// Compute a local YYYY-MM-DD from a JS Date without timezone shift —
// matches the convention storageService uses for plan.startDate so the
// rescheduled date round-trips cleanly.
function toLocalISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Friendly label like "Mon 5 May" — used for both the preset rows and
// the "Custom" preview. Keeps the column tidy without needing locale
// gymnastics.
function formatFriendly(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

export default function RescheduleCheckInSheet({ visible, onCancel, onConfirm }) {
  // Always recompute the presets at render time — if the rider opens the
  // sheet at midnight the dates need to roll over without a remount.
  const presets = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0); // noon — avoids DST edge cases on the +1 day add

    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const inThreeDays = new Date(today); inThreeDays.setDate(today.getDate() + 3);

    // Next Monday — find the next Monday strictly after today (so if
    // today IS Monday, we go to next-week's Monday, not "right now").
    const nextMonday = new Date(today);
    const daysUntilNextMon = ((1 - today.getDay() + 7) % 7) || 7;
    nextMonday.setDate(today.getDate() + daysUntilNextMon);

    return [
      { key: 'tomorrow', title: 'Tomorrow', subtitle: formatFriendly(tomorrow), date: tomorrow },
      { key: 'in_3_days', title: 'In 3 days', subtitle: formatFriendly(inThreeDays), date: inThreeDays },
      { key: 'next_monday', title: 'Next Monday', subtitle: formatFriendly(nextMonday), date: nextMonday },
    ];
  }, [visible]);

  // Custom state lives here so reopening the sheet resets the picker —
  // a stale "I picked next Tuesday last week" state would be confusing.
  const [customDate, setCustomDate] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  if (!visible) return null;

  const handlePick = (d) => {
    if (!d) return;
    onConfirm?.(toLocalISODate(d));
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      {/* Backdrop tap closes the sheet (cancels reschedule). Inner Pressable stops propagation so taps on the surface don't dismiss. */}
      <Pressable style={s.backdrop} onPress={onCancel}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.grab} />

          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Reschedule check-in</Text>
              <Text style={s.subtitle}>
                Pick a day that works better. We'll nudge you again then — your answers stay saved.
              </Text>
            </View>
            <TouchableOpacity onPress={onCancel} hitSlop={HIT}>
              <MaterialCommunityIcons name="close" size={20} color={colors.textMid} />
            </TouchableOpacity>
          </View>

          <View style={s.list}>
            {presets.map(p => (
              <TouchableOpacity
                key={p.key}
                style={s.row}
                onPress={() => handlePick(p.date)}
                activeOpacity={0.7}
              >
                <View style={s.rowText}>
                  <Text style={s.rowTitle}>{p.title}</Text>
                  <Text style={s.rowSub}>{p.subtitle}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            ))}

            {/* Custom row — only rendered when the native picker is
                actually present. If it's not installed, the three
                preset rows still cover the common cases and the row
                stays hidden so we don't promise an affordance we
                can't deliver. */}
            {DateTimePicker && (
              <TouchableOpacity
                style={s.row}
                onPress={() => setShowPicker(true)}
                activeOpacity={0.7}
              >
                <View style={s.rowText}>
                  <Text style={s.rowTitle}>Custom</Text>
                  <Text style={s.rowSub}>
                    {customDate ? formatFriendly(customDate) : 'Pick any date'}
                  </Text>
                </View>
                <MaterialCommunityIcons name="calendar" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Native picker — Android dismisses on confirm, iOS keeps the
              spinner visible until the rider taps Save. We treat both
              the same: any date emitted by the picker becomes the
              confirmed reschedule date. */}
          {showPicker && DateTimePicker && (
            <DateTimePicker
              value={customDate || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={new Date()}
              onChange={(event, selected) => {
                setShowPicker(Platform.OS === 'ios');
                if (event?.type === 'dismissed') return;
                if (selected) {
                  setCustomDate(selected);
                  // Android closes immediately — confirm right away.
                  // On iOS the spinner stays open and the rider taps
                  // "Save" below to commit.
                  if (Platform.OS !== 'ios') handlePick(selected);
                }
              }}
            />
          )}

          {Platform.OS === 'ios' && customDate && showPicker && (
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => { setShowPicker(false); handlePick(customDate); }}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>Save {formatFriendly(customDate)}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 6, paddingBottom: 24,
    borderTopWidth: 0.5, borderColor: colors.border,
  },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 6 },

  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12,
    borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
  },
  title: { fontSize: 17, fontWeight: '600', color: colors.text, fontFamily: FF.semibold, marginBottom: 4 },
  subtitle: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, lineHeight: 17 },

  list: { paddingHorizontal: 18, paddingTop: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '500', color: colors.text, fontFamily: FF.medium },
  rowSub: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, marginTop: 2 },

  primaryBtn: {
    backgroundColor: colors.primary, marginHorizontal: 18, marginTop: 16,
    paddingVertical: 13, borderRadius: 12, alignItems: 'center',
  },
  primaryBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', fontFamily: FF.semibold },

  cancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  cancelText: { fontSize: 13, color: colors.textMuted, fontFamily: FF.regular },
});
