/**
 * Coach Chat — multi-turn AI coaching conversation.
 * Can be scoped to the full plan or a specific week.
 * Chat history persists per plan + optional week scope.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fontFamily } from '../theme';
import { getPlans, getGoals, getWeekActivities, getPlanConfig, savePlan } from '../services/storageService';
import { coachChat } from '../services/llmPlanService';
import { api } from '../services/api';

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const FF = fontFamily;

/**
 * Parse simple markdown (bold and italic) into an array of Text elements.
 * Supports **bold**, *italic*, and plain text.
 */
function renderMarkdown(text, baseStyle) {
  // Split on **bold** and *italic* patterns
  const parts = [];
  // Regex: match **bold** or *italic* or plain text
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Plain text before this match
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), style: null });
    }
    if (match[2]) {
      // **bold**
      parts.push({ text: match[2], style: { fontWeight: '700', fontFamily: FF.semibold } });
    } else if (match[3]) {
      // *italic*
      parts.push({ text: match[3], style: { fontStyle: 'italic' } });
    }
    lastIndex = match.index + match[0].length;
  }
  // Trailing plain text
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), style: null });
  }

  if (parts.length === 0) return <Text style={baseStyle}>{text}</Text>;

  return (
    <Text style={baseStyle}>
      {parts.map((p, i) =>
        p.style ? <Text key={i} style={p.style}>{p.text}</Text> : p.text
      )}
    </Text>
  );
}

function chatKey(planId, weekNum) {
  if (weekNum) return `@etapa_coach_chat_${planId}_w${weekNum}`;
  return `@etapa_coach_chat_${planId}`;
}

export default function CoachChatScreen({ navigation, route }) {
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
  const scrollRef = useRef(null);

  // Load plan, goal, and chat history
  useEffect(() => {
    (async () => {
      const plans = await getPlans();
      const p = plans.find(pl => pl.id === planId) || plans[0];
      setPlan(p);
      if (p) {
        const goals = await getGoals();
        setGoal(goals.find(g => g.id === p.goalId) || null);
        const cfg = await getPlanConfig(p.configId);
        setPlanConfig(cfg);

        // Load saved chat — try local first, then server
        const saved = await AsyncStorage.getItem(chatKey(p.id, weekNum));
        if (saved) {
          try { setMessages(JSON.parse(saved)); } catch {}
        } else {
          // Try hydrating from server
          try {
            const sessions = await api.chatSessions.list(p.id);
            const wn = weekNum || null;
            const match = sessions?.find(s => s.planId === p.id && s.weekNum === wn);
            if (match?.messages?.length > 0) {
              setMessages(match.messages);
              await AsyncStorage.setItem(chatKey(p.id, weekNum), JSON.stringify(match.messages));
            }
          } catch {}
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

  // Scroll to bottom on new messages
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending || !plan) return;
    const userMsg = { role: 'user', content: input.trim(), ts: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setSending(true);

    // Build context
    const now = new Date();
    const start = new Date(plan.startDate);
    const daysSince = Math.floor((now - start) / (1000 * 60 * 60 * 24));
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
    const allActivities = (plan.activities || []).map(a => ({
      id: a.id, week: a.week, dayOfWeek: a.dayOfWeek,
      type: a.type, subType: a.subType, title: a.title,
      description: a.description, notes: a.notes,
      durationMins: a.durationMins, distanceKm: a.distanceKm,
      effort: a.effort, completed: a.completed,
    }));

    const context = {
      plan: { name: plan.name, weeks: plan.weeks, startDate: plan.startDate, currentWeek },
      goal: goal ? {
        goalType: goal.goalType,
        eventName: goal.eventName,
        targetDistance: goal.targetDistance,
        targetDate: goal.targetDate,
        targetElevation: goal.targetElevation,
        cyclingType: goal.cyclingType,
      } : null,
      fitnessLevel: planConfig?.fitnessLevel || null,
      weekSummaries,
      allActivities,
    };

    if (weekNum) {
      context.weekNum = weekNum;
    }

    // Send only role + content for API
    const apiMessages = updated.map(m => ({ role: m.role, content: m.content }));

    try {
      const result = await coachChat(apiMessages, context);
      const coachMsg = { role: 'assistant', content: result.reply, ts: Date.now() };
      setMessages(prev => {
        const newMsgs = [...prev, coachMsg];
        // If the coach returned plan modifications, store them
        if (result.updatedActivities && result.updatedActivities.length > 0) {
          setPendingUpdate({ activities: result.updatedActivities, msgIndex: newMsgs.length - 1 });
        }
        return newMsgs;
      });
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.', ts: Date.now() }]);
    }

    setSending(false);
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

      await savePlan(updated);
      setPlan(updated);
      setPendingUpdate(null);

      // Add confirmation message
      const weekLabel = affectedWeeks.size === plan.weeks
        ? 'your entire plan'
        : `week${affectedWeeks.size > 1 ? 's' : ''} ${[...affectedWeeks].sort((a,b) => a-b).join(', ')}`;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Plan updated! I've modified ${weekLabel}. Go back to review the changes.`,
        ts: Date.now(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, failed to apply the changes. Please try again.',
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

  const scopeLabel = weekNum ? `Week ${weekNum}` : 'Your plan';

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Ask your coach</Text>
            <Text style={s.headerScope}>{scopeLabel}</Text>
          </View>
          {messages.length > 0 ? (
            <TouchableOpacity onPress={handleClearChat} hitSlop={HIT}>
              <Text style={s.clearBtn}>Clear</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 40 }} />}
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
          {/* Messages */}
          <ScrollView
            ref={scrollRef}
            style={s.messageList}
            contentContainerStyle={s.messageContent}
            showsVerticalScrollIndicator={false}
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
              </View>
            )}

            {messages.map((msg, i) => (
              <View key={i} style={[s.bubble, msg.role === 'user' ? s.bubbleUser : s.bubbleCoach]}>
                {msg.role === 'assistant' && (
                  <Text style={s.bubbleLabel}>Coach</Text>
                )}
                {msg.role === 'assistant'
                  ? renderMarkdown(msg.content, [s.bubbleText])
                  : <Text style={[s.bubbleText, s.bubbleTextUser]}>{msg.content}</Text>
                }
              </View>
            ))}

            {sending && (
              <View style={[s.bubble, s.bubbleCoach]}>
                <Text style={s.bubbleLabel}>Coach</Text>
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

          {/* Input bar */}
          <View style={s.inputBar}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask your coach anything..."
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={1000}
              editable={!sending}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
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
  headerTitle: { fontSize: 17, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  headerScope: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.primary, marginTop: 1 },
  clearBtn: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, width: 40, textAlign: 'right' },

  messageList: { flex: 1 },
  messageContent: { paddingHorizontal: 16, paddingTop: 16 },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 },
  emptyIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(217,119,6,0.12)', borderWidth: 1.5, borderColor: colors.primary,
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

  // Bubbles
  bubble: { marginBottom: 12, maxWidth: '88%', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleCoach: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  bubbleLabel: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  bubbleText: { fontSize: 15, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },

  // Plan update action bar
  updateBar: {
    backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
    padding: 14, marginBottom: 8, marginTop: 4,
  },
  updateDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', marginBottom: 8 },
  updateBarText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.text, marginBottom: 12, lineHeight: 18 },
  updateActions: { flexDirection: 'row', gap: 10 },
  updateApplyBtn: {
    flex: 1, height: 42, borderRadius: 12, backgroundColor: '#22C55E',
    alignItems: 'center', justifyContent: 'center',
  },
  updateApplyText: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  updateDismissBtn: {
    flex: 1, height: 42, borderRadius: 12, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  updateDismissText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },

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
});
