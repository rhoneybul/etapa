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
import { colors, fontFamily } from '../theme';
import { api } from '../services/api';

const FF = fontFamily;

const TYPE_CONFIG = {
  admin_reply:    { icon: '\u{1F4AC}', label: 'Team Response' },
  coach_checkin:  { icon: '\u{1F6B4}', label: 'Coach Check-in' },
  system:         { icon: '\u{1F514}', label: 'Notification' },
};

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

  return (
    <TouchableOpacity
      style={[s.notifCard, !item.read && s.notifCardUnread]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={s.notifIcon}>
        <Text style={s.notifIconText}>{config.icon}</Text>
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api.notifications.list();
      setNotifications(data || []);
    } catch {
      // fail silently
    }
  }, []);

  useEffect(() => {
    fetchNotifications().finally(() => setLoading(false));
  }, []);

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
          {unreadCount > 0 ? (
            <TouchableOpacity onPress={handleMarkAllRead} hitSlop={HIT}>
              <Text style={s.markAllRead}>Read all</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 52 }} />
          )}
        </View>

        {notifications.length === 0 ? (
          <View style={s.emptyContainer}>
            <Text style={s.emptyIcon}>{'\u{1F514}'}</Text>
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
  emptyTitle: { fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 8 },
  emptyMessage: { fontSize: 14, fontFamily: FF.regular, color: colors.textMid, textAlign: 'center', lineHeight: 20 },
});
