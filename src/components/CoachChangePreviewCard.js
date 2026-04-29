/**
 * CoachChangePreviewCard — inline card the coach drops into the chat
 * when it's about to make a structured set of plan changes (mockup 5A).
 *
 * Why this exists: the existing coach chat surfaces a single "Apply
 * changes / Dismiss" bar at the bottom of the chat when a `plan_update`
 * fence comes back. That's fine for "I tweaked your week" replies, but
 * doesn't communicate WHAT specifically the coach is about to do — the
 * rider has to apply blind, then check the calendar.
 *
 * This card renders the structured intent inline with the chat bubble
 * itself: a pink "I'LL ADD THESE CHANGES" eyebrow, then a list of
 * concrete operations with iconography (+ adds in green, → moves and
 * − removes in grey), then two CTAs: "See on calendar ↗" jumps to the
 * Calendar in review mode (the existing pendingChanges flow), and
 * "Apply" commits the changes via whatever mechanism the parent supplies.
 *
 * Props:
 *   adds:    [{ title, when, detail }]  — "I'll add this"
 *   moves:   [{ title, from, to }]      — "I'll move this from X to Y"
 *   removes: [{ title, reason }]        — "I'll drop this because…"
 *   onSeeOnCalendar()  navigates to Calendar with pendingChanges
 *   onApply()          commits the change set
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily } from '../theme';

const FF = fontFamily;

function Row({ icon, iconColor, title, sub }) {
  return (
    <View style={s.row}>
      <View style={[s.rowIcon, { backgroundColor: iconColor + '22' }]}>
        <Text style={[s.rowIconText, { color: iconColor }]}>{icon}</Text>
      </View>
      <View style={s.rowText}>
        <Text style={s.rowTitle} numberOfLines={2}>{title}</Text>
        {sub ? <Text style={s.rowSub} numberOfLines={2}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export default function CoachChangePreviewCard({
  adds = [], moves = [], removes = [], onSeeOnCalendar, onApply,
}) {
  const total = (adds?.length || 0) + (moves?.length || 0) + (removes?.length || 0);
  if (total === 0) return null;

  return (
    <View style={s.card}>
      <Text style={s.eyebrow}>I'LL ADD THESE CHANGES</Text>

      <View style={s.list}>
        {/* + Adds: green so the rider's eye lands on "new things" first.
            Each row's `when` (e.g. "Wed 7 May") sits as the subtitle so
            the change reads as a sentence on a single line. */}
        {adds.map((a, i) => (
          <Row
            key={`add-${i}`}
            icon="+"
            iconColor="#22C55E"
            title={a.title}
            sub={[a.when, a.detail].filter(Boolean).join(' · ')}
          />
        ))}
        {/* → Moves: grey so they don't compete with adds. The from→to is
            a concrete preview of where the session is going to live. */}
        {moves.map((m, i) => (
          <Row
            key={`move-${i}`}
            icon="→"
            iconColor={colors.textMid}
            title={m.title}
            sub={[m.from, m.to].filter(Boolean).join(' → ')}
          />
        ))}
        {/* − Removes: also grey, with the reason as subtitle so the
            rider sees WHY (e.g. "freeing up Wednesday for the group
            ride"). Reason is optional — a bare "−" + title still reads. */}
        {removes.map((r, i) => (
          <Row
            key={`rm-${i}`}
            icon={'\u2212'}
            iconColor={colors.textMid}
            title={r.title}
            sub={r.reason || null}
          />
        ))}
      </View>

      <View style={s.btnRow}>
        <TouchableOpacity
          style={s.ghostBtn}
          onPress={onSeeOnCalendar}
          activeOpacity={0.7}
        >
          <Text style={s.ghostBtnText}>See on calendar</Text>
          <MaterialCommunityIcons name="arrow-top-right" size={14} color={colors.textMid} />
        </TouchableOpacity>
        <TouchableOpacity
          style={s.primaryBtn}
          onPress={onApply}
          activeOpacity={0.85}
        >
          <Text style={s.primaryBtnText}>Apply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginTop: 8, marginBottom: 4,
    backgroundColor: colors.primary + '14',
    borderWidth: 0.5, borderColor: colors.primary + '50',
    borderRadius: 14,
    padding: 14,
  },
  eyebrow: {
    fontSize: 10, fontWeight: '700', color: colors.primary,
    fontFamily: FF.semibold, letterSpacing: 0.8, marginBottom: 10,
  },
  list: { gap: 0 },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowIcon: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  rowIconText: { fontSize: 13, fontWeight: '700', fontFamily: FF.semibold, lineHeight: 14 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 13, fontWeight: '500', color: colors.text, fontFamily: FF.medium, lineHeight: 18 },
  rowSub: { fontSize: 11, color: colors.textMid, fontFamily: FF.regular, marginTop: 2, lineHeight: 15 },

  btnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  ghostBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10,
    borderWidth: 0.5, borderColor: colors.border,
  },
  ghostBtnText: { fontSize: 12, color: colors.textMid, fontFamily: FF.medium, fontWeight: '500' },
  primaryBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', fontFamily: FF.semibold },
});
