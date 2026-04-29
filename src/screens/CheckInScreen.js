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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fontFamily } from '../theme';
import { api } from '../services/api';
import { getPlans, updateActivity, getActivityDate } from '../services/storageService';
import analytics from '../services/analyticsService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import RescheduleCheckInSheet from '../components/RescheduleCheckInSheet';

// Per-checkin draft key — answers persist across backgrounding so a rider
// who started writing comments doesn't lose them on a notification tap or
// app suspension. Cleared on submit / dismiss.
const draftKey = (checkinId) => `@etapa_checkin_draft_${checkinId}`;

const FF = fontFamily;

export default function CheckInScreen({ navigation, route }) {
  const checkinId = route.params?.checkinId;
  const [phase, setPhase] = useState('loading'); // loading | form | submitting | review | error

  const [checkin, setCheckin] = useState(null);
  const [thisWeekActs, setThisWeekActs] = useState([]);
  // Captured so the per-session date pill below each session title can
  // resolve a calendar date via getActivityDate(plan.startDate, w, dow).
  // We don't need the full plan object beyond that, so this stays a
  // single string instead of duplicating the plan into local state.
  const [planStartDate, setPlanStartDate] = useState(null);
  // Reschedule sheet — opened from the new "Reschedule" pill in the
  // header. See RescheduleCheckInSheet for the UX.
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  // Form state
  const [sessionsDone, setSessionsDone] = useState({}); // { [activityId]: true }
  const [sessionComments, setSessionComments] = useState({}); // { [activityId]: 'note' }
  const [modifications, setModifications] = useState('');
  const [lifeEvents, setLifeEvents] = useState('');
  const [injuryReported, setInjuryReported] = useState(false);
  // Two-step injury reveal: Yes shows the medical banner only; the rider
  // then taps "Tell me more" to reveal the description input + physio
  // opt-in. Less imposing than dumping every safety affordance at once.
  const [injuryDetailsOpen, setInjuryDetailsOpen] = useState(false);
  const [injuryDescription, setInjuryDescription] = useState('');
  const [intentToSeePhysio, setIntentToSeePhysio] = useState(false);

  // Submitting timer — drives the "Talking to your coach" elapsed-seconds
  // copy so a slow Claude call doesn't read as "broken."
  const [submittingSecs, setSubmittingSecs] = useState(0);
  const submittingTimerRef = useRef(null);
  useEffect(() => {
    if (phase !== 'submitting') {
      if (submittingTimerRef.current) clearInterval(submittingTimerRef.current);
      submittingTimerRef.current = null;
      setSubmittingSecs(0);
      return;
    }
    const startedAt = Date.now();
    submittingTimerRef.current = setInterval(() => {
      setSubmittingSecs(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(submittingTimerRef.current);
  }, [phase]);

  // Track the resolved check-in id so the draft key is stable across
  // re-renders even when route.params didn't carry one (the hydrator
  // resolves it from /pending).
  const resolvedIdRef = useRef(checkinId || null);

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
        resolvedIdRef.current = ci.id;
        // If already responded, jump straight to review
        if (ci.status === 'responded' && ci.suggestions) {
          setPhase('review');
        } else {
          setPhase('form');
          // Hydrate any saved draft for this check-in. Quietly swallow
          // parse errors — a bad draft is better dropped than crashed on.
          try {
            const raw = await AsyncStorage.getItem(draftKey(ci.id));
            if (raw) {
              const draft = JSON.parse(raw);
              if (draft.sessionsDone) setSessionsDone(draft.sessionsDone);
              if (draft.sessionComments) setSessionComments(draft.sessionComments);
              if (draft.modifications) setModifications(draft.modifications);
              if (draft.lifeEvents) setLifeEvents(draft.lifeEvents);
              if (draft.injuryReported) setInjuryReported(true);
              if (draft.injuryDetailsOpen) setInjuryDetailsOpen(true);
              if (draft.injuryDescription) setInjuryDescription(draft.injuryDescription);
              if (draft.intentToSeePhysio) setIntentToSeePhysio(true);
            }
          } catch {}
        }
        // Load this week's activities for the multi-select
        const plans = await getPlans();
        const plan = plans.find(p => p.id === ci.planId) || plans[0];
        if (plan && Array.isArray(plan.activities)) {
          const week = ci.weekNum || plan.currentWeek || 1;
          const acts = plan.activities.filter(a => a.week === week && a.type !== 'rest');
          setThisWeekActs(acts);
          // Capture the plan's start date so the session row can render
          // the actual calendar date below the title (e.g. "Mon 27 Apr").
          // We don't store the plan itself — the date string is all we
          // need.
          setPlanStartDate(plan.startDate || null);
        }
      } catch {
        setPhase('error');
      }
    })();
  }, [checkinId]);

  // Auto-save the draft as the rider types. Throttled by useEffect
  // dependency change so we don't write every keystroke — React batches
  // the state update; AsyncStorage write is fast enough that a per-render
  // save is fine. Scoped to phase=form so review-mode interactions don't
  // re-write a stale draft.
  useEffect(() => {
    if (phase !== 'form') return;
    const id = resolvedIdRef.current;
    if (!id) return;
    const draft = {
      sessionsDone, sessionComments, modifications, lifeEvents,
      injuryReported, injuryDetailsOpen, injuryDescription, intentToSeePhysio,
    };
    AsyncStorage.setItem(draftKey(id), JSON.stringify(draft)).catch(() => {});
  }, [phase, sessionsDone, sessionComments, modifications, lifeEvents,
      injuryReported, injuryDetailsOpen, injuryDescription, intentToSeePhysio]);

  // Resolve and format the calendar date for a single activity, e.g.
  // "Mon 27 Apr". Returns null when the plan doesn't have a startDate
  // yet (the session row will silently omit the pill in that case).
  // Uses toLocaleDateString rather than Intl.DateTimeFormat directly
  // because RN's bundled ICU lacks long-form names — `weekday: 'short'`
  // + `day: 'numeric'` + `month: 'short'` is the safe combination.
  const formatActivityDate = (activity) => {
    if (!planStartDate || activity?.dayOfWeek == null || activity?.week == null) return null;
    try {
      const d = getActivityDate(planStartDate, activity.week, activity.dayOfWeek);
      return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    } catch {
      return null;
    }
  };

  // Render the rider's post-ride feedback (effort / feel / note) saved
  // via ActivityFeedbackSheet when they ticked the session done.
  // Surfacing it here closes the loop: the rider sees that what they
  // typed in the moment is being passed through to their coach, so they
  // don't waste time re-typing the same thing in "anything to flag".
  // The activityFeedback array on the respond payload uses the same
  // values; the server-side prompt builder threads it into the LLM
  // context so the coach can quote-anchor next-week suggestions.
  const EFFORT_LABELS = {
    way_too_easy: 'way too easy',
    easy: 'easy',
    just_right: 'just right',
    hard: 'hard',
    way_too_hard: 'way too hard',
  };
  const FEEL_LABELS = { strong: 'felt strong', ok: 'felt ok', off: 'felt off' };
  const formatFeedbackLine = (feedback) => {
    if (!feedback) return null;
    const bits = [];
    if (feedback.effort && EFFORT_LABELS[feedback.effort]) bits.push(EFFORT_LABELS[feedback.effort]);
    else if (feedback.rpe != null) bits.push(`RPE ${feedback.rpe}/10`);
    if (feedback.feel && FEEL_LABELS[feedback.feel]) bits.push(FEEL_LABELS[feedback.feel]);
    const head = bits.join(' · ');
    const note = feedback.note ? `'${String(feedback.note).slice(0, 80)}'` : null;
    return [head, note].filter(Boolean).join(' · ');
  };

  // Reschedule handler — calls the server endpoint directly. Previously we
  // kept an AsyncStorage `@etapa_checkin_rescheduled_<id>` fallback in case
  // the route hadn't shipped yet, but POST /api/checkins/:id/reschedule is
  // now wired (see server/src/routes/checkins.js) and the server is the
  // canonical source of truth — `scheduled_at` on coach_checkins moves with
  // the rider's choice. We still dismiss the sheet + nav back even on
  // failure so the rider gets one consistent outcome ("you're done with
  // this for now") rather than a stuck modal.
  const handleReschedule = async (isoDate) => {
    setRescheduleOpen(false);
    const id = checkin?.id || resolvedIdRef.current;
    if (!id) { navigation.goBack(); return; }
    try {
      await api.checkins.reschedule(id, isoDate);
    } catch {
      // Best-effort — surface failures via the toast / nav rather than
      // blocking; the rider can re-fire from the next pending check-in.
    }
    analytics.events.weeklyCheckinRescheduled?.({ checkinId: id, to: isoDate });
    navigation.goBack();
  };

  const toggleSessionDone = (id) => {
    setSessionsDone(prev => ({ ...prev, [id]: !prev[id] }));
  };
  const setComment = (id, text) => {
    setSessionComments(prev => ({ ...prev, [id]: text }));
  };

  // Pull together everything the rider has actually filled in. Used to
  // detect empty submissions so we can prompt rather than fire a useless
  // Claude call. The per-session comments and the standalone life-events
  // input were retired in favour of the single "Anything to flag for
  // next week?" field — `modifications` is now the catch-all input.
  const hasMeaningfulInput = useMemo(() => {
    const anySession = Object.values(sessionsDone).some(Boolean);
    return anySession
      || modifications.trim().length > 0
      || (injuryReported && injuryDescription.trim().length > 0);
  }, [sessionsDone, modifications, injuryReported, injuryDescription]);

  const submit = async () => {
    if (!checkin?.id) return;

    if (!hasMeaningfulInput) {
      Alert.alert(
        'Nothing to send',
        "You haven't filled anything in. Skip this week's check-in instead?",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Skip this week', style: 'destructive', onPress: dismissCheckin },
        ],
      );
      return;
    }

    setPhase('submitting');
    const doneIds = Object.keys(sessionsDone).filter(k => sessionsDone[k]);
    // Pull post-ride feedback the rider already saved via
    // ActivityFeedbackSheet for any session they're confirming. Sent
    // alongside the free-text modifications so the coach prompt builder
    // has structured "how did each ride feel" data, not just narrative.
    // We only attach feedback for sessions the rider ticked done — if
    // they're skipping a session entirely, sending its feedback would
    // be misleading.
    const activityFeedback = thisWeekActs
      .filter(a => sessionsDone[a.id] && a.feedback)
      .map(a => ({
        activityId: a.id,
        title: a.title || null,
        effort: a.feedback.effort || null,
        rpe: a.feedback.rpe ?? null,
        feel: a.feedback.feel || null,
        note: a.feedback.note || '',
        recordedAt: a.feedback.recordedAt || null,
      }));
    try {
      const res = await api.checkins.respond(checkin.id, {
        sessionsDone: doneIds,
        // Empty objects/strings preserved on the wire so the server
        // doesn't have to handle a missing field. The new single
        // `modifications` input is the rider's free-text — the
        // server-side prompt builder uses it as the catch-all.
        sessionComments: {},
        modifications: modifications.trim(),
        lifeEvents: '',
        // Structured per-session post-ride feedback. New field — the
        // server's /respond handler accepts it under the same
        // `responses` jsonb so the coach LLM can reference it.
        activityFeedback,
        injury: {
          reported: injuryReported,
          description: injuryReported ? injuryDescription.trim() : '',
          intentToSeePhysio: injuryReported && intentToSeePhysio,
        },
      });
      // Clear the draft on successful submit.
      AsyncStorage.removeItem(draftKey(checkin.id)).catch(() => {});
      analytics.events.weeklyCheckinResponded?.({ checkinId: checkin.id });
      setCheckin(res?.checkin || checkin);
      setPhase('review');
    } catch (err) {
      Alert.alert('Couldn\'t submit', 'We\'ll save your answers — try again in a moment when you have signal.');
      setPhase('form');
    }
  };

  const dismissCheckin = async () => {
    if (!checkin?.id) { navigation.goBack(); return; }
    try { await api.checkins.dismiss(checkin.id); } catch {}
    AsyncStorage.removeItem(draftKey(checkin.id)).catch(() => {});
    analytics.events.weeklyCheckinDismissed?.({ checkinId: checkin.id });
    navigation.goBack();
  };

  const confirmSkip = () => {
    Alert.alert(
      'Skip this week\'s check-in?',
      'You can still tweak any session manually. The next check-in will arrive on schedule.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip', style: 'destructive', onPress: dismissCheckin },
      ],
    );
  };

  // Undo snackbar state — shows "Applied. Undo." for 6s after a change.
  // Tap Undo within the window → activity reverts to the snapshot taken
  // before the change.
  const [undoToast, setUndoToast] = useState(null); // { activityId, kind, snapshot }
  const undoTimerRef = useRef(null);
  const showUndoToast = (activityId, kind, snapshot) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast({ activityId, kind, snapshot });
    undoTimerRef.current = setTimeout(() => setUndoToast(null), 6000);
  };
  const undoLastApply = async () => {
    if (!undoToast) return;
    const { activityId, kind, snapshot } = undoToast;
    setUndoToast(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    try {
      await updateActivity(activityId, {
        durationMins: snapshot.durationMins,
        distanceKm: snapshot.distanceKm,
        effort: snapshot.effort,
        completed: snapshot.completed,
        notes: snapshot.notes,
      });
      // Re-enable the suggestion locally so they can apply it again later
      // if they want.
      setCheckin(prev => prev ? {
        ...prev,
        suggestions: {
          ...(prev.suggestions || {}),
          changes: (prev.suggestions?.changes || []).map(c =>
            c.activityId === activityId && c.kind === kind ? { ...c, _applied: false } : c
          ),
        },
      } : prev);
    } catch {
      Alert.alert('Couldn\'t undo', 'Open the activity and edit it manually.');
    }
  };

  // Apply a single suggestion to the local plan + sync to server.
  // Captures the activity's PRE-change state so the rider can Undo for
  // ~6 seconds via the snackbar that appears at the bottom of the screen.
  const applySuggestion = async (change) => {
    if (!change?.activityId) return;
    // Snapshot what we're overwriting so Undo can restore it. Pulls
    // current values from this week's loaded activity list.
    const prevAct = thisWeekActs.find(a => a.id === change.activityId) || null;
    const prevSnapshot = prevAct ? {
      durationMins: prevAct.durationMins ?? null,
      distanceKm: prevAct.distanceKm ?? null,
      effort: prevAct.effort ?? null,
      completed: !!prevAct.completed,
      notes: prevAct.notes ?? null,
    } : null;

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
      analytics.events.weeklyCheckinSuggestionApplied?.({
        checkinId: checkin?.id, activityId: change.activityId, kind: change.kind,
      });
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
      if (prevSnapshot) showUndoToast(change.activityId, change.kind, prevSnapshot);
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        // 80pt offset on iOS so the focused TextInput lifts clear of
        // the soft keyboard. The default (0) leaves the input flush
        // against the keyboard's top edge — fine on a 6.7" Pro Max
        // but cramped on smaller phones. Android handles this via
        // adjustResize so we leave the offset at 0 there.
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Weekly check-in</Text>
          {/* Reschedule pill replaces the empty 24px spacer that used
              to sit on the right. Only shown in the form phase — once
              the rider has submitted there's nothing to reschedule
              (the suggestions are already in hand). */}
          {phase === 'form' || phase === 'submitting' ? (
            <TouchableOpacity
              style={s.reschedulePill}
              onPress={() => setRescheduleOpen(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="calendar-clock" size={13} color={colors.textMid} />
              <Text style={s.reschedulePillText}>Reschedule</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
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
                      {/* Calendar date pill — small pink line right under
                          the title. Helps the rider place the session in
                          the week ("Mon 27 Apr — that was the hill ride")
                          when reading down a list of un-named generic
                          titles. Silently omitted when we can't resolve
                          a date (e.g. plan startDate missing). */}
                      {(() => {
                        const dateLabel = formatActivityDate(a);
                        return dateLabel ? (
                          <Text style={s.sessionDate}>{dateLabel}</Text>
                        ) : null;
                      })()}
                      <Text style={s.sessionMeta}>
                        {[a.distanceKm ? `${Math.round(a.distanceKm)} km` : null, a.durationMins ? `${a.durationMins} min` : null, a.effort].filter(Boolean).join(' · ')}
                      </Text>
                      {/* Echo back the rider's post-ride feedback if they
                          left any via ActivityFeedbackSheet. Pink-tinted
                          pill makes it obvious this is something they
                          said (not a system field) and that it's already
                          on its way to the coach — no need to re-type. */}
                      {(() => {
                        const fb = formatFeedbackLine(a.feedback);
                        return fb ? (
                          <View style={s.feedbackPill}>
                            <Text style={s.feedbackPillEyebrow}>YOU SAID</Text>
                            <Text style={s.feedbackPillText}>{fb}</Text>
                          </View>
                        ) : null;
                      })()}
                      {/* Per-session comment field used to live here.
                          Riders rarely filled them in and the form
                          read long; the single "Anything to flag?"
                          input below now covers the same ground in
                          one place, and the AI prompt builder is
                          smart enough to attribute references to
                          specific sessions ("can't ride Wednesday",
                          "knee twinged on Tuesday's ride") without
                          needing per-row inputs. */}
                    </View>
                  </View>
                );
              })
            )}

            {/* Single freeform "anything to flag?" — replaces the old
                per-session comments + the separate modifications +
                life-events fields. The placeholder primes the rider
                with concrete examples so they answer in plain words
                instead of the formal/over-considered tone the old
                "Anything you'd like to change about the plan?" prompt
                used to draw out. */}
            <Text style={[s.qLabel, { marginTop: 18 }]}>Anything to flag for next week? (optional)</Text>
            <TextInput
              style={s.bigInput}
              placeholder="can't ride wednesday, knee twinging, off to barcelona thurs–sun"
              placeholderTextColor={colors.textFaint}
              value={modifications}
              onChangeText={setModifications}
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
                {/* Two-step injury reveal — banner first, then on tap of
                    "Tell me more" we expose the description input + the
                    physio opt-in. Saves an apparent wall of pink for
                    riders who tapped Yes meaning "minor twinge." */}
                <View
                  style={s.medicalBanner}
                  accessibilityRole="alert"
                  accessibilityLabel="A note before you continue. Etapa is a training app, not a medical service. We will not diagnose or suggest treatment. Please see a physiotherapist."
                >
                  <Text style={s.medicalBannerTitle}>A note before you continue</Text>
                  <Text style={s.medicalBannerBody}>
                    Etapa is a training app, not a medical service. We won't try to diagnose anything or suggest treatment. If you're hurting, please see a physiotherapist — and we'll shape the plan around what they tell you.
                  </Text>
                </View>
                {!injuryDetailsOpen ? (
                  <TouchableOpacity
                    style={s.tellMoreRow}
                    onPress={() => setInjuryDetailsOpen(true)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Tell me more about it"
                  >
                    <Text style={s.tellMoreText}>Tell me more about it →</Text>
                  </TouchableOpacity>
                ) : (
                  <>
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
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: intentToSeePhysio }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
              </>
            )}

            <TouchableOpacity
              style={[s.primaryBtn, phase === 'submitting' && { opacity: 0.6 }]}
              onPress={submit}
              disabled={phase === 'submitting'}
              activeOpacity={0.85}
            >
              {phase === 'submitting' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator color="#fff" />
                  <Text style={s.primaryBtnText}>
                    {submittingSecs < 8
                      ? 'Talking to your coach…'
                      : submittingSecs < 20
                        ? 'Still thinking — hold tight'
                        : "Slower than usual — your answers are saved either way"}
                  </Text>
                </View>
              ) : (
                <Text style={s.primaryBtnText}>Submit to your coach</Text>
              )}
            </TouchableOpacity>

            {/* Surfaced more prominently than before — used to sit below
                the primary button as a faint underlined link, easy to
                miss. Now a proper ghost button right under Submit. */}
            <TouchableOpacity
              style={s.skipBtn}
              onPress={confirmSkip}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={s.skipBtnText}>Skip this week's check-in</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}

        {phase === 'review' && checkin?.suggestions ? (
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
            {/* Crisis short-circuit — when the input screen matched a
                crisis pattern the server returns crisisResources instead
                of running suggestions. Show the resources prominently
                and nothing else. */}
            {checkin.suggestions.crisisResources ? (
              <View style={s.crisisCard} accessibilityRole="alert">
                <Text style={s.crisisTitle}>{checkin.suggestions.summary}</Text>
                <View style={{ height: 12 }} />
                {(checkin.suggestions.resources || []).map((r, i) => (
                  <View key={i} style={s.crisisResource}>
                    <Text style={s.crisisResourceLabel}>{r.label}</Text>
                    <Text style={s.crisisResourceDetail}>{r.detail}</Text>
                  </View>
                ))}
                <TouchableOpacity
                  style={s.primaryBtn}
                  onPress={() => navigation.goBack()}
                >
                  <Text style={s.primaryBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {!checkin.suggestions.crisisResources && (
              <Text style={s.intro}>Here's what I'd change for next week.</Text>
            )}

            {!checkin.suggestions.crisisResources && checkin.suggestions.summary ? (
              <View style={s.summaryCard}>
                <Text style={s.summaryText}>{checkin.suggestions.summary}</Text>
              </View>
            ) : null}

            {!checkin.suggestions.crisisResources && checkin.suggestions.physioRecommended ? (
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

            {!checkin.suggestions.crisisResources && (checkin.suggestions.changes || []).length === 0 ? (
              <Text style={s.muted}>No changes — stick with the plan and ride well.</Text>
            ) : !checkin.suggestions.crisisResources ? (
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
            ) : null}

            {!checkin.suggestions.crisisResources && (
              <>
                {/* Hand-off to the shareable weekly summary card. The
                    rider's just spent 90 seconds answering questions
                    and reading suggestions — capture the moment with
                    a punchy "this is your week" view they can post
                    to a group chat or story. We `replace` so back
                    doesn't drop them onto the now-stale review. */}
                <TouchableOpacity
                  style={s.primaryBtn}
                  onPress={() => navigation.replace('WeeklySummary')}
                  activeOpacity={0.85}
                >
                  <Text style={s.primaryBtnText}>See my week</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.primaryBtn, { backgroundColor: 'transparent', marginTop: 8 }]}
                  onPress={() => navigation.goBack()}
                  activeOpacity={0.7}
                >
                  <Text style={[s.primaryBtnText, { color: colors.textMid, fontWeight: '500' }]}>Skip — back to home</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        ) : null}

        {/* Reschedule sheet — surfaced from the header pill. Renders as
            a Modal internally so it sits above the KeyboardAvoidingView
            and isn't constrained by it. */}
        <RescheduleCheckInSheet
          visible={rescheduleOpen}
          onCancel={() => setRescheduleOpen(false)}
          onConfirm={handleReschedule}
        />

        {/* Undo snackbar — fades out after 6s. Sits above the bottom
            edge in screen-space so it's visible whatever the rider is
            reading on the review list. */}
        {undoToast && (
          <View style={s.undoToast} pointerEvents="box-none">
            <View style={s.undoToastInner} accessibilityRole="alert">
              <Text style={s.undoToastText}>Applied to your plan.</Text>
              <TouchableOpacity onPress={undoLastApply} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={s.undoToastBtn}>Undo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
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
  // Pink date pill below the title — small, low-contrast on its own
  // (no chip background) but pink enough that it reads as the calendar
  // anchor for that row.
  sessionDate: { fontSize: 11, color: colors.primary, fontFamily: FF.medium, marginTop: 2 },
  sessionMeta: { fontSize: 11, color: colors.textMid, fontFamily: FF.regular, marginTop: 3 },
  // Echoed post-ride feedback. Pink-tinted to flag it as the rider's
  // own words coming back to them, with a small "YOU SAID" eyebrow so
  // it's obvious this is being threaded through to the coach.
  feedbackPill: {
    marginTop: 6, alignSelf: 'flex-start',
    backgroundColor: colors.primary + '14',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
    borderLeftWidth: 2, borderLeftColor: colors.primary,
  },
  feedbackPillEyebrow: {
    fontSize: 8, fontWeight: '700', color: colors.primary, fontFamily: FF.semibold,
    letterSpacing: 0.7, marginBottom: 1,
  },
  feedbackPillText: {
    fontSize: 11, color: colors.text, fontFamily: FF.regular, lineHeight: 15,
  },

  // Header right — Reschedule pill. Replaces the empty 24px spacer.
  // Borderless ghost so it doesn't visually compete with the title;
  // tap target is generous via hitSlop on the touchable itself.
  reschedulePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    borderWidth: 0.5, borderColor: colors.border,
  },
  reschedulePillText: { fontSize: 11, color: colors.textMid, fontFamily: FF.medium, fontWeight: '500' },
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

  // Skip button — promoted from a faint underlined link to a proper
  // ghost button right below Submit, so riders who genuinely don't have
  // time can find it instantly.
  skipBtn: {
    paddingVertical: 13, borderRadius: 12,
    borderWidth: 0.5, borderColor: colors.border,
    alignItems: 'center', marginTop: 10,
  },
  skipBtnText: { color: colors.textMid, fontSize: 13, fontFamily: FF.regular },

  // Two-step injury reveal — "Tell me more" affordance after the banner.
  tellMoreRow: { paddingVertical: 12, alignItems: 'flex-start', marginTop: 4 },
  tellMoreText: { fontSize: 13, fontWeight: '500', color: colors.primary, fontFamily: FF.medium },

  // Undo toast — pinned to the bottom of the screen for 6s after Apply.
  undoToast: {
    position: 'absolute', left: 16, right: 16, bottom: 24,
    alignItems: 'center', pointerEvents: 'box-none',
  },
  undoToastInner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.text,
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 10,
  },
  undoToastText: { color: colors.bg, fontSize: 13, fontFamily: FF.regular, flex: 1 },
  undoToastBtn: { color: colors.primary, fontSize: 13, fontWeight: '600', fontFamily: FF.semibold },

  // Crisis resources panel — shown when input screen matched.
  crisisCard: {
    backgroundColor: 'rgba(248,113,113,0.06)',
    borderWidth: 0.5, borderColor: 'rgba(248,113,113,0.4)',
    borderRadius: 12, padding: 18, marginBottom: 12,
  },
  crisisTitle: { fontSize: 14, fontWeight: '500', color: colors.text, fontFamily: FF.medium, lineHeight: 20 },
  crisisResource: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(248,113,113,0.3)',
  },
  crisisResourceLabel: { fontSize: 13, fontWeight: '600', color: '#F87171', fontFamily: FF.semibold, marginBottom: 3 },
  crisisResourceDetail: { fontSize: 12, color: colors.textMid, fontFamily: FF.regular, lineHeight: 17 },

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
