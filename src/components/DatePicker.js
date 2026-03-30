/**
 * Inline calendar date picker — dark theme, no native dependencies.
 * Shows a month grid with navigation. Tap a day to select it.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fontFamily } from '../theme';

const FF = fontFamily;
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_HEADERS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function parseDate(str) {
  if (!str || typeof str !== 'string') return null;
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10) - 1;
  const d = parseInt(match[3], 10);
  const date = new Date(y, m, d);
  // Validate the date is real (e.g. not Feb 30)
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

export default function DatePicker({ value, onChange, minDate, label }) {
  const selected = parseDate(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const min = parseDate(minDate) || today;

  const initYear = selected ? selected.getFullYear() : today.getFullYear();
  const initMonth = selected ? selected.getMonth() : today.getMonth();

  const [viewYear, setViewYear] = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth);

  const days = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1; // Mon=0
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  const goMonth = (delta) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
  };

  const handleSelect = (day) => {
    const d = new Date(viewYear, viewMonth, day);
    if (d < min) return;
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(iso);
  };

  const isSelected = (day) => {
    if (!selected || !day) return false;
    return selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === day;
  };

  const isDisabled = (day) => {
    if (!day) return true;
    const d = new Date(viewYear, viewMonth, day);
    return d < min;
  };

  const isToday = (day) => {
    if (!day) return false;
    return today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
  };

  // Pad last row to 7 cells so grid is even
  const paddedDays = [...days];
  while (paddedDays.length % 7 !== 0) paddedDays.push(null);

  return (
    <View style={s.container}>
      {label ? <Text style={s.label}>{label}</Text> : null}

      {/* Month nav */}
      <View style={s.monthNav}>
        <TouchableOpacity onPress={() => goMonth(-1)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.navArrow}>{'\u2039'}</Text>
        </TouchableOpacity>
        <Text style={s.monthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={() => goMonth(1)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.navArrow}>{'\u203A'}</Text>
        </TouchableOpacity>
      </View>

      {/* Day headers */}
      <View style={s.row}>
        {DAY_HEADERS.map(d => (
          <View key={d} style={s.cell}>
            <Text style={s.dayHeader}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      {Array.from({ length: Math.ceil(paddedDays.length / 7) }, (_, week) => (
        <View key={week} style={s.row}>
          {paddedDays.slice(week * 7, week * 7 + 7).map((day, i) => {
            const disabled = isDisabled(day);
            const sel = isSelected(day);
            const tod = isToday(day);
            return (
              <TouchableOpacity
                key={i}
                style={[s.cell, sel && s.cellSelected, tod && !sel && s.cellToday]}
                onPress={() => day && !disabled && handleSelect(day)}
                disabled={!day || disabled}
                activeOpacity={0.7}
              >
                {day ? (
                  <Text style={[
                    s.dayText,
                    disabled && s.dayDisabled,
                    sel && s.daySelected,
                    tod && !sel && s.dayTodayText,
                  ]}>{day}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* Selected date display */}
      {selected ? (
        <View style={s.selectedRow}>
          <Text style={s.selectedText}>{formatNice(selected)}</Text>
          <TouchableOpacity onPress={() => onChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function formatNice(d) {
  if (!d || isNaN(d.getTime())) return '';
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const s = StyleSheet.create({
  container: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.border, marginBottom: 8,
  },
  label: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid, marginBottom: 10 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navArrow: { fontSize: 26, color: colors.text, fontWeight: '300', paddingHorizontal: 8 },
  monthTitle: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 38, borderRadius: 19 },
  cellSelected: { backgroundColor: colors.primary },
  cellToday: { borderWidth: 1, borderColor: colors.primary },
  dayHeader: { fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, textTransform: 'uppercase' },
  dayText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  dayDisabled: { color: colors.textFaint },
  daySelected: { color: '#fff', fontWeight: '600' },
  dayTodayText: { color: colors.primary },
  selectedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  selectedText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  clearText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },
});
