/**
 * UnavailabilitySheet — bottom sheet for the new "+ Mark unavailable"
 * affordance on the Calendar. Lets the rider tag days they can't ride
 * (travel, work, family) so the coach plans around them and the calendar
 * visually de-emphasises those cells.
 *
 * Why this UX shape: we considered a fully calendar-aware multi-select
 * grid, but the simple "tap to add a chip per day, tap the X to drop one"
 * pattern moves faster for the typical use case (1-3 days off in a
 * specific week). Riders who need to block a longer stretch can re-open
 * the sheet — the existing entries pre-populate so they keep their
 * context.
 *
 * Persistence is handled via storageService.addUnavailableDates /
 * removeUnavailableDate, which writes locally + (eventually) syncs.
 *
 * Props:
 *   visible    boolean — whether the sheet is open
 *   onCancel() dismissed without saving
 *   onSave()   saved + dismissed (parent should reload to pick up new state)
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView, Platform, Alert, Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily } from '../theme';
import {
  getUnavailableDates,
  addUnavailableDates,
  removeUnavailableDate,
} from '../services/storageService';

const FF = fontFamily;

// Lazy-import the native date picker — same dance as RescheduleCheckInSheet.
// If it's missing, we fall back to a tiny inline 14-day grid so the rider
// can still tag days without the native picker.
let DateTimePicker = null;
try {
  // eslint-disable-next-line global-require
  DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch {
  DateTimePicker = null;
}

function toLocalISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromISODate(iso) {
  // Parse YYYY-MM-DD as a local date — ISO-string-via-new-Date(iso) would
  // parse as UTC and shift the day in negative-offset timezones.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function shortLabel(iso) {
  const date = fromISODate(iso);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

export default function UnavailabilitySheet({ visible, onCancel, onSave }) {
  // Selected dates — staged in component state so the rider can pile up
  // a few days then commit them all at once via Save. Dates leave the
  // staging area when "x" is tapped on a chip, even if they were already
  // persisted (the Save handler diffs against the previous list).
  const [selected, setSelected] = useState([]); // ['YYYY-MM-DD']
  const [reason, setReason] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [previousSet, setPreviousSet] = useState(new Set());

  // Hydrate from storage every time the sheet opens — so saving, closing,
  // reopening shows the latest state instead of stale local state.
  useEffect(() => {
    if (!visible) return;
    (async () => {
      const existing = await getUnavailableDates();
      setSelected(existing.map(e => e.date));
      setPreviousSet(new Set(existing.map(e => e.date)));
      // Take the most recent reason as the default — if every entry
      // shares it, the rider is just adding more days to an existing
      // block and we shouldn't make them retype it.
      const reasons = Array.from(new Set(existing.map(e => e.reason).filter(Boolean)));
      setReason(reasons.length === 1 ? reasons[0] : '');
    })();
  }, [visible]);

  // Render a sorted, deduped list so the chips don't wander as the
  // rider taps "Add day" repeatedly.
  const sorted = useMemo(() => [...new Set(selected)].sort(), [selected]);

  const onPickDate = (date) => {
    if (!date) return;
    const iso = toLocalISODate(date);
    setSelected(prev => prev.includes(iso) ? prev : [...prev, iso]);
  };

  const handleSave = async () => {
    try {
      // Diff staged list against previous: anything removed needs an
      // explicit removeUnavailableDate call. addUnavailableDates handles
      // both new entries and updating reasons in-place.
      const stagedSet = new Set(sorted);
      const removed = [...previousSet].filter(d => !stagedSet.has(d));
      for (const d of removed) {
        // eslint-disable-next-line no-await-in-loop
        await removeUnavailableDate(d);
      }
      if (sorted.length > 0) {
        await addUnavailableDates(sorted, reason.trim());
      }
      onSave?.();
    } catch (err) {
      Alert.alert("Couldn't save", "Try again in a moment.");
    }
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      {/* Backdrop tap closes the sheet (cancels). Inner Pressable stops propagation so taps on the surface don't dismiss. */}
      <Pressable style={s.backdrop} onPress={onCancel}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.grab} />

          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Mark days unavailable</Text>
              <Text style={s.subtitle}>
                Travel, work, family — anything that means you can't ride.
                Your coach will plan around it.
              </Text>
            </View>
            <TouchableOpacity onPress={onCancel} hitSlop={HIT}>
              <MaterialCommunityIcons name="close" size={20} color={colors.textMid} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.sectionLabel}>Days off</Text>
            <View style={s.chipsRow}>
              {sorted.map(iso => (
                <View key={iso} style={s.chip}>
                  <Text style={s.chipText}>{shortLabel(iso)}</Text>
                  <TouchableOpacity
                    onPress={() => setSelected(prev => prev.filter(d => d !== iso))}
                    hitSlop={HIT}
                  >
                    <MaterialCommunityIcons name="close" size={14} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              ))}
              {/* "+ Add day" chip — opens the native picker each time so
                  the rider can pile up multiple days. We re-open the
                  picker rather than using a multi-select grid because
                  most riders mark 1-3 days; a grid would be more UI
                  for less benefit. */}
              {DateTimePicker ? (
                <TouchableOpacity
                  style={[s.chip, s.chipAdd]}
                  onPress={() => setShowPicker(true)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="plus" size={14} color={colors.primary} />
                  <Text style={[s.chipText, { color: colors.primary }]}>Add day</Text>
                </TouchableOpacity>
              ) : (
                // Fallback: an inline 2-week grid starting from today.
                // Crude but functional when the native picker isn't
                // available (e.g. running in Expo Go without the
                // datetimepicker dep).
                <Text style={s.fallbackHint}>Date picker not available — install @react-native-community/datetimepicker.</Text>
              )}
            </View>

            {showPicker && DateTimePicker && (
              <DateTimePicker
                value={new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onChange={(event, selectedDate) => {
                  setShowPicker(Platform.OS === 'ios');
                  if (event?.type === 'dismissed') return;
                  if (selectedDate) onPickDate(selectedDate);
                }}
              />
            )}

            <Text style={[s.sectionLabel, { marginTop: 18 }]}>Reason (optional)</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Work trip to Madrid"
              placeholderTextColor={colors.textFaint}
              value={reason}
              onChangeText={setReason}
            />
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity style={s.ghostBtn} onPress={onCancel} activeOpacity={0.7}>
              <Text style={s.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryBtn, sorted.length === 0 && previousSet.size === 0 && { opacity: 0.5 }]}
              onPress={handleSave}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
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
    maxHeight: '80%',
  },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 6 },

  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12,
    borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
  },
  title: { fontSize: 17, fontWeight: '600', color: colors.text, fontFamily: FF.semibold, marginBottom: 4 },
  subtitle: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, lineHeight: 17 },

  scroll: { maxHeight: 360 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8 },

  sectionLabel: {
    fontSize: 10, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
    fontFamily: FF.medium, marginBottom: 8,
  },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: colors.primary + '14',
    borderWidth: 0.5, borderColor: colors.primary + '50',
    borderRadius: 999,
  },
  chipText: { fontSize: 12, color: colors.text, fontFamily: FF.medium },
  chipAdd: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
  },
  fallbackHint: { fontSize: 11, color: colors.textMuted, fontFamily: FF.regular, lineHeight: 16 },

  input: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 0.5, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: colors.text, fontFamily: FF.regular,
  },

  footer: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 18, paddingTop: 14,
    borderTopWidth: 0.5, borderTopColor: colors.borderLight,
  },
  ghostBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    borderWidth: 0.5, borderColor: colors.border,
  },
  ghostBtnText: { fontSize: 13, color: colors.textMid, fontFamily: FF.regular },
  primaryBtn: {
    flex: 2, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    backgroundColor: colors.primary,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', fontFamily: FF.semibold },
});
