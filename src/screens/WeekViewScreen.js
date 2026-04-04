/**
 * Weekly plan view — dark theme. Activities grouped by day.
 * Shows month label, week navigation, no off-track badge.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, RefreshControl,
  TextInput, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../theme';
import { getPlan, getPlans, getWeekActivities, getWeekProgress, markActivityComplete, getWeekMonthLabel, getGoals, getPlanConfig, updateActivity, savePlan } from '../services/storageService';
import { editActivityWithAI, adjustWeekForOrganisedRide } from '../services/llmPlanService';
import { uid } from '../services/storageService';
import { getSessionColor, getSessionLabel, getCrossTrainingForDay, CROSS_TRAINING_COLOR } from '../utils/sessionLabels';
import { syncStravaActivities, getStravaActivitiesForWeek, getStravaActivitiesForDate } from '../services/stravaSyncService';
import { isStravaConnected } from '../services/stravaService';
import StravaLogo from '../components/StravaLogo';
import analytics from '../services/analyticsService';

const FF = fontFamily;
const DAY_LABELS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function WeekViewScreen({ navigation, route }) {
  const initialWeek = route.params?.week || 1;
  const planId = route.params?.planId || null;
  const openOrgRideDay = route.params?.openOrgRide ?? null;
  const [plan, setPlan] = useState(null);
  const [goal, setGoal] = useState(null);
  const [planConfig, setPlanConfig] = useState(null);
  const [week, setWeek] = useState(initialWeek);
  const [refreshing, setRefreshing] = useState(false);
  // Activity inline edit
  const [editingActivity, setEditingActivity] = useState(null); // activity object being edited
  const [actEditText, setActEditText] = useState('');
  const [actEditing, setActEditing] = useState(false);
  const [actEditStatus, setActEditStatus] = useState('');

  // Organised ride modal
  const [showOrgRide, setShowOrgRide] = useState(false);
  const [orgRideDay, setOrgRideDay] = useState(null);
  const [orgRideForm, setOrgRideForm] = useState({ description: '', durationMins: '', distanceKm: '', elevationM: '' });
  const [stravaActivities, setStravaActivities] = useState([]);

  // Compute the actual date for a given day index in the current week
  const getWeekDayInfo = (dayIdx) => {
    if (!plan?.startDate) return { label: DAY_LABELS_FULL[dayIdx], dateStr: '' };
    const start = parseDateLocal(plan.startDate);
    const d = new Date(start);
    d.setDate(d.getDate() + (week - 1) * 7 + dayIdx);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return { label: DAY_LABELS_FULL[dayIdx].slice(0, 3), dateStr: `${d.getDate()} ${months[d.getMonth()]}` };
  };
  const [orgRideProcessing, setOrgRideProcessing] = useState(false);

  const loadPlan = useCallback(async () => {
    let p;
    if (planId) {
      const plans = await getPlans();
      p = plans.find(pl => pl.id === planId) || null;
    } else {
      p = await getPlan();
    }
    // Gate: if plan is unpaid, redirect back to Home
    if (p?.paymentStatus === 'pending') {
      navigation.replace('Home');
      return;
    }
    setPlan(p);
    if (p) {
      const goals = await getGoals();
      setGoal(goals.find(g => g.id === p.goalId) || null);
      const cfg = await getPlanConfig(p.configId);
      setPlanConfig(cfg);
      // Sync Strava activities (non-blocking — wrapped in try/catch to prevent crashes)
      try {
        const connected = await isStravaConnected();
        if (connected) {
          syncStravaActivities(p).then(async (result) => {
            if (result?.stravaActivities) setStravaActivities(result.stravaActivities);
            if (result?.matchedCount > 0) {
              const refreshed = await getPlans();
              const updated = refreshed.find(pl => pl.id === (planId || p.id)) || null;
              if (updated) setPlan(updated);
            }
          }).catch(() => {});
        }
      } catch {}

    }
  }, [planId, navigation]);

  useEffect(() => { loadPlan(); }, [loadPlan]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', loadPlan);
    return unsub;
  }, [navigation, loadPlan]);
  useEffect(() => {
    if (plan) analytics.events.weekViewed(week, plan.id);
  }, [week, plan?.id]);

  // Auto-open organised ride modal if navigated with openOrgRide param
  useEffect(() => {
    if (openOrgRideDay !== null && plan) {
      setOrgRideDay(openOrgRideDay);
      setShowOrgRide(true);
    }
  }, [openOrgRideDay, plan]);

  const onRefresh = async () => { setRefreshing(true); await loadPlan(); setRefreshing(false); };

  if (!plan) return null;

  const activities = getWeekActivities(plan, week);
  const progress = getWeekProgress(plan, week);
  const isDeload = week % 4 === 0;
  const monthLabel = getWeekMonthLabel(plan.startDate, week);

  const byDay = {};
  activities.forEach(a => { const d = a.dayOfWeek ?? 0; if (!byDay[d]) byDay[d] = []; byDay[d].push(a); });

  const handleComplete = async (id) => {
    const act = activities.find(a => a.id === id);
    if (act) {
      if (!act.completed) {
        analytics.events.activityCompleted({ activityType: act.type, subType: act.subType, effort: act.effort, week, distanceKm: act.distanceKm, durationMins: act.durationMins });
      } else {
        analytics.events.activityUncompleted({ activityType: act.type, week });
      }
    }
    await markActivityComplete(id);
    await loadPlan();
  };

  // Track background adjustments
  const [adjustingInBackground, setAdjustingInBackground] = useState(false);

  // Add organised ride to current week
  const handleAddOrganisedRide = async () => {
    if (orgRideDay === null) {
      Alert.alert('Pick a day', 'Select which day this organised ride is on.');
      return;
    }
    if (!orgRideForm.description.trim()) {
      Alert.alert('Describe the ride', 'Enter a description for the organised ride.');
      return;
    }
    setOrgRideProcessing(true);
    try {
      // Create the organised ride activity
      const orgRide = {
        id: uid(),
        planId: plan.id,
        week,
        dayOfWeek: orgRideDay,
        type: 'ride',
        subType: 'organised',
        title: orgRideForm.description.trim(),
        description: 'Organised ride added to this week.',
        notes: [
          orgRideForm.durationMins ? `${orgRideForm.durationMins} min` : null,
          orgRideForm.distanceKm ? `${orgRideForm.distanceKm} km` : null,
          orgRideForm.elevationM ? `${orgRideForm.elevationM}m elevation` : null,
        ].filter(Boolean).join(' · ') || null,
        durationMins: orgRideForm.durationMins ? parseInt(orgRideForm.durationMins, 10) : null,
        distanceKm: orgRideForm.distanceKm ? parseFloat(orgRideForm.distanceKm) : null,
        elevationM: orgRideForm.elevationM ? parseInt(orgRideForm.elevationM, 10) : null,
        effort: 'moderate',
        completed: false,
        completedAt: null,
        isOrganised: true,
        stravaActivityId: null,
        stravaData: null,
      };

      // Add the ride immediately so the user sees it
      const updatedPlan = { ...plan };
      updatedPlan.activities = [...(updatedPlan.activities || []), orgRide];
      await savePlan(updatedPlan);
      await loadPlan();

      // Close the modal immediately
      setShowOrgRide(false);
      setOrgRideForm({ description: '', durationMins: '', distanceKm: '', elevationM: '' });
      setOrgRideDay(null);
      setOrgRideProcessing(false);

      // Ask AI to adjust this week's other activities in the background
      setAdjustingInBackground(true);
      try {
        const adjusted = await adjustWeekForOrganisedRide(updatedPlan, week, orgRide, goal);
        if (adjusted?.activities) {
          const bgUpdated = { ...updatedPlan, activities: adjusted.activities };
          await savePlan(bgUpdated);
          await loadPlan();
        }
      } catch {
        // If AI adjustment fails, the ride is still added — no user-facing error
      }
      setAdjustingInBackground(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to add organised ride.');
      setOrgRideProcessing(false);
    }
  };

  // Inline activity edit via AI
  const handleActivityEdit = async () => {
    if (!actEditText.trim() || !editingActivity || actEditing) return;
    setActEditing(true);
    setActEditStatus('Asking coach...');
    try {
      const result = await editActivityWithAI(editingActivity, goal, actEditText.trim(), (msg) => setActEditStatus(msg));
      if (result.updatedActivity) {
        analytics.events.activityEditedAI({ activityType: editingActivity.type, subType: editingActivity.subType, week, hadChanges: true });
        await updateActivity(editingActivity.id, result.updatedActivity);
        setActEditStatus('Updated!');
        await loadPlan();
        setTimeout(() => { setEditingActivity(null); setActEditText(''); setActEditStatus(''); }, 800);
      } else if (result.answer) {
        setActEditStatus(result.answer);
        setTimeout(() => setActEditStatus(''), 5000);
      }
    } catch {
      setActEditStatus('Failed to update');
      setTimeout(() => setActEditStatus(''), 3000);
    }
    setActEditing(false);
  };

  const crossTraining = planConfig?.crossTrainingDaysFull || {};

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <Text style={s.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Week {week} of {plan.weeks}</Text>
            <Text style={s.headerMonth}>{monthLabel}</Text>
          </View>
          <View style={{ width: 32 }} />
        </View>

        {/* Week selector */}
        <View style={s.weekNav}>
          <TouchableOpacity onPress={() => { const to = Math.max(1, week - 1); analytics.events.weekNavigated('prev', week, to); setWeek(to); }} disabled={week <= 1} style={s.weekNavBtn}>
            <Text style={[s.weekNavArrow, week <= 1 && s.weekNavDisabled]}>{'\u2039'}</Text>
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.weekPills}>
            {Array.from({ length: plan.weeks }, (_, i) => i + 1).map(w => (
              <TouchableOpacity key={w} style={[s.weekPill, w === week && s.weekPillActive]} onPress={() => setWeek(w)}>
                <Text style={[s.weekPillText, w === week && s.weekPillTextActive]}>{w}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={() => { const to = Math.min(plan.weeks, week + 1); analytics.events.weekNavigated('next', week, to); setWeek(to); }} disabled={week >= plan.weeks} style={s.weekNavBtn}>
            <Text style={[s.weekNavArrow, week >= plan.weeks && s.weekNavDisabled]}>{'\u203A'}</Text>
          </TouchableOpacity>
        </View>

        {/* Progress */}
        <View style={s.progressRow}>
          <Text style={s.progressLabel}>{progress.done}/{progress.total} sessions</Text>
          <Text style={s.progressPct}>{progress.pct}%</Text>
        </View>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progress.pct}%` }]} />
        </View>

        {isDeload && (
          <View style={s.deloadBanner}>
            <Text style={s.deloadText}>Recovery week \u2014 lighter load to let your body adapt</Text>
          </View>
        )}

        {/* Compact coach assessment */}
        {plan.assessment && week === 1 && (
          <TouchableOpacity
            style={s.assessBanner}
            onPress={() => navigation.navigate('PlanOverview', { planId: plan.id })}
            activeOpacity={0.8}
          >
            <View style={s.assessBannerLeft}>
              <Text style={s.assessBannerChance}>{plan.assessment.successChance}%</Text>
              <Text style={s.assessBannerLabel}>success</Text>
            </View>
            <Text style={s.assessBannerText} numberOfLines={2}>{plan.assessment.summary}</Text>
          </TouchableOpacity>
        )}

        {/* Background adjusting banner */}
        {adjustingInBackground && (
          <View style={s.adjustBanner}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={s.adjustBannerText}>Your coach is adjusting the week...</Text>
          </View>
        )}

        <ScrollView style={s.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#666" />}>
          {DAY_LABELS_FULL.map((dayLabel, dayIdx) => {
            const dayActivities = byDay[dayIdx] || [];
            const ctItems = getCrossTrainingForDay(crossTraining, dayIdx);
            const dateStr = plan?.startDate ? getDayDateStr(plan.startDate, week, dayIdx) : null;
            const dayStravaRides = dateStr
              ? getStravaActivitiesForDate(stravaActivities, dateStr).filter(sa => !dayActivities.some(a => a.stravaActivityId === sa.stravaId))
              : [];
            if (dayActivities.length === 0 && ctItems.length === 0 && dayStravaRides.length === 0) return null;

            const dayDate = getDayDate(plan.startDate, week, dayIdx);

            return (
              <View key={dayIdx} style={s.dayGroup}>
                <Text style={s.dayHeader}>{dayLabel} {dayDate}</Text>
                {dayActivities.map(activity => {
                  const isEditing = editingActivity?.id === activity.id;
                  return (
                    <View key={activity.id}>
                      <TouchableOpacity
                        style={[
                          s.activityCard,
                          activity.type === 'strength' && s.activityCardStrength,
                          activity.completed && s.activityCardDone,
                          isEditing && s.activityCardEditing,
                        ]}
                        onPress={() => navigation.navigate('ActivityDetail', { activityId: activity.id })}
                        onLongPress={() => { setEditingActivity(activity); setActEditText(''); setActEditStatus(''); }}
                        activeOpacity={0.75}
                        delayLongPress={400}
                      >
                        <View style={[
                          s.activityAccent,
                          { backgroundColor: getSessionColor(activity) },
                          activity.type === 'strength' && s.accentStrength,
                        ]} />
                        <View style={s.activityBody}>
                          <View style={s.activityTop}>
                            <View style={[s.typeShape, activity.type === 'strength' ? s.typeShapeSquare : s.typeShapeCircle, { backgroundColor: getSessionColor(activity) }]} />
                            <View style={[s.activityTypeBadge, { backgroundColor: getSessionColor(activity) + '18' }]}>
                              <Text style={[s.activityTypeText, { color: getSessionColor(activity) }]}>{getSessionLabel(activity)}</Text>
                            </View>
                            <View style={s.activityTitleWrap}>
                              <Text style={[s.activityTitle, activity.completed && s.activityTitleDone]}>{activity.title}</Text>
                              <Text style={s.activityMeta}>
                                {activity.type === 'ride' && activity.distanceKm ? `${activity.distanceKm} km \u00B7 ` : ''}
                                {activity.durationMins ? `~${activity.durationMins} min` : ''}
                                {activity.effort ? ` \u00B7 ${activity.effort}` : ''}
                              </Text>
                              {activity.stravaActivityId && (
                                <View style={s.stravaMatchBadge}>
                                  <StravaLogo size={12} />
                                  <Text style={s.stravaMatchText}>
                                    {activity.stravaData?.distanceKm ? `${activity.stravaData.distanceKm} km` : ''}
                                    {activity.stravaData?.distanceKm && activity.stravaData?.durationMins ? ' \u00B7 ' : ''}
                                    {activity.stravaData?.durationMins ? `${activity.stravaData.durationMins} min` : ''}
                                    {activity.stravaData?.avgSpeedKmh ? ` \u00B7 ${activity.stravaData.avgSpeedKmh} km/h` : ''}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <TouchableOpacity
                              style={[s.checkBtn, activity.completed && s.checkBtnDone]}
                              onPress={() => handleComplete(activity.id)}
                            >
                              <Text style={s.checkMark}>{activity.completed ? '\u2713' : ''}</Text>
                            </TouchableOpacity>
                          </View>
                          {!activity.completed && (
                            <Text style={s.editHint}>Hold to edit</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                      {/* Inline edit bar for this activity */}
                      {isEditing && (
                        <View style={s.actEditBar}>
                          {actEditStatus ? (
                            <Text style={s.actEditStatusText}>{actEditStatus}</Text>
                          ) : null}
                          <View style={s.actEditRow}>
                            <TextInput
                              style={s.actEditInput}
                              value={actEditText}
                              onChangeText={setActEditText}
                              placeholder={`e.g. "Make it shorter" or "Change to intervals"`}
                              placeholderTextColor={colors.textFaint}
                              editable={!actEditing}
                              autoFocus
                              returnKeyType="send"
                              onSubmitEditing={handleActivityEdit}
                            />
                            <TouchableOpacity
                              style={[s.actEditSendBtn, (!actEditText.trim() || actEditing) && { opacity: 0.3 }]}
                              onPress={handleActivityEdit}
                              disabled={!actEditText.trim() || actEditing}
                            >
                              <Text style={s.actEditSendText}>{'\u2191'}</Text>
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity onPress={() => setEditingActivity(null)} style={s.actEditCancel}>
                            <Text style={s.actEditCancelText}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
                {/* Cross-training items */}
                {ctItems.map((ct, i) => (
                  <View key={`ct-${i}`} style={s.ctCard}>
                    <View style={[s.activityAccent, { backgroundColor: CROSS_TRAINING_COLOR }]} />
                    <View style={s.ctBody}>
                      <View style={[s.typeShape, s.typeShapeDiamond, { backgroundColor: CROSS_TRAINING_COLOR }]} />
                      <View style={[s.activityTypeBadge, { backgroundColor: CROSS_TRAINING_COLOR + '18' }]}>
                        <Text style={[s.activityTypeText, { color: CROSS_TRAINING_COLOR }]}>{ct.label}</Text>
                      </View>
                      <Text style={s.ctNote}>Your activity {'\u00B7'} Factored into plan recovery</Text>
                    </View>
                  </View>
                ))}
                {/* Unmatched Strava rides for this day */}
                {dayStravaRides.map(sa => (
                  <View key={sa.stravaId} style={s.stravaRideCard}>
                    <View style={[s.activityAccent, { backgroundColor: '#FC4C02' }]} />
                    <View style={s.stravaRideBody}>
                      <View style={[s.activityTypeBadge, { backgroundColor: 'rgba(252,76,2,0.12)' }]}>
                        <Text style={[s.activityTypeText, { color: '#FC4C02' }]}>STRAVA</Text>
                      </View>
                      <Text style={s.stravaRideName}>{sa.name || 'Ride'}</Text>
                      <Text style={s.stravaRideMeta}>
                        {sa.distanceKm ? `${sa.distanceKm} km` : ''}
                        {sa.distanceKm && sa.durationMins ? ' \u00B7 ' : ''}
                        {sa.durationMins ? `${sa.durationMins} min` : ''}
                        {sa.avgSpeedKmh ? ` \u00B7 ${sa.avgSpeedKmh} km/h` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          })}
          {/* Days with no scheduled activities — still allow adding organised rides */}
          {DAY_LABELS_FULL.map((dayLabel, dayIdx) => {
            const dayActivitiesForDay = byDay[dayIdx] || [];
            const ctItems = getCrossTrainingForDay(crossTraining, dayIdx);
            if (dayActivitiesForDay.length > 0 || ctItems.length > 0) return null; // already rendered above
            return null; // rest days stay clean
          })}
          {activities.length === 0 && Object.keys(crossTraining).length === 0 && (
            <View style={s.emptyWeek}><Text style={s.emptyText}>No activities this week</Text></View>
          )}

          {/* Floating add organised ride for rest days */}
          <TouchableOpacity
            style={s.addOrgRideFloating}
            onPress={() => { setOrgRideDay(null); setShowOrgRide(true); }}
            activeOpacity={0.7}
          >
            <Text style={s.addOrgRideFloatingText}>+ Add organised ride this week</Text>
          </TouchableOpacity>

          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Bottom bar */}
        <View style={s.editBar}>
          <TouchableOpacity
            style={s.coachBtn}
            onPress={() => navigation.navigate('CoachChat', { planId: plan.id, weekNum: week })}
            activeOpacity={0.7}
          >
            <View style={[s.coachDot, { backgroundColor: colors.primary }]} />
            <View style={s.coachBtnTextWrap}>
              <Text style={s.coachBtnLabel}>Ask coach about week {week}</Text>
              <Text style={s.coachBtnHint}>Get advice or ask your coach to change this week</Text>
            </View>
            <Text style={s.coachBtnArrow}>{'\u203A'}</Text>
          </TouchableOpacity>
        </View>

        {/* Organised ride modal */}
        <Modal visible={showOrgRide} transparent animationType="slide" onRequestClose={() => setShowOrgRide(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.orgModalOverlay}>
            <TouchableOpacity style={s.orgModalBg} onPress={() => setShowOrgRide(false)} activeOpacity={1} />
            <View style={s.orgModalSheet}>
              <View style={s.orgModalHandle} />
              <Text style={s.orgModalTitle}>Add organised ride</Text>

              {/* Day / date picker for current week */}
              <Text style={s.orgModalLabel}>Which day?</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.orgDayScroll} contentContainerStyle={s.orgDayScrollContent}>
                {DAY_LABELS_FULL.map((_, idx) => {
                  const { label, dateStr } = getWeekDayInfo(idx);
                  const selected = orgRideDay === idx;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[s.orgDayPill, selected && s.orgDayPillSelected]}
                      onPress={() => setOrgRideDay(idx)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.orgDayShort, selected && s.orgDayTextSelected]}>{label.toUpperCase()}</Text>
                      <Text style={[s.orgDayDate, selected && s.orgDayTextSelected]}>{dateStr}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={s.orgModalLabel}>Describe the ride</Text>
              <TextInput
                style={s.orgModalInput}
                placeholder="e.g. Saturday morning group ride, hilly route"
                placeholderTextColor={colors.textFaint}
                value={orgRideForm.description}
                onChangeText={v => setOrgRideForm(f => ({ ...f, description: v }))}
                multiline
              />

              <View style={s.orgModalInputRow}>
                <View style={s.orgModalInputGroup}>
                  <Text style={s.orgModalInputLabel}>Duration</Text>
                  <TextInput
                    style={s.orgModalSmallInput}
                    placeholder="mins"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="numeric"
                    value={orgRideForm.durationMins}
                    onChangeText={v => setOrgRideForm(f => ({ ...f, durationMins: v }))}
                  />
                </View>
                <View style={s.orgModalInputGroup}>
                  <Text style={s.orgModalInputLabel}>Distance</Text>
                  <TextInput
                    style={s.orgModalSmallInput}
                    placeholder="km"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="numeric"
                    value={orgRideForm.distanceKm}
                    onChangeText={v => setOrgRideForm(f => ({ ...f, distanceKm: v }))}
                  />
                </View>
                <View style={s.orgModalInputGroup}>
                  <Text style={s.orgModalInputLabel}>Elevation</Text>
                  <TextInput
                    style={s.orgModalSmallInput}
                    placeholder="m"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="numeric"
                    value={orgRideForm.elevationM}
                    onChangeText={v => setOrgRideForm(f => ({ ...f, elevationM: v }))}
                  />
                </View>
              </View>

              <Text style={s.orgModalNote}>Your coach will adjust this week's plan to account for the extra ride.</Text>

              <TouchableOpacity
                style={[s.orgModalAddBtn, orgRideProcessing && { opacity: 0.6 }]}
                onPress={handleAddOrganisedRide}
                disabled={orgRideProcessing}
                activeOpacity={0.85}
              >
                {orgRideProcessing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.orgModalAddText}>Add to plan</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

function parseDateLocal(dateStr) {
  // Parse YYYY-MM-DD or ISO string as local date (noon to avoid DST edge cases)
  const parts = dateStr.split('T')[0].split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
}

function getDayDate(startDateStr, week, dayIdx) {
  const start = parseDateLocal(startDateStr);
  const offset = (week - 1) * 7 + dayIdx;
  const d = new Date(start);
  d.setDate(d.getDate() + offset);
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[d.getMonth()]}`;
}

function getDayDateStr(startDateStr, week, dayIdx) {
  const start = parseDateLocal(startDateStr);
  const d = new Date(start);
  d.setDate(d.getDate() + (week - 1) * 7 + dayIdx);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backArrow: { fontSize: 22, color: colors.text, width: 32 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  headerMonth: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 2 },

  weekNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 12 },
  weekNavBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  weekNavArrow: { fontSize: 28, color: colors.text, fontWeight: '300' },
  weekNavDisabled: { color: colors.textFaint },

  weekPills: { flexDirection: 'row', paddingHorizontal: 4 },
  weekPill: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2, backgroundColor: colors.surfaceLight },
  weekPillActive: { backgroundColor: colors.primary },
  weekPillText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },
  weekPillTextActive: { color: '#fff' },

  progressRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 6 },
  progressLabel: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },
  progressPct: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.primary },
  progressTrack: { height: 4, backgroundColor: colors.border, borderRadius: 2, marginHorizontal: 20, marginBottom: 12, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },

  deloadBanner: { backgroundColor: 'rgba(100,116,139,0.1)', marginHorizontal: 20, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(100,116,139,0.2)' },
  deloadText: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: '#94A3B8' },

  assessBanner: {
    backgroundColor: colors.surface, marginHorizontal: 20, borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  assessBannerLeft: { alignItems: 'center', minWidth: 44 },
  assessBannerChance: { fontSize: 20, fontWeight: '700', fontFamily: FF.semibold, color: colors.primary },
  assessBannerLabel: { fontSize: 9, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  assessBannerText: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, flex: 1, lineHeight: 17 },

  adjustBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(217,119,6,0.08)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.2)',
  },
  adjustBannerText: { fontSize: 13, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },

  list: { flex: 1 },
  dayGroup: { marginBottom: 8 },
  dayHeader: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 20, paddingVertical: 8 },

  activityCard: {
    flexDirection: 'row', backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 8,
    borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border,
  },
  activityCardStrength: { borderStyle: 'dashed', borderColor: 'rgba(139,92,246,0.3)' },
  activityCardDone: { opacity: 0.5 },
  activityAccent: { width: 4 },
  accentStrength: { width: 4, borderRadius: 0 },
  activityBody: { flex: 1, padding: 14 },
  activityTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeShape: { width: 8, height: 8 },
  typeShapeCircle: { borderRadius: 4 },
  typeShapeSquare: { borderRadius: 2 },
  typeShapeDiamond: { borderRadius: 1, transform: [{ rotate: '45deg' }] },
  activityTypeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  activityTypeText: { fontSize: 10, fontWeight: '600', fontFamily: FF.semibold, textTransform: 'uppercase', letterSpacing: 0.3 },
  activityTitleWrap: { flex: 1 },
  activityTitle: { fontSize: 15, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  activityTitleDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  activityMeta: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted, marginTop: 2 },

  checkBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkBtnDone: { borderColor: '#22C55E', backgroundColor: '#22C55E' },
  checkMark: { fontSize: 14, color: '#fff', fontWeight: '700' },

  emptyWeek: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, fontWeight: '400', fontFamily: FF.regular, color: colors.textMuted },

  editHint: { fontSize: 10, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginTop: 6 },

  // Activity inline edit
  activityCardEditing: { borderColor: colors.primary },
  actEditBar: { marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.primary + '44' },
  actEditStatusText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.primary, marginBottom: 6 },
  actEditRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  actEditInput: {
    flex: 1, backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    color: colors.text, fontFamily: FF.regular, fontSize: 13,
    borderWidth: 1, borderColor: colors.border,
  },
  actEditSendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  actEditSendText: { fontSize: 16, color: '#fff', fontWeight: '700' },
  actEditCancel: { marginTop: 6, alignSelf: 'flex-end' },
  actEditCancelText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted },

  // Cross-training cards
  ctCard: {
    flexDirection: 'row', backgroundColor: 'rgba(6,182,212,0.06)', marginHorizontal: 16, marginBottom: 8,
    borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(6,182,212,0.2)', borderStyle: 'dashed',
  },
  ctBody: { flex: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  ctNote: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, flex: 1 },

  // Bottom bar — single coach button
  editBar: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  coachBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14,
    backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.border,
  },
  coachDot: { width: 10, height: 10, borderRadius: 5 },
  coachBtnTextWrap: { flex: 1 },
  coachBtnLabel: { fontSize: 14, fontWeight: '600', fontFamily: FF.semibold, color: colors.text },
  coachBtnHint: { fontSize: 11, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginTop: 1 },
  coachBtnArrow: { fontSize: 22, color: colors.textFaint, fontWeight: '300' },

  // ── Add organised ride ──────────────────────────────────────────────────
  addOrgRideBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12, marginTop: 4,
  },
  addOrgRidePlus: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  addOrgRideText: { fontSize: 12, fontWeight: '500', fontFamily: FF.medium, color: colors.textMid },
  addOrgRideFloating: {
    alignItems: 'center', paddingVertical: 14, marginHorizontal: 16, marginTop: 8,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  addOrgRideFloatingText: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.primary },

  // ── Organised ride modal ────────────────────────────────────────────────
  orgModalOverlay: { flex: 1, justifyContent: 'flex-end' },
  orgModalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  orgModalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  orgModalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: 16,
  },
  orgModalTitle: { fontSize: 18, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 4 },
  orgModalSub: { fontSize: 13, fontWeight: '400', fontFamily: FF.regular, color: colors.textMid, marginBottom: 16 },
  orgModalLabel: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginBottom: 6 },
  orgModalInput: {
    backgroundColor: colors.bg, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: FF.regular, color: colors.text,
    minHeight: 56, textAlignVertical: 'top', marginBottom: 14,
  },
  orgModalInputRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  orgModalInputGroup: { flex: 1 },
  orgModalInputLabel: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: colors.textMuted, marginBottom: 4 },
  orgModalSmallInput: {
    backgroundColor: colors.bg, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontFamily: FF.regular, color: colors.text,
  },
  orgModalNote: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: colors.textFaint, marginBottom: 16, lineHeight: 17 },

  // Day picker inside modal
  orgDayScroll: { marginBottom: 16 },
  orgDayScrollContent: { paddingRight: 8 },
  orgDayPill: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1.5, borderColor: colors.border,
    marginRight: 8, backgroundColor: colors.bg, minWidth: 58,
  },
  orgDayPillSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
  orgDayShort: { fontSize: 10, fontWeight: '700', fontFamily: FF.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  orgDayDate: { fontSize: 13, fontWeight: '600', fontFamily: FF.semibold, color: colors.text, marginTop: 3 },
  orgDayTextSelected: { color: colors.primary },

  orgModalAddBtn: {
    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center',
  },
  orgModalAddText: { fontSize: 16, fontWeight: '600', fontFamily: FF.semibold, color: '#fff' },

  // Strava inline
  stravaMatchBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4,
    backgroundColor: 'rgba(252,76,2,0.08)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start',
  },
  stravaMatchLogo: {
    width: 14, height: 14,
  },
  stravaMatchText: { fontSize: 11, fontWeight: '500', fontFamily: FF.medium, color: '#FC4C02' },
  stravaRideCard: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14,
    overflow: 'hidden', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(252,76,2,0.2)',
  },
  stravaRideBody: { flex: 1, padding: 14, gap: 4 },
  stravaRideName: { fontSize: 14, fontWeight: '500', fontFamily: FF.medium, color: colors.text },
  stravaRideMeta: { fontSize: 12, fontWeight: '400', fontFamily: FF.regular, color: '#FC4C02' },
});
