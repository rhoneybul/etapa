/**
 * RecurringRideSheet — bottom-sheet modal for adding or editing a "regular
 * ride" (club ride, weekly group session, fixed Friday spin etc.) on
 * PlanConfigScreen step 3.
 *
 * Replaces the previous inline expanding form which scrolled itself off-
 * screen as the keyboard appeared. The modal:
 *   • Keeps fields visible above the keyboard via KeyboardAvoidingView
 *   • Uses a sticky footer so the primary action (Add / Save) is always
 *     reachable
 *   • Supports both ADD and EDIT modes from one component (passing an
 *     `initialValue` toggles edit mode + delete affordance)
 *
 * Props:
 *   visible       boolean — show/hide the sheet
 *   initialValue  ride object (with id) for edit mode, null/undefined for add
 *   bikeOptions   string[] of cyclingTypes the user has configured. When
 *                 length > 1 a "Bike" chip row is shown so the rider can
 *                 tag the recurring ride with a specific bike. When length
 *                 ≤ 1, the row is hidden (no point asking).
 *   onSave(ride)  called with the new/updated ride. Parent diffs by id.
 *   onDelete(id)  called when the rider taps "Delete this ride" in edit mode
 *   onCancel()    called when the rider dismisses without saving
 *
 * Backwards compatible: existing rides only have day / durationMins /
 * distanceKm / elevationM / notes. The new bikeType field is optional and
 * defaults to null (= "rider's choice / matches plan default").
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView,
  KeyboardAvoidingView, Platform, Keyboard, Alert,
} from 'react-native';
import { colors, fontFamily } from '../theme';

const FF = fontFamily;

const DAYS = [
  { key: 'monday',    short: 'MON' },
  { key: 'tuesday',   short: 'TUE' },
  { key: 'wednesday', short: 'WED' },
  { key: 'thursday',  short: 'THU' },
  { key: 'friday',    short: 'FRI' },
  { key: 'saturday',  short: 'SAT' },
  { key: 'sunday',    short: 'SUN' },
];

const BIKE_LABELS = {
  road:   'Road',
  gravel: 'Gravel',
  mtb:    'MTB',
  ebike:  'E-bike',
  indoor: 'Indoor',
};

const EMPTY = { day: null, durationMins: '', distanceKm: '', elevationM: '', notes: '', bikeType: null };

export default function RecurringRideSheet({
  visible,
  initialValue,
  bikeOptions = [],
  onSave,
  onDelete,
  onCancel,
}) {
  const isEdit = !!initialValue;
  const [form, setForm] = useState(EMPTY);

  // Reset form when the sheet opens. Stringify numerics so they bind
  // cleanly to <TextInput value=...>; convert back to numbers on save.
  useEffect(() => {
    if (!visible) return;
    if (initialValue) {
      setForm({
        day: initialValue.day || null,
        durationMins: initialValue.durationMins != null ? String(initialValue.durationMins) : '',
        distanceKm: initialValue.distanceKm != null ? String(initialValue.distanceKm) : '',
        elevationM: initialValue.elevationM != null ? String(initialValue.elevationM) : '',
        notes: initialValue.notes || '',
        bikeType: initialValue.bikeType || null,
      });
    } else {
      setForm(EMPTY);
    }
  }, [visible, initialValue]);

  const handleSave = () => {
    if (!form.day) {
      Alert.alert('Pick a day', 'Choose which day of the week this ride happens.');
      return;
    }
    if (!form.durationMins && !form.distanceKm) {
      Alert.alert('Add details', 'Enter at least a duration or distance for this ride.');
      return;
    }
    Keyboard.dismiss();
    const ride = {
      id: initialValue?.id || Date.now().toString(36),
      day: form.day,
      durationMins: form.durationMins ? parseInt(form.durationMins, 10) : null,
      distanceKm: form.distanceKm ? parseFloat(form.distanceKm) : null,
      elevationM: form.elevationM ? parseInt(form.elevationM, 10) : null,
      notes: form.notes || '',
      bikeType: form.bikeType || null,
    };
    onSave?.(ride);
  };

  const handleDelete = () => {
    if (!initialValue?.id) return;
    Alert.alert(
      'Delete this ride?',
      'This will remove the ride from your weekly schedule.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Keyboard.dismiss();
            onDelete?.(initialValue.id);
          },
        },
      ],
    );
  };

  const handleCancel = () => {
    Keyboard.dismiss();
    onCancel?.();
  };

  const showBikeRow = Array.isArray(bikeOptions) && bikeOptions.length > 1;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <View style={s.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.kav}
        >
          <View style={s.sheet}>
            <View style={s.grab} />
            <View style={s.header}>
              <TouchableOpacity onPress={handleCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={s.headerCancel}>{'\u2715'}</Text>
              </TouchableOpacity>
              <Text style={s.headerTitle}>{isEdit ? 'Edit regular ride' : 'Add a regular ride'}</Text>
              <View style={{ width: 16 }} />
            </View>

            <ScrollView
              style={s.scroll}
              contentContainerStyle={s.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              <Text style={s.label}>Which day?</Text>
              <View style={s.dayRow}>
                {DAYS.map(d => {
                  const selected = form.day === d.key;
                  return (
                    <TouchableOpacity
                      key={d.key}
                      style={[s.dayPill, selected && s.dayPillSelected]}
                      onPress={() => setForm(f => ({ ...f, day: d.key }))}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.dayPillText, selected && s.dayPillTextSelected]}>
                        {d.short.slice(0, 1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.label}>How long?</Text>
              <View style={s.row2}>
                <View style={s.col}>
                  <Text style={s.subLabel}>Duration</Text>
                  <View style={s.inputWrap}>
                    <TextInput
                      style={s.input}
                      placeholder="e.g. 90"
                      placeholderTextColor={colors.textFaint}
                      keyboardType="numeric"
                      value={form.durationMins}
                      onChangeText={v => setForm(f => ({ ...f, durationMins: v }))}
                      returnKeyType="done"
                    />
                    <Text style={s.unit}>min</Text>
                  </View>
                </View>
                <View style={s.col}>
                  <Text style={s.subLabel}>Distance</Text>
                  <View style={s.inputWrap}>
                    <TextInput
                      style={s.input}
                      placeholder="e.g. 45"
                      placeholderTextColor={colors.textFaint}
                      keyboardType="numeric"
                      value={form.distanceKm}
                      onChangeText={v => setForm(f => ({ ...f, distanceKm: v }))}
                      returnKeyType="done"
                    />
                    <Text style={s.unit}>km</Text>
                  </View>
                </View>
              </View>

              <Text style={s.label}>Elevation (optional)</Text>
              <View style={s.inputWrap}>
                <TextInput
                  style={s.input}
                  placeholder="e.g. 500"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="numeric"
                  value={form.elevationM}
                  onChangeText={v => setForm(f => ({ ...f, elevationM: v }))}
                  returnKeyType="done"
                />
                <Text style={s.unit}>m</Text>
              </View>

              {showBikeRow && (
                <>
                  <Text style={s.label}>Bike</Text>
                  <View style={s.bikeRow}>
                    {bikeOptions.map(b => {
                      const selected = form.bikeType === b;
                      const label = BIKE_LABELS[b] || b;
                      return (
                        <TouchableOpacity
                          key={b}
                          style={[s.bikeChip, selected && s.bikeChipSelected]}
                          onPress={() => setForm(f => ({ ...f, bikeType: selected ? null : b }))}
                          activeOpacity={0.7}
                        >
                          <Text style={[s.bikeChipText, selected && s.bikeChipTextSelected]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={s.label}>Notes (optional)</Text>
              <TextInput
                style={[s.input, s.notesInput]}
                placeholder="e.g. Friday club ride with mates"
                placeholderTextColor={colors.textFaint}
                value={form.notes}
                onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                returnKeyType="done"
                multiline={false}
              />

              {isEdit && (
                <TouchableOpacity onPress={handleDelete} style={s.deleteRow} activeOpacity={0.7}>
                  <Text style={s.deleteText}>Delete this ride</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <View style={s.footer}>
              <TouchableOpacity style={s.primaryBtn} onPress={handleSave} activeOpacity={0.85}>
                <Text style={s.primaryBtnText}>{isEdit ? 'Save changes' : 'Add ride'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.ghostBtn} onPress={handleCancel} activeOpacity={0.7}>
                <Text style={s.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  kav: { width: '100%' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 0.5,
    borderColor: colors.border,
    maxHeight: '92%',
    paddingBottom: 4,
  },
  grab: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
  },
  headerCancel: { fontSize: 18, color: colors.textMid, fontFamily: FF.regular, width: 16 },
  headerTitle: { fontSize: 15, fontWeight: '600', color: colors.text, fontFamily: FF.semibold },

  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12 },

  label: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 10, marginTop: 4, fontFamily: FF.medium,
  },
  subLabel: {
    fontSize: 10, fontWeight: '500', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 6, fontFamily: FF.medium,
  },

  dayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  dayPill: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.surfaceLight,
    borderWidth: 0.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  dayPillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayPillText: { fontSize: 12, fontWeight: '600', color: colors.textMid, fontFamily: FF.semibold },
  dayPillTextSelected: { color: '#fff' },

  row2: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  col: { flex: 1 },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 0.5, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 12,
    marginBottom: 14,
  },
  input: {
    flex: 1, fontSize: 14, color: colors.text,
    paddingVertical: 12, fontFamily: FF.regular,
  },
  unit: { fontSize: 12, color: colors.textMuted, fontFamily: FF.regular, marginLeft: 6 },
  notesInput: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 0.5, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 12,
    marginBottom: 14,
  },

  bikeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  bikeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: colors.surfaceLight,
    borderWidth: 0.5, borderColor: colors.border,
  },
  bikeChipSelected: {
    backgroundColor: colors.primary + '22',
    borderColor: colors.primary,
  },
  bikeChipText: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular },
  bikeChipTextSelected: { color: colors.text, fontFamily: FF.semibold, fontWeight: '600' },

  deleteRow: { paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  deleteText: { fontSize: 13, color: '#F87171', fontFamily: FF.regular },

  footer: {
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 24,
    borderTopWidth: 0.5, borderTopColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    marginBottom: 8,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '600', color: '#fff', fontFamily: FF.semibold },
  ghostBtn: { paddingVertical: 12, alignItems: 'center' },
  ghostBtnText: { fontSize: 13, color: colors.textMid, fontFamily: FF.regular },
});
