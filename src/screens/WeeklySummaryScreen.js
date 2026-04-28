/**
 * WeeklySummaryScreen — branded "this is how your week went" card.
 *
 * Shown right after a successful weekly check-in submit (and reachable
 * from Home as a manual entry point). The card is designed for
 * screenshot-and-share — bold numbers, big brand mark, the kind of
 * thing a rider posts to a WhatsApp group or Instagram story without
 * editing.
 *
 * v1 share path: React Native's built-in Share API sends a text-only
 * payload via the OS share sheet (so WhatsApp / Instagram Stories
 * /Threads / Mastodon all work natively). Riders who want the visual
 * card simply screenshot the screen — every modern phone has a
 * screenshot share button right after capture.
 *
 * Image-export of the card itself (capture-as-PNG via
 * react-native-view-shot) is an obvious follow-up, but it's a native
 * module that needs an EAS build, so we keep it for later. The text
 * share gets the feature live today.
 *
 * Stats computed locally from the active plan's activities — no
 * server round-trip, instant render. Stats covered:
 *   - Total km this week (completed only)
 *   - Sessions completed / planned
 *   - Longest single ride
 *   - Current streak (consecutive completed sessions)
 *
 * Coach quote is shown if the most recent check-in had AI suggestions
 * with a `summary` field — gives the share a personal flavour.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily } from '../theme';
import { getPlans, getGoals } from '../services/storageService';
import api from '../services/api';
import analytics from '../services/analyticsService';

const FF = fontFamily;

// Computes the activity stats for the current week of the rider's
// active plan. Returns sensible defaults when there's no plan yet so
// the screen still renders something.
function computeWeekStats(plan) {
  const activities = plan?.activities || [];
  const currentWeek = plan?.currentWeek || 1;
  const weekActs = activities.filter(a => a.week === currentWeek);
  const rides = weekActs.filter(a => a.type === 'ride');

  const completedRides = rides.filter(a => a.completed);
  const totalKm = completedRides.reduce((sum, a) => sum + (Number(a.distanceKm) || 0), 0);
  const longestKm = completedRides.reduce((max, a) => Math.max(max, Number(a.distanceKm) || 0), 0);
  const totalMins = completedRides.reduce((sum, a) => sum + (Number(a.durationMins) || 0), 0);

  // Streak across the whole plan — count consecutive completed
  // sessions back from the most recent. Ignores rest days and the
  // gap between rides (a rider doing 3-on, rest, 3-on still has a
  // 6-session streak by this definition).
  const sortedRides = activities
    .filter(a => a.type === 'ride')
    .sort((a, b) => (a.week - b.week) || ((a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0)));
  let streak = 0;
  for (let i = sortedRides.length - 1; i >= 0; i--) {
    if (sortedRides[i].completed) streak++;
    else if (streak > 0) break;
  }

  return {
    totalKm: Math.round(totalKm),
    longestKm: Math.round(longestKm),
    totalMins,
    completed: completedRides.length,
    planned: rides.length,
    streak,
    weekNumber: currentWeek,
  };
}

export default function WeeklySummaryScreen({ navigation }) {
  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);
  const [coachQuote, setCoachQuote] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const plans = await getPlans();
        const goals = await getGoals();
        const active = plans?.find(p => p.status !== 'archived') || plans?.[0] || null;
        setPlan(active);
        setGoal(goals?.find(g => g.id === active?.goalId) || goals?.[0] || null);
        // Pull the most recent check-in's coach summary as the quote.
        // Best-effort — failure here just means no quote in the share.
        try {
          const list = await api.checkins.list?.({ limit: 1 });
          const recent = Array.isArray(list) ? list[0] : null;
          if (recent?.suggestions?.summary && typeof recent.suggestions.summary === 'string') {
            setCoachQuote(recent.suggestions.summary);
          }
        } catch {}
        analytics.events.weeklySummaryViewed?.({});
      } catch {}
    })();
  }, []);

  const stats = useMemo(() => computeWeekStats(plan), [plan]);

  const formatHours = (mins) => {
    if (!mins) return '0h';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  };

  const onShare = async () => {
    // Plain-text share — works on every share-sheet target. Riders who
    // want a visual post screenshot the card above and post it from
    // their photos. Keeps the share fun and human, not corporate.
    const goalLine = goal?.eventName
      ? `Building toward ${goal.eventName}.`
      : (goal?.targetDistance ? `Working toward ${goal.targetDistance} km.` : 'Building the habit.');
    const lines = [
      `Week ${stats.weekNumber} on the bike:`,
      `· ${stats.totalKm} km logged`,
      stats.longestKm > 0 ? `· longest ride ${stats.longestKm} km` : null,
      stats.totalMins > 0 ? `· ${formatHours(stats.totalMins)} in the saddle` : null,
      stats.streak > 1 ? `· ${stats.streak}-session streak` : null,
      '',
      goalLine,
      '',
      'Plan + AI coach via @etapa.app',
    ].filter(Boolean);
    const message = lines.join('\n');
    try {
      analytics.events.weeklySummaryShared?.({ km: stats.totalKm });
      await Share.share({ message }, { dialogTitle: 'Share your week' });
    } catch (err) {
      // User cancelling the share is not an error — only show an alert
      // for genuine errors (rare: typically a content-blocked sheet).
      const msg = err?.message || '';
      if (!/cancel/i.test(msg)) {
        Alert.alert('Share unavailable', 'Couldn\'t open the share sheet. Try again in a moment.');
      }
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBtn}>
          <MaterialCommunityIcons name="close" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Your week</Text>
        <View style={s.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* The branded share card. Designed to hold up as a screenshot
            without further chrome — punchy hero number, week ID, three
            secondary stats, optional coach quote, brand mark. */}
        <LinearGradient
          colors={[colors.primary, '#FF6FB1']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.card}
        >
          <Text style={s.cardEyebrow}>WEEK {stats.weekNumber}</Text>
          <Text style={s.cardHero}>{stats.totalKm}<Text style={s.cardHeroUnit}> km</Text></Text>
          <Text style={s.cardHeroLabel}>logged this week</Text>

          <View style={s.cardStatsRow}>
            <View style={s.cardStat}>
              <Text style={s.cardStatValue}>{stats.completed}/{stats.planned}</Text>
              <Text style={s.cardStatLabel}>sessions</Text>
            </View>
            <View style={s.cardStatDivider} />
            <View style={s.cardStat}>
              <Text style={s.cardStatValue}>{stats.longestKm} km</Text>
              <Text style={s.cardStatLabel}>longest ride</Text>
            </View>
            <View style={s.cardStatDivider} />
            <View style={s.cardStat}>
              <Text style={s.cardStatValue}>{formatHours(stats.totalMins)}</Text>
              <Text style={s.cardStatLabel}>saddle time</Text>
            </View>
          </View>

          {coachQuote ? (
            <View style={s.cardQuote}>
              <Text style={s.cardQuoteText}>{`"${coachQuote.replace(/^"|"$/g, '').slice(0, 180)}"`}</Text>
            </View>
          ) : null}

          {stats.streak > 1 ? (
            <View style={s.cardStreak}>
              <MaterialCommunityIcons name="fire" size={14} color="#FFFFFF" />
              <Text style={s.cardStreakText}>{stats.streak}-session streak</Text>
            </View>
          ) : null}

          <Text style={s.cardBrand}>etapa</Text>
        </LinearGradient>

        <Text style={s.shareHint}>
          Share to your group, your story, anywhere — keeps you accountable and
          maybe pulls a friend onto the bike.
        </Text>

        <TouchableOpacity style={s.shareBtn} onPress={onShare} activeOpacity={0.85}>
          <MaterialCommunityIcons name="share-variant" size={18} color="#FFFFFF" />
          <Text style={s.shareBtnText}>Share my week</Text>
        </TouchableOpacity>

        <Text style={s.tip}>
          Tip: take a screenshot of the card above (Side + Volume Up on iPhone, Power
          + Volume Down on Android) and post it as an image — every share target
          supports photo posts.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 0.5, borderColor: colors.border,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.text, fontFamily: FF.semibold },

  scroll: { padding: 18, paddingBottom: 60 },

  // ── Branded card ──────────────────────────────────────────────────
  card: {
    borderRadius: 22, padding: 24, marginBottom: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
  cardEyebrow: {
    fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)',
    fontFamily: FF.semibold, letterSpacing: 1.5, marginBottom: 8,
  },
  cardHero: {
    fontSize: 64, fontWeight: '800', color: '#FFFFFF', fontFamily: FF.bold,
    lineHeight: 72,
  },
  cardHeroUnit: { fontSize: 32, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  cardHeroLabel: {
    fontSize: 14, color: 'rgba(255,255,255,0.85)', fontFamily: FF.regular,
    marginBottom: 22,
  },
  cardStatsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14, padding: 14, marginBottom: 18,
  },
  cardStat: { flex: 1, alignItems: 'center' },
  cardStatValue: {
    fontSize: 20, fontWeight: '700', color: '#FFFFFF', fontFamily: FF.bold, marginBottom: 2,
  },
  cardStatLabel: {
    fontSize: 11, color: 'rgba(255,255,255,0.85)', fontFamily: FF.regular,
  },
  cardStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.25)' },
  cardQuote: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12, padding: 12, marginBottom: 14,
  },
  cardQuoteText: {
    fontSize: 13, color: '#FFFFFF', fontFamily: FF.regular,
    lineHeight: 19, fontStyle: 'italic',
  },
  cardStreak: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    marginBottom: 14, gap: 5,
  },
  cardStreakText: { fontSize: 12, color: '#FFFFFF', fontFamily: FF.semibold, fontWeight: '600' },
  cardBrand: {
    fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)',
    fontFamily: FF.bold, letterSpacing: 1, marginTop: 4,
  },

  // ── Share controls ────────────────────────────────────────────────
  shareHint: {
    fontSize: 13, color: colors.textMid, fontFamily: FF.regular,
    lineHeight: 19, marginBottom: 18, textAlign: 'center',
  },
  shareBtn: {
    flexDirection: 'row', gap: 8,
    backgroundColor: colors.primary, paddingVertical: 14,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  shareBtnText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', fontFamily: FF.semibold },
  tip: {
    fontSize: 12, color: colors.textMuted, fontFamily: FF.regular,
    lineHeight: 17, textAlign: 'center',
  },
});
