/**
 * Ride speed rules.
 *
 * Claude has a habit of producing distance values that imply unrealistic
 * average speeds (e.g. 110 km / 150 min = 44 km/h — that's elite pro race
 * pace, not a "long ride" for even an expert amateur). This module is the
 * single source of truth for how fast a rider at a given level rides a
 * given session, and exposes helpers to:
 *
 *   1. compute a realistic distance from duration + session metadata
 *   2. assert / clamp a distance value that Claude returned
 *
 * The numbers here reflect real-world amateur road cycling averages, not
 * elite race pace. They are deliberately conservative — for a beginner-
 * oriented app it is far better to under-promise the distance than to
 * quote a number the rider has no hope of hitting.
 */

// Base moving-average speeds (km/h) for a sustained ride at that level's
// typical aerobic endurance pace. These match the benchmarks in ai.js.
const BASE_AVG_SPEED_KMH = Object.freeze({
  beginner: 17,
  intermediate: 24,
  advanced: 28,
  expert: 32,
});

// Multipliers applied to the level's base speed, by session subType.
// Keep these grounded in real cycling:
//   - recovery rides are spun easy, ~65-70% of endurance pace
//   - endurance is zone-2, slightly below your avg day
//   - tempo is zone-3, above endurance but not threshold
//   - intervals look slow on average because of rest intervals
//   - long rides slow progressively from endurance pace due to fatigue
const SUBTYPE_MULTIPLIER = Object.freeze({
  recovery: 0.70,
  endurance: 0.90,
  tempo: 1.02,
  intervals: 0.88,
  indoor: 0.85, // trainer-watts rarely convert to outdoor speed
  long_ride: 0.88,
  default: 0.90,
});

// Efforts can nudge speed up/down when subType alone doesn't tell the whole
// story (Claude will sometimes emit subType: "endurance", effort: "hard").
const EFFORT_MULTIPLIER = Object.freeze({
  recovery: 0.92,
  easy: 1.00,
  moderate: 1.04,
  hard: 1.08,
  max: 1.10,
  default: 1.00,
});

// Absolute hard caps on average speed for an entire activity. These are
// "nobody rides faster than this on a training day" bounds and exist to
// catch anything the multiplier system misses. Values are km/h.
const MAX_AVG_SPEED_KMH = Object.freeze({
  beginner: 22,
  intermediate: 28,
  advanced: 32,
  expert: 36,
});

// Minimum floor to avoid "I rode 1 km in 30 minutes" nonsense — not likely
// to happen but keeps the clamp symmetric.
const MIN_AVG_SPEED_KMH = Object.freeze({
  beginner: 10,
  intermediate: 14,
  advanced: 16,
  expert: 18,
});

function normaliseLevel(level) {
  const key = String(level || '').toLowerCase().trim();
  return BASE_AVG_SPEED_KMH[key] ? key : 'beginner';
}

function normaliseSubType(subType) {
  const key = String(subType || '').toLowerCase().trim();
  if (SUBTYPE_MULTIPLIER[key]) return key;
  return 'default';
}

function normaliseEffort(effort) {
  const key = String(effort || '').toLowerCase().trim();
  if (EFFORT_MULTIPLIER[key]) return key;
  return 'default';
}

/**
 * Compute the target average speed (km/h) for a single activity.
 *
 * Inputs are lenient — unknown levels default to beginner, unknown subtypes
 * fall back to the default multiplier.
 */
function targetSpeedKmh({ fitnessLevel, subType, effort, isLongRide } = {}) {
  const level = normaliseLevel(fitnessLevel);
  const base = BASE_AVG_SPEED_KMH[level];

  const subKey = isLongRide ? 'long_ride' : normaliseSubType(subType);
  const effortKey = normaliseEffort(effort);

  const raw = base
    * SUBTYPE_MULTIPLIER[subKey]
    * EFFORT_MULTIPLIER[effortKey];

  const max = MAX_AVG_SPEED_KMH[level];
  const min = MIN_AVG_SPEED_KMH[level];
  return Math.max(min, Math.min(max, raw));
}

/**
 * Given an activity (duration + type info), compute the realistic
 * distance in km. Rounds to nearest km. Returns null for non-ride
 * activities (strength etc).
 */
function realisticDistanceKm({
  durationMins,
  fitnessLevel,
  subType,
  effort,
  isLongRide,
  type,
} = {}) {
  if (type && type !== 'ride') return null;
  const mins = Number(durationMins);
  if (!Number.isFinite(mins) || mins <= 0) return null;

  const speed = targetSpeedKmh({ fitnessLevel, subType, effort, isLongRide });
  const km = (mins / 60) * speed;
  return Math.max(1, Math.round(km));
}

/**
 * Returns the max distance that is acceptable for the activity — anything
 * higher than this gets clamped by normaliseActivity. Uses the per-level
 * hard cap, not the per-session target.
 */
function maxAcceptableDistanceKm({
  durationMins,
  fitnessLevel,
} = {}) {
  const mins = Number(durationMins);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const level = normaliseLevel(fitnessLevel);
  const speed = MAX_AVG_SPEED_KMH[level];
  return Math.ceil((mins / 60) * speed);
}

/**
 * Normalise a single activity Claude returned. Fully replaces distanceKm
 * with a realistic value. Idempotent and side-effect-free — returns a
 * shallow copy.
 *
 * Rules:
 *   - strength / non-ride activities get distanceKm: null
 *   - ride activities get distanceKm recomputed from durationMins + rules
 *   - if Claude's distance was within the target band we keep it (avoids
 *     flattening all rides to identical numbers week-over-week)
 */
function normaliseActivity(activity, { fitnessLevel, isLongRide } = {}) {
  if (!activity || typeof activity !== 'object') return activity;
  const next = { ...activity };

  if (next.type && next.type !== 'ride') {
    next.distanceKm = null;
    return next;
  }

  const mins = Number(next.durationMins);
  if (!Number.isFinite(mins) || mins <= 0) {
    next.distanceKm = null;
    return next;
  }

  const target = realisticDistanceKm({
    durationMins: mins,
    fitnessLevel,
    subType: next.subType,
    effort: next.effort,
    isLongRide,
    type: next.type,
  });

  const maxKm = maxAcceptableDistanceKm({
    durationMins: mins,
    fitnessLevel,
  });

  const provided = Number(next.distanceKm);
  // Accept Claude's value only if it's within +/- 15% of the target and
  // not above the hard cap. Otherwise replace with the target.
  if (Number.isFinite(provided) && provided > 0) {
    const withinBand = Math.abs(provided - target) / target <= 0.15;
    const withinCap = provided <= maxKm;
    if (withinBand && withinCap) {
      next.distanceKm = Math.round(provided);
      return next;
    }
  }

  next.distanceKm = target;
  return next;
}

/**
 * Normalise an entire activities array. The single long ride per week is
 * detected (longest durationMins per week) so its multiplier can lean on
 * long_ride semantics rather than the generic endurance curve.
 */
function normaliseActivities(activities, { fitnessLevel } = {}) {
  if (!Array.isArray(activities)) return activities;

  // Find each week's long ride by longest duration (ride type only).
  const longRideIdByWeek = new Map();
  const maxDurByWeek = new Map();
  for (const a of activities) {
    if (!a || a.type !== 'ride') continue;
    const w = a.week;
    const dur = Number(a.durationMins) || 0;
    if (dur > (maxDurByWeek.get(w) || 0)) {
      maxDurByWeek.set(w, dur);
      longRideIdByWeek.set(w, a);
    }
  }

  return activities.map((a) => {
    const isLongRide = longRideIdByWeek.get(a?.week) === a;
    return normaliseActivity(a, { fitnessLevel, isLongRide });
  });
}

/**
 * Return diagnostic info for a single activity — used by tests to assert
 * that distance/duration combinations are realistic without re-deriving
 * the rules in the test itself.
 *
 * If `subType` is provided on the activity (or passed via opts), diagnose
 * also checks against the subType-appropriate target speed with a 30%
 * tolerance. A 35 km/h "recovery" ride is technically within the 36 km/h
 * expert absolute cap, but it is clearly wrong for the subType — this
 * shape of error is the most common failure mode from Claude.
 */
function diagnose(activity, { fitnessLevel, isLongRide } = {}) {
  if (!activity || typeof activity !== 'object') {
    return { ok: true, reason: 'not-an-activity' };
  }
  if (activity.type && activity.type !== 'ride') {
    return { ok: activity.distanceKm == null, reason: 'strength-should-have-null-distance' };
  }
  const mins = Number(activity.durationMins);
  const km = Number(activity.distanceKm);
  if (!Number.isFinite(mins) || mins <= 0) return { ok: true, reason: 'missing-duration' };
  if (!Number.isFinite(km) || km <= 0) return { ok: false, reason: 'missing-distance' };

  const impliedSpeed = km / (mins / 60);
  const level = normaliseLevel(fitnessLevel);
  const max = MAX_AVG_SPEED_KMH[level];
  const min = MIN_AVG_SPEED_KMH[level];

  // Absolute physical cap check first — definitively impossible speeds.
  if (impliedSpeed > max) {
    return {
      ok: false,
      impliedSpeedKmh: Number(impliedSpeed.toFixed(2)),
      minKmh: min,
      maxKmh: max,
      level,
      reason: 'speed-above-cap',
    };
  }
  if (impliedSpeed < min) {
    return {
      ok: false,
      impliedSpeedKmh: Number(impliedSpeed.toFixed(2)),
      minKmh: min,
      maxKmh: max,
      level,
      reason: 'speed-below-floor',
    };
  }

  // SubType-aware check: is this speed plausible for the labelled subType?
  // Recovery at 35 km/h is within the hard cap but wildly wrong for the
  // session type. Allow 30% either side of the target to leave room for
  // Claude's natural variance.
  if (activity.subType || isLongRide) {
    const target = targetSpeedKmh({
      fitnessLevel: level,
      subType: activity.subType,
      effort: activity.effort,
      isLongRide,
    });
    const ratio = impliedSpeed / target;
    if (ratio > 1.3) {
      return {
        ok: false,
        impliedSpeedKmh: Number(impliedSpeed.toFixed(2)),
        targetSpeedKmh: Number(target.toFixed(2)),
        minKmh: min,
        maxKmh: max,
        level,
        reason: 'speed-above-subtype-target',
      };
    }
    if (ratio < 0.5) {
      return {
        ok: false,
        impliedSpeedKmh: Number(impliedSpeed.toFixed(2)),
        targetSpeedKmh: Number(target.toFixed(2)),
        minKmh: min,
        maxKmh: max,
        level,
        reason: 'speed-below-subtype-target',
      };
    }
  }

  return {
    ok: true,
    impliedSpeedKmh: Number(impliedSpeed.toFixed(2)),
    minKmh: min,
    maxKmh: max,
    level,
    reason: 'within-band',
  };
}

module.exports = {
  BASE_AVG_SPEED_KMH,
  MAX_AVG_SPEED_KMH,
  MIN_AVG_SPEED_KMH,
  SUBTYPE_MULTIPLIER,
  EFFORT_MULTIPLIER,
  targetSpeedKmh,
  realisticDistanceKm,
  maxAcceptableDistanceKm,
  normaliseActivity,
  normaliseActivities,
  diagnose,
};
