/**
 * Strava Sync Service — fetches Strava activities, caches locally,
 * matches them to plan days, and optionally auto-completes activities.
 *
 * Key exports:
 *  - syncStravaActivities(plan)  — fetch + store + match + auto-complete
 *  - getStravaActivitiesForPlan(plan) — return cached activities matched to plan weeks/days
 *  - getStravaActivityForDate(date) — find a Strava ride on a specific date
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchRecentActivities, isStravaConnected } from './stravaService';
import { markActivityComplete, savePlan } from './storageService';

const STRAVA_ACTIVITIES_KEY = '@etapa_strava_activities';
const SYNC_COOLDOWN_MS = 2 * 60 * 1000; // Don't re-fetch more than once every 2 min
let _lastSyncTime = 0;

// ── Storage helpers ─────────────────────────────────────────────────────────

async function getCachedActivities() {
  try {
    const raw = await AsyncStorage.getItem(STRAVA_ACTIVITIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function setCachedActivities(activities) {
  await AsyncStorage.setItem(STRAVA_ACTIVITIES_KEY, JSON.stringify(activities));
}

// ── Date helpers ────────────────────────────────────────────────────────────

/** Get the plan day index (0=Mon..6=Sun) for a given Date */
function getDayOfWeek(dateStr) {
  const d = new Date(dateStr);
  const js = d.getDay(); // 0=Sun
  return js === 0 ? 6 : js - 1; // convert to 0=Mon
}

/** Get the plan week number for a date relative to the plan start */
function getWeekNumber(planStartDate, dateStr) {
  const start = new Date(planStartDate);
  start.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const daysSince = Math.floor((d - start) / (1000 * 60 * 60 * 24));
  if (daysSince < 0) return -1; // before plan start
  return Math.floor(daysSince / 7) + 1;
}

/** Get actual date for a plan's week + dayOfWeek */
function getPlanDayDate(planStartDate, week, dayOfWeek) {
  const start = new Date(planStartDate);
  const d = new Date(start);
  d.setDate(d.getDate() + (week - 1) * 7 + dayOfWeek);
  return d.toISOString().split('T')[0];
}

// ── Core sync ───────────────────────────────────────────────────────────────

/**
 * Fetch latest Strava activities, merge with cache, match to plan,
 * and auto-complete planned activities that match a Strava ride.
 *
 * @param {object} plan - the current plan (with activities, startDate, weeks)
 * @param {object} options
 * @param {boolean} options.force - bypass cooldown
 * @param {boolean} options.autoComplete - auto-mark matched activities as done (default true)
 * @returns {{ stravaActivities: array, matchedCount: number, newCount: number }}
 */
export async function syncStravaActivities(plan, { force = false, autoComplete = true } = {}) {
  const connected = await isStravaConnected();
  if (!connected) return { stravaActivities: [], matchedCount: 0, newCount: 0 };

  // Cooldown check
  const now = Date.now();
  if (!force && now - _lastSyncTime < SYNC_COOLDOWN_MS) {
    const cached = await getCachedActivities();
    return { stravaActivities: cached, matchedCount: 0, newCount: 0, fromCache: true };
  }

  try {
    // Fetch from Strava — only activities since plan start
    const after = plan?.startDate || null;
    const fetched = await fetchRecentActivities(after);
    _lastSyncTime = Date.now();

    // Merge with cache (dedup by stravaId)
    const cached = await getCachedActivities();
    const existingIds = new Set(cached.map(a => a.stravaId));
    const newActivities = fetched.filter(a => !existingIds.has(a.stravaId));

    // Enrich each activity with plan week/day info
    const enriched = fetched.map(a => ({
      ...a,
      distanceKm: Math.round((a.distance || 0) / 1000 * 10) / 10,
      durationMins: Math.round((a.movingTime || 0) / 60),
      avgSpeedKmh: a.avgSpeed ? Math.round(a.avgSpeed * 3.6 * 10) / 10 : null,
      planWeek: plan?.startDate ? getWeekNumber(plan.startDate, a.startDate) : null,
      planDayOfWeek: getDayOfWeek(a.startDate),
      dateStr: a.startDate?.split('T')[0] || null,
    }));

    // Save to cache
    await setCachedActivities(enriched);

    // Auto-complete: match Strava rides to planned activities
    let matchedCount = 0;
    if (autoComplete && plan?.activities) {
      for (const strava of enriched) {
        if (!strava.planWeek || strava.planWeek < 1 || strava.planWeek > plan.weeks) continue;

        // Find a planned ride on the same day that isn't already completed
        const match = plan.activities.find(a =>
          a.week === strava.planWeek &&
          a.dayOfWeek === strava.planDayOfWeek &&
          a.type === 'ride' &&
          !a.completed &&
          !a.stravaActivityId // not already matched
        );

        if (match) {
          match.completed = true;
          match.completedAt = strava.startDate;
          match.stravaActivityId = strava.stravaId;
          match.stravaData = {
            distanceKm: strava.distanceKm,
            durationMins: strava.durationMins,
            avgSpeedKmh: strava.avgSpeedKmh,
            name: strava.name,
          };
          matchedCount++;
        }
      }

      // Save plan if any matches were made
      if (matchedCount > 0) {
        await savePlan(plan);
      }
    }

    return {
      stravaActivities: enriched,
      matchedCount,
      newCount: newActivities.length,
    };
  } catch (err) {
    console.error('[strava-sync] Sync failed:', err.message);
    // Return cached data on failure
    const cached = await getCachedActivities();
    return { stravaActivities: cached, matchedCount: 0, newCount: 0, error: err.message };
  }
}

// ── Query helpers ───────────────────────────────────────────────────────────

/**
 * Get all cached Strava activities (already enriched with plan week/day info).
 */
export async function getStravaActivitiesForPlan(plan) {
  const all = await getCachedActivities();
  if (!plan?.startDate) return all;
  // Re-enrich with current plan's week numbers (in case plan changed)
  return all.map(a => ({
    ...a,
    planWeek: getWeekNumber(plan.startDate, a.startDate),
    planDayOfWeek: getDayOfWeek(a.startDate),
  })).filter(a => a.planWeek >= 1 && a.planWeek <= plan.weeks);
}

/**
 * Get Strava activities for a specific week.
 */
export function getStravaActivitiesForWeek(stravaActivities, weekNum) {
  return stravaActivities.filter(a => a.planWeek === weekNum);
}

/**
 * Get Strava activities for a specific date string (YYYY-MM-DD).
 */
export function getStravaActivitiesForDate(stravaActivities, dateStr) {
  return stravaActivities.filter(a => a.dateStr === dateStr);
}

/**
 * Build a summary of Strava activities suitable for AI context.
 * Returns an array of objects with week, day, distance, time, speed info.
 */
export function buildStravaContextForAI(stravaActivities) {
  if (!stravaActivities || stravaActivities.length === 0) return null;
  return stravaActivities.map(a => ({
    date: a.dateStr,
    week: a.planWeek,
    dayOfWeek: a.planDayOfWeek,
    name: a.name,
    distanceKm: a.distanceKm,
    durationMins: a.durationMins,
    avgSpeedKmh: a.avgSpeedKmh,
    type: a.type, // Ride, VirtualRide, etc.
  }));
}

/**
 * Summarise Strava vs planned for a given week — useful for coach context.
 */
export function weekComparisonSummary(plan, stravaActivities, weekNum) {
  const planned = (plan.activities || []).filter(a => a.week === weekNum && a.type === 'ride');
  const actual = stravaActivities.filter(a => a.planWeek === weekNum);

  const plannedKm = planned.reduce((s, a) => s + (a.distanceKm || 0), 0);
  const plannedMins = planned.reduce((s, a) => s + (a.durationMins || 0), 0);
  const actualKm = actual.reduce((s, a) => s + (a.distanceKm || 0), 0);
  const actualMins = actual.reduce((s, a) => s + (a.durationMins || 0), 0);

  return {
    week: weekNum,
    plannedRides: planned.length,
    actualRides: actual.length,
    plannedKm: Math.round(plannedKm),
    actualKm: Math.round(actualKm),
    plannedMins,
    actualMins,
    compliancePct: plannedKm > 0 ? Math.round((actualKm / plannedKm) * 100) : null,
  };
}
