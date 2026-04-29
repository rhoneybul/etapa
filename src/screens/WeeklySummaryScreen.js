/**
 * WeeklySummaryScreen — branded "this is how your week went" card.
 *
 * Shown right after a successful weekly check-in submit (and reachable
 * from Home as a manual entry point). The card is designed for
 * screenshot-and-share — bold numbers, big brand mark, the kind of
 * thing a rider posts to a WhatsApp group or Instagram story without
 * editing.
 *
 * Share path: we capture the actual card view via react-native-view-shot
 * and pass the resulting PNG to the OS share sheet (`url` field —
 * WhatsApp / iMessage / Instagram Stories all accept image attachments
 * via this). Riders who want the image in their camera roll tap Share
 * → "Save Image" — the system sheet exposes that as a destination, so
 * we don't need expo-media-library + the photo permission it pulls
 * (and the Google Play Photo and Video Permissions Declaration form
 * that comes with it). One Share button, every outcome.
 *
 * Stats computed locally from the active plan's activities — no
 * server round-trip, instant render. Stats covered:
 *   - Total km this week (completed only)
 *   - Sessions completed / planned
 *   - Longest single ride
 *   - Current streak (consecutive completed sessions)
 *   - 4-week mini-trend bar chart (current week pink, previous 3 grey)
 *
 * Coach quote is shown if the most recent check-in had AI suggestions
 * with a `summary` field — gives the share a personal flavour, and
 * we wrap it with the active coach's name so the quote reads as
 * "Clara · your coach" rather than as anonymous AI output.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Share, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily } from '../theme';
import { getPlans, getGoals, getPlanConfig } from '../services/storageService';
import { getCoach } from '../data/coaches';
import api from '../services/api';
import analytics from '../services/analyticsService';

// Lazy-imports — view-shot is a native module that needs a dev client /
// EAS build to actually work. Wrap the require so this file doesn't
// fail to import when running in Expo Go (the share-as-image path
// simply degrades to text-only there).
//
// We previously also pulled in expo-media-library here so a "Save image"
// button could write the PNG directly into the rider's photo library.
// That dep was removed because Google Play now blocks AAB submissions
// that request READ_MEDIA_IMAGES / READ_MEDIA_VIDEO without filling out
// the Photo and Video Permissions Declaration form, and the same
// outcome — image lands in Photos / Files / chat app — is reachable via
// the OS share sheet ("Save Image" is one of its destinations) with
// zero added permissions. The single Share button below now does both
// "share to a friend" and "save to your camera roll" via that route.
let ViewShot = null; let captureRef = null;
try {
  // eslint-disable-next-line global-require
  const vs = require('react-native-view-shot');
  ViewShot = vs.default || vs.ViewShot;
  captureRef = vs.captureRef;
} catch {}

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

// Compute the last N weeks' completed-km totals as bar-chart data. Used
// for the 4-week mini-trend strip below the stats row. We also compute a
// max so the bar heights can be scaled relative to the tallest week.
function computeRecentWeekKms(plan, count = 4) {
  if (!plan?.activities || !plan?.currentWeek) return { weeks: [], max: 0 };
  const cw = plan.currentWeek || 1;
  const startWeek = Math.max(1, cw - (count - 1));
  const weeks = [];
  for (let w = startWeek; w <= cw; w++) {
    const km = (plan.activities || [])
      .filter(a => a.week === w && a.type === 'ride' && a.completed)
      .reduce((sum, a) => sum + (Number(a.distanceKm) || 0), 0);
    weeks.push({ week: w, km: Math.round(km), isCurrent: w === cw });
  }
  const max = weeks.reduce((m, w) => Math.max(m, w.km), 0);
  return { weeks, max };
}

export default function WeeklySummaryScreen({ navigation }) {
  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);
  const [coachQuote, setCoachQuote] = useState(null);
  const [coach, setCoach] = useState(null);
  // ViewShot ref for the card. captureRef(viewShotRef, {...}) returns
  // a file URI we hand to Share.share's `url` field — the system share
  // sheet then exposes "Save Image", "Save to Files", AirDrop, Messages,
  // and any installed app that handles PNGs.
  const cardRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const plans = await getPlans();
        const goals = await getGoals();
        const active = plans?.find(p => p.status !== 'archived') || plans?.[0] || null;
        setPlan(active);
        setGoal(goals?.find(g => g.id === active?.goalId) || goals?.[0] || null);
        // Resolve the active coach via the plan's configId — getCoach()
        // safely falls back to the default if the id isn't recognised.
        try {
          if (active?.configId) {
            const cfg = await getPlanConfig(active.configId);
            if (cfg?.coachId) setCoach(getCoach(cfg.coachId));
          }
        } catch {}
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
  // 4-week trend strip data, computed once per plan change so the bar
  // chart doesn't re-layout on every render.
  const trend = useMemo(() => computeRecentWeekKms(plan, 4), [plan]);

  const formatHours = (mins) => {
    if (!mins) return '0h';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  };

  // Try to capture the card to a PNG file URI. Returns null on any
  // failure (no view-shot, ref not yet attached, capture threw). The
  // caller is responsible for falling back to text-only share.
  const captureCard = async () => {
    if (!captureRef || !cardRef.current) return null;
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      return uri || null;
    } catch (err) {
      console.warn('captureCard failed:', err);
      return null;
    }
  };

  // Build the textual side of the share — kept as a function because
  // both Share (for image+text) and any text-only fallback want the
  // same copy.
  const buildShareText = () => {
    const goalLine = goal?.eventName
      ? `Building toward ${goal.eventName}.`
      : (goal?.targetDistance ? `Working toward ${goal.targetDistance} km.` : 'Building the habit.');
    const lines = [
      `Week ${stats.weekNumber} on the bike:`,
      `\u00B7 ${stats.totalKm} km logged`,
      stats.longestKm > 0 ? `\u00B7 longest ride ${stats.longestKm} km` : null,
      stats.totalMins > 0 ? `\u00B7 ${formatHours(stats.totalMins)} in the saddle` : null,
      stats.streak > 1 ? `\u00B7 ${stats.streak}-session streak` : null,
      '',
      goalLine,
      '',
      'Plan + AI coach via @etapa.app',
    ].filter(Boolean);
    return lines.join('\n');
  };

  const onShare = async () => {
    // Try the image-share path first. We wait briefly for the ref to
    // settle if the screen just mounted; in practice the capture is
    // instant by the time the user can tap Share.
    const message = buildShareText();
    let uri = await captureCard();
    try {
      analytics.events.weeklySummaryShared?.({ km: stats.totalKm, withImage: !!uri });
      if (uri) {
        // iOS reads `url` to attach a file; Android reads `message`
        // and (since RN 0.72) also `url` for some apps. Pass both so
        // each platform picks the right field.
        await Share.share(
          Platform.OS === 'ios' ? { url: uri, message } : { message, url: uri },
          { dialogTitle: 'Share your week' },
        );
      } else {
        await Share.share({ message }, { dialogTitle: 'Share your week' });
      }
    } catch (err) {
      const msg = err?.message || '';
      if (!/cancel/i.test(msg)) {
        Alert.alert('Share unavailable', "Couldn't open the share sheet. Try again in a moment.");
      }
    }
  };

  // The previous "Save image" button (which wrote the PNG straight into
  // the camera roll via MediaLibrary.saveToLibraryAsync) lived here.
  // It's gone — see the comment at the top of this file. Riders who
  // want the image in Photos hit Share → Save Image; same outcome, no
  // photo-library permission, no Play Console declaration form.

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
        {/* The branded share card. Wrapped in ViewShot so we can capture
            it as a PNG via captureRef on Share / Save image taps. The
            wrapper component degrades gracefully — when view-shot isn't
            installed (Expo Go, older builds), CardWrap is just a View
            and the captureCard() helper returns null. */}
        {(() => {
          const CardWrap = ViewShot || View;
          return (
            <CardWrap
              ref={cardRef}
              options={{ format: 'png', quality: 1 }}
              style={s.cardWrap}
            >
              <LinearGradient
                colors={[colors.primary, '#FF6FB1']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.card}
              >
                {/* Top-left brand mark — pink rounded square with a
                    white "E". Anchors the card visually so a cropped
                    screenshot still reads as Etapa. */}
                <View style={s.cardLogoRow}>
                  <View style={s.logoBadge}>
                    <Text style={s.logoBadgeText}>E</Text>
                  </View>
                  <Text style={s.cardEyebrow}>WEEK {stats.weekNumber}</Text>
                </View>

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

                {/* 4-week trend strip — small bars showing recent week
                    km totals. Current week pink (matches the card's
                    palette but slightly opaque), previous 3 weeks in
                    semi-transparent white so the eye lands on the
                    current number first. Hidden when there's no
                    completed history yet (max=0) — the strip would
                    just render empty space. */}
                {trend.weeks.length > 0 && trend.max > 0 && (
                  <View style={s.trendWrap}>
                    <Text style={s.trendLabel}>Last {trend.weeks.length} weeks</Text>
                    <View style={s.trendBars}>
                      {trend.weeks.map((w, i) => {
                        const heightPct = trend.max > 0 ? (w.km / trend.max) : 0;
                        // Cap the minimum height so empty weeks still
                        // draw a hairline rather than vanishing.
                        const h = Math.max(3, Math.round(heightPct * 36));
                        return (
                          <View key={i} style={s.trendBarCol}>
                            <View
                              style={[
                                s.trendBar,
                                { height: h },
                                w.isCurrent ? s.trendBarCurrent : s.trendBarPast,
                              ]}
                            />
                            <Text style={s.trendBarValue}>{w.km}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {coachQuote ? (
                  <View style={s.cardQuote}>
                    {/* "Clara · your coach" — light-weight attribution
                        line above the quote so the rider sees who said
                        it. Falls back to a generic label when the coach
                        isn't resolved yet. */}
                    <Text style={s.cardQuoteAttr}>
                      {coach?.name ? `${coach.name} \u00B7 your coach` : 'Your coach'}
                    </Text>
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
            </CardWrap>
          );
        })()}

        <Text style={s.shareHint}>
          Share to your group, your story, anywhere — keeps you accountable and
          maybe pulls a friend onto the bike.
        </Text>

        {/* Single Share button. Used to be paired with a "Save image"
            button that wrote straight to the camera roll via expo-
            media-library; that dep was removed because it pulls Android
            photo permissions Google Play now blocks without a Photos
            Permissions Declaration. Riders who want the PNG in their
            camera roll tap Share → "Save Image" — same outcome, no
            permission, one less button on the screen. */}
        <TouchableOpacity style={s.shareBtn} onPress={onShare} activeOpacity={0.85}>
          <MaterialCommunityIcons name="share-variant" size={18} color="#FFFFFF" />
          <Text style={s.shareBtnText}>Share my week</Text>
        </TouchableOpacity>
        <Text style={s.saveHint}>
          Want it in your camera roll? Tap Share → Save Image.
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
  // The ViewShot wrapper sits at this level — we add `marginBottom`
  // here (rather than on the gradient itself) so the captured image
  // crops tightly to the card's visual edge without bleeding margin.
  cardWrap: { marginBottom: 22 },
  card: {
    borderRadius: 22, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },

  // Top-left brand mark — small pink rounded square with white "E".
  // Stays inside the card so a cropped screenshot retains the brand.
  cardLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  logoBadge: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  logoBadgeText: { fontSize: 13, fontWeight: '800', color: colors.primary, fontFamily: FF.semibold },
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

  // 4-week trend strip
  trendWrap: { marginBottom: 18 },
  trendLabel: {
    fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.85)',
    fontFamily: FF.medium, letterSpacing: 0.6, textTransform: 'uppercase',
    marginBottom: 8,
  },
  trendBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 50 },
  trendBarCol: { flex: 1, alignItems: 'center', marginHorizontal: 4 },
  trendBar: { width: '100%', borderRadius: 4 },
  trendBarPast: { backgroundColor: 'rgba(255,255,255,0.4)' },
  // Current week — slightly more saturated. The card itself is on a
  // pink gradient so we use white-with-high-opacity (instead of pink)
  // to keep contrast.
  trendBarCurrent: { backgroundColor: 'rgba(255,255,255,0.95)' },
  trendBarValue: {
    fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.85)',
    fontFamily: FF.medium, marginTop: 4,
  },

  cardQuote: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12, padding: 12, marginBottom: 14,
  },
  cardQuoteAttr: {
    fontSize: 10, fontWeight: '500', color: 'rgba(255,255,255,0.75)',
    fontFamily: FF.medium, letterSpacing: 0.4, marginBottom: 6,
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
  // Two-button row — Share + Save image side by side. Share is the
  // primary affordance (filled pink) since most riders want it on a
  // group chat directly; Save is the ghost variant for the "I'll
  // post this manually to Stories later" path.
  // Single Share button. The previous version paired this with a ghost
  // Save-image button via btnRow + saveBtn styles; both gone because
  // the Save-image affordance now lives inside the OS share sheet
  // (Save Image / Save to Files). One less style, one less button.
  shareBtn: {
    flexDirection: 'row', gap: 8,
    backgroundColor: colors.primary, paddingVertical: 14,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  shareBtnText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', fontFamily: FF.semibold },
  // Small caption under the Share button telling the rider the camera-
  // roll path. Plain English, one line, no link — just primes them
  // that the system sheet has Save Image as an option.
  saveHint: {
    fontSize: 12, color: colors.textMuted, fontFamily: FF.regular,
    textAlign: 'center', marginTop: 10, lineHeight: 17,
  },
});
