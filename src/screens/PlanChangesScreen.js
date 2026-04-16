/**
 * PlanChangesScreen — shows what changed after applying a "ways to level up" suggestion.
 * Displays a summary of added/modified activities and lets the user undo.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily, BOTTOM_INSET } from '../theme';
import { getPlan, savePlan, getUserPrefs } from '../services/storageService';
import { convertDistance, distanceLabel } from '../utils/units';

const FF = fontFamily;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function PlanChangesScreen({ navigation, route }) {
  const { planId, previousPlan, suggestionTitle } = route.params;
  const [plan, setPlan] = useState(null);
  const [units, setUnits] = useState('km');
  const [changes, setChanges] = useState({ added: [], modified: [], removed: [] });

  useEffect(() => {
    getUserPrefs().then(p => setUnits(p.units || 'km')).catch(() => {});
    getPlan(planId).then(p => {
      setPlan(p);
      if (p && previousPlan) {
        computeChanges(previousPlan, p);
      }
    });
  }, [planId]);

  const computeChanges = (before, after) => {
    const beforeIds = new Set((before.activities || []).map(a => a.id));
    const afterIds = new Set((after.activities || []).map(a => a.id));
    const afterMap = {};
    (after.activities || []).forEach(a => { afterMap[a.id] = a; });
    const beforeMap = {};
    (before.activities || []).forEach(a => { beforeMap[a.id] = a; });

    const added = (after.activities || []).filter(a => !beforeIds.has(a.id));
    const removed = (before.activities || []).filter(a => !afterIds.has(a.id));
    const modified = (after.activities || []).filter(a => {
      if (!beforeIds.has(a.id)) return false;
      const old = beforeMap[a.id];
      return old.durationMins !== a.durationMins
        || old.distanceKm !== a.distanceKm
        || old.title !== a.title
        || old.dayOfWeek !== a.dayOfWeek
        || old.effort !== a.effort;
    });

    setChanges({ added, modified, removed });
  };

  const handleUndo = async () => {
    if (previousPlan) {
      await savePlan(previousPlan);
    }
    navigation.goBack();
  };

  const handleKeep = () => {
    navigation.goBack();
  };

  const formatActivity = (a) => {
    const day = a.dayOfWeek !== undefined && a.dayOfWeek !== null ? DAY_NAMES[a.dayOfWeek] : '';
    const dist = a.distanceKm ? ` · ${convertDistance(a.distanceKm, units)} ${distanceLabel(units)}` : '';
    const dur = a.durationMins ? ` · ${a.durationMins} min` : '';
    return `Wk ${a.week} ${day} — ${a.title || a.type}${dist}${dur}`;
  };

  const totalChanges = changes.added.length + changes.modified.length + changes.removed.length;

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Plan Updated</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={s.heroCard}>
            <View style={s.heroCheck}>
              <Text style={s.heroCheckText}>{'\u2713'}</Text>
            </View>
            <Text style={s.heroTitle}>{suggestionTitle || 'Changes applied'}</Text>
            <Text style={s.heroSub}>
              {totalChanges === 0
                ? 'No visible changes were made.'
                : `${totalChanges} change${totalChanges !== 1 ? 's' : ''} made to your plan`}
            </Text>
          </View>

          {changes.added.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Added</Text>
              {changes.added.map((a, i) => (
                <View key={i} style={s.changeRow}>
                  <View style={[s.changeDot, { backgroundColor: '#E8458B' }]} />
                  <Text style={s.changeText}>{formatActivity(a)}</Text>
                </View>
              ))}
            </View>
          )}

          {changes.modified.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Modified</Text>
              {changes.modified.map((a, i) => (
                <View key={i} style={s.changeRow}>
                  <View style={[s.changeDot, { backgroundColor: colors.primary }]} />
                  <Text style={s.changeText}>{formatActivity(a)}</Text>
                </View>
              ))}
            </View>
          )}

          {changes.removed.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Removed</Text>
              {changes.removed.map((a, i) => (
                <View key={i} style={s.changeRow}>
                  <View style={[s.changeDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={s.changeText}>{formatActivity(a)}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={s.ctaWrap}>
          <View style={s.ctaRow}>
            <TouchableOpacity style={s.undoBtn} onPress={handleUndo} activeOpacity={0.8}>
              <Text style={s.undoBtnText}>Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.keepBtn} onPress={handleKeep} activeOpacity={0.8}>
              <Text style={s.keepBtnText}>Keep changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, textAlign: 'center' },

  heroCard: {
    alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20,
    marginHorizontal: 20, marginTop: 8, marginBottom: 20,
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  heroCheck: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 2, borderColor: '#22C55E',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  heroCheckText: { fontSize: 22, color: '#22C55E', fontWeight: '700' },
  heroTitle: { fontSize: 20, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 6, textAlign: 'center' },
  heroSub: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, textAlign: 'center' },

  section: {
    marginHorizontal: 20, marginBottom: 16,
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 },

  changeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  changeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  changeText: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, flex: 1, lineHeight: 20 },

  ctaWrap: { paddingHorizontal: 20, paddingBottom: 16 + BOTTOM_INSET, paddingTop: 8 },
  ctaRow: { flexDirection: 'row', gap: 10 },
  undoBtn: {
    backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  undoBtnText: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: '#EF4444' },
  keepBtn: {
    flex: 1, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  keepBtnText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
});
