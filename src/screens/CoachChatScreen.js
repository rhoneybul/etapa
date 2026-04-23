/**
 * Coach Chat — multi-turn AI coaching conversation.
 * Can be scoped to the full plan or a specific week.
 * Chat history persists per plan + optional week scope.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fontFamily } from '../theme';
import useScreenGuard from '../hooks/useScreenGuard';
import { getPlans, getGoals, getWeekActivities, getPlanConfig, savePlan, getUserPrefs, getActivityDate } from '../services/storageService';
import { coachChat } from '../services/llmPlanService';
import { api } from '../services/api';
import { getCoach } from '../data/coaches';
import { getCurrentUser } from '../services/authService';
import { syncStravaActivities, buildStravaContextForAI, weekComparisonSummary } from '../services/stravaSyncService';
import { isStravaConnected } from '../services/stravaService';
import analytics from '../services/analyticsService';

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const FF = fontFamily;

/**
 * Parse simple markdown (bold and italic) into an array of Text elements.
 * Supports **bold**, *italic*, and plain text.
 */
function renderMarkdown(text, baseStyle, onWeekPress) {
  // Combined regex: **bold**, *italic*, and "Week N" / "week N" references
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|[Ww]eek\s+(\d+))/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), type: 'plain' });
    }
    if (match[2]) {
      parts.push({ text: match[2], type: 'bold' });
    } else if (match[3]) {
      parts.push({ text: match[3], type: 'italic' });
    } else if (match[4]) {
      parts.push({ text: match[0], type: 'week', weekNum: parseInt(match[4], 10) });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), type: 'plain' });
  }

  if (parts.length === 0) return <Text style={baseStyle}>{text}</Text>;

  return (
    <Text style={baseStyle}>
      {parts.map((p, i) => {
        if (p.type === 'bold') return <Text key={i} style={{ fontWeight: '700', fontFamily: FF.semibold }}>{p.text}</Text>;
        if (p.type === 'italic') return <Text key={i} style={{ fontStyle: 'italic' }}>{p.text}</Text>;
        if (p.type === 'week' && onWeekPress) {
          return (
            <Text
              key={i}
              style={{ color: '#E8458B', textDecorationLine: 'underline' }}
              onPress={() => onWeekPress(p.weekNum)}
            >
              {p.text}
            </Text>
          );
        }
        return p.text;
      })}
    </Text>
  );
}

function chatKey(planId, weekNum) {
  if (weekNum) return `@etapa_coach_chat_${planId}_w${weekNum}`;
  return `@etapa_coach_chat_${planId}`;
}

export default function CoachChatScreen({ navigation, route }) {
  const _screenGuard = useScreenGuard('CoachChatScreen', navigation);
  const planId = route.params?.planId;
  const weekNum = route.params?.weekNum || null; // null = full plan scope
  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);
  const [planConfig, setPlanConfig] = useState(null);
  const [messages, setMessages] = useState([]); // { role: 'user'|'assistant', content: string, ts: number }
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState(null); // { activities: [], msgIndex: number }
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [lastFailedMsg, setLastFailedMsg] = useState(null); // last user message content that failed
  const [userName, setUserName] = useState(null);
  const [stravaActivities, setStravaActivities] = useState([]);
  // Weekly coach-message limit: { used, limit, remaining, unlimited }
  const [limits, setLimits] = useState(null);
  const scrollRef = useRef(null);

  // ── Telemetry refs ─────────────────────────────────────────────────────────
  // Opened-at timestamp — used to compute session duration on close.
  const sessionOpenedAtRef = useRef(Date.now());
  // Timestamp of the most recent coach reply. If the user leaves within 10s
  // of this, we fire `chat_exited_shortly_after_response` — a signal that
  // the reply didn't land well.
  const lastCoachResponseAtRef = useRef(null);
  // Latest user message count, kept in a ref so the unmount cleanup can read it.
  const userMsgCountRef = useRef(0);
  // Latest coach id, kept in a ref so the unmount cleanup can read it.
  const coachIdRef = useRef(null);

  // Load plan, goal, chat history, and user name
  useEffect(() => {
    (async () => {
      // Fetch user name for personalised coaching — prefer local display name
      try {
        const [user, userPrefs] = await Promise.all([getCurrentUser(), getUserPrefs()]);
        const name = userPrefs?.displayName || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || null;
        setUserName(name);
      } catch {}

      const plans = await getPlans();
      const p = plans.find(pl => pl.id === planId) || plans[0];
      setPlan(p);
      if (p) {
        const goals = await getGoals();
        setGoal(goals.find(g => g.id === p.goalId) || null);
        const cfg = await getPlanConfig(p.configId);
        setPlanConfig(cfg);
        analytics.events.coachChatOpened(cfg?.coachId || null, weekNum ? 'week' : 'plan');
        // Sync Strava data for coach context
        isStravaConnected().then(connected => {
          if (connected) {
            syncStravaActivities(p).then(result => {
              if (result?.stravaActivities) setStravaActivities(result.stravaActivities);
            }).catch(() => {});
          }
        });

        // Load saved chat — local + server, merging any new server-side
        // messages (e.g. coach check-ins injected by the cron job).
        let localMessages = [];
        const saved = await AsyncStorage.getItem(chatKey(p.id, weekNum));
        if (saved) {
          try { localMessages = JSON.parse(saved); } catch {}
        }

        try {
          const sessions = await api.chatSessions.list(p.id);
          const wn = weekNum || null;
          const match = sessions?.find(s => s.planId === p.id && s.weekNum === wn);
          const serverMessages = match?.messages || [];

          if (serverMessages.length > localMessages.length) {
            // Server has new messages (check-ins added server-side) — use server
            setMessages(serverMessages);
            await AsyncStorage.setItem(chatKey(p.id, weekNum), JSON.stringify(serverMessages));
          } else if (localMessages.length > 0) {
            setMessages(localMessages);
          } else if (serverMessages.length > 0) {
            setMessages(serverMessages);
            await AsyncStorage.setItem(chatKey(p.id, weekNum), JSON.stringify(serverMessages));
          }
        } catch {
          // Server unreachable — fall back to local
          if (localMessages.length > 0) setMessages(localMessages);
        }
      }
    })();
  }, [planId, weekNum]);

  // Save chat whenever messages change — local + server
  useEffect(() => {
    if (plan && messages.length > 0) {
      AsyncStorage.setItem(chatKey(plan.id, weekNum), JSON.stringify(messages));
      // Fire-and-forget sync to server
      api.chatSessions.save(plan.id, weekNum, messages).catch(() => {});
    }
  }, [messages, plan, weekNum]);

  // Fetch the user's current rate-limit usage on mount and after each send,
  // so the "X of 25 this week" indicator stays accurate.
  const refreshLimits = useCallback(async () => {
    try {
      const res = await api.users.limits();
      if (res?.coach_messages) setLimits(res.coach_messages);
    } catch {}
  }, []);
  useEffect(() => { refreshLimits(); }, [refreshLimits]);

  // Scroll to bottom on new messages
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  // Keep refs in sync so the unmount cleanup below can read the latest values.
  useEffect(() => {
    userMsgCountRef.current = messages.filter(m => m.role === 'user').length;
  }, [messages]);
  useEffect(() => {
    coachIdRef.current = planConfig?.coachId || null;
  }, [planConfig]);

  // Chat-closed telemetry — fires on unmount with the session totals. Also
  // fires `chat_exited_shortly_after_response` if the user bailed within 10s
  // of the coach's last reply (a signal that the reply was unsatisfying).
  useEffect(() => {
    return () => {
      const durationSec = Math.round((Date.now() - sessionOpenedAtRef.current) / 1000);
      const turns = userMsgCountRef.current;
      const coachId = coachIdRef.current;
      const scope = weekNum ? 'week' : 'plan';

      // Only log sessions where the user actually sent a message — skip the
      // "opened the chat, looked around, backed out" case which is tracked
      // separately by coach_chat_opened vs chat_message_sent in funnels.
      if (turns > 0) {
        analytics.events.chatClosed({
          coachId, turns, durationSec, scope,
        });
      }

      // Shortly-after-response: if the most recent event was a coach reply
      // AND the user's last action was to leave within 10 seconds of it,
      // that's a "meh, not helpful" signal we want to catch.
      const last = lastCoachResponseAtRef.current;
      if (last && Date.now() - last <= 10_000) {
        analytics.events.chatExitedShortlyAfterResponse({
          coachId, turns, secondsSinceResponse: Math.round((Date.now() - last) / 1000), scope,
        });
      }
    };
  }, [weekNum]);

  const handleSend = async () => {
    if (!input.trim() || sending || !plan) return;
    const userMsg = { role: 'user', content: input.trim(), ts: Date.now() };
    const updated = [...messages, userMsg];
    const userMsgCount = updated.filter(m => m.role === 'user').length;
    analytics.events.chatMessageSent({ coachId: planConfig?.coachId || null, messageLength: input.trim().length, messageIndex: userMsgCount, scope: weekNum ? 'week' : 'plan' });

    // Fire a conversation-depth milestone when user crosses 2, 4, 6, 10 turns.
    // Tells us whether coach chats go deep (multi-turn) or stay shallow.
    const milestones = [2, 4, 6, 10];
    if (milestones.includes(userMsgCount)) {
      analytics.events.chatConversationMilestone({
        coachId: planConfig?.coachId || null,
        turnCount: userMsgCount,
        scope: weekNum ? 'week' : 'plan',
      });
    }
    setMessages(updated);
    setInput('');
    setSending(true);

    // Build context
    const now = new Date();
    const sp = plan.startDate.split('T')[0].split('-');
    const start = new Date(Number(sp[0]), Number(sp[1]) - 1, Number(sp[2]), 12, 0, 0);
    const daysSince = Math.round((now - start) / (1000 * 60 * 60 * 24));
    const currentWeek = Math.max(1, Math.min(Math.floor(daysSince / 7) + 1, plan.weeks));

    // Build a per-week summary of all activities so the coach knows the full plan
    const weekSummaries = [];
    for (let w = 1; w <= plan.weeks; w++) {
      const acts = getWeekActivities(plan, w);
      if (acts.length > 0) {
        const totalKm = acts.reduce((s, a) => s + (a.distanceKm || 0), 0);
        const totalMins = acts.reduce((s, a) => s + (a.durationMins || 0), 0);
        const rides = acts.filter(a => a.type === 'ride');
        const strength = acts.filter(a => a.type === 'strength');
        const longestRide = rides.length > 0 ? Math.max(...rides.map(r => r.distanceKm || 0)) : 0;
        weekSummaries.push({
          week: w,
          rideCount: rides.length,
          strengthCount: strength.length,
          totalKm: Math.round(totalKm),
          totalMins,
          longestRideKm: Math.round(longestRide),
          sessions: acts.map(a => `${a.title} (${a.distanceKm ? a.distanceKm + 'km' : a.durationMins + 'min'}, ${a.effort})`),
        });
      }
    }

    // Send compact version of all activities (with IDs) so the coach can modify them
    // Include the actual calendar date so the coach doesn't miscalculate dates
    const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const allActivities = (plan.activities || []).map(a => {
      const d = getActivityDate(plan.startDate, a.week, a.dayOfWeek);
      const calDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        id: a.id, week: a.week, dayOfWeek: a.dayOfWeek,
        dayName: DAY_NAMES[a.dayOfWeek] || 'Unknown',
        calendarDate: a.date || calDate,
        scheduleType: a.scheduleType || 'planned', // organised | recurring | planned
        type: a.type, subType: a.subType, title: a.title,
        description: a.description, notes: a.notes,
        durationMins: a.durationMins, distanceKm: a.distanceKm,
        effort: a.effort, completed: a.completed,
      };
    });

    // Compute actual day names for week 1 so the coach knows the calendar layout
    const week1Days = {};
    for (let dow = 0; dow < 7; dow++) {
      const d = getActivityDate(plan.startDate, 1, dow);
      week1Days[`dayOfWeek ${dow}`] = `${DAY_NAMES[dow]} ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    const context = {
      athleteName: userName || null,
      plan: { name: plan.name, weeks: plan.weeks, startDate: plan.startDate, currentWeek },
      calendarMapping: week1Days,
      goal: goal ? {
        goalType: goal.goalType,
        eventName: goal.eventName,
        targetDistance: goal.targetDistance,
        targetElevation: goal.targetElevation,
        targetTime: goal.targetTime,
        targetDate: goal.targetDate,
        cyclingType: goal.cyclingType,
      } : null,
      fitnessLevel: planConfig?.fitnessLevel || null,
      coachId: planConfig?.coachId || null,
      weekSummaries,
      allActivities,
    };

    // ── Strava data deliberately NOT sent to the AI coach ────────────────
    // Strava's API Agreement (as of Nov 2024) explicitly prohibits using data
    // obtained via their API in AI models or similar applications. We keep
    // Strava integration for on-device display + planned-vs-actual comparison
    // on the user's own screen, but we do not forward Strava activities into
    // Claude's context. If you need to restore this behaviour, it requires a
    // commercial partnership with Strava first — do NOT silently re-enable.
    // See LEGAL_AUDIT.md for context.

    if (weekNum) {
      context.weekNum = weekNum;
    }

    // Send only role + content for API
    const apiMessages = updated.map(m => ({ role: m.role, content: m.content }));

    try {
      const result = await coachChat(apiMessages, context);

      // Rate limit reached — server returned 429. Two possible causes:
      //   - Weekly coach-message limit (25/week default)
      //   - Daily Claude cost cap (spend-based)
      // Both surface as a friendly "limit reached" message with a dedicated
      // analytics event so we can see how often it happens.
      if (result.rateLimited) {
        setLastFailedMsg(null);
        analytics.track('chat_rate_limited', {
          coachId: planConfig?.coachId || null,
          kind: result.rateLimitKind || 'cost_cap',
          used: result.rateLimitUsed ?? null,
          limit: result.rateLimitMax ?? null,
          spentUsd: result.spentUsd ?? null,
          capUsd: result.capUsd ?? null,
          scope: weekNum ? 'week' : 'plan',
        });
        const msg = result.rateLimitKind === 'coach_msgs_per_week'
          ? `You've sent ${result.rateLimitUsed ?? '?'} of ${result.rateLimitMax ?? '25'} coach messages this week. The count resets as individual messages age out — come back in a day or two and you'll have some back.`
          : "You've reached today's coach limit. It resets in 24 hours — thanks for chatting so much. Come back tomorrow.";
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: msg,
          ts: Date.now(),
          rateLimited: true,
        }]);
        // Update limits display to reflect the block
        refreshLimits();
        setSending(false);
        return;
      }

      const coachMsg = {
        role: 'assistant',
        content: result.reply,
        ts: Date.now(),
        blocked: result.blocked || false,
        blockedMessage: result.blockedMessage || null,
      };
      setLastFailedMsg(null);
      setMessages(prev => {
        const newMsgs = [...prev, coachMsg];
        // If the coach returned plan modifications, store them
        if (result.updatedActivities && result.updatedActivities.length > 0) {
          setPendingUpdate({ activities: result.updatedActivities, msgIndex: newMsgs.length - 1 });
          // Track the suggestion. Compare to chat_plan_update_applied to compute
          // the user's suggestion-accept rate — a strong signal of coach quality.
          analytics.events.chatPlanSuggestionReceived({
            coachId: planConfig?.coachId || null,
            activityCount: result.updatedActivities.length,
            scope: weekNum ? 'week' : 'plan',
          });
        }
        return newMsgs;
      });
      // Record the moment the coach reply landed — used by the unmount
      // handler to decide whether the user bailed "shortly after a response".
      lastCoachResponseAtRef.current = Date.now();
      // Refresh the weekly-usage indicator so the counter updates immediately.
      refreshLimits();
    } catch {
      setLastFailedMsg(userMsg.content);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.', ts: Date.now(), failed: true }]);
    }

    setSending(false);
  };

  /** Report a wrongly blocked message — sends to support/Linear */
  const handleReportBlock = async (blockedMessage) => {
    try {
      const serverUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
      const { getSession } = require('../services/authService');
      const session = await getSession();
      const token = session?.access_token;
      await fetch(`${serverUrl}/api/support/report-blocked`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: blockedMessage,
          planId: plan?.id || null,
          coachId: planConfig?.coachId || null,
        }),
      });
      Alert.alert('Thanks for letting us know', "We've logged this and will review it. Your message may be allowed in a future update.");
    } catch {
      Alert.alert('Could not send report', 'Please try again later.');
    }
  };

  const handleClearChat = async () => {
    if (plan) {
      await AsyncStorage.removeItem(chatKey(plan.id, weekNum));
      // Sync deletion to server
      api.chatSessions.delete(plan.id, weekNum).catch(() => {});
    }
    setMessages([]);
    setPendingUpdate(null);
  };

  const handleApplyUpdate = async () => {
    if (!pendingUpdate || !plan || applyingUpdate) return;
    setApplyingUpdate(true);
    analytics.events.chatPlanUpdateApplied(planConfig?.coachId || null);

    try {
      const updated = { ...plan };
      const incomingActivities = pendingUpdate.activities;

      // Determine which weeks are being replaced
      const affectedWeeks = new Set(incomingActivities.map(a => a.week));

      // Keep activities from unaffected weeks, replace affected weeks entirely
      const keptActivities = (plan.activities || []).filter(a => !affectedWeeks.has(a.week));

      // Build new activities from the update
      const newActivities = incomingActivities.map(a => ({
        id: a.id || uid(),
        planId: plan.id,
        week: a.week,
        dayOfWeek: a.dayOfWeek,
        type: a.type || 'ride',
        subType: a.subType || (a.type === 'strength' ? null : 'endurance'),
        title: a.title || 'Session',
        description: a.description || '',
        notes: a.notes || null,
        durationMins: a.durationMins || 45,
        distanceKm: a.type === 'strength' ? null : (a.distanceKm || null),
        effort: a.effort || 'moderate',
        completed: a.completed || false,
        completedAt: null,
        stravaActivityId: null,
        stravaData: null,
      }));

      updated.activities = [...keptActivities, ...newActivities].sort((a, b) =>
        a.week !== b.week ? a.week - b.week : a.dayOfWeek - b.dayOfWeek
      );

      setPendingUpdate(null);

      // Navigate to Calendar with the proposed changes for review
      navigation.navigate('Calendar', {
        pendingChanges: {
          planId: plan.id,
          previousActivities: plan.activities || [],
          proposedActivities: updated.activities,
          affectedWeeks: [...affectedWeeks],
        },
      });
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, failed to prepare the changes. Please try again.',
        ts: Date.now(),
      }]);
    }

    setApplyingUpdate(false);
  };

  const handleDismissUpdate = () => {
    setPendingUpdate(null);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'No changes applied. Feel free to ask for different adjustments.',
      ts: Date.now(),
    }]);
  };

  const handleRetry = () => {
    if (!lastFailedMsg) return;
    // Remove the last failed assistant message and the user message before it
    setMessages(prev => {
      const msgs = [...prev];
      // Remove last failed assistant message
      if (msgs.length > 0 && msgs[msgs.length - 1].failed) msgs.pop();
      // Remove the user message that triggered it
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') msgs.pop();
      return msgs;
    });
    setInput(lastFailedMsg);
    setLastFailedMsg(null);
  };

  const scopeLabel = weekNum ? `Week ${weekNum}` : 'Your plan';

  if (_screenGuard.blocked) return _screenGuard.render();

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <View style={s.headerCenter}>
            {(() => {
              const coach = getCoach(planConfig?.coachId);
              return coach ? (
                <>
                  <View style={s.headerCoachRow}>
                    <View style={[s.headerCoachDot, { backgroundColor: coach.avatarColor }]}>
                      <Text style={s.headerCoachInitials}>{coach.avatarInitials}</Text>
                    </View>
                    <Text style={s.headerTitle}>{coach.name}</Text>
                  </View>
                  <Text style={s.headerScope}>{scopeLabel}</Text>
                </>
              ) : (
                <>
                  <Text style={s.headerTitle}>Ask your coach</Text>
                  <Text style={s.headerScope}>{scopeLabel}</Text>
                </>
              );
            })()}
          </View>
          {messages.length > 0 ? (
            <TouchableOpacity onPress={handleClearChat} hitSlop={HIT}>
              <Text style={s.clearBtn}>Clear</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 40 }} />}
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : (StatusBar.currentHeight ?? 0)}
        >
          {/* Messages */}
          <ScrollView
            ref={scrollRef}
            style={s.messageList}
            contentContainerStyle={s.messageContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 && (
              <View style={s.emptyState}>
                <View style={s.emptyIcon}>
                  <Text style={s.emptyIconText}>?</Text>
                </View>
                <Text style={s.emptyTitle}>Chat with your coach</Text>
                <Text style={s.emptyDesc}>
                  Ask anything about {weekNum ? `week ${weekNum}` : 'your training plan'} {'\u2014'} session advice, nutrition, recovery, pacing, or adjustments.
                </Text>
                <View style={s.suggestions}>
                  {(weekNum ? [
                    'How should I pace this week?',
                    'Is this week too hard for me?',
                    'What should I eat before the long ride?',
                    'Can I swap Tuesday and Thursday?',
                  ] : [
                    'How is my plan structured?',
                    'Am I training enough for my goal?',
                    'What should I focus on this month?',
                    'How will the taper work?',
                  ]).map((q, i) => (
                    <TouchableOpacity
                      key={i}
                      style={s.suggestionChip}
                      onPress={() => { setInput(q); }}
                      activeOpacity={0.7}
                    >
                      <Text style={s.suggestionText}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* AI + medical disclosure — required by Apple's AI disclosure
                    rules and as a defensive notice. Keep this text visible. */}
                <Text style={s.emptyAiNote}>
                  Responses are AI-generated. Your coach is a cycling guide,
                  not a doctor {'\u2014'} for medical questions, always speak
                  to a qualified professional.
                </Text>
              </View>
            )}

            {messages.map((msg, i) => (
              <View key={i}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  delayLongPress={400}
                  onLongPress={() => {
                    Clipboard.setStringAsync(msg.content);
                    Alert.alert('Copied', 'Message copied to clipboard');
                  }}
                  style={[s.bubble, msg.role === 'user' ? s.bubbleUser : s.bubbleCoach]}
                >
                  {msg.role === 'assistant' && (
                    <Text style={s.bubbleLabel}>{getCoach(planConfig?.coachId)?.name || 'Coach'}</Text>
                  )}
                  {msg.role === 'assistant'
                    ? renderMarkdown(msg.content, [s.bubbleText], (wk) => {
                        if (plan && wk >= 1 && wk <= plan.weeks) {
                          navigation.navigate('WeekView', { week: wk, planId: plan.id });
                        }
                      })
                    : <Text style={[s.bubbleText, s.bubbleTextUser]}>{msg.content}</Text>
                  }
                </TouchableOpacity>
                {msg.blocked && (
                  <TouchableOpacity
                    style={s.reportBtn}
                    onPress={() => handleReportBlock(msg.blockedMessage)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.reportText}>Was this wrong? Let us know</Text>
                  </TouchableOpacity>
                )}
                {msg.failed && i === messages.length - 1 && lastFailedMsg && (
                  <TouchableOpacity style={s.retryBtn} onPress={handleRetry} activeOpacity={0.7}>
                    <Text style={s.retryText}>Tap to retry</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {sending && (
              <View style={[s.bubble, s.bubbleCoach]}>
                <Text style={s.bubbleLabel}>{getCoach(planConfig?.coachId)?.name || 'Coach'}</Text>
                <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
              </View>
            )}

            {/* Plan update action bar */}
            {pendingUpdate && !sending && (
              <View style={s.updateBar}>
                <View style={s.updateDot} />
                <Text style={s.updateBarText}>
                  Coach has suggested changes to your plan
                </Text>
                <View style={s.updateActions}>
                  <TouchableOpacity
                    style={s.updateApplyBtn}
                    onPress={handleApplyUpdate}
                    disabled={applyingUpdate}
                    activeOpacity={0.7}
                  >
                    {applyingUpdate
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={s.updateApplyText}>Apply changes</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.updateDismissBtn}
                    onPress={handleDismissUpdate}
                    disabled={applyingUpdate}
                    activeOpacity={0.7}
                  >
                    <Text style={s.updateDismissText}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={{ height: 16 }} />
          </ScrollView>

          {/* Weekly coach-message usage indicator — always visible so the user
              knows their remaining quota before they hit the limit. */}
          {limits && !limits.unlimited && (
            <View style={[
              s.limitIndicator,
              limits.remaining === 0 && s.limitIndicatorBlocked,
              limits.remaining > 0 && limits.remaining <= 5 && s.limitIndicatorWarning,
            ]}>
              <Text style={[
                s.limitIndicatorText,
                limits.remaining === 0 && s.limitIndicatorTextBlocked,
              ]}>
                {limits.remaining === 0
                  ? `Weekly coach limit reached (${limits.used}/${limits.limit})`
                  : `${limits.used}/${limits.limit} coach messages this week`}
              </Text>
            </View>
          )}

          {/* Input bar */}
          <View style={s.inputBar}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder={limits?.remaining === 0 ? 'Weekly limit reached — check back soon' : 'Ask your coach anything...'}
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={1000}
              editable={!sending && (!limits || limits.unlimited || limits.remaining > 0)}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[s.sendBtn, (!input.trim() || sending || (limits && !limits.unlimited && limits.remaining === 0)) && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending || (limits && !limits.unlimited && limits.remaining === 0)}
            >
              <Text style={s.sendBtnText}>{'\u2191'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerCoachRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  headerCoachDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerCoachInitials: { fontSize: 10, fontWeight: '700', color: '#fff', fontFamily: FF.semibold },
  headerTitle: { fontSize: 17, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  headerScope: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.primary, marginTop: 1 },
  clearBtn: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, width: 40, textAlign: 'right' },

  messageList: { flex: 1 },
  messageContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 },
  emptyIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(232,69,139,0.12)', borderWidth: 1.5, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyIconText: { fontSize: 22, fontWeight: '700', color: colors.primary },
  emptyTitle: { fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 8 },
  emptyDesc: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, textAlign: 'center', lineHeight: 20, marginBottom: 24 },

  suggestions: { width: '100%', gap: 8 },
  suggestionChip: {
    backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  suggestionText: { fontSize: 14, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid },
  // Small AI/medical disclosure below the suggestion chips.
  emptyAiNote: {
    fontSize: 11, fontWeight: '400', fontFamily: FF.regular,
    color: colors.textMuted, textAlign: 'center', lineHeight: 16,
    marginTop: 24, paddingHorizontal: 8,
    fontStyle: 'italic',
  },

  // Bubbles
  bubble: { marginBottom: 12, maxWidth: '88%', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleCoach: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  bubbleLabel: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  bubbleText: { fontSize: 15, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },

  // Plan update action bar
  updateBar: {
    backgroundColor: 'rgba(232,69,139,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(232,69,139,0.25)',
    padding: 14, marginBottom: 8, marginTop: 4,
  },
  updateDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8458B', marginBottom: 8 },
  updateBarText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.text, marginBottom: 12, lineHeight: 18 },
  updateActions: { flexDirection: 'row', gap: 10 },
  updateApplyBtn: {
    flex: 1, height: 42, borderRadius: 12, backgroundColor: '#E8458B',
    alignItems: 'center', justifyContent: 'center',
  },
  updateApplyText: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  updateDismissBtn: {
    flex: 1, height: 42, borderRadius: 12, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  updateDismissText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },

  // Weekly-message usage indicator (sits above the input bar)
  limitIndicator: {
    paddingHorizontal: 16, paddingVertical: 6,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
    alignItems: 'center',
  },
  limitIndicatorText: {
    fontSize: 11, fontWeight: '500', fontFamily: FF.medium,
    color: colors.textFaint, letterSpacing: 0.3,
  },
  limitIndicatorWarning: { backgroundColor: 'rgba(232,69,139,0.06)' },
  limitIndicatorBlocked: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderTopColor: 'rgba(239,68,68,0.25)',
  },
  limitIndicatorTextBlocked: { color: '#ef4444' },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  input: {
    flex: 1, backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    color: colors.text, fontFamily: FF.regular, fontSize: 15, maxHeight: 100,
    borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.3 },
  sendBtnText: { fontSize: 20, color: '#fff', fontWeight: '700' },

  retryBtn: {
    alignSelf: 'flex-start', marginBottom: 12, marginTop: -4,
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
  },
  retryText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: '#EF4444' },
  reportBtn: { alignSelf: 'flex-start', marginTop: 6, marginLeft: 4, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: 'rgba(232,69,139,0.08)', borderRadius: 8 },
  reportText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
});
