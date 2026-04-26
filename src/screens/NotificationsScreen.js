/**
 * NotificationsScreen — shows in-app notifications (admin replies, coach check-ins).
 * Accessible from Settings. Shows unread badge count.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fontFamily } from '../theme';
import { api } from '../services/api';
import { getCoach } from '../data/coaches';

const FF = fontFamily;
// AsyncStorage key for the cache-first render. Anything we've shown
// the user before is replayed instantly on next mount; the network
// call then runs in the background and merges in fresh items.
const NOTIFS_CACHE_KEY = '@etapa_notifications_cache';

// Per-type label + whether the row should render a coach avatar.
// `coachAvatar: true` tells the item to look up the coach via
// notification.data.coachId and show their initials in their brand
// colour (matches CoachChatCard styling) instead of the generic grey
// "N" circle.
const TYPE_CONFIG = {
  admin_reply:    { label: 'Team response' },
  support_reply:  { label: 'Support' },
  coach_reply:    { label: 'Message', coachAvatar: true },
  coach_checkin:  { label: 'Coach check-in', coachAvatar: true },
  plan_ready:     { label: 'Plan ready' },
  system:         { label: 'Notification' },
};

// Fallback when we can't look up the coach from data.coachId (legacy
// notifications created before we added coachId to the push payload).
// We try to parse initials from the notification title e.g. "Clara
// Moreno replied" → "CM". Returns null if nothing parseable found.
function initialsFromTitle(title) {
  if (!title) return null;
  const stripped = String(title).replace(/\s+(replied|said|checked in).*/i, '').trim();
  const parts = stripped.split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return null;
  return parts.map(p => p.charAt(0).toUpperCase()).join('');
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function NotificationItem({ item, onPress }) {
  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.system;
  const data = item.data || {};

  // Resolve the avatar content + colour. For coach notifications we
  // prefer a proper coach lookup (gives us avatarInitials + brand
  // avatarColor). If the notification is legacy and missing coachId,
  // fall back to parsing initials from the title ("Clara Moreno
  // replied" → "CM"). Everything else gets a neutral grey first-letter
  // of the type label (matches the pre-change behaviour).
  const coach = config.coachAvatar && data.coachId ? getCoach(data.coachId) : null;
  const initials = coach?.avatarInitials
    || (config.coachAvatar ? initialsFromTitle(item.title) : null)
    || config.label.charAt(0);
  const iconBg = coach?.avatarColor || colors.border;
  const iconFg = coach ? '#FFFFFF' : colors.textMuted;

  return (
    <TouchableOpacity
      style={[s.notifCard, !item.read && s.notifCardUnread]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={[s.notifIcon, { backgroundColor: iconBg }]}>
        <Text style={[s.notifIconText, { color: iconFg, fontWeight: coach ? '600' : '400', fontSize: coach ? 13 : 18 }]}>
          {initials}
        </Text>
      </View>
      <View style={s.notifContent}>
        <View style={s.notifHeader}>
          <Text style={s.notifLabel}>{config.label}</Text>
          <Text style={s.notifTime}>{timeAgo(item.created_at)}</Text>
        </View>
        <Text style={[s.notifTitle, !item.read && s.notifTitleUnread]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={s.notifBody} numberOfLines={2}>{item.body}</Text>
      </View>
      {!item.read && <View style={s.unreadDot} />}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  // `loading` = true ONLY when we have nothing to show (no cache + no
  // network result yet). Once a cache hit lands we flip to false and
  // render real rows even while a fresh fetch is in flight — the
  // separate `refreshing` flag drives a small "Refreshing…" hint in
  // the header so the user knows there might be more on the way.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Cache-first: replay anything we showed last time as soon as the
  // screen mounts, then hit the server. This means opening Messages
  // feels instant on every visit after the first — no spinner, no
  // empty state flash. Comparison shape on the network result is
  // forgiving (any `data || []`), and we only persist non-empty
  // arrays so a one-off network blip doesn't poison the cache.
  const fetchNotifications = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await api.notifications.list();
      const next = data || [];
      setNotifications(next);
      if (next.length > 0) {
        AsyncStorage.setItem(NOTIFS_CACHE_KEY, JSON.stringify(next)).catch(() => {});
      }
    } catch {
      // Network failed — leave cached state in place rather than
      // wiping it. The user keeps reading what they had before.
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Step 1 — try the cache. If we have anything, paint it
      // immediately and clear `loading` so the user is in the list.
      try {
        const cached = await AsyncStorage.getItem(NOTIFS_CACHE_KEY);
        if (!cancelled && cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setNotifications(parsed);
            setLoading(false);
          }
        }
      } catch {
        // Ignore — fall through to the network fetch.
      }
      // Step 2 — fetch fresh. The "Refreshing…" hint shows in the
      // header during this in-flight period IF the cache hit landed
      // (loading=false, header visible). On a cold load with no
      // cache, the centered spinner takes over and the hint is moot.
      await fetchNotifications();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchNotifications]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const handlePress = async (notif) => {
    if (!notif.read) {
      await api.notifications.markRead(notif.id);
      setNotifications(prev =>
        prev.map(n => n.id === notif.id ? { ...n, read: true } : n)
      );
    }

    // Navigate to the appropriate screen based on notification type.
    // Previously this handler only covered support_reply / admin_reply /
    // coach_checkin. Coach replies and plan-ready notifications (the
    // two most common types the server emits) fell through silently —
    // tapping them did literally nothing. Now every server-emitted
    // type has a route:
    //   coach_reply / coach_checkin → CoachChat (scoped to week if set)
    //   plan_ready                  → PlanOverview for the finished plan
    //   support_reply / admin_reply → SupportChat thread
    //   anything else               → stay on this screen
    const data = notif.data || {};
    if ((notif.type === 'support_reply' || notif.type === 'admin_reply') && data.feedbackId) {
      navigation.navigate('SupportChat', { feedbackId: data.feedbackId, isNew: false });
      return;
    }
    if ((notif.type === 'coach_reply' || notif.type === 'coach_checkin') && data.planId) {
      navigation.navigate('CoachChat', {
        planId: data.planId,
        // weekNum is only populated for week-scoped chats. When null we
        // open the full-plan conversation, which is the correct default
        // for push replies on non-week-scoped threads.
        weekNum: data.weekNum || null,
        // scrollToTs tells CoachChat to scroll to the specific message
        // that triggered this notification (matched by assistantMsg.ts)
        // and briefly highlight it. Only set for coach_reply; check-ins
        // don't carry a message ts.
        scrollToTs: data.messageTs || null,
      });
      return;
    }
    if (notif.type === 'plan_ready' && data.planId) {
      navigation.navigate('PlanOverview', { planId: data.planId });
      return;
    }
  };

  const handleMarkAllRead = async () => {
    await api.notifications.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <View style={s.container}>
        <SafeAreaView style={s.safe}>
          <View style={s.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Messages</Text>
          {/* Right-side header slot, three states (priority order):
              1. refreshing — soft "Refreshing…" hint while a background
                 fetch is in flight on top of cached rows.
              2. unread > 0 — "Read all" action.
              3. nothing — invisible spacer to keep the title centred. */}
          {refreshing ? (
            <Text style={s.refreshingHint}>Refreshing…</Text>
          ) : unreadCount > 0 ? (
            <TouchableOpacity onPress={handleMarkAllRead} hitSlop={HIT}>
              <Text style={s.markAllRead}>Read all</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 52 }} />
          )}
        </View>

        {notifications.length === 0 ? (
          <View style={s.emptyContainer}>
            <View style={s.emptyIconCircle}><Text style={s.emptyIconLetter}>N</Text></View>
            <Text style={s.emptyTitle}>No messages yet</Text>
            <Text style={s.emptyMessage}>
              You'll see responses to your feedback and coach check-ins here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <NotificationItem item={item} onPress={handlePress} />
            )}
            contentContainerStyle={s.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, textAlign: 'center' },
  markAllRead: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },
  // "Refreshing…" hint that replaces "Read all" while a background
  // fetch is in flight on top of cached rows. Half-strength pink so
  // it reads as "in progress" not as a tappable action.
  refreshingHint: {
    fontSize: 12, fontFamily: FF.medium, fontWeight: '500',
    color: 'rgba(232,69,139,0.55)', letterSpacing: 0.2,
  },

  list: { paddingHorizontal: 16, paddingBottom: 40 },

  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.surface, borderRadius: 14,
    padding: 16, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  notifCardUnread: {
    backgroundColor: '#1A120A',
    borderColor: '#2A1E10',
  },

  notifIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  notifIconText: { fontSize: 18 },

  notifContent: { flex: 1 },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  notifLabel: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  notifTime: { fontSize: 11, fontFamily: FF.regular, color: colors.textFaint },

  notifTitle: { fontSize: 15, fontWeight: '400', fontFamily: FF.regular, color: colors.text, marginBottom: 2 },
  notifTitleUnread: { fontWeight: '600', fontFamily: FF.semibold },
  notifBody: { fontSize: 13, fontFamily: FF.regular, color: colors.textMid, lineHeight: 18 },

  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginLeft: 8, marginTop: 4 },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyIconLetter: { fontSize: 20, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted },
  emptyTitle: { fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 8 },
  emptyMessage: { fontSize: 14, fontFamily: FF.regular, color: colors.textMid, textAlign: 'center', lineHeight: 20 },
});
