/**
 * Plan Overview — shows the full plan build-up, weekly volume chart,
 * phase descriptions, and free-text AI edit input.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, StatusBar, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily, BOTTOM_INSET } from '../theme';
import useScreenGuard from '../hooks/useScreenGuard';
import { getPlans, getGoals, getWeekActivities, getPlanConfig, updatePlanConfig } from '../services/storageService';
import { getCrossTrainingLabel } from '../utils/sessionLabels';
import { syncStravaActivities, getStravaActivitiesForWeek } from '../services/stravaSyncService';
import { isStravaConnected } from '../services/stravaService';
import analytics from '../services/analyticsService';
import CoachChatCard from '../components/CoachChatCard';
import { getCoach } from '../data/coaches';

const DAY_LABELS = [
  { key: 'monday', short: 'MON' }, { key: 'tuesday', short: 'TUE' },
  { key: 'wednesday', short: 'WED' }, { key: 'thursday', short: 'THU' },
  { key: 'friday', short: 'FRI' }, { key: 'saturday', short: 'SAT' },
  { key: 'sunday', short: 'SUN' },
];

const FF = fontFamily;

function getPlanPhases(totalWeeks) {
  if (totalWeeks <= 4) {
    return [{ name: 'Build', start: 1, end: totalWeeks, desc: 'Progressive volume and intensity increase' }];
  }
  const baseEnd = Math.ceil(totalWeeks * 0.3);
  const buildEnd = Math.ceil(totalWeeks * 0.65);
  const peakEnd = Math.ceil(totalWeeks * 0.85);
  const phases = [
    { name: 'Base', start: 1, end: baseEnd, desc: 'Building aerobic foundation with steady volume' },
    { name: 'Build', start: baseEnd + 1, end: buildEnd, desc: 'Increasing intensity and sport-specific work' },
    { name: 'Peak', start: buildEnd + 1, end: peakEnd, desc: 'Highest load — sharpening fitness' },
    { name: 'Taper', start: peakEnd + 1, end: totalWeeks, desc: 'Reducing volume to arrive fresh' },
  ];
  return phases.filter(p => p.start <= p.end);
}

// Week flag colours and labels.
// Palette kept to brand pinks + slate-blues — no reds/ambers (feedback
// was that the red "Peak week" chip looked alarming and didn't match
// the rest of the app). Peak now uses a warm pink so it still reads as
// "this is an important week" without a stop-sign connotation.
const WEEK_FLAGS = {
  recovery: { label: 'Recovery', color: '#6B8CC7', bg: 'rgba(107,140,199,0.14)' },
  peak:     { label: 'Peak week', color: '#E8458B', bg: 'rgba(232,69,139,0.14)' },
  longest:  { label: 'Longest ride', color: '#E8458B', bg: 'rgba(232,69,139,0.12)' },
  taper:    { label: 'Taper', color: '#E8458B', bg: 'rgba(232,69,139,0.12)' },
  test:     { label: 'Test week', color: '#6B8CC7', bg: 'rgba(107,140,199,0.14)' },
};

function getWeekFlags(weekVolumes, phases, plan) {
  const flags = weekVolumes.map(() => []);
  const maxKmWeek = weekVolumes.reduce((best, v, i) => v.totalKm > (weekVolumes[best]?.totalKm || 0) ? i : best, 0);

  // Find the week with the single longest ride
  let longestRideKm = 0;
  let longestRideWeek = -1;
  for (let w = 0; w < plan.weeks; w++) {
    const acts = (plan.activities || []).filter(a => a.week === w + 1);
    acts.forEach(a => {
      if ((a.distanceKm || 0) > longestRideKm) {
        longestRideKm = a.distanceKm;
        longestRideWeek = w;
      }
    });
  }

  // Only ONE week gets the "peak week" label — the single highest-volume
  // week across the whole plan. Previously every non-deload week inside
  // the Peak phase was flagged, which meant a 12-week plan showed three
  // peak weeks back-to-back — confusing and dilutes the signal. The
  // peak phase itself is still visible via the training-phases section
  // lower on the screen; the week-flag is the "this one, right here" cue.
  weekVolumes.forEach((v, i) => {
    const weekNum = i + 1;
    const isDeload = weekNum % 4 === 0;
    const phase = phases.find(p => weekNum >= p.start && weekNum <= p.end);

    if (isDeload) flags[i].push('recovery');
    if (phase?.name === 'Taper') flags[i].push('taper');
    if (phase?.name === 'Peak' && i === maxKmWeek && !isDeload) flags[i].push('peak');
    if (i === longestRideWeek && longestRideKm > 0) flags[i].push('longest');
  });

  return flags;
}

// Ride type colors for stacked bars.
// Saturated pinks + slate-blues. Previous palette (soft pastels) was
// too faint against the app's dark background — users reported the
// bars "not showing" at all. Each color is picked to pop: endurance
// uses the brand primary pink, intervals a deep raspberry, and so on.
// Brand primary (#E8458B) is reserved for the endurance fill — the
// current-week BORDER uses the same hue but is visually distinct
// because it's 1.5px stroke rather than fill.
const RIDE_TYPE_COLORS = {
  recovery:   '#85B7EB',      // mid blue — easiest, cool
  endurance:  '#F472B6',      // bright magenta-pink — aerobic base (pops on dark)
  tempo:      '#D85A30',      // coral — moderate intensity
  intervals:  '#993556',      // deep raspberry — high intensity
  indoor:     '#378ADD',      // vivid blue — distinct indoor
  strength:   '#7F77DD',      // purple — different modality
  other:      '#85B7EB',      // fall back to recovery blue so nothing ever goes grey
};

const RIDE_TYPE_LABELS = {
  endurance: 'Endurance',
  tempo: 'Tempo',
  intervals: 'Intervals',
  recovery: 'Recovery',
  indoor: 'Indoor',
  strength: 'Strength',
};

function getWeekVolume(plan, weekNum) {
  const acts = getWeekActivities(plan, weekNum);
  const totalKm = acts.reduce((s, a) => s + (a.distanceKm || 0), 0);
  const totalMins = acts.reduce((s, a) => s + (a.durationMins || 0), 0);
  const rideCount = acts.filter(a => a.type === 'ride').length;
  const strengthCount = acts.filter(a => a.type === 'strength').length;

  // Break down km by session category for stacked bars.
  //
  // CRITICAL: every kilometre that contributes to totalKm MUST also
  // land in a recognised bucket, otherwise the rendered bar height
  // (sized to totalKm) is taller than the sum of the segments and
  // the bottom of the bar shows the dark track — the "bars are only
  // half-filled" bug. Previously, ride subTypes like `long`, `hills`,
  // `threshold`, `sweet_spot` went into their own buckets which were
  // then filtered out by the typeOrder allow-list, silently dropping
  // their km from the visualisation.
  //
  // Bucketing rules:
  //   - strength            → 'strength'
  //   - ride.subType in known set → that subType's bucket
  //   - ride with unknown / no subType → 'endurance' (default aerobic)
  //   - cross-training (run, swim, hike, row, …) → 'endurance' (it's
  //     aerobic distance work, colour as endurance for honesty)
  const KNOWN_RIDE_SUBTYPES = new Set(['endurance', 'tempo', 'intervals', 'indoor', 'recovery']);
  const byType = {};
  acts.forEach(a => {
    let key;
    if (a.type === 'strength') {
      key = 'strength';
    } else if (a.type === 'ride') {
      key = KNOWN_RIDE_SUBTYPES.has(a.subType) ? a.subType : 'endurance';
    } else {
      key = 'endurance';
    }
    const km = a.distanceKm || 0;
    if (!byType[key]) byType[key] = 0;
    byType[key] += km;
  });

  // Convert to ordered segments array. Every bucket that has km is
  // guaranteed to be in typeOrder now, so the filter below only drops
  // empty buckets — never a real km contribution.
  const typeOrder = ['endurance', 'tempo', 'intervals', 'indoor', 'recovery', 'strength'];
  const segments = typeOrder
    .filter(t => byType[t] > 0)
    .map(t => ({ type: t, km: byType[t], color: RIDE_TYPE_COLORS[t] || RIDE_TYPE_COLORS.other }));

  return { totalKm, totalMins, rideCount, strengthCount, total: acts.length, segments };
}

export default function PlanOverviewScreen({ navigation, route }) {
  const _screenGuard = useScreenGuard('PlanOverviewScreen', navigation);
  const planId = route.params?.planId;
  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);
  const [planConfig, setPlanConfig] = useState(null);
  const [recurringRides, setRecurringRides] = useState([]);
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [recurringForm, setRecurringForm] = useState({ day: null, durationMins: '', distanceKm: '', elevationM: '', notes: '' });
  const [stravaActivities, setStravaActivities] = useState([]);

  const load = useCallback(async () => {
    const plans = await getPlans();
    const p = plans.find(pl => pl.id === planId) || plans[0];
    setPlan(p);
    if (p) {
      const goals = await getGoals();
      setGoal(goals.find(g => g.id === p.goalId) || null);
      if (p.configId) {
        const cfg = await getPlanConfig(p.configId);
        setPlanConfig(cfg);
        setRecurringRides(cfg?.recurringRides || []);
      }
      analytics.events.planOverviewViewed(p.id, p.weeks);
      // Load Strava data (non-blocking)
      isStravaConnected().then(connected => {
        if (connected) {
          syncStravaActivities(p).then(result => {
            if (result?.stravaActivities) setStravaActivities(result.stravaActivities);
          }).catch(() => {});
        }
      });
    }
  }, [planId]);

  const addRecurringRide = async () => {
    if (!recurringForm.day) { Alert.alert('Select a day'); return; }
    if (!recurringForm.durationMins && !recurringForm.distanceKm) { Alert.alert('Add details', 'Enter at least a duration or distance.'); return; }
    const ride = {
      id: Date.now().toString(36),
      day: recurringForm.day,
      durationMins: recurringForm.durationMins ? parseInt(recurringForm.durationMins, 10) : null,
      distanceKm: recurringForm.distanceKm ? parseFloat(recurringForm.distanceKm) : null,
      elevationM: recurringForm.elevationM ? parseInt(recurringForm.elevationM, 10) : null,
      notes: recurringForm.notes || '',
    };
    const updated = [...recurringRides, ride];
    setRecurringRides(updated);
    if (planConfig) await updatePlanConfig(planConfig.id, { recurringRides: updated });
    setRecurringForm({ day: null, durationMins: '', distanceKm: '', elevationM: '', notes: '' });
    setShowAddRecurring(false);
  };

  const removeRecurringRide = async (id) => {
    const updated = recurringRides.filter(r => r.id !== id);
    setRecurringRides(updated);
    if (planConfig) await updatePlanConfig(planConfig.id, { recurringRides: updated });
  };

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  if (!plan) return null;

  const phases = getPlanPhases(plan.weeks);
  const weekVolumes = Array.from({ length: plan.weeks }, (_, i) => getWeekVolume(plan, i + 1));
  const maxKm = Math.max(...weekVolumes.map(v => v.totalKm), 1);
  const weekFlags = getWeekFlags(weekVolumes, phases, plan);

  const now = new Date();
  const startParts = plan.startDate.split('T')[0].split('-');
  const start = new Date(Number(startParts[0]), Number(startParts[1]) - 1, Number(startParts[2]), 12, 0, 0);
  const daysSince = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const currentWeek = Math.max(1, Math.min(Math.floor(daysSince / 7) + 1, plan.weeks));

  const totalKm = weekVolumes.reduce((s, v) => s + v.totalKm, 0);
  const totalSessions = plan.activities?.length || 0;
  const totalHours = weekVolumes.reduce((s, v) => s + v.totalMins, 0) / 60;

  if (_screenGuard.blocked) return _screenGuard.render();

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>{plan.name || 'Your Plan'}</Text>
          <View style={{ width: 32 }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : (StatusBar.currentHeight ?? 0)}
        >
          <ScrollView
            style={s.scroll}
            contentContainerStyle={{ paddingBottom: 32 + BOTTOM_INSET }}
            showsVerticalScrollIndicator={false}
          >
            {/* Stats */}
            <View style={s.statsRow}>
              <View style={s.statBox}>
                <Text style={s.statValue}>{Math.round(totalKm)}</Text>
                <Text style={s.statLabel}>Total km</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statValue}>{totalSessions}</Text>
                <Text style={s.statLabel}>Sessions</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statValue}>{totalHours.toFixed(0)}</Text>
                <Text style={s.statLabel}>Hours</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statValue}>{plan.weeks}</Text>
                <Text style={s.statLabel}>Weeks</Text>
              </View>
            </View>

            {/* Volume chart — stacked by ride type */}
            <View style={s.chartCard}>
              <Text style={s.chartTitle}>Weekly volume</Text>
              <View style={s.chartArea}>
                {weekVolumes.map((v, i) => {
                  const totalH = maxKm > 0 ? Math.max(4, (v.totalKm / maxKm) * 100) : 4;
                  const isCurrent = i + 1 === currentWeek;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={s.chartCol}
                      onPress={() => navigation.navigate('WeekView', { week: i + 1, planId: plan.id })}
                      activeOpacity={0.7}
                    >
                      {v.totalKm > 0 && (
                        <Text style={[s.chartBarLabel, isCurrent && { color: '#E8458B' }]}>
                          {Math.round(v.totalKm)}
                        </Text>
                      )}
                      <View style={[s.chartBarStack, { height: totalH }, isCurrent && s.chartBarStackCurrent]}>
                        {v.segments.length > 0 ? (() => {
                          // Render each segment, then a "remainder"
                          // catch-all in the dominant colour if for any
                          // reason segments don't sum to totalKm. This
                          // is the belt-and-braces fix for the
                          // "bars are half-filled" bug — the bar's
                          // height is sized to totalKm so the segments
                          // MUST cover it visually, even if the data
                          // upstream had a category mismatch.
                          const segmentSum = v.segments.reduce((s, seg) => s + seg.km, 0);
                          const remainder = Math.max(0, v.totalKm - segmentSum);
                          const dominant = v.segments.reduce(
                            (best, seg) => (seg.km > best.km ? seg : best),
                            v.segments[0],
                          );
                          return (
                            <>
                              {v.segments.map((seg, si) => {
                                const segH = v.totalKm > 0 ? (seg.km / v.totalKm) * totalH : 0;
                                return (
                                  <View
                                    key={si}
                                    style={{
                                      width: '100%',
                                      height: segH,
                                      backgroundColor: seg.color,
                                    }}
                                  />
                                );
                              })}
                              {remainder > 0 && dominant && (
                                <View
                                  style={{
                                    width: '100%',
                                    height: (remainder / v.totalKm) * totalH,
                                    backgroundColor: dominant.color,
                                  }}
                                />
                              )}
                            </>
                          );
                        })() : (
                          // Empty-week fallback (no rides, only strength
                          // or rest). Brighter pink than the track so
                          // the bar still reads as data rather than as
                          // empty chart space.
                          <View style={{ width: '100%', height: totalH, backgroundColor: 'rgba(244,114,182,0.55)', borderRadius: 3 }} />
                        )}
                      </View>
                      {/* Strava actual km label */}
                      {(() => {
                        const weekStrava = getStravaActivitiesForWeek(stravaActivities, i + 1);
                        const actualKm = Math.round(weekStrava.reduce((s, a) => s + (a.distanceKm || 0), 0));
                        if (actualKm <= 0) return null;
                        return (
                          <Text style={s.stravaBarLabel}>{actualKm}</Text>
                        );
                      })()}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={s.chartDateRow}>
                {weekVolumes.map((_, i) => {
                  const showLabel = i === 0 || (i + 1) % 4 === 0 || i === plan.weeks - 1;
                  if (!showLabel) return <View key={i} style={s.chartDateCol} />;
                  const weekStart = new Date(start);
                  weekStart.setDate(weekStart.getDate() + i * 7);
                  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                  const dateLabel = `${monthNames[weekStart.getMonth()]} ${weekStart.getDate()}`;
                  const isCurrent = i + 1 === currentWeek;
                  return (
                    <View key={i} style={s.chartDateCol}>
                      <Text style={[s.chartDateLabel, isCurrent && s.chartDateLabelCurrent]}>{dateLabel}</Text>
                    </View>
                  );
                })}
              </View>
              {/* Dynamic legend — session types are solid dots (they
                  represent fills inside the bar). The "This week"
                  entry is a ring, not a dot, because the current-week
                  treatment on the chart is a pink BORDER around the
                  bar, not a coloured fill. Using a ring for the
                  legend icon matches the actual visual and stops
                  users reading "Current" as yet another ride type. */}
              <View style={s.chartLegend}>
                {(() => {
                  const typesUsed = new Set();
                  weekVolumes.forEach(v => v.segments.forEach(seg => typesUsed.add(seg.type)));
                  const typeOrder = ['endurance', 'tempo', 'intervals', 'indoor', 'recovery', 'strength'];
                  return typeOrder.filter(t => typesUsed.has(t)).map(t => (
                    <View key={t} style={s.legendItem}>
                      <View style={[s.legendDot, { backgroundColor: RIDE_TYPE_COLORS[t] }]} />
                      <Text style={s.legendText}>{RIDE_TYPE_LABELS[t]}</Text>
                    </View>
                  ));
                })()}
                <View style={s.legendItem}>
                  <View style={s.legendRing} />
                  <Text style={s.legendText}>This week</Text>
                </View>
                {stravaActivities.length > 0 && (
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: '#FC4C02' }]} />
                    <Text style={s.legendText}>Strava actual</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Phases */}
            <Text style={s.sectionTitle}>Training phases</Text>
            {phases.map((phase, i) => (
              <View key={i} style={s.phaseCard}>
                <View style={s.phaseHeader}>
                  <Text style={s.phaseName}>{phase.name}</Text>
                  <Text style={s.phaseWeeks}>Weeks {phase.start}{'\u2013'}{phase.end}</Text>
                </View>
                <Text style={s.phaseDesc}>{phase.desc}</Text>
                {currentWeek >= phase.start && currentWeek <= phase.end && (
                  <View style={s.currentBadge}>
                    <Text style={s.currentBadgeText}>You are here</Text>
                  </View>
                )}
              </View>
            ))}

            {/* Week by week */}
            <Text style={s.sectionTitle}>Week by week</Text>
            {weekVolumes.map((v, i) => {
              const weekNum = i + 1;
              const isDeload = weekNum % 4 === 0;
              const isCurrent = weekNum === currentWeek;
              const isPast = weekNum < currentWeek;
              const weekStart = new Date(start);
              weekStart.setDate(weekStart.getDate() + i * 7);
              const weekEnd = new Date(weekStart);
              weekEnd.setDate(weekEnd.getDate() + 6);
              const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const fmtDate = (d) => `${d.getDate()} ${monthNames[d.getMonth()]}`;
              const dateRange = `${fmtDate(weekStart)} \u2013 ${fmtDate(weekEnd)}`;
              return (
                <TouchableOpacity
                  key={i}
                  style={[s.weekRow, isCurrent && s.weekRowCurrent]}
                  onPress={() => navigation.navigate('WeekView', { week: weekNum, planId: plan.id })}
                  activeOpacity={0.7}
                >
                  <View style={[s.weekNumCol, isCurrent && s.weekNumColCurrent]}>
                    <Text style={[s.weekNum, isCurrent && s.weekNumCurrent]}>{weekNum}</Text>
                  </View>
                  <View style={s.weekInfo}>
                    <View style={s.weekTitleRow}>
                      <Text style={[s.weekTitle, isPast && s.weekTitlePast]}>
                        {isDeload ? 'Recovery week' : `Week ${weekNum}`}
                      </Text>
                      {weekFlags[i].map((flag, fi) => {
                        const f = WEEK_FLAGS[flag];
                        if (!f) return null;
                        return (
                          <View key={fi} style={[s.weekFlagBadge, { backgroundColor: f.bg }]}>
                            <Text style={[s.weekFlagText, { color: f.color }]}>{f.label}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <Text style={s.weekDate}>{dateRange}</Text>
                    <Text style={s.weekMeta}>
                      {v.rideCount > 0 ? `${v.rideCount} ride${v.rideCount > 1 ? 's' : ''}` : ''}
                      {v.rideCount > 0 && v.strengthCount > 0 ? ' \u00B7 ' : ''}
                      {v.strengthCount > 0 ? `${v.strengthCount} strength` : ''}
                      {v.totalKm > 0 ? ` \u00B7 ${Math.round(v.totalKm)} km` : ''}
                      {(() => {
                        const weekStrava = getStravaActivitiesForWeek(stravaActivities, weekNum);
                        if (weekStrava.length === 0) return '';
                        const actualKm = Math.round(weekStrava.reduce((s, a) => s + (a.distanceKm || 0), 0));
                        return actualKm > 0 ? ` \u00B7 ${actualKm} km actual` : '';
                      })()}
                      {(() => {
                        // Show cross-training from config
                        const ctDays = planConfig?.crossTrainingDaysFull;
                        if (!ctDays) return '';
                        const allCt = new Set();
                        Object.values(ctDays).forEach(arr => {
                          if (Array.isArray(arr)) arr.forEach(k => allCt.add(k));
                        });
                        if (allCt.size === 0) return '';
                        const prefix = (v.rideCount > 0 || v.strengthCount > 0 || v.totalKm > 0) ? ' \u00B7 ' : '';
                        const labels = Array.from(allCt).map(k => getCrossTrainingLabel(k));
                        return prefix + labels.join(', ');
                      })()}
                    </Text>
                  </View>
                  <Text style={s.weekArrow}>{'\u203A'}</Text>
                </TouchableOpacity>
              );
            })}
            {/* ── Recurring rides section ── */}
            <View style={s.recurringSection}>
              <Text style={s.recurringSectionTitle}>Recurring rides</Text>
              <Text style={s.recurringSectionHint}>
                These rides repeat every week. Your plan is built around them.
              </Text>

              {recurringRides.map(ride => (
                <View key={ride.id} style={s.recurringCard}>
                  <View style={s.recurringCardRow}>
                    <View style={[s.recurringDayBadge, { backgroundColor: colors.primary + '18' }]}>
                      <Text style={s.recurringDayBadgeText}>{DAY_LABELS.find(d => d.key === ride.day)?.short || ride.day}</Text>
                    </View>
                    <View style={s.recurringDetails}>
                      {ride.durationMins && <Text style={s.recurringDetail}>{ride.durationMins} min</Text>}
                      {ride.distanceKm && <Text style={s.recurringDetail}>{ride.distanceKm} km</Text>}
                      {ride.elevationM && <Text style={s.recurringDetail}>{ride.elevationM}m elev</Text>}
                    </View>
                    <TouchableOpacity onPress={() => removeRecurringRide(ride.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={s.recurringRemove}>{'\u00D7'}</Text>
                    </TouchableOpacity>
                  </View>
                  {ride.notes ? <Text style={s.recurringNotes}>{ride.notes}</Text> : null}
                </View>
              ))}

              {recurringRides.length === 0 && !showAddRecurring && (
                <Text style={s.recurringEmpty}>No recurring rides set up yet.</Text>
              )}

              {showAddRecurring ? (
                <View style={s.recurringForm}>
                  <Text style={s.recurringFormLabel}>Which day?</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.recurringDayScroll}>
                    {DAY_LABELS.map(d => (
                      <TouchableOpacity
                        key={d.key}
                        style={[s.recurringDayPill, recurringForm.day === d.key && s.recurringDayPillSel]}
                        onPress={() => setRecurringForm(f => ({ ...f, day: d.key }))}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.recurringDayPillText, recurringForm.day === d.key && s.recurringDayPillTextSel]}>{d.short}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <View style={s.recurringInputRow}>
                    <View style={s.recurringInputGroup}>
                      <Text style={s.recurringInputLabel}>Duration</Text>
                      <TextInput style={s.recurringInput} placeholder="mins" placeholderTextColor={colors.textFaint} keyboardType="numeric" value={recurringForm.durationMins} onChangeText={v => setRecurringForm(f => ({ ...f, durationMins: v }))} />
                    </View>
                    <View style={s.recurringInputGroup}>
                      <Text style={s.recurringInputLabel}>Distance</Text>
                      <TextInput style={s.recurringInput} placeholder="km" placeholderTextColor={colors.textFaint} keyboardType="numeric" value={recurringForm.distanceKm} onChangeText={v => setRecurringForm(f => ({ ...f, distanceKm: v }))} />
                    </View>
                    <View style={s.recurringInputGroup}>
                      <Text style={s.recurringInputLabel}>Elevation</Text>
                      <TextInput style={s.recurringInput} placeholder="m" placeholderTextColor={colors.textFaint} keyboardType="numeric" value={recurringForm.elevationM} onChangeText={v => setRecurringForm(f => ({ ...f, elevationM: v }))} />
                    </View>
                  </View>
                  <TextInput style={s.recurringNotesInput} placeholder="Notes (e.g. 'Friday club ride')" placeholderTextColor={colors.textFaint} value={recurringForm.notes} onChangeText={v => setRecurringForm(f => ({ ...f, notes: v }))} />
                  <View style={s.recurringFormActions}>
                    <TouchableOpacity style={s.recurringCancelBtn} onPress={() => { setShowAddRecurring(false); setRecurringForm({ day: null, durationMins: '', distanceKm: '', elevationM: '', notes: '' }); }}>
                      <Text style={s.recurringCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.recurringAddBtn} onPress={addRecurringRide}>
                      <Text style={s.recurringAddBtnText}>Add ride</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={s.recurringAddTrigger} onPress={() => setShowAddRecurring(true)} activeOpacity={0.7}>
                  <Text style={s.recurringAddTriggerPlus}>+</Text>
                  <Text style={s.recurringAddTriggerText}>Add a recurring ride</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Plan actions — regenerate / version history */}
            <View style={s.planActionsRow}>
              <TouchableOpacity
                style={s.planActionCard}
                onPress={() => navigation.navigate('RegeneratePlan', { plan })}
                activeOpacity={0.85}
              >
                <Text style={s.planActionTitle}>Regenerate plan</Text>
                <Text style={s.planActionSub}>Rebuild with updated settings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.planActionCard}
                onPress={() => navigation.navigate('PlanVersionHistory', { planId: plan.id })}
                activeOpacity={0.85}
              >
                <Text style={s.planActionTitle}>Version history</Text>
                <Text style={s.planActionSub}>Revert to a previous plan</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 100 }} />
          </ScrollView>

          {/* Bottom bar — uses the shared CoachChatCard component so the
              entry-point here matches the Home screen's promoted card
              exactly (same avatar, chevron, layout, border treatment).
              Previously this was a custom pink-dot pill that looked
              inconsistent with Home / Week view. */}
          <View style={s.coachBarWrap}>
            <CoachChatCard
              coach={getCoach(planConfig?.coachId)}
              onPress={() => navigation.navigate('CoachChat', { planId: plan.id })}
              subtitleOverride="Ask about your plan, rework weeks, or get advice on training structure."
            />
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
  scroll: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, textAlign: 'center' },

  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16 },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 12, backgroundColor: colors.surface, borderRadius: 12, marginHorizontal: 3, borderWidth: 1, borderColor: colors.border },
  statValue: { fontSize: 20, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  statLabel: { fontSize: 10, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

  chartCard: { backgroundColor: colors.surface, marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  chartTitle: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 12 },
  chartArea: { flexDirection: 'row', alignItems: 'flex-end', height: 125, gap: 2 },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  // Subtle background fill so users can see "0%" vs "100%" even when
  // the bar's own colour is very tall. Barely-there slate so it reads
  // as a track, not as data. Min-height 6 ensures even a 0-km week
  // still shows a sliver to keep the axis anchored.
  chartBarStack: {
    width: '80%', borderRadius: 3, minHeight: 6, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chartBarStackCurrent: { borderWidth: 1.5, borderColor: '#E8458B' },
  chartBarLabel: { fontSize: 9, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, marginBottom: 2 },
  chartDateRow: { flexDirection: 'row', marginTop: 6, gap: 2 },
  chartDateCol: { flex: 1, alignItems: 'center' },
  chartDateLabel: { fontSize: 9, fontWeight: '500', fontFamily: FF.medium, color: colors.textFaint },
  chartDateLabelCurrent: { color: '#E8458B' },
  chartLegend: { flexDirection: 'row', gap: 16, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  // Hollow pink ring — mirrors the current-week bar's border treatment
  // so the legend reads as "this visual = this week" rather than as a
  // ride-type category. Hair-width border to keep it compact at 10px.
  legendRing: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: '#E8458B' },
  legendText: { fontSize: 10, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },
  stravaBarLabel: {
    fontSize: 8, fontWeight: '600', fontFamily: FF.semibold, color: '#FC4C02', marginTop: 1,
  },

  sectionTitle: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, paddingHorizontal: 20, marginBottom: 10, marginTop: 4 },

  phaseCard: { backgroundColor: colors.surface, marginHorizontal: 16, borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  phaseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  phaseName: { fontSize: 15, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  phaseWeeks: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },
  phaseDesc: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, lineHeight: 18 },
  currentBadge: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: 'rgba(232,69,139,0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  currentBadgeText: { fontSize: 11, fontWeight: '600', fontFamily: FF.semibold, color: '#E8458B' },

  weekRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 16, marginBottom: 4, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  weekRowCurrent: { borderColor: colors.primary, borderWidth: 1.5 },
  weekNumCol: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  weekNumColCurrent: { backgroundColor: 'rgba(232,69,139,0.15)' },
  weekNum: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted },
  weekNumCurrent: { color: colors.primary },
  weekInfo: { flex: 1 },
  weekTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  weekFlagBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  weekFlagText: { fontSize: 9, fontWeight: '600', fontFamily: FF.semibold, textTransform: 'uppercase', letterSpacing: 0.3 },
  weekTitle: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  weekTitlePast: { color: colors.textMuted },
  weekDate: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: colors.primary, marginTop: 1, opacity: 0.8 },
  weekMeta: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 1 },
  weekArrow: { fontSize: 20, color: colors.textFaint, fontWeight: '300' },

  // Wrapper around the bottom CoachChatCard. Kept minimal — the card
  // component owns its own border/shadow; we just give it horizontal
  // gutter + breathing room from the screen edge.
  coachBarWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },

  // ── Recurring rides ────────────────────────────────────────────────────
  recurringSection: { marginHorizontal: 16, marginTop: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  recurringSectionTitle: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  recurringSectionHint: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginBottom: 12, lineHeight: 19 },
  recurringCard: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  recurringCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recurringDayBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  recurringDayBadgeText: { fontSize: 12, fontWeight: '700', fontFamily: FF.semibold, color: colors.primary },
  recurringDetails: { flex: 1, flexDirection: 'row', gap: 10 },
  recurringDetail: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
  recurringRemove: { fontSize: 20, color: colors.textMuted, paddingHorizontal: 4 },
  recurringNotes: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 6 },
  recurringEmpty: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginBottom: 8 },
  recurringForm: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginTop: 4,
    borderWidth: 1, borderColor: colors.primary + '44',
  },
  recurringFormLabel: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 8 },
  recurringDayScroll: { marginBottom: 12 },
  recurringDayPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginRight: 6,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
  },
  recurringDayPillSel: { borderColor: colors.primary, backgroundColor: colors.primary + '14' },
  recurringDayPillText: { fontSize: 12, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMid },
  recurringDayPillTextSel: { color: colors.primary },
  recurringInputRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  recurringInputGroup: { flex: 1 },
  recurringInputLabel: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, marginBottom: 4 },
  recurringInput: {
    backgroundColor: colors.bg, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontFamily: FF.regular, color: colors.text,
  },
  recurringNotesInput: {
    backgroundColor: colors.bg, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: FF.regular, color: colors.text,
    marginBottom: 12,
  },
  recurringFormActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  recurringCancelBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  recurringCancelText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
  recurringAddBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  recurringAddBtnText: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },
  recurringAddTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginTop: 4,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  recurringAddTriggerPlus: { fontSize: 20, color: colors.primary, fontWeight: '600' },
  recurringAddTriggerText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },

  // Regenerate / Version history — two-up row above bottom bar
  planActionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 20,
  },
  planActionCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, padding: 16,
  },
  planActionTitle: {
    fontSize: 15, fontFamily: FF.semibold, fontWeight: '600',
    color: colors.text, marginBottom: 4,
  },
  planActionSub: {
    fontSize: 12, lineHeight: 16,
    color: colors.textMuted, fontFamily: FF.regular, fontWeight: '300',
  },
});
