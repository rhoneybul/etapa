/**
 * CoachChatCard — the prominent "Chat with your coach" card used on the
 * Home screen, and (for visual consistency) on the Week view and Activity
 * detail screens. Previously each screen rendered its own ad-hoc "Ask
 * coach" pill or bar, which meant three different visual treatments for
 * the same action. Consolidating here means any future tweak to the
 * coach entry-point only needs to happen in one place.
 *
 * Props:
 *   - coach:   result of getCoach(coachId) — may be null/undefined; we
 *              fall back to generic name/colour/initials
 *   - onPress: invoked when the whole card is tapped
 *   - subtitleOverride: optional custom sub-line. Defaults to the
 *                       Home-screen copy. Useful on the week-view where
 *                       "ask about this week" is more context-specific.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily } from '../theme';

const FF = fontFamily;

export default function CoachChatCard({ coach, onPress, subtitleOverride, unreadCount = 0, style }) {
  const coachName = coach?.name || 'Your coach';
  const coachColor = coach?.avatarColor || colors.primary;
  const coachInitials = coach?.avatarInitials || '?';
  const subtitle = subtitleOverride || 'Get advice, tweak your plan, ask anything about your training';
  const hasUnread = unreadCount > 0;

  return (
    <TouchableOpacity
      style={[s.coachCard, style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={s.coachCardTop}>
        <View style={[s.coachAvatar, { backgroundColor: coachColor }]}>
          <Text style={s.coachAvatarText}>{coachInitials}</Text>
          {/* Pink unread badge anchored to the avatar — mirrors the
              iOS app-icon convention. Shows "1" (or the actual count,
              capped at 9+). Hidden when no unread replies. */}
          {hasUnread && (
            <View style={s.coachUnreadBadge}>
              <Text style={s.coachUnreadBadgeText}>
                {unreadCount > 9 ? '9+' : String(unreadCount)}
              </Text>
            </View>
          )}
        </View>
        <View style={s.coachCardTextWrap}>
          <Text style={s.coachCardName}>{coachName}</Text>
          <Text style={s.coachCardHint}>
            {hasUnread
              ? `${unreadCount} new ${unreadCount === 1 ? 'reply' : 'replies'}`
              : 'Chat with your coach'}
          </Text>
        </View>
        <View style={s.coachCardArrowWrap}>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.primary} />
        </View>
      </View>
      <Text style={s.coachCardSub}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  // Kept visually identical to HomeScreen's inline `coachCard` so the
  // promotion on Home and the entry-points on Week/Activity read as the
  // same component. Any tweak here automatically applies everywhere.
  coachCard: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: 'rgba(232,69,139,0.3)',
    padding: 16,
    shadowColor: '#E8458B', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
  },
  coachCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coachAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative', // badge anchors to this
  },
  // Unread-reply badge — anchored to the avatar's top-right corner.
  // Sits on top of whatever the avatar is showing (initials / photo)
  // and uses a white ring so it stays legible against any avatar colour.
  coachUnreadBadge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.surface,
  },
  coachUnreadBadgeText: {
    color: '#fff', fontSize: 10, fontWeight: '700', fontFamily: FF.semibold,
    lineHeight: 14, letterSpacing: 0.2,
  },
  coachAvatarText: { fontSize: 14, fontWeight: '700', color: '#fff', fontFamily: FF.semibold },
  coachCardTextWrap: { flex: 1 },
  coachCardName: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  coachCardHint: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.primary, marginTop: 1 },
  coachCardArrowWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(232,69,139,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  coachCardSub: {
    fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted,
    marginTop: 10, lineHeight: 17,
  },
});
