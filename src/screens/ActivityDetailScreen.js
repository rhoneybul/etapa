/**
 * Activity detail screen — shows full info for a single activity.
 * Editable metrics (distance, duration, effort, day).
 * AI chat: ask questions or request changes to the session.
 * Changes cascade to adjust future activities proportionally.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { getPlans, getGoals, markActivityComplete, updateActivity, savePlan } from '../services/storageService';
import { editActivityWithAI } from '../services/llmPlanService';
import { getSessionColor, getSessionLabel, SESSION_COLORS, EFFORT_LABELS as EFFORT_GUIDE_LABELS } from '../utils/sessionLabels';
import analytics from '../services/analyticsService';

const FF = fontFamily;

const EFFORT_COLORS = SESSION_COLORS;
const ACTIVITY_BLUE = '#A0A8B4';

const EFFORT_LABELS = {
  easy:     'Easy \u2014 Zone 2',
  moderate: 'Moderate \u2014 Zone 3-4',
  hard:     'Hard \u2014 Zone 4-5',
  recovery: 'Recovery \u2014 Zone 1',
  max:      'All out \u2014 Zone 5+',
};

const EFFORT_LIST = ['easy', 'moderate', 'hard', 'recovery', 'max'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Ride tips generator ──────────────────────────────────────────────────────
function generateRideTips(activity) {
  const tips = [];
  const dur = activity.durationMins || 60;
  const effort = activity.effort || 'moderate';
  const subType = activity.subType || 'endurance';

  if (dur <= 45) {
    tips.push({ title: 'Hydration', text: 'A single bottle of water should be enough. Sip regularly rather than waiting until you feel thirsty.' });
  } else if (dur <= 90) {
    tips.push({ title: 'Hydration', text: 'Bring one full bottle (500\u2013750 ml). Aim for a few sips every 15 minutes. Add an electrolyte tab if it\'s warm.' });
  } else {
    tips.push({ title: 'Hydration', text: `For a ${dur}-minute ride, bring two bottles or plan a refill stop. Drink 500\u2013750 ml per hour and use electrolytes.` });
  }

  if (dur <= 60) {
    tips.push({ title: 'Fueling', text: 'You shouldn\'t need to eat during the ride. Make sure you\'ve had a light meal 1\u20132 hours beforehand.' });
  } else if (dur <= 120) {
    tips.push({ title: 'Fueling', text: 'Pack a banana or energy bar. Start eating around the 45-minute mark \u2014 aim for 30\u201360g of carbs per hour.' });
  } else {
    tips.push({ title: 'Fueling', text: `Long ride! Aim for 60\u201390g carbs per hour. Pack gels, bars, or real food. Start fueling early \u2014 don't wait until you feel depleted.` });
  }

  tips.push({ title: 'Before the ride', text: 'Do 5 minutes of dynamic stretching: leg swings, hip circles, and gentle squats. Skip static stretches \u2014 save those for after.' });

  if (effort === 'hard' || effort === 'max' || dur > 90) {
    tips.push({ title: 'After the ride', text: 'This is a tough session \u2014 spend 10\u201315 minutes stretching afterwards. Focus on quads, hamstrings, hip flexors, and lower back.' });
  } else {
    tips.push({ title: 'After the ride', text: 'Cool down with 5\u201310 minutes of gentle stretching. Hit your quads, hamstrings, and calves while they\'re still warm.' });
  }

  if (subType === 'intervals' || effort === 'hard' || effort === 'max') {
    tips.push({ title: 'Interval tip', text: 'Warm up for at least 10 minutes before hitting any hard efforts. Cool down with easy spinning afterwards.' });
  } else if (subType === 'endurance' || effort === 'easy') {
    tips.push({ title: 'Pacing tip', text: 'Keep it conversational \u2014 you should be able to talk in full sentences. If you can\'t, ease off.' });
  } else if (subType === 'recovery') {
    tips.push({ title: 'Recovery tip', text: 'Keep the effort genuinely easy \u2014 resist the temptation to push. Your legs are rebuilding from harder efforts.' });
  }

  return tips;
}

export default function ActivityDetailScreen({ navigation, route }) {
  const { activityId } = route.params;
  const [activity, setActivity] = useState(null);
  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({});
  const [showTips, setShowTips] = useState(false);

  // AI chat state
  const [chatText, setChatText] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatStatus, setChatStatus] = useState('');
  const [chatMessages, setChatMessages] = useState([]); // { role: 'user'|'coach', text: string }

  const scrollRef = useRef(null);

  const loadActivity = async () => {
    const plans = await getPlans();
    const goals = await getGoals();
    for (const p of plans) {
      const a = p.activities?.find(act => act.id === activityId);
      if (a) {
        setPlan(p);
        setActivity(a);
        setGoal(goals.find(g => g.id === p.goalId) || null);
        analytics.events.activityViewed({ activityType: a.type, subType: a.subType, effort: a.effort, week: a.week, completed: !!a.completed });
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
    if (activity && !activity.completed) {
      analytics.events.activityCompleted({ activityType: activity.type, subType: activity.subType, effort: activity.effort, week: activity.week, distanceKm: activity.distanceKm, durationMins: activity.durationMins });
    } else if (activity) {
      analytics.events.activityUncompleted({ activityType: activity.type, week: activity.week });
    }
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

    await updateActivity(activityId, {
      distanceKm: newDist,
      durationMins: newDur,
      effort: newEffort,
      dayOfWeek: newDay,
    });

    if (plan && (oldDist !== newDist || oldDur !== newDur)) {
      const distRatio = oldDist && newDist ? newDist / oldDist : 1;
      const durRatio = oldDur && newDur ? newDur / oldDur : 1;

      if (Math.abs(distRatio - 1) > 0.05 || Math.abs(durRatio - 1) > 0.05) {
        const updatedPlan = { ...plan, activities: plan.activities.map(a => {
          if (a.id === activityId) return a;
          if (a.week < activity.week) return a;
          if (a.week === activity.week && (a.dayOfWeek ?? 0) <= (activity.dayOfWeek ?? 0)) return a;
          if (a.type !== activity.type) return a;
          if (a.completed) return a;

          return {
            ...a,
            distanceKm: a.distanceKm ? Math.round(a.distanceKm * distRatio) : a.distanceKm,
            durationMins: a.durationMins ? Math.round(a.durationMins * durRatio) : a.durationMins,
          };
        })};

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

    const changedFields = [];
    if (parseFloat(editValues.distanceKm) !== activity.distanceKm) changedFields.push('distance');
    if (parseInt(editValues.durationMins) !== activity.durationMins) changedFields.push('duration');
    if (editValues.effort !== activity.effort) changedFields.push('effort');
    if (editValues.dayOfWeek !== (activity.dayOfWeek ?? 0)) changedFields.push('day');
    if (changedFields.length > 0) {
      analytics.events.activityEditedManual({ activityType: activity.type, week: activity.week, changedFields });
    }
    setIsEditing(false);
    await loadActivity();
  };

  // AI chat handler
  const handleChatSend = async () => {
    if (!chatText.trim() || chatLoading) return;
    const msg = chatText.trim();
    setChatText('');
    Keyboard.dismiss();

    setChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setChatLoading(true);

    try {
      const result = await editActivityWithAI(activity, goal, msg, setChatStatus);

      if (result.answer) {
        setChatMessages(prev => [...prev, { role: 'coach', text: result.answer }]);
      }

      if (result.updatedActivity) {
        analytics.events.activityEditedAI({ activityType: activity.type, subType: activity.subType, week: activity.week, hadChanges: true });
        // Apply the AI's changes to the activity
        const updates = {};
        if (result.updatedActivity.title) updates.title = result.updatedActivity.title;
        if (result.updatedActivity.description) updates.description = result.updatedActivity.description;
        if (result.updatedActivity.notes !== undefined) updates.notes = result.updatedActivity.notes;
        if (result.updatedActivity.durationMins) updates.durationMins = result.updatedActivity.durationMins;
        if (result.updatedActivity.distanceKm !== undefined) updates.distanceKm = result.updatedActivity.distanceKm;
        if (result.updatedActivity.effort) updates.effort = result.updatedActivity.effort;
        if (result.updatedActivity.subType !== undefined) updates.subType = result.updatedActivity.subType;

        await updateActivity(activityId, updates);
        await loadActivity();
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'coach', text: 'Sorry, something went wrong. Try again.' }]);
    }

    setChatLoading(false);
    setChatStatus('');

    // Scroll to bottom
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  if (!activity) return null;

  const isRide = activity.type === 'ride';
  const isStrength = activity.type === 'strength';
  const effortColor = ACTIVITY_BLUE;

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

        <ScrollView ref={scrollRef} style={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Title card */}
          <View style={s.titleCard}>
            <View style={[s.typeTag, { backgroundColor: effortColor + '20' }]}>
              <Text style={[s.typeTagText, { color: effortColor }]}>
                {isStrength ? 'strength' : (activity.subType || 'ride')}
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
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
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
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
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
                    <Text style={[s.metricValue, { color: ACTIVITY_BLUE }]}>
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
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
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
                  <Text style={s.tipsBtnText}>Show ride tips</Text>
                  <Text style={s.tipsBtnArrow}>{'\u203A'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.tipsCard}>
                  <View style={s.tipsHeader}>
                    <Text style={s.tipsTitle}>Ride tips</Text>
                    <TouchableOpacity onPress={() => setShowTips(false)} hitSlop={HIT}>
                      <Text style={s.tipsHide}>Hide</Text>
                    </TouchableOpacity>
                  </View>
                  {generateRideTips(activity).map((tip, idx) => (
                    <View key={idx} style={s.tipRow}>
                      <View style={s.tipDot} />
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

          {/* AI chat history */}
          {chatMessages.length > 0 && (
            <View style={s.chatHistory}>
              <Text style={s.chatHistoryTitle}>Coach chat</Text>
              {chatMessages.map((msg, idx) => (
                <View key={idx} style={[s.chatBubble, msg.role === 'user' ? s.chatBubbleUser : s.chatBubbleCoach]}>
                  <Text style={[s.chatBubbleText, msg.role === 'user' ? s.chatBubbleTextUser : s.chatBubbleTextCoach]}>
                    {msg.text}
                  </Text>
                </View>
              ))}
            </View>
          )}


          <View style={{ height: 80 }} />
        </ScrollView>

        {/* AI chat bar — always visible */}
        {!isEditing && (
          <View style={s.chatBar}>
            {chatStatus ? (
              <View style={s.chatStatusRow}>
                {chatLoading && <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />}
                <Text style={s.chatStatusText}>{chatStatus}</Text>
              </View>
            ) : null}
            <View style={s.chatInputRow}>
              <TextInput
                style={s.chatInput}
                value={chatText}
                onChangeText={setChatText}
                placeholder="Ask your coach anything..."
                placeholderTextColor={colors.textFaint}
                editable={!chatLoading}
                returnKeyType="send"
                onSubmitEditing={handleChatSend}
                multiline={false}
              />
              <TouchableOpacity
                style={[s.chatSendBtn, (!chatText.trim() || chatLoading) && s.chatSendBtnDisabled]}
                onPress={handleChatSend}
                disabled={!chatText.trim() || chatLoading}
              >
                <Text style={s.chatSendText}>{'\u2191'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Bottom action — mark complete */}
        {!activity.completed && isEditing && (
          <View style={s.bottomBar}>
            <TouchableOpacity style={s.completeBtn} onPress={handleComplete} activeOpacity={0.85}>
              <Text style={s.completeBtnText}>Mark as complete</Text>
            </TouchableOpacity>
          </View>
        )}
        </KeyboardAvoidingView>
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
  saveBtn: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: '#E8458B' },

  scroll: { flex: 1 },

  titleCard: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  typeTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 10 },
  typeTagText: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 22, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  completedBadge: { marginTop: 10, backgroundColor: 'rgba(232,69,139,0.12)', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  completedText: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: '#E8458B' },

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
  tipsBtnDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  tipsBtnText: { flex: 1, fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  tipsBtnArrow: { fontSize: 20, color: colors.primary, fontWeight: '300' },

  tipsCard: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.25)',
  },
  tipsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  tipsTitle: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  tipsHide: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },

  tipRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  tipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 7 },
  tipContent: { flex: 1 },
  tipTitle: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary, marginBottom: 3 },
  tipText: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 19 },

  notesCard: {
    backgroundColor: 'rgba(232,69,139,0.08)', marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.2)',
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

  // AI chat
  chatHistory: { marginHorizontal: 16, marginBottom: 12 },
  chatHistoryTitle: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  chatBubble: { borderRadius: 14, padding: 14, marginBottom: 8, maxWidth: '85%' },
  chatBubbleUser: { backgroundColor: colors.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  chatBubbleCoach: { backgroundColor: colors.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  chatBubbleText: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, lineHeight: 20 },
  chatBubbleTextUser: { color: '#fff' },
  chatBubbleTextCoach: { color: colors.textMid },

  chatBar: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  chatStatusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  chatStatusText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  chatInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  chatInput: {
    flex: 1, backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    color: colors.text, fontFamily: FF.regular, fontSize: 14,
    borderWidth: 1, borderColor: colors.border, maxHeight: 80,
  },
  chatSendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  chatSendBtnDisabled: { opacity: 0.3 },
  chatSendText: { fontSize: 18, color: '#fff', fontWeight: '700' },

  bottomBar: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8 },
  completeBtn: { backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
  completeBtnText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },

  // Add organised ride
  addOrgRideLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, marginHorizontal: 20, marginTop: 8,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  addOrgRideLinkPlus: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  addOrgRideLinkText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
});
