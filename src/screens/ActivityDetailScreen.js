/**
 * Activity detail screen — shows full info for a single activity.
 * Editable metrics (distance, duration, effort, day).
 * Changes cascade to adjust future activities proportionally.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { getPlans, markActivityComplete, updateActivity, savePlan } from '../services/storageService';

const FF = fontFamily;

const EFFORT_COLORS = {
  easy:     '#22C55E',
  moderate: '#F59E0B',
  hard:     '#EF4444',
  recovery: '#60A5FA',
  max:      '#DC2626',
};

const EFFORT_LABELS = {
  easy:     'Easy — Zone 2',
  moderate: 'Moderate — Zone 3-4',
  hard:     'Hard — Zone 4-5',
  recovery: 'Recovery — Zone 1',
  max:      'All out — Zone 5+',
};

const EFFORT_LIST = ['easy', 'moderate', 'hard', 'recovery', 'max'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Ride tips generator ──────────────────────────────────────────────────────
function generateRideTips(activity) {
  const tips = [];
  const dur = activity.durationMins || 60;
  const dist = activity.distanceKm || 0;
  const effort = activity.effort || 'moderate';
  const subType = activity.subType || 'endurance';

  // Hydration
  if (dur <= 45) {
    tips.push({ icon: '\uD83D\uDCA7', title: 'Hydration', text: 'A single bottle of water should be enough for this session. Sip regularly rather than waiting until you feel thirsty.' });
  } else if (dur <= 90) {
    tips.push({ icon: '\uD83D\uDCA7', title: 'Hydration', text: 'Bring one full bottle (500\u2013750 ml). Aim for a few sips every 15 minutes. Add an electrolyte tab if it\'s warm out.' });
  } else {
    tips.push({ icon: '\uD83D\uDCA7', title: 'Hydration', text: `For a ${dur}-minute ride, bring two bottles or plan a refill stop. Drink 500\u2013750 ml per hour and use electrolytes to replace what you lose through sweat.` });
  }

  // Fueling
  if (dur <= 60) {
    tips.push({ icon: '\uD83C\uDF4C', title: 'Fueling', text: 'You shouldn\'t need to eat during the ride. Make sure you\'ve had a light meal 1\u20132 hours beforehand.' });
  } else if (dur <= 120) {
    tips.push({ icon: '\uD83C\uDF4C', title: 'Fueling', text: 'Pack a banana or energy bar. Start eating around the 45-minute mark \u2014 aim for 30\u201360g of carbs per hour to keep your energy steady.' });
  } else {
    tips.push({ icon: '\uD83C\uDF4C', title: 'Fueling', text: `Long ride! Aim for 60\u201390g carbs per hour. Pack gels, bars, or real food like rice cakes. Start fueling early \u2014 don't wait until you feel depleted.` });
  }

  // Pre-ride stretching
  tips.push({ icon: '\uD83E\uDDD8', title: 'Before the ride', text: 'Do 5 minutes of dynamic stretching: leg swings, hip circles, and gentle squats. Skip static stretches \u2014 save those for after.' });

  // Post-ride stretching
  if (effort === 'hard' || effort === 'max' || dur > 90) {
    tips.push({ icon: '\uD83E\uDD38', title: 'After the ride', text: 'This is a tough session \u2014 spend 10\u201315 minutes stretching afterwards. Focus on quads, hamstrings, hip flexors, and lower back. Foam rolling helps too.' });
  } else {
    tips.push({ icon: '\uD83E\uDD38', title: 'After the ride', text: 'Cool down with 5\u201310 minutes of gentle stretching. Hit your quads, hamstrings, and calves while they\'re still warm.' });
  }

  // Effort-specific tip
  if (subType === 'intervals' || effort === 'hard' || effort === 'max') {
    tips.push({ icon: '\u26A1', title: 'Interval tip', text: 'Warm up for at least 10 minutes before hitting any hard efforts. Your body needs time to shift into high gear. Cool down with easy spinning afterwards.' });
  } else if (subType === 'endurance' || effort === 'easy') {
    tips.push({ icon: '\uD83D\uDCAC', title: 'Pacing tip', text: 'Keep it conversational \u2014 you should be able to talk in full sentences. If you can\'t, ease off. Building your aerobic base is about consistency, not speed.' });
  } else if (subType === 'recovery') {
    tips.push({ icon: '\uD83D\uDCA4', title: 'Recovery tip', text: 'This is an active recovery session. Keep the effort genuinely easy \u2014 resist the temptation to push. Your legs are rebuilding from harder efforts.' });
  }

  return tips;
}

export default function ActivityDetailScreen({ navigation, route }) {
  const { activityId } = route.params;
  const [activity, setActivity] = useState(null);
  const [plan, setPlan] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({});
  const [showTips, setShowTips] = useState(false);

  const loadActivity = async () => {
    const plans = await getPlans();
    for (const p of plans) {
      const a = p.activities?.find(act => act.id === activityId);
      if (a) {
        setPlan(p);
        setActivity(a);
        setEditValues({
          distanceKm: a.distanceKm?.toString() || '',
          durationMins: a.durationMins?.toString() || '',
          effort: a.effort || 'moderate',
          dayOfWeek: a.dayOfWeek ?? 0,
        });
        return;
      }
    }
  };

  useEffect(() => { loadActivity(); }, [activityId]);

  const handleComplete = async () => {
    await markActivityComplete(activityId);
    await loadActivity();
  };

  const handleSaveEdits = async () => {
    const newDist = parseFloat(editValues.distanceKm) || null;
    const newDur = parseInt(editValues.durationMins) || null;
    const newEffort = editValues.effort;
    const newDay = editValues.dayOfWeek;

    const oldDist = activity.distanceKm;
    const oldDur = activity.durationMins;

    // Update this activity
    await updateActivity(activityId, {
      distanceKm: newDist,
      durationMins: newDur,
      effort: newEffort,
      dayOfWeek: newDay,
    });

    // Cascade: adjust future activities of the same type proportionally
    if (plan && (oldDist !== newDist || oldDur !== newDur)) {
      const distRatio = oldDist && newDist ? newDist / oldDist : 1;
      const durRatio = oldDur && newDur ? newDur / oldDur : 1;

      // Only cascade if the change is meaningful (> 5%)
      if (Math.abs(distRatio - 1) > 0.05 || Math.abs(durRatio - 1) > 0.05) {
        const updatedPlan = { ...plan, activities: plan.activities.map(a => {
          // Only adjust future activities of the same type
          if (a.id === activityId) return a; // already updated
          if (a.week < activity.week) return a; // past
          if (a.week === activity.week && (a.dayOfWeek ?? 0) <= (activity.dayOfWeek ?? 0)) return a;
          if (a.type !== activity.type) return a;
          if (a.completed) return a;

          return {
            ...a,
            distanceKm: a.distanceKm ? Math.round(a.distanceKm * distRatio) : a.distanceKm,
            durationMins: a.durationMins ? Math.round(a.durationMins * durRatio) : a.durationMins,
          };
        })};

        // Re-apply the direct edit to this activity
        const idx = updatedPlan.activities.findIndex(a => a.id === activityId);
        if (idx >= 0) {
          updatedPlan.activities[idx] = {
            ...updatedPlan.activities[idx],
            distanceKm: newDist,
            durationMins: newDur,
            effort: newEffort,
            dayOfWeek: newDay,
          };
        }

        await savePlan(updatedPlan);
      }
    }

    setIsEditing(false);
    await loadActivity();
  };

  if (!activity) return null;

  const isRide = activity.type === 'ride';
  const isStrength = activity.type === 'strength';
  const effortColor = EFFORT_COLORS[activity.effort] || colors.primary;

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Activity</Text>
          {!isEditing ? (
            <TouchableOpacity onPress={() => setIsEditing(true)} hitSlop={HIT}>
              <Text style={s.editBtn}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleSaveEdits} hitSlop={HIT}>
              <Text style={s.saveBtn}>Save</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Title card */}
          <View style={s.titleCard}>
            <View style={[s.typeTag, { backgroundColor: effortColor + '20' }]}>
              <Text style={[s.typeTagText, { color: effortColor }]}>
                {isRide ? (activity.subType || 'ride') : activity.type}
              </Text>
            </View>
            <Text style={s.title}>{activity.title}</Text>
            {activity.completed && (
              <View style={s.completedBadge}>
                <Text style={s.completedText}>{'\u2713'} Completed</Text>
              </View>
            )}
          </View>

          {/* Metrics — editable */}
          {isRide && (
            <View style={s.metricsCard}>
              {isEditing ? (
                <>
                  <View style={s.metric}>
                    <Text style={s.metricLabel}>DISTANCE</Text>
                    <TextInput
                      style={s.metricInput}
                      value={editValues.distanceKm}
                      onChangeText={v => setEditValues(prev => ({ ...prev, distanceKm: v }))}
                      keyboardType="numeric"
                      placeholder="km"
                      placeholderTextColor={colors.textFaint}
                    />
                    <Text style={s.metricUnit}>km</Text>
                  </View>
                  <View style={s.metric}>
                    <Text style={s.metricLabel}>DURATION</Text>
                    <TextInput
                      style={s.metricInput}
                      value={editValues.durationMins}
                      onChangeText={v => setEditValues(prev => ({ ...prev, durationMins: v }))}
                      keyboardType="numeric"
                      placeholder="min"
                      placeholderTextColor={colors.textFaint}
                    />
                    <Text style={s.metricUnit}>min</Text>
                  </View>
                </>
              ) : (
                <>
                  {activity.distanceKm != null && (
                    <View style={s.metric}>
                      <Text style={s.metricLabel}>DISTANCE</Text>
                      <Text style={s.metricValue}>{activity.distanceKm} km</Text>
                    </View>
                  )}
                  {activity.durationMins != null && (
                    <View style={s.metric}>
                      <Text style={s.metricLabel}>DURATION</Text>
                      <Text style={s.metricValue}>{activity.durationMins} min</Text>
                    </View>
                  )}
                </>
              )}
              <View style={s.metric}>
                <Text style={s.metricLabel}>EFFORT</Text>
                {isEditing ? (
                  <TouchableOpacity onPress={() => {
                    const idx = EFFORT_LIST.indexOf(editValues.effort);
                    const next = EFFORT_LIST[(idx + 1) % EFFORT_LIST.length];
                    setEditValues(prev => ({ ...prev, effort: next }));
                  }}>
                    <Text style={[s.metricValue, { color: EFFORT_COLORS[editValues.effort] || colors.primary }]}>
                      {editValues.effort} {'\u25BE'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[s.metricValue, { color: effortColor }]}>{activity.effort}</Text>
                )}
              </View>
            </View>
          )}

          {/* Strength duration */}
          {isStrength && (
            <View style={s.metricsCard}>
              <View style={s.metric}>
                <Text style={s.metricLabel}>DURATION</Text>
                {isEditing ? (
                  <View>
                    <TextInput
                      style={s.metricInput}
                      value={editValues.durationMins}
                      onChangeText={v => setEditValues(prev => ({ ...prev, durationMins: v }))}
                      keyboardType="numeric"
                      placeholderTextColor={colors.textFaint}
                    />
                    <Text style={s.metricUnit}>min</Text>
                  </View>
                ) : (
                  <Text style={s.metricValue}>{activity.durationMins} min</Text>
                )}
              </View>
              <View style={s.metric}>
                <Text style={s.metricLabel}>INTENSITY</Text>
                <Text style={[s.metricValue, { color: effortColor }]}>{activity.effort}</Text>
              </View>
            </View>
          )}

          {/* Day selector in edit mode */}
          {isEditing && (
            <View style={s.daySelectorCard}>
              <Text style={s.daySelectorLabel}>DAY</Text>
              <View style={s.daySelectorRow}>
                {DAY_NAMES.map((name, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.dayPill, editValues.dayOfWeek === i && s.dayPillActive]}
                    onPress={() => setEditValues(prev => ({ ...prev, dayOfWeek: i }))}
                  >
                    <Text style={[s.dayPillText, editValues.dayOfWeek === i && s.dayPillTextActive]}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Cascade notice */}
          {isEditing && (
            <View style={s.cascadeNotice}>
              <Text style={s.cascadeText}>Changes to distance or duration will proportionally adjust all future sessions of this type</Text>
            </View>
          )}

          {/* Effort guide */}
          {!isEditing && activity.effort && EFFORT_LABELS[activity.effort] && (
            <View style={s.effortGuide}>
              <View style={[s.effortDot, { backgroundColor: effortColor }]} />
              <Text style={s.effortGuideText}>{EFFORT_LABELS[activity.effort]}</Text>
            </View>
          )}

          {/* Description */}
          <View style={s.descCard}>
            <Text style={s.descTitle}>What to do</Text>
            <Text style={s.descBody}>{activity.description}</Text>
          </View>

          {/* Tips — rides only */}
          {isRide && !isEditing && (
            <>
              {!showTips ? (
                <TouchableOpacity
                  style={s.tipsBtn}
                  onPress={() => setShowTips(true)}
                  activeOpacity={0.8}
                >
                  <Text style={s.tipsBtnIcon}>{'\uD83D\uDCA1'}</Text>
                  <Text style={s.tipsBtnText}>Show ride tips</Text>
                  <Text style={s.tipsBtnArrow}>{'\u203A'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.tipsCard}>
                  <View style={s.tipsHeader}>
                    <Text style={s.tipsTitle}>{'\uD83D\uDCA1'} Ride tips</Text>
                    <TouchableOpacity onPress={() => setShowTips(false)} hitSlop={HIT}>
                      <Text style={s.tipsHide}>Hide</Text>
                    </TouchableOpacity>
                  </View>
                  {generateRideTips(activity).map((tip, idx) => (
                    <View key={idx} style={s.tipRow}>
                      <Text style={s.tipIcon}>{tip.icon}</Text>
                      <View style={s.tipContent}>
                        <Text style={s.tipTitle}>{tip.title}</Text>
                        <Text style={s.tipText}>{tip.text}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Notes */}
          {activity.notes && (
            <View style={s.notesCard}>
              <Text style={s.notesTitle}>Notes</Text>
              <Text style={s.notesBody}>{activity.notes}</Text>
            </View>
          )}

          {/* Strava link */}
          {activity.stravaActivityId && (
            <View style={s.stravaCard}>
              <Text style={s.stravaLabel}>Strava Activity</Text>
              <Text style={s.stravaId}>#{activity.stravaActivityId}</Text>
              {activity.stravaData && (
                <Text style={s.stravaMeta}>
                  {activity.stravaData.distance ? `${(activity.stravaData.distance / 1000).toFixed(1)} km` : ''}
                  {activity.stravaData.time ? ` \u00B7 ${Math.round(activity.stravaData.time / 60)} min` : ''}
                </Text>
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Bottom action */}
        {!activity.completed && !isEditing && (
          <View style={s.bottomBar}>
            <TouchableOpacity style={s.completeBtn} onPress={handleComplete} activeOpacity={0.85}>
              <Text style={s.completeBtnText}>Mark as complete</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, textAlign: 'center' },
  editBtn: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  saveBtn: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: '#22C55E' },

  scroll: { flex: 1 },

  titleCard: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  typeTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 10 },
  typeTagText: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 22, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  completedBadge: { marginTop: 10, backgroundColor: 'rgba(34,197,94,0.12)', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  completedText: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: '#22C55E' },

  metricsCard: {
    flexDirection: 'row', backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border,
  },
  metric: { flex: 1, padding: 16, alignItems: 'center', borderRightWidth: 0.5, borderRightColor: colors.border },
  metricLabel: { fontSize: 10, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  metricValue: { fontSize: 18, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  metricInput: {
    fontSize: 18, fontWeight: '500', fontFamily: FF.medium, color: colors.text,
    textAlign: 'center', borderBottomWidth: 1, borderBottomColor: colors.primary,
    paddingVertical: 2, minWidth: 40,
  },
  metricUnit: { fontSize: 10, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 2, textAlign: 'center' },

  // Day selector
  daySelectorCard: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  daySelectorLabel: { fontSize: 10, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  daySelectorRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surfaceLight },
  dayPillActive: { backgroundColor: colors.primary },
  dayPillText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },
  dayPillTextActive: { color: '#fff' },

  // Cascade notice
  cascadeNotice: { marginHorizontal: 20, marginBottom: 12 },
  cascadeText: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, fontStyle: 'italic' },

  effortGuide: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, marginBottom: 12 },
  effortDot: { width: 8, height: 8, borderRadius: 4 },
  effortGuideText: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid },

  descCard: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  descTitle: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 8 },
  descBody: { fontSize: 15, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 22 },

  // Tips
  tipsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  tipsBtnIcon: { fontSize: 18 },
  tipsBtnText: { flex: 1, fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  tipsBtnArrow: { fontSize: 20, color: colors.primary, fontWeight: '300' },

  tipsCard: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.25)',
  },
  tipsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  tipsTitle: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  tipsHide: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },

  tipRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  tipIcon: { fontSize: 18, width: 26, textAlign: 'center', marginTop: 1 },
  tipContent: { flex: 1 },
  tipTitle: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary, marginBottom: 3 },
  tipText: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 19 },

  notesCard: {
    backgroundColor: 'rgba(217,119,6,0.08)', marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.2)',
  },
  notesTitle: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary, marginBottom: 6 },
  notesBody: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 20 },

  stravaCard: {
    backgroundColor: 'rgba(249,115,22,0.08)', marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(249,115,22,0.2)',
  },
  stravaLabel: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, color: '#FB923C', marginBottom: 4 },
  stravaId: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  stravaMeta: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, marginTop: 4 },

  bottomBar: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8 },
  completeBtn: { backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
  completeBtnText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
});
