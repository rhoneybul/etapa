/**
 * CheckInScreen — the weekly coach check-in questionnaire.
 *
 * Two-phase flow on one screen:
 *
 *   Phase 1: questionnaire form
 *     - Sessions you did (multi-select from this week's plan)
 *     - Per-session comment (optional, free text)
 *     - Modifications you'd like (free text)
 *     - Anything coming up next week (free text)
 *     - Injuries — yes/no, then a description + "I'll see a physio"
 *
 *   Phase 2: AI suggestions review
 *     - Summary card from the coach
 *     - Per-change row with Apply / Skip
 *     - Physio recommendation banner if injury was reported
 *     - Done button → home
 *
 * Strict guardrail (server-side too): the coach never gives medical
 * advice. Injuries always recommend physio. The screen surfaces that
 * recommendation prominently when the rider reports one.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { api } from '../services/api';
import { getPlans, updateActivity } from '../services/storageService';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const FF = fontFamily;

export default function CheckInScreen({ navigation, route }) {
  const checkinId = route.params?.checkinId;
  const [phase, setPhase] = useState('loading'); // loading | form | submitting | review | error

  const [checkin, setCheckin] = useState(null);
  const [thisWeekActs, setThisWeekActs] = useState([]);

  // Form state
  const [sessionsDone, setSessionsDone] = useState({}); // { [activityId]: true }
  const [sessionComments, setSessionComments] = useState({}); // { [activityId]: 'note' }
  const [modifications, setModifications] = useState('');
  const [lifeEvents, setLifeEvents] = useState('');
  const [injuryReported, setInjuryReported] = useState(false);
  const [injuryDescription, setInjuryDescription] = useState('');
  const [intentToSeePhysio, setIntentToSeePhysio] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Load the check-in (or fall back to pending if no id given)
        const res = checkinId
          ? null // we don't have a get-by-id; use list and find. For now reload from pending.
          : await api.checkins.pending();
        let ci = res?.checkin || null;
        if (checkinId && !ci) {
          // Resolve by listing
          const all = await api.checkins.list();
          ci = (all?.checkins || []).find(c => c.id === checkinId) || null;
        }
        if (!ci) { setPhase('error'); return; }
        setCheckin(ci);
        // If already responded, jump straight to review
        if (ci.status === 'responded' && ci.suggestions) {
          setPhase('review');
        } else {
          setPhase('form');
        }
        // Load this week's activities for the multi-select
        const plans = await getPlans();
        const plan = plans.find(p => p.id === ci.planId) || plans[0];
        if (plan && Array.isArray(plan.activities)) {
          const week = ci.weekNum || plan.currentWeek || 1;
          const acts = plan.activities.filter(a => a.week === week && a.type !== 'rest');
          setThisWeekActs(acts);
        }
      } catch {
        setPhase('error');
      }
    })();
  }, [checkinId]);

  const toggleSessionDone = (id) => {
    setSessionsDone(prev => ({ ...prev, [id]: !prev[id] }));
  };
  const setComment = (id, text) => {
    setSessionComments(prev => ({ ...prev, [id]: text }));
  };

  const submit = async () => {
    if (!checkin?.id) return;
    setPhase('submitting');
    const doneIds = Object.keys(sessionsDone).filter(k => sessionsDone[k]);
    const cleanComments = {};
    for (const id of doneIds) {
      const c = (sessionComments[id] || '').trim();
      if (c) cleanComments[id] = c;
    }
    try {
      const res = await api.checkins.respond(checkin.id, {
        sessionsDone: doneIds,
        sessionComments: cleanComments,
        modifications: modifications.trim(),
        lifeEvents: lifeEvents.trim(),
        injury: {
          reported: injuryReported,
          description: injuryReported ? injuryDescription.trim() : '',
          intentToSeePhysio: injuryReported && intentToSeePhysio,
        },
      });
      setCheckin(res?.checkin || checkin);
      setPhase('review');
    } catch (err) {
      Alert.alert('Couldn\'t submit', 'Try again in a moment.');
      setPhase('form');
    }
  };

  // Apply a single suggestion to the local plan + sync to server.
  const applySuggestion = async (change) => {
    if (!change?.activityId) return;
    const updates = {};
    if (change.kind === 'skip') {
      updates.completed = false;
      updates.notes = (change.reason || '') + ' [auto-skipped from check-in]';
      // We don't actually delete; we mark a note. Riders can manually tick complete to keep the streak record.
    } else {
      if (change.newDurationMins != null) updates.durationMins = change.newDurationMins;
      if (change.newDistanceKm != null) updates.distanceKm = change.newDistanceKm;
      if (change.newEffort) updates.effort = change.newEffort;
    }
    try {
      await updateActivity(change.activityId, updates);
      // Mark this change locally so the UI can grey it out
      setCheckin(prev => prev ? {
        ...prev,
        suggestions: {
          ...(prev.suggestions || {}),
          changes: (prev.suggestions?.changes || []).map(c =>
            c.activityId === change.activityId && c.kind === change.kind ? { ...c, _applied: true } : c
          ),
        },
      } : prev);
    } catch {
      Alert.alert('Couldn\'t apply', 'Try again or open the session and edit it manually.');
    }
  };

  // ── Renders ────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (phase === 'error') {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}>
          <Text style={s.title}>Couldn't load your check-in.</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => navigation.goBack()}>
            <Text style={s.primaryBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Weekly check-in</Text>
          <View style={{ width: 24 }} />
        </View>

        {phase === 'form' || phase === 'submitting' ? (
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.intro}>Five quick questions. Your coach will use this to shape next week.</Text>

            {/* Sessions done */}
            <Text style={s.qLabel}>Which sessions did you do?</Text>
            {thisWeekActs.length === 0 ? (
              <Text style={s.muted}>No sessions on the plan this week.</Text>
            ) : (
              thisWeekActs.map(a => {
                const done = !!sessionsDone[a.id];
                return (
                  <View key={a.id} style={s.sessionRow}>
                    <TouchableOpacity
                      style={[s.checkBox, done && s.checkBoxOn]}
                      onPress={() => toggleSessionDone(a.id)}
                      activeOpacity={0.7}
                    >
                      {done ? <Text style={s.checkTick}>{'\u2713'}</Text> : null}
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={s.sessionTitle}>{a.title}</Text>
                      <Text style={s.sessionMeta}>
                        {[a.distanceKm ? `${Math.round(a.distanceKm)} km` : null, a.durationMins ? `${a.durationMins} min` : null, a.effort].filter(Boolean).join(' · ')}
                      </Text>
                      {done && (
                        <TextInput
                          style={s.commentInput}
                          placeholder="How did it feel? (optional)"
                          placeholderTextColor={colors.textFaint}
                          value={sessionComments[a.id] || ''}
                          onChangeText={(t) => setComment(a.id, t)}
                          multiline
                        />
                      )}
                    </View>
                  </View>
                );
              })
            )}

            {/* Modifications */}
            <Text style={[s.qLabel, { marginTop: 18 }]}>Anything you'd like to change about the plan?</Text>
            <TextInput
              style={s.bigInput}
              placeholder="e.g. fewer hills, more indoor sessions, longer Sunday rides…"
              placeholderTextColor={colors.textFaint}
              value={modifications}
              onChangeText={setModifications}
              multiline
            />

            {/* Life events */}
            <Text style={[s.qLabel, { marginTop: 18 }]}>Anything coming up next week that affects training?</Text>
            <TextInput
              style={s.bigInput}
              placeholder="e.g. travelling Wednesday–Friday, kid's birthday Saturday, work crunch Monday…"
              placeholderTextColor={colors.textFaint}
              value={lifeEvents}
              onChangeText={setLifeEvents}
              multiline
            />

            {/* Injury */}
            <Text style={[s.qLabel, { marginTop: 18 }]}>Any injuries or pain?</Text>
            <View style={s.yesNoRow}>
              <TouchableOpacity
                style={[s.yesNoBtn, !injuryReported && s.yesNoBtnOn]}
                onPress={() => setInjuryReported(false)}
              >
                <Text style={[s.yesNoText, !injuryReported && s.yesNoTextOn]}>No, all good</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.yesNoBtn, injuryReported && s.yesNoBtnOn]}
                onPress={() => setInjuryReported(true)}
              >
                <Text style={[s.yesNoText, injuryReported && s.yesNoTextOn]}>Yes</Text>
              </TouchableOpacity>
            </View>

            {injuryReported && (
              <>
                <View style={s.medicalBanner}>
                  <Text style={s.medicalBannerTitle}>A note before you continue</Text>
                  <Text style={s.medicalBannerBody}>
                    Etapa is a training app, not a medical service. We won't try to diagnose anything or suggest treatment. If you're hurting, please see a physiotherapist — and we'll shape the plan around what they tell you.
                  </Text>
                </View>
                <TextInput
                  style={s.bigInput}
                  placeholder="Briefly describe what's bothering you (no need for detail — your physio will assess)"
                  placeholderTextColor={colors.textFaint}
                  value={injuryDescription}
                  onChangeText={setInjuryDescription}
                  multiline
                />
                <TouchableOpacity
                  style={[s.physioOptIn, intentToSeePhysio && s.physioOptInOn]}
                  onPress={() => setIntentToSeePhysio(!intentToSeePhysio)}
                  activeOpacity={0.7}
                >
                  <View style={[s.checkBox, intentToSeePhysio && s.checkBoxOn]}>
                    {intentToSeePhysio ? <Text style={s.checkTick}>{'\u2713'}</Text> : null}
                  </View>
                  <Text style={s.physioOptInText}>
                    I'll book a physio. Add a placeholder appointment to my plan so I remember.
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={[s.primaryBtn, phase === 'submitting' && { opacity: 0.6 }]}
              onPress={submit}
              disabled={phase === 'submitting'}
              activeOpacity={0.85}
            >
              {phase === 'submitting'
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.primaryBtnText}>Submit to your coach</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={s.dismissRow}
              onPress={async () => {
                await api.checkins.dismiss(checkin.id);
                navigation.goBack();
              }}
              activeOpacity={0.7}
            >
              <Text style={s.dismissText}>Skip this week's check-in</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}

        {phase === 'review' && checkin?.suggestions ? (
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
            <Text style={s.intro}>Here's what I'd change for next week.</Text>

            {checkin.suggestions.summary ? (
              <View style={s.summaryCard}>
                <Text style={s.summaryText}>{checkin.suggestions.summary}</Text>
              </View>
            ) : null}

            {checkin.suggestions.physioRecommended ? (
              <View style={s.physioBanner}>
                <MaterialCommunityIcons name="hand-heart" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={s.physioBannerTitle}>Please see a physio</Text>
                  <Text style={s.physioBannerBody}>
                    We've added a placeholder appointment to your plan if you opted in. Once you've been, paste the physio's notes back into the app and we'll adjust the plan around them.
                  </Text>
                </View>
              </View>
            ) : null}

            {(checkin.suggestions.changes || []).length === 0 ? (
              <Text style={s.muted}>No changes — stick with the plan and ride well.</Text>
            ) : (
              checkin.suggestions.changes.map((c, i) => (
                <View key={i} style={[s.changeCard, c._applied && { opacity: 0.5 }]}>
                  <Text style={s.changeKind}>
                    {c.kind === 'modify' ? 'Modify' : c.kind === 'skip' ? 'Skip' : 'Switch to recovery'}
                  </Text>
                  <Text style={s.changeReason}>{c.reason}</Text>
                  <View style={s.changeMetaRow}>
                    {c.newDurationMins != null && <Text style={s.changeMeta}>{c.newDurationMins} min</Text>}
                    {c.newDistanceKm != null && <Text style={s.changeMeta}>{c.newDistanceKm} km</Text>}
                    {c.newEffort && <Text style={s.changeMeta}>{c.newEffort}</Text>}
                  </View>
                  <View style={s.changeActions}>
                    <TouchableOpacity
                      style={[s.smallBtn, s.smallBtnPrimary]}
                      onPress={() => applySuggestion(c)}
                      disabled={c._applied}
                    >
                      <Text style={s.smallBtnPrimaryText}>{c._applied ? 'Applied' : 'Apply'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.smallBtn, s.smallBtnGhost]}
                      onPress={() => setCheckin(prev => prev ? {
                        ...prev,
                        suggestions: {
                          ...(prev.suggestions || {}),
                          changes: (prev.suggestions?.changes || []).map(x =>
                            x === c ? { ...x, _applied: true } : x
                          ),
                        },
                      } : prev)}
                      disabled={c._applied}
                    >
                      <Text style={s.smallBtnGhostText}>Skip</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}

            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.text, fontFamily: FF.semibold },
  backArrow: { fontSize: 22, color: colors.text },

  scroll: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 40 },

  intro: { fontSize: 14, color: colors.textMid, fontFamily: FF.regular, lineHeight: 20, marginBottom: 18 },
  title: { fontSize: 18, fontWeight: '600', color: colors.text, fontFamily: FF.semibold, marginBottom: 12, textAlign: 'center' },

  qLabel: { fontSize: 14, fontWeight: '600', color: colors.text, fontFamily: FF.semibold, marginBottom: 10 },
  muted: { fontSize: 13, color: colors.textMid, fontFamily: FF.regular, lineHeight: 19 },

  sessionRow: {
    flexDirection: 'row', gap: 12, paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  sessionTitle: { fontSize: 14, fontWeight: '500', color: colors.text, fontFamily: FF.medium },
  sessionMeta: { fontSize: 11, color: colors.textMid, fontFamily: FF.regular, marginTop: 3 },
  commentInput: {
    marginTop: 8, backgroundColor: colors.surfaceLight,
    borderWidth: 0.5, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: colors.text,
    fontFamily: FF.regular, minHeight: 36,
  },
  bigInput: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 0.5, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 14, color: colors.text, fontFamily: FF.regular,
    minHeight: 80, textAlignVertical: 'top',
  },

  yesNoRow: { flexDirection: 'row', gap: 8 },
  yesNoBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: colors.surfaceLight,
    borderWidth: 0.5, borderColor: colors.border, alignItems: 'center',
  },
  yesNoBtnOn: { backgroundColor: colors.primary + '22', borderColor: colors.primary, borderWidth: 1.5 },
  yesNoText: { fontSize: 13, color: colors.textMid, fontFamily: FF.regular },
  yesNoTextOn: { color: colors.text, fontWeight: '600', fontFamily: FF.semibold },

  medicalBanner: {
    backgroundColor: colors.primary + '14',
    borderWidth: 0.5, borderColor: colors.primary + '50',
    borderRadius: 12, padding: 12, marginTop: 12, marginBottom: 8,
  },
  medicalBannerTitle: { fontSize: 12, fontWeight: '600', color: colors.primary, fontFamily: FF.semibold, marginBottom: 4 },
  medicalBannerBody: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, lineHeight: 17 },

  physioOptIn: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12,
    borderRadius: 10, backgroundColor: colors.surfaceLight,
    borderWidth: 0.5, borderColor: colors.border, marginTop: 10,
  },
  physioOptInOn: { borderColor: colors.primary, backgroundColor: colors.primary + '14' },
  physioOptInText: { flex: 1, fontSize: 12, color: colors.text, fontFamily: FF.regular, lineHeight: 17 },

  checkBox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  checkBoxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkTick: { color: '#fff', fontSize: 13, fontWeight: '700' },

  primaryBtn: {
    backgroundColor: colors.primary, paddingVertical: 14,
    borderRadius: 12, alignItems: 'center', marginTop: 24,
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600', fontFamily: FF.semibold },
  dismissRow: { paddingVertical: 14, alignItems: 'center' },
  dismissText: { color: colors.textMuted, fontSize: 13, fontFamily: FF.regular },

  // Review phase
  summaryCard: {
    backgroundColor: colors.primary + '14',
    borderWidth: 0.5, borderColor: colors.primary + '50',
    borderRadius: 12, padding: 14, marginBottom: 12,
  },
  summaryText: { fontSize: 13, color: colors.text, fontFamily: FF.regular, lineHeight: 19 },

  physioBanner: {
    flexDirection: 'row', gap: 10,
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderWidth: 0.5, borderColor: 'rgba(248,113,113,0.4)',
    borderRadius: 12, padding: 12, marginBottom: 12,
  },
  physioBannerTitle: { fontSize: 13, fontWeight: '600', color: '#F87171', fontFamily: FF.semibold, marginBottom: 4 },
  physioBannerBody: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, lineHeight: 17 },

  changeCard: {
    backgroundColor: colors.surface,
    borderWidth: 0.5, borderColor: colors.border,
    borderRadius: 12, padding: 12, marginBottom: 8,
  },
  changeKind: { fontSize: 11, fontWeight: '600', color: colors.primary, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 },
  changeReason: { fontSize: 13, color: colors.text, fontFamily: FF.regular, lineHeight: 19 },
  changeMetaRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  changeMeta: {
    fontSize: 11, color: colors.textMid, fontFamily: FF.regular,
    backgroundColor: colors.surfaceLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden',
  },
  changeActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  smallBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  smallBtnPrimary: { backgroundColor: colors.primary },
  smallBtnPrimaryText: { color: '#fff', fontSize: 12, fontWeight: '600', fontFamily: FF.semibold },
  smallBtnGhost: { borderWidth: 0.5, borderColor: colors.border },
  smallBtnGhostText: { color: colors.textMid, fontSize: 12, fontFamily: FF.regular },
});
