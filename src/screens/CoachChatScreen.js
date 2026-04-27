/**
 * Coach Chat — multi-turn AI coaching conversation.
 * Can be scoped to the full plan or a specific week.
 * Chat history persists per plan + optional week scope.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, RefreshControl,
  TextInput, KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator, Alert,
  Animated, Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fontFamily } from '../theme';
import useScreenGuard from '../hooks/useScreenGuard';
import { getPlans, getGoals, getWeekActivities, getPlanConfig, savePlan, getUserPrefs, getActivityDate } from '../services/storageService';
import {
  coachChat,
  startCoachChatJob,
  pollCoachChatJob,
  cancelCoachChatJob,
  openCoachChatStream,
} from '../services/llmPlanService';
import { api } from '../services/api';
import { getCoach } from '../data/coaches';
import { getCurrentUser } from '../services/authService';
import { setFocusedScreen } from '../services/notificationService';
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
  // Set when the user opens this screen from a notification tap — the
  // `ts` of the specific assistant message that triggered the push. We
  // scroll to that message and briefly highlight it so the user lands
  // on the right reply when they have multiple unread. Consumed once,
  // then cleared so a re-focus doesn't re-scroll.
  const scrollToTs = route.params?.scrollToTs || null;
  // Map of msg.ts → Y position within the ScrollView, captured via
  // onLayout. Populated as each bubble mounts; used by the scroll-to-
  // message effect below.
  const messageYs = useRef(new Map());
  // Animated value driving the "highlight pulse" on the target message
  // bubble. 0 = no highlight, 1 = full pink ring fading to 0 over ~2s.
  const highlightTs = useRef(null);
  const [highlightedTs, setHighlightedTs] = useState(null);
  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);
  const [planConfig, setPlanConfig] = useState(null);
  const [messages, setMessages] = useState([]); // { role: 'user'|'assistant', content: string, ts: number }
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  // True while the mount effect is hydrating plan / goal / planConfig /
  // chat history. Without it, users see an empty scroll area with a
  // blinking cursor in the input for ~500ms–2s after opening the
  // screen — a user flagged it as feeling broken. Set false in the
  // mount effect's finally block so errors don't leave the spinner up.
  const [loadingChat, setLoadingChat] = useState(true);
  const [pendingUpdate, setPendingUpdate] = useState(null); // { activities: [], msgIndex: number }
  // True between the moment the server detects a plan_update fence in the
  // stream and the moment the real Apply/Dismiss panel renders. Drives a
  // small "Preparing changes…" placeholder under the reply so the user
  // knows an action is coming — otherwise there's an awkward gap while
  // the JSON streams + parses. Cleared in handleTerminal when we swap
  // to the real pendingUpdate state (or when there's no plan_update
  // after all).
  const [preparingUpdate, setPreparingUpdate] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [lastFailedMsg, setLastFailedMsg] = useState(null); // last user message content that failed
  const [userName, setUserName] = useState(null);
  const [stravaActivities, setStravaActivities] = useState([]);
  // Weekly coach-message limit: { used, limit, remaining, unlimited }
  const [limits, setLimits] = useState(null);
  const scrollRef = useRef(null);
  // Throbbing pink Etapa icon shown during initial chat-history
  // hydration. Uses the same 1.0 → 1.12 → 1.0 rhythm the CoachChatCard
  // refreshing state uses so the two loading moments feel like the
  // same thing. Only runs while loadingChat is true.
  const loadingPulse = useRef(new Animated.Value(1)).current;
  // Tick clock used by the pending-bubble copy below. Re-renders the
  // chat list every second while at least one assistant reply is in
  // flight so the "thinking… → looking at your plan… → still going,
  // feel free to leave" copy escalates promptly with the wait time.
  // Cleared as soon as no pending bubble remains so we're not running
  // an idle timer.
  const [pendingTick, setPendingTick] = useState(Date.now());
  useEffect(() => {
    const hasPending = messages.some(m => m.pending);
    if (!hasPending) return;
    const interval = setInterval(() => setPendingTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [messages]);
  // Returns the right "I'm still working" copy for the given pending
  // bubble's age. Tightened thresholds: most replies land in 2-5s, so
  // chrome appears almost immediately and escalates to the "you can
  // leave, we'll push" path within ~15 seconds. Was previously 4s →
  // 12s → 25s → 45s, which left people staring at a bare spinner
  // for too long.
  const getPendingCopy = (ts) => {
    if (!ts) return null;
    const elapsedMs = pendingTick - ts;
    if (elapsedMs < 1500) return null;
    if (elapsedMs < 4000) return 'Thinking…';
    if (elapsedMs < 8000) return 'Looking at your plan…';
    if (elapsedMs < 15000) return 'Getting this right — coaches don\'t rush…';
    return "Still going. You can leave the chat — we'll send you a notification when your coach replies.";
  };
  useEffect(() => {
    if (!loadingChat) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(loadingPulse, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(loadingPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [loadingChat, loadingPulse]);

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
  // Map of in-flight jobId -> { closeStream, pollInterval, timeout }. Lets
  // the unmount cleanup tear down streams + polls without cancelling the
  // server-side job (Claude keeps running; the push notification will land
  // when it's done). Also lets `handleClearChat` cancel in-flight jobs.
  const activeJobsRef = useRef(new Map());

  // Load plan, goal, chat history, and user name
  useEffect(() => {
    (async () => {
      // Mark any unread coach_reply notifications as read — clears the
      // badge on the Home CoachChatCard the moment the user lands on
      // this screen. Silent-fail if offline; the next server-side sweep
      // will reconcile when the client reconnects. Scoped to coach_reply
      // so we don't accidentally dismiss a pending system notification
      // (e.g. "Plan ready!") the user hasn't actually seen yet.
      api.notifications.markAllRead('coach_reply').catch(() => {});

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

        // Load saved chat — local first (instant), server second (merge).
        //
        // Cache-first render: if local has anything, paint it IMMEDIATELY
        // and clear the loading overlay. The server fetch then runs in
        // the background and reconciles. This is what "could we cache
        // it a little bit" gets the user — opening the chat screen
        // feels instant on every visit after the first.
        let localMessages = [];
        const saved = await AsyncStorage.getItem(chatKey(p.id, weekNum));
        if (saved) {
          try { localMessages = JSON.parse(saved); } catch {}
        }
        if (localMessages.length > 0) {
          setMessages(localMessages);
          setLoadingChat(false);
        }

        try {
          const sessions = await api.chatSessions.list(p.id);
          const wn = weekNum || null;
          const match = sessions?.find(s => s.planId === p.id && s.weekNum === wn);
          const serverMessages = match?.messages || [];

          // Merge strategy: compare COMPLETED ASSISTANT message counts,
          // not total length. Server only persists FINISHED replies
          // (runCoachChatJob's append after Claude finishes), so a real
          // coach reply is the authoritative "this conversation
          // progressed" signal. We deliberately exclude PENDING local
          // bubbles from the local count — the "still loading on push
          // notification tap" bug was caused by counting the placeholder
          // pending bubble as 1 assistant: when the user backed out
          // mid-reply and tapped the push, local had [user, pending]
          // (1 assistant) while server had [user, completed-reply]
          // (1 assistant) — a tie, fell through to "use local" and the
          // completed reply got ignored, leaving the user staring at a
          // forever-spinner. Filtering pending out of local makes the
          // tie break in server's favour.
          const countCompletedAssistant = (arr) =>
            arr.filter(m => m?.role === 'assistant' && !m.pending).length;
          const serverAssistants = countCompletedAssistant(serverMessages);
          const localAssistants = countCompletedAssistant(localMessages);

          let chosen = null;
          if (serverAssistants > localAssistants) {
            chosen = serverMessages;
          } else if (localAssistants > serverAssistants) {
            chosen = localMessages;
          } else if (serverMessages.length > localMessages.length) {
            chosen = serverMessages;
          } else if (localMessages.length > 0) {
            chosen = localMessages;
          } else if (serverMessages.length > 0) {
            chosen = serverMessages;
          }

          if (chosen) {
            // Repair any pending bubbles that were left in-flight when the
            // user navigated away. For each pending bubble we either:
            //   - if it's got a jobId and the server says completed →
            //     swap in the real reply (and updatedActivities)
            //   - if the server says failed/cancelled → mark as failed
            //   - if it's still pending but older than 90 s → assume
            //     orphaned and mark as failed (with a friendly retry
            //     message)
            //   - otherwise leave alone — a fresh send may be in flight
            //     and we don't want to stomp it
            const repaired = await Promise.all(chosen.map(async (m) => {
              if (!m.pending) return m;
              const ageMs = m.ts ? Date.now() - m.ts : 0;
              if (m.jobId) {
                try {
                  const state = await pollCoachChatJob(m.jobId);
                  if (state.status === 'completed') {
                    return {
                      ...m, pending: false,
                      content: state.reply || m.content || '',
                      ...(Array.isArray(state.updatedActivities) && state.updatedActivities.length
                        ? { hasUpdate: true, updatedActivities: state.updatedActivities }
                        : {}),
                    };
                  }
                  if (state.status === 'failed' || state.status === 'cancelled') {
                    return {
                      ...m, pending: false, failed: true,
                      content: state.error || 'Message failed — tap retry to try again.',
                    };
                  }
                } catch {
                  // Poll itself failed (network) — fall through to age check.
                }
              }
              if (ageMs > 90_000) {
                return {
                  ...m, pending: false, failed: true,
                  content: 'Message timed out — tap retry to try again.',
                };
              }
              return m; // young + still pending — leave it
            }));
            setMessages(repaired);
            // Mirror the repaired array to AsyncStorage so the same repair
            // doesn't have to happen on every subsequent mount.
            AsyncStorage.setItem(chatKey(p.id, weekNum), JSON.stringify(repaired)).catch(() => {});
            // If repair produced any failed bubble that came from an
            // orphaned send, surface its lastFailedMsg for the retry
            // affordance.
            const orphanedFailed = [...repaired].reverse().find(m => m.failed && m.role === 'assistant');
            if (orphanedFailed) {
              const before = repaired.slice(0, repaired.lastIndexOf(orphanedFailed)).reverse();
              const triggeringUserMsg = before.find(m => m.role === 'user');
              if (triggeringUserMsg?.content) setLastFailedMsg(triggeringUserMsg.content);
            }
            // Re-hydrate the Apply/Dismiss UI from the last persisted
            // coach recommendation (server now stores the full
            // updatedActivities array on the assistant message, so we
            // can restore the pending-update pane here).
            const lastAssistantWithUpdate = [...repaired].reverse().find(
              m => m.role === 'assistant' && Array.isArray(m.updatedActivities) && m.updatedActivities.length > 0
            );
            if (lastAssistantWithUpdate) {
              const msgIndex = repaired.lastIndexOf(lastAssistantWithUpdate);
              setPendingUpdate({ activities: lastAssistantWithUpdate.updatedActivities, msgIndex });
            }
          }
        } catch {
          // Server unreachable — fall back to local
          if (localMessages.length > 0) setMessages(localMessages);
        }
      }
      // Mount hydration complete — clear the loading overlay whether or
      // not plan/sessions resolved cleanly. The empty state below will
      // handle the "no messages yet" case; the overlay is only for the
      // first ~second while local + server messages are being merged.
      setLoadingChat(false);
    })();
  }, [planId, weekNum]);

  // Scroll-to-message on notification tap. Fires once after the chat
  // has hydrated AND layout onLayouts have populated messageYs.
  // Tolerance: the server's messageTs is Date.now() at the push send,
  // while the stored message's ts is Date.now() at write time — a few
  // milliseconds apart. We find the closest ts within 5 seconds.
  useEffect(() => {
    if (loadingChat || !scrollToTs || !messages.length) return;
    if (highlightTs.current === scrollToTs) return; // already handled
    highlightTs.current = scrollToTs;
    // Defer one frame so all bubble onLayouts have fired.
    const timer = setTimeout(() => {
      // Find nearest-ts message (tolerance 5000ms to handle server/
      // client clock skew between push-send and message-persist).
      let bestTs = null;
      let bestDelta = Infinity;
      for (const m of messages) {
        if (!m.ts) continue;
        const d = Math.abs(m.ts - scrollToTs);
        if (d < bestDelta) { bestDelta = d; bestTs = m.ts; }
      }
      if (bestTs === null || bestDelta > 5000) return;
      const y = messageYs.current.get(bestTs);
      if (y == null) return;
      // Scroll with ~100pt of headroom above so the target isn't
      // jammed against the header.
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 100), animated: true });
      // Brief highlight so the user knows which bubble they landed on.
      setHighlightedTs(bestTs);
      setTimeout(() => setHighlightedTs(null), 2000);
    }, 250);
    return () => clearTimeout(timer);
  }, [loadingChat, scrollToTs, messages]);

  // Save chat whenever messages change — local + server.
  //
  // LOCAL: we save the full messages array INCLUDING pending bubbles. This
  // is essential for navigation-away resilience: if the user sends a
  // message and immediately backs out of the screen, we want their
  // message AND the placeholder thinking bubble to be on disk so a
  // return mount can repair the conversation (poll the job, swap in the
  // real reply, or mark as failed). Filtering pending out of local
  // caused the "I sent a message, came back, my message disappeared"
  // bug Rob reported.
  //
  // SERVER: still gated on hasPending. The server worker
  // (runCoachChatJob) is the authoritative writer for assistant replies
  // — it writes to chat_sessions when the Claude call finishes. If the
  // client PUTs its "user msg only, no assistant yet" view while the
  // worker is mid-stream, the PUT can clobber the worker's later append
  // (the server PUT shrink-guard catches the obvious case but not all
  // races). Letting the worker own server persistence while a reply is
  // in flight is the simplest safe rule. Failed bubbles aren't
  // "pending" so they DO sync to server via this effect.
  useEffect(() => {
    if (plan && messages.length > 0) {
      // FULL state to AsyncStorage — pending bubbles included.
      AsyncStorage.setItem(chatKey(plan.id, weekNum), JSON.stringify(messages)).catch(() => {});
      const settled = messages.filter(m => !m.pending);
      const hasPending = messages.some(m => m.pending);
      if (!hasPending && settled.length > 0) {
        api.chatSessions.save(plan.id, weekNum, settled).catch(() => {});
      }
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

  // handleSend accepts an optional `textOverride` so the resend
  // affordance on a failed bubble can fire the same path without
  // round-tripping through the input field. When `textOverride` is
  // omitted (the normal Send-button path), we read from input state
  // and clear it like before.
  const handleSend = async (textOverride) => {
    const text = (typeof textOverride === 'string' ? textOverride : input).trim();
    if (!text || sending || !plan) return;
    const userMsg = { role: 'user', content: text, ts: Date.now() };
    const updated = [...messages, userMsg];
    const userMsgCount = updated.filter(m => m.role === 'user').length;
    analytics.events.chatMessageSent({ coachId: planConfig?.coachId || null, messageLength: text.length, messageIndex: userMsgCount, scope: weekNum ? 'week' : 'plan' });

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
    // Optimistic user msg goes in immediately; the pending assistant bubble
    // is appended further down so we can tag it with its jobId at that point.
    setMessages(updated);
    // Only clear the composer when we read from it. A resend keeps any
    // half-typed message the user has staged.
    if (typeof textOverride !== 'string') setInput('');
    setSending(true);

    // Helper: the pending bubble block below assumes `messages` starts from
    // the already-updated array — since React state updates are batched, we
    // append via functional setState to avoid ordering races.

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
      // plan.id is needed on the server so push notifications can
      // carry a planId in their data payload — the App-level response
      // handler routes `coach_reply` pushes to CoachChat using
      // data.planId. Without id here, the server serialised null, the
      // handler fell through to the Notifications screen, and the
      // user's tap didn't open the conversation. weekNum is included
      // at the top level (not inside plan) so the server sees it at
      // job.context.weekNum where runCoachChatJob expects it.
      plan: { id: plan.id, name: plan.name, weeks: plan.weeks, startDate: plan.startDate, currentWeek },
      weekNum: weekNum || null,
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

    // ── Async flow ───────────────────────────────────────────────────────
    // POST → 202 + jobId. Client-side we add a "pending" assistant bubble
    // right away so the user sees acknowledgement. The bubble's content
    // streams in via SSE, with a parallel polling loop as fallback. When
    // the job completes the bubble is marked done and persisted.
    //
    // If the user leaves the screen before completion, the server still
    // finishes the Claude call and writes the reply to chat_sessions; a
    // push notification fires so they know it's ready. On next mount the
    // completed reply loads from server with the rest of the history.

    const pendingKey = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const pendingBubble = {
      role: 'assistant',
      content: '',
      ts: Date.now(),
      pending: true,
      pendingKey,
      jobId: null, // filled when server returns 202
    };
    setMessages(prev => [...prev, pendingBubble]);

    // 1) Start the job. Errors + blocks come back synchronously here.
    const startRes = await startCoachChatJob(apiMessages, context);

    // Rate limit (same analytics + copy as the old sync path)
    if (startRes.rateLimited) {
      setLastFailedMsg(null);
      analytics.track('chat_rate_limited', {
        coachId: planConfig?.coachId || null,
        kind: startRes.rateLimitKind || 'cost_cap',
        used: startRes.rateLimitUsed ?? null,
        limit: startRes.rateLimitMax ?? null,
        spentUsd: startRes.spentUsd ?? null,
        capUsd: startRes.capUsd ?? null,
        scope: weekNum ? 'week' : 'plan',
      });
      const msg = startRes.rateLimitKind === 'coach_msgs_per_week'
        ? `You've sent ${startRes.rateLimitUsed ?? '?'} of ${startRes.rateLimitMax ?? '25'} coach messages this week. The count resets as individual messages age out — come back in a day or two and you'll have some back.`
        : "You've reached today's coach limit. It resets in 24 hours — thanks for chatting so much. Come back tomorrow.";
      setMessages(prev => prev.map(m => m.pendingKey === pendingKey
        ? { ...m, pending: false, content: msg, rateLimited: true }
        : m));
      refreshLimits();
      setSending(false);
      return;
    }

    // Topic-guard block — server returned 200 with blocked:true. No job was
    // started, so no streaming / polling needed.
    if (startRes.blocked) {
      setMessages(prev => prev.map(m => m.pendingKey === pendingKey
        ? { ...m, pending: false, content: startRes.reply, blocked: true, blockedMessage: startRes.blockedMessage || null }
        : m));
      setSending(false);
      return;
    }

    // Hard network / server error before we even got a jobId.
    if (startRes.error || !startRes.jobId) {
      setLastFailedMsg(userMsg.content);
      setMessages(prev => prev.map(m => m.pendingKey === pendingKey
        ? { ...m, pending: false, content: startRes.error || 'Sorry, something went wrong.', failed: true }
        : m));
      setSending(false);
      return;
    }

    const jobId = startRes.jobId;
    // Stamp jobId onto the bubble so we can resume / cancel later.
    setMessages(prev => prev.map(m => m.pendingKey === pendingKey
      ? { ...m, jobId } : m));

    // Shared terminal handler — called from SSE done/error OR from poll
    // fallback, whichever wins the race.
    let terminated = false;
    const handleTerminal = ({ ok, reply, updatedActivities, error }) => {
      if (terminated) return;
      terminated = true;

      const resources = activeJobsRef.current.get(jobId);
      if (resources) {
        try { resources.closeStream?.(); } catch {}
        if (resources.pollInterval) clearInterval(resources.pollInterval);
        if (resources.timeout) clearTimeout(resources.timeout);
        activeJobsRef.current.delete(jobId);
      }

      // Clear the "preparing changes" placeholder on every terminal
      // (success OR error) — either the real Apply/Dismiss panel is
      // about to render, or the stream failed and the placeholder
      // shouldn't linger.
      setPreparingUpdate(false);

      if (!ok) {
        setLastFailedMsg(userMsg.content);
        setMessages(prev => prev.map(m => m.pendingKey === pendingKey
          ? { ...m, pending: false, content: error || 'Sorry, something went wrong.', failed: true }
          : m));
        setSending(false);
        return;
      }

      setMessages(prev => {
        const newMsgs = prev.map(m => m.pendingKey === pendingKey
          ? {
              ...m, pending: false,
              content: reply || m.content || '',
              blocked: false,
              hasUpdate: !!(updatedActivities && updatedActivities.length),
            }
          : m);
        if (updatedActivities && updatedActivities.length > 0) {
          const idx = newMsgs.findIndex(m => m.pendingKey === pendingKey);
          setPendingUpdate({ activities: updatedActivities, msgIndex: idx >= 0 ? idx : newMsgs.length - 1 });
          analytics.events.chatPlanSuggestionReceived({
            coachId: planConfig?.coachId || null,
            activityCount: updatedActivities.length,
            scope: weekNum ? 'week' : 'plan',
          });
        }
        return newMsgs;
      });

      lastCoachResponseAtRef.current = Date.now();
      setLastFailedMsg(null);
      refreshLimits();
      setSending(false);
    };

    // 2) Open SSE stream — live token deltas into the pending bubble.
    const closeStream = await openCoachChatStream(jobId, {
      onDelta: ({ text }) => {
        setMessages(prev => prev.map(m => m.pendingKey === pendingKey
          ? { ...m, content: text || m.content }
          : m));
      },
      onPlanUpdateStart: () => {
        // Server detected the plan_update fence mid-stream. Show the
        // placeholder immediately so the user sees "something is coming"
        // before the JSON finishes parsing + onDone lands.
        setPreparingUpdate(true);
      },
      onDone: ({ reply, updatedActivities }) => {
        handleTerminal({ ok: true, reply, updatedActivities });
      },
      onError: ({ error }) => {
        // Don't immediately give up — let the polling fallback confirm.
        // A stream error is often transient (mobile tower handoff etc.).
        // The poll below will resolve the job one way or the other.
        console.warn('[coach-chat] SSE error, falling back to poll:', error);
      },
    });

    // 3) Parallel polling fallback. Runs every 2s, covers cases where SSE
    // never connected (server restart between start + stream, proxy strips
    // SSE, etc.). Cheap — small DB read until terminal.
    const pollInterval = setInterval(async () => {
      const state = await pollCoachChatJob(jobId);
      if (state.status === 'completed') {
        handleTerminal({ ok: true, reply: state.reply, updatedActivities: state.updatedActivities });
      } else if (state.status === 'failed' || state.status === 'cancelled') {
        handleTerminal({ ok: false, error: state.error || 'Message failed' });
      } else if (state.reply && !terminated) {
        // Partial reply from server — keep the UI in sync even if the SSE
        // delta events aren't arriving for whatever reason.
        setMessages(prev => prev.map(m => m.pendingKey === pendingKey
          ? { ...m, content: state.reply }
          : m));
      }
    }, 2000);

    // 4) Hard 90s client-side cap — server's 60s Claude abort + 30s buffer.
    // If something is truly stuck we fail here so the user isn't waiting.
    const timeout = setTimeout(() => {
      handleTerminal({ ok: false, error: 'Message timed out — tap retry to try again.' });
    }, 90000);

    activeJobsRef.current.set(jobId, { closeStream, pollInterval, timeout });
  };

  // ── Clean up in-flight streams / intervals on unmount ────────────────────
  // Does NOT cancel server-side jobs — they keep running and the user gets
  // a push notification when the reply lands. Only the client-side spinners
  // and listeners are released here.
  useEffect(() => () => {
    for (const [, resources] of activeJobsRef.current) {
      try { resources.closeStream?.(); } catch {}
      if (resources.pollInterval) clearInterval(resources.pollInterval);
      if (resources.timeout) clearTimeout(resources.timeout);
    }
    activeJobsRef.current.clear();
  }, []);

  // ── Mark ourselves as focused so incoming coach_reply pushes are dropped
  //    while the user is staring at the chat. Unmount clears it so other
  //    screens don't accidentally inherit the silencing.
  useEffect(() => {
    setFocusedScreen('CoachChat');
    return () => setFocusedScreen(null);
  }, []);

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
    // Cancel any in-flight jobs so Claude stops cooking replies we're about
    // to throw away — and so the push notification doesn't fire after the
    // user clears the chat.
    for (const [jobId, resources] of activeJobsRef.current) {
      try { resources.closeStream?.(); } catch {}
      if (resources.pollInterval) clearInterval(resources.pollInterval);
      if (resources.timeout) clearTimeout(resources.timeout);
      cancelCoachChatJob(jobId).catch(() => {});
    }
    activeJobsRef.current.clear();

    if (plan) {
      await AsyncStorage.removeItem(chatKey(plan.id, weekNum));
      // Sync deletion to server
      api.chatSessions.delete(plan.id, weekNum).catch(() => {});
    }
    setMessages([]);
    setPendingUpdate(null);
    setSending(false);
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

  // Cancel an in-flight coach reply. Fires when the user taps the
  // "Cancel" affordance on the pending status strip above the input.
  // Tells the server to abort the Claude call (so we don't pay for
  // tokens we'll discard), tears down the local SSE/poll/timeout
  // resources, and removes the pending bubble from the chat. The
  // user message stays in place — they may want to edit and resend.
  const handleCancelInflight = async () => {
    const pending = messages.filter(m => m.pending);
    // Drop pending bubbles from view immediately so the cancel feels
    // instant, even before the server roundtrip.
    setMessages(prev => prev.filter(m => !m.pending));
    setSending(false);
    setPreparingUpdate(false);
    setLastFailedMsg(null);
    // Tear down every active job's local resources + ask server to
    // abort. activeJobsRef holds the closeStream / pollInterval /
    // timeout for each in-flight job; cancelling them stops the SSE
    // from re-introducing a bubble after we've removed it.
    for (const [jobId, resources] of activeJobsRef.current) {
      try { resources.closeStream?.(); } catch {}
      if (resources.pollInterval) clearInterval(resources.pollInterval);
      if (resources.timeout) clearTimeout(resources.timeout);
      cancelCoachChatJob(jobId).catch(() => {});
    }
    activeJobsRef.current.clear();
    // Belt-and-braces: any pending bubble that already had a jobId
    // stamped but didn't make it into activeJobsRef (race window)
    // also gets a cancel call.
    for (const m of pending) {
      if (m.jobId) cancelCoachChatJob(m.jobId).catch(() => {});
    }
  };

  // Resend the failed/copied message immediately — no detour through
  // the composer. handleSend has been refactored to accept a text
  // override exactly for this path.
  const handleResend = (text) => {
    if (!text || sending) return;
    handleSend(text);
  };

  // Pull-to-refresh on the message list. Re-fetches the chat session
  // from the server and merges in any new completed coach replies the
  // local cache hadn't seen yet (e.g. the user backgrounded the app
  // before the SSE finished, the server's runCoachChatJob completed,
  // they swiped down to manually pull the reply in).
  //
  // Uses the same "exclude pending from the count" merge as the mount
  // effect so a server reply always wins over a local pending bubble
  // for the same turn.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (!plan) return;
    setRefreshing(true);
    try {
      const sessions = await api.chatSessions.list(plan.id);
      const wn = weekNum || null;
      const match = sessions?.find(s => s.planId === plan.id && s.weekNum === wn);
      const serverMessages = match?.messages || [];
      if (serverMessages.length === 0) return;
      const countCompletedAssistant = (arr) =>
        arr.filter(m => m?.role === 'assistant' && !m.pending).length;
      const serverAssistants = countCompletedAssistant(serverMessages);
      const localAssistants = countCompletedAssistant(messages);
      // Only adopt server messages if they have at least as many
      // completed coach replies as local. This stops a stale server
      // row from clobbering an in-flight local message; the mount
      // effect's repair flow handles the more complex pending cases.
      if (serverAssistants > localAssistants
          || (serverAssistants === localAssistants && serverMessages.length > messages.length)) {
        setMessages(serverMessages);
        AsyncStorage.setItem(chatKey(plan.id, weekNum), JSON.stringify(serverMessages)).catch(() => {});
        // Re-hydrate the Apply/Dismiss UI from the last persisted
        // assistant message that carries updatedActivities — same
        // pattern as the mount effect.
        const lastAssistantWithUpdate = [...serverMessages].reverse().find(
          m => m.role === 'assistant' && Array.isArray(m.updatedActivities) && m.updatedActivities.length > 0
        );
        if (lastAssistantWithUpdate) {
          const msgIndex = serverMessages.lastIndexOf(lastAssistantWithUpdate);
          setPendingUpdate({ activities: lastAssistantWithUpdate.updatedActivities, msgIndex });
        }
      }
    } catch {
      // Network error — silently fall through. The user pulled to
      // refresh, didn't get new content, no need to surface an error.
    } finally {
      setRefreshing(false);
    }
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
          // iOS: "padding" keeps the input above the keyboard.
          // Android: leave undefined and rely on the Activity's native
          // `adjustResize` (Expo default). Using "height" here shrinks the
          // KAV and clips the message list — that's what caused the
          // "chat goes invisible when the keyboard opens" bug on Android.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {/* Messages */}
          <ScrollView
            ref={scrollRef}
            style={s.messageList}
            contentContainerStyle={s.messageContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
                progressBackgroundColor={colors.surface}
              />
            }
          >
            {/* First-open skeleton — three placeholder bubbles in the
                same shape as real messages (coach / user / coach), each
                with shimmering line placeholders inside. Replaces the
                throbbing pink app-icon overlay: that read as "the app
                is loading" when what we actually want is "the
                conversation is loading". The skeleton communicates
                "this is a chat, content is on its way" without making
                the screen flash from icon → empty → messages.
                Cache-first hydration means returning visitors usually
                never see this — they get real messages from
                AsyncStorage on the first paint. Skeleton only shows
                when there's no cached transcript yet. */}
            {loadingChat && (
              <View style={s.skeletonWrap}>
                {/* Coach bubble (left) — eyebrow + 3 lines */}
                <View style={s.skeletonCoachWrap}>
                  <Animated.View style={[s.skeletonEyebrow, { opacity: loadingPulse.interpolate({ inputRange: [1, 1.12], outputRange: [0.5, 0.85] }) }]} />
                  <View style={s.skeletonBubbleCoach}>
                    <Animated.View style={[s.skeletonLine, { width: '100%', opacity: loadingPulse.interpolate({ inputRange: [1, 1.12], outputRange: [0.5, 0.85] }) }]} />
                    <Animated.View style={[s.skeletonLine, { width: '85%', opacity: loadingPulse.interpolate({ inputRange: [1, 1.12], outputRange: [0.5, 0.85] }) }]} />
                    <Animated.View style={[s.skeletonLine, { width: '60%', marginBottom: 0, opacity: loadingPulse.interpolate({ inputRange: [1, 1.12], outputRange: [0.5, 0.85] }) }]} />
                  </View>
                </View>

                {/* User bubble (right, pink-tinted) — 2 lines */}
                <View style={s.skeletonUserWrap}>
                  <View style={s.skeletonBubbleUser}>
                    <Animated.View style={[s.skeletonLineUser, { width: '100%', opacity: loadingPulse.interpolate({ inputRange: [1, 1.12], outputRange: [0.5, 0.85] }) }]} />
                    <Animated.View style={[s.skeletonLineUser, { width: '70%', marginBottom: 0, opacity: loadingPulse.interpolate({ inputRange: [1, 1.12], outputRange: [0.5, 0.85] }) }]} />
                  </View>
                </View>

                {/* Coach bubble (left) — eyebrow + 4 lines */}
                <View style={s.skeletonCoachWrap}>
                  <Animated.View style={[s.skeletonEyebrow, { opacity: loadingPulse.interpolate({ inputRange: [1, 1.12], outputRange: [0.5, 0.85] }) }]} />
                  <View style={s.skeletonBubbleCoach}>
                    <Animated.View style={[s.skeletonLine, { width: '100%', opacity: loadingPulse.interpolate({ inputRange: [1, 1.12], outputRange: [0.5, 0.85] }) }]} />
                    <Animated.View style={[s.skeletonLine, { width: '95%', opacity: loadingPulse.interpolate({ inputRange: [1, 1.12], outputRange: [0.5, 0.85] }) }]} />
                    <Animated.View style={[s.skeletonLine, { width: '78%', opacity: loadingPulse.interpolate({ inputRange: [1, 1.12], outputRange: [0.5, 0.85] }) }]} />
                    <Animated.View style={[s.skeletonLine, { width: '50%', marginBottom: 0, opacity: loadingPulse.interpolate({ inputRange: [1, 1.12], outputRange: [0.5, 0.85] }) }]} />
                  </View>
                </View>
              </View>
            )}
            {!loadingChat && messages.length === 0 && (
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
              <View
                key={i}
                onLayout={(e) => {
                  // Track each bubble's Y offset so scroll-to-message
                  // (notification tap) can jump to a specific reply by
                  // its timestamp. Keyed by msg.ts which the server
                  // stamps on every persisted message.
                  if (msg.ts) messageYs.current.set(msg.ts, e.nativeEvent.layout.y);
                }}
                style={highlightedTs === msg.ts ? s.bubbleHighlight : null}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  delayLongPress={400}
                  onLongPress={() => {
                    if (msg.pending || !msg.content) return;
                    // Long-press action sheet. User messages get a
                    // Resend option in addition to Copy — useful when
                    // the previous exchange went off the rails and
                    // they want to try the same question again, or
                    // tweak wording slightly. Resend simply re-loads
                    // the message into the input box (NOT fire-and-
                    // forget) so the user can edit before sending.
                    // Coach messages get Copy only, matching the
                    // prior behaviour.
                    const isUser = msg.role === 'user';
                    const buttons = [
                      { text: 'Copy', onPress: () => {
                        Clipboard.setStringAsync(msg.content);
                      }},
                      ...(isUser ? [{
                        text: 'Resend',
                        onPress: () => handleResend(msg.content),
                      }] : []),
                      { text: 'Cancel', style: 'cancel' },
                    ];
                    Alert.alert(
                      isUser ? 'Your message' : 'Coach message',
                      msg.content.length > 120 ? msg.content.slice(0, 120) + '…' : msg.content,
                      buttons,
                      { cancelable: true }
                    );
                  }}
                  style={[s.bubble, msg.role === 'user' ? s.bubbleUser : s.bubbleCoach]}
                >
                  {msg.role === 'assistant' && (
                    <Text style={s.bubbleLabel}>{getCoach(planConfig?.coachId)?.name || 'Coach'}</Text>
                  )}
                  {msg.role === 'assistant' ? (
                    // Pending + no text yet: thinking spinner with
                    // progressive copy that escalates with wait time
                    // (see getPendingCopy above for thresholds).
                    // Pending + streaming text: show the partial reply.
                    // Done: markdown-render the final reply.
                    msg.pending && !msg.content ? (
                      <View style={s.pendingWrap}>
                        <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
                        {(() => {
                          const copy = getPendingCopy(msg.ts);
                          if (!copy) return null;
                          // Final stage gets the slightly-bigger
                          // "you can leave" treatment so it reads as
                          // an option, not a status. Earlier stages
                          // are quieter — they're acknowledgements.
                          const isLongWait = (pendingTick - (msg.ts || pendingTick)) >= 15000;
                          return (
                            <Text style={[s.pendingCopy, isLongWait && s.pendingCopyLong]}>{copy}</Text>
                          );
                        })()}
                      </View>
                    ) : renderMarkdown(msg.content, [s.bubbleText], (wk) => {
                      if (plan && wk >= 1 && wk <= plan.weeks) {
                        navigation.navigate('WeekView', { week: wk, planId: plan.id });
                      }
                    })
                  ) : (
                    // User message: text + small resend icon in the
                    // bubble's bottom-right corner. Tap copies the
                    // content into the input for re-send (no auto-fire).
                    // Replaces the row-below variant — keeps the
                    // affordance visible without adding extra vertical
                    // space below every message.
                    <View style={s.bubbleUserRow}>
                      <Text style={[s.bubbleText, s.bubbleTextUser, s.bubbleUserText]}>{msg.content}</Text>
                      {!msg.pending && msg.content && (
                        <TouchableOpacity
                          onPress={() => handleResend(msg.content)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          activeOpacity={0.6}
                          style={s.bubbleResendBtn}
                          disabled={sending}
                        >
                          <MaterialCommunityIcons name="refresh" size={12} color="rgba(255,255,255,0.65)" />
                          <Text style={s.bubbleResendText}>Resend</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
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
                {/* (Resend now lives inline inside the user bubble — see
                    bubbleResendIcon above. The standalone row was dropped
                    so the affordance doesn't add vertical space below
                    every message.) */}
              </View>
            ))}
            {/* No separate "sending" indicator — the pending bubble above
                already owns the spinner + streaming text state. */}

            {/* "Preparing changes…" placeholder — shows as soon as the
                server detects a plan_update fence in the stream, before
                the real Apply/Dismiss panel is ready. Hidden the moment
                `pendingUpdate` renders (the real panel) or the stream
                ends without a plan_update after all. Matches the
                updateBar's outline so the swap feels continuous. */}
            {preparingUpdate && !pendingUpdate && (
              <View style={s.updateBarPreparing}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={s.updateBarPreparingText}>Preparing changes…</Text>
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

          {/* Pending status strip — appears the moment a coach reply is
              in flight and disappears the second it lands. Reassures
              first-time users that they can leave the screen / app
              while waiting (we'll fire a push), and gives them an
              explicit Cancel that aborts the in-flight job + clears
              the pending bubble. Hidden when there's no pending bubble
              so the input area stays clean during normal use. */}
          {messages.some(m => m.pending) && (
            <View style={s.pendingStatusStrip}>
              <View style={s.pendingStatusLeft}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={s.pendingStatusText} numberOfLines={2}>
                  You can leave — we'll notify you when {getCoach(planConfig?.coachId)?.name?.split(' ')[0] || 'your coach'} replies.
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleCancelInflight}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.6}
              >
                <Text style={s.pendingStatusCancel}>Cancel</Text>
              </TouchableOpacity>
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
  // First-open loading state — big throbbing Etapa icon + caption,
  // matching the Home splash treatment so the brand moment carries
  // (Old loadingState / loadingIcon / loadingHalo styles removed —
  //  the chat now uses bubble skeletons instead of a throbbing icon.
  //  See skeleton* styles below.)

  // Bubble skeletons — three placeholder shapes (coach / user / coach)
  // that sit in the message scroll while the chat hydrates. Each has
  // the same padding, radius, and asymmetric corner tweak as the
  // real bubble component so the layout doesn't shift when content
  // paints in.
  skeletonWrap: {
    paddingTop: 8, gap: 14,
  },
  skeletonCoachWrap: {
    alignSelf: 'flex-start', maxWidth: '78%',
  },
  skeletonUserWrap: {
    alignSelf: 'flex-end', maxWidth: '70%',
  },
  // Faint label placeholder above the coach bubble — stands in for
  // the "LARS" / coach name eyebrow so layout stays faithful.
  skeletonEyebrow: {
    width: 36, height: 8, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginLeft: 16, marginBottom: 4,
  },
  skeletonBubbleCoach: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, borderBottomLeftRadius: 4,
    paddingHorizontal: 16, paddingVertical: 12,
    minWidth: 200,
  },
  skeletonBubbleUser: {
    backgroundColor: 'rgba(232,69,139,0.55)',
    borderRadius: 16, borderBottomRightRadius: 4,
    paddingHorizontal: 16, paddingVertical: 12,
    minWidth: 140,
  },
  // Each line inside a bubble — height matches the bubbleText line
  // height, so 2-3 lines visually equal a real short reply.
  skeletonLine: {
    height: 10, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 6,
  },
  skeletonLineUser: {
    height: 10, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginBottom: 6,
  },
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
  // Compact placeholder that sits between the coach's reply finishing
  // and the real Apply/Dismiss panel rendering. Matches updateBar's
  // pink outline so when the real panel takes over, the swap reads as
  // "this filled in" rather than "something replaced something else".
  updateBarPreparing: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(232,69,139,0.06)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.2)',
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8, marginTop: 4,
  },
  updateBarPreparingText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
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
  // Flash highlight applied to the message a notification tap landed
  // on. Pink-tinted background + 1px border in brand pink, ~2s decay
  // back to normal (handled by clearing `highlightedTs` in the effect).
  // Wraps the entire message container including the bubble and its
  // trailing affordances (resend row, report button, etc).
  bubbleHighlight: {
    backgroundColor: 'rgba(232,69,139,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(232,69,139,0.35)',
    borderRadius: 14,
    marginHorizontal: -4,
    marginVertical: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },

  // Pending-bubble container — spinner + escalating "thinking…" copy
  // stacked vertically. Spinner sits on its own line so the copy
  // wraps cleanly underneath when it gets to the longer "you can
  // leave" message.
  pendingWrap: {
    flexDirection: 'column', alignItems: 'flex-start', gap: 6,
    paddingVertical: 2,
  },
  pendingCopy: {
    fontSize: 13, fontFamily: FF.regular, color: colors.textMid,
    lineHeight: 18, fontStyle: 'italic',
  },
  // Long-wait variant gets a slightly higher contrast + drops the
  // italic so the "you can leave" line reads as actionable info, not
  // mid-sentence prose. Adds a touch more line-height because the
  // copy wraps to two lines on most phone widths.
  pendingCopyLong: {
    color: colors.text, fontStyle: 'normal',
    lineHeight: 19,
  },

  // User-bubble inner row — text on the left, resend icon on the right.
  // Keeps the affordance discoverable without adding vertical space
  // below every user message. The icon sits at the bottom-right of
  // the bubble so multi-line messages don't have it floating in
  // whitespace.
  bubbleUserRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
  },
  // CRITICAL: flexShrink (NOT flex:1). The bubble has maxWidth 88% but
  // no fixed width — it sizes to its content. A Text with flex:1 in a
  // content-sized row resolves to 0 width because there's no available
  // space to grow into, and the message content disappears (bubble
  // still renders because of padding). flexShrink:1 lets the Text use
  // its intrinsic width to drive the bubble's size, then wrap if the
  // bubble hits the 88% cap. Caused a "user bubbles drawn but empty"
  // bug Rob hit — coach replies were unaffected because they go
  // through renderMarkdown which doesn't apply flex.
  bubbleUserText: {
    flexShrink: 1,
  },
  bubbleResendIcon: {
    paddingTop: 2, paddingLeft: 4,
    opacity: 0.85,
  },
  // Resend pill — sits at the bottom-right of a user message bubble.
  // ↻ + "Resend" reads as "fire it again, immediately" rather than
  // the previous icon-only treatment which was too quiet. Tapping
  // this hits handleResend → handleSend(text) directly; it does NOT
  // route through the input field any more (the prior behaviour
  // staged the message in the composer for editing, which the user
  // disliked because they wanted a no-friction one-tap resend).
  bubbleResendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'flex-end',
  },
  bubbleResendText: {
    fontSize: 10, fontFamily: FF.semibold, fontWeight: '600',
    color: 'rgba(255,255,255,0.85)', letterSpacing: 0.3,
  },

  // Pending status strip — pink-tinted row that sits between the
  // message list and the input bar while a reply is in flight.
  // Combines the "you can leave, we'll notify you" reassurance with
  // an explicit Cancel for users who change their mind. Disappears
  // the second the reply lands.
  pendingStatusStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(232,69,139,0.06)',
    borderWidth: 1, borderColor: 'rgba(232,69,139,0.20)',
  },
  pendingStatusLeft: {
    flexDirection: 'row', alignItems: 'center',
    flex: 1, minWidth: 0, gap: 8,
  },
  pendingStatusText: {
    flex: 1, minWidth: 0,
    fontSize: 11, fontFamily: FF.regular,
    color: colors.textMid, lineHeight: 15,
  },
  pendingStatusCancel: {
    fontSize: 12, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.primary,
  },
});
