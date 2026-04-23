/**
 * Session label + colour system.
 * Replaces emojis with a clean text + colour approach.
 * Every activity gets a short descriptor (e.g. "Easy", "Intervals", "Long")
 * and a colour that encodes its intensity at a glance.
 */

import { colors } from '../theme';

// ── Colour palette ──────────────────────────────────────────────────────────
export const SESSION_COLORS = {
  easy:       '#22C55E', // green
  moderate:   '#E8458B', // amber
  hard:       '#EF4444', // red
  max:        '#DC2626', // deep red
  recovery:   '#64748B', // slate
  strength:   colors.secondaryMid, // steel blue
  indoor:     colors.secondary,    // steel blue
  rest:       '#64748B', // slate
};

// ── Effort display labels ───────────────────────────────────────────────────
export const EFFORT_LABELS = {
  easy:     'Easy — conversational pace, keep it relaxed',
  moderate: 'Moderate — steady effort, comfortably challenging',
  hard:     'Hard — sustained high effort',
  recovery: 'Recovery — very light, active recovery only',
  max:      'Max — all-out, race-level intensity',
};

// ── Derive the session type colour ──────────────────────────────────────────
export function getSessionColor(activity) {
  if (!activity) return SESSION_COLORS.moderate;
  if (activity.type === 'strength') return SESSION_COLORS.strength;
  if (activity.type === 'rest') return SESSION_COLORS.rest;
  if (activity.type === 'ride') {
    // Indoor rides
    if (activity.subType === 'indoor' || activity.title?.toLowerCase().includes('indoor')) {
      return SESSION_COLORS.indoor;
    }
    // By effort
    if (activity.effort && SESSION_COLORS[activity.effort]) {
      return SESSION_COLORS[activity.effort];
    }
  }
  return SESSION_COLORS.moderate;
}

// ── Derive a short session descriptor ───────────────────────────────────────
// Returns a 1–2 word label: "Easy", "Intervals", "Long", "Tempo", "Strength", etc.
export function getSessionLabel(activity) {
  if (!activity) return '';
  if (activity.type === 'strength') return 'Strength';
  if (activity.type === 'rest') return 'Rest';

  const title = (activity.title || '').toLowerCase();
  const sub = activity.subType || '';

  // Check subType first
  if (sub === 'intervals' || title.includes('interval')) return 'Intervals';
  if (sub === 'tempo' || title.includes('tempo')) return 'Tempo';
  if (sub === 'recovery' || activity.effort === 'recovery') return 'Recovery';
  if (sub === 'indoor' || title.includes('indoor')) return 'Indoor';

  // Check title for common descriptors
  if (title.includes('long')) return 'Long';
  if (title.includes('hill') || title.includes('climb')) return 'Hills';
  if (title.includes('sprint')) return 'Sprints';
  if (title.includes('threshold') || title.includes('ftp')) return 'Threshold';
  if (title.includes('endurance')) return 'Endurance';
  if (title.includes('sweet spot')) return 'Sweet Spot';

  // Fall back to effort
  if (activity.effort === 'easy') return 'Easy';
  if (activity.effort === 'hard' || activity.effort === 'max') return 'Hard';
  if (activity.effort === 'moderate') return 'Moderate';

  return 'Ride';
}

// ── Compact label for calendar / week strip cells ───────────────────────────
// Combines session label + metric: "Easy 25km", "Strength 35m", "Intervals"
export function getCellLabel(activity) {
  const label = getSessionLabel(activity);
  if (activity.distanceKm) return `${label} ${activity.distanceKm}km`;
  if (activity.durationMins) return `${label} ${activity.durationMins}m`;
  return label;
}

// ── Session-type tag — tiny-caps label for week-list rows ──────────────────
// Returns a short uppercase string suitable for a pill tag above a session
// title (matches the existing "STRENGTH" pill style used on the Today card).
// Null for rest days — the row just reads "Rest".
//
// Monochrome, no emojis, no colour coding. One more text signal that tells
// the user *what kind* of session each day is without them having to parse
// the session title (which is often a coach-named thing like "Melt" that
// gives no type info on its own).
export function getSessionTag(activity) {
  if (!activity) return null;
  if (activity.type === 'rest')     return null;
  if (activity.type === 'strength') return 'STRENGTH';
  if (activity.type === 'ride') {
    const title = (activity.title || '').toLowerCase();
    const sub = activity.subType || '';
    if (sub === 'indoor' || title.includes('indoor'))             return 'INDOOR';
    if (sub === 'recovery' || activity.effort === 'recovery')     return 'RECOVERY';
    if (sub === 'intervals' || title.includes('interval') ||
        title.includes('sprint'))                                 return 'INTERVALS';
    if (sub === 'tempo' || title.includes('tempo') ||
        title.includes('threshold') || title.includes('ftp') ||
        title.includes('sweet spot'))                             return 'TEMPO';
    if (title.includes('long'))                                   return 'LONG RIDE';
    if (title.includes('hill') || title.includes('climb'))        return 'HILLS';
    return 'ENDURANCE';
  }
  // Cross-training activity types surface as their label uppercased
  if (activity.type) return String(activity.type).toUpperCase().replace(/_/g, ' ');
  return null;
}

// ── Minimal metric only ─────────────────────────────────────────────────────
export function getMetricLabel(activity) {
  if (activity.distanceKm) return `${activity.distanceKm}km`;
  if (activity.durationMins) return `${activity.durationMins}m`;
  if (activity.type === 'strength') return 'str';
  return '';
}

// ── Activity type icons (MaterialCommunityIcons names) ──────────────────────
// Returns the icon name to use for a given activity or cross-training key.
// All icons come from @expo/vector-icons MaterialCommunityIcons.
const CT_ICONS = {
  run:            'run',
  trail_run:      'run',
  walk:           'walk',
  hike:           'hiking',
  swim:           'swim',
  weight_training:'dumbbell',
  crossfit:       'dumbbell',
  yoga:           'yoga',
  pilates:        'yoga',
  rowing:         'rowing',
  kayak:          'kayak',
  surf:           'surfing',
  ski:            'ski',
  snowboard:      'snowboard',
  rock_climb:     'image-filter-hdr',
  soccer:         'soccer',
  tennis:         'tennis',
  padel:          'tennis',
  golf:           'golf',
  martial_arts:   'karate',
  dance:          'dance-ballroom',
  skateboard:     'skateboarding',
  elliptical:     'bike-stationary',
  stair_stepper:  'stairs',
  other:          'lightning-bolt',
};

/**
 * Returns a MaterialCommunityIcons icon name for an activity.
 * Pass `ctKey` (string) for cross-training items, otherwise pass the activity object.
 */
export function getActivityIcon(activityOrCtKey) {
  if (typeof activityOrCtKey === 'string') {
    return CT_ICONS[activityOrCtKey] || 'lightning-bolt';
  }
  const a = activityOrCtKey;
  if (!a) return 'bike';
  if (a.type === 'strength') return 'dumbbell';
  if (a.type === 'rest')     return 'sleep';
  if (a.type === 'ride') {
    if (a.subType === 'indoor' || a.title?.toLowerCase().includes('indoor')) return 'bike-stationary';
    return 'bike';
  }
  // Cross-training activity types (run, swim, yoga, etc.) — use their dedicated icon
  if (a.type && CT_ICONS[a.type]) return CT_ICONS[a.type];
  return 'bike';
}

// ── Cross-training ──────────────────────────────────────────────────────────
export const CROSS_TRAINING_COLOR = colors.secondaryDark; // unified steel blue

const CT_LABELS = {
  run: 'Run', trail_run: 'Trail Run', walk: 'Walk', hike: 'Hike',
  swim: 'Swim', weight_training: 'Weights', crossfit: 'CrossFit',
  yoga: 'Yoga', pilates: 'Pilates', rowing: 'Row', kayak: 'Kayak',
  surf: 'Surf', ski: 'Ski', snowboard: 'Snowboard', rock_climb: 'Climb',
  soccer: 'Soccer', tennis: 'Tennis', padel: 'Padel', golf: 'Golf',
  martial_arts: 'Martial Arts', dance: 'Dance', skateboard: 'Skate',
  elliptical: 'Elliptical', stair_stepper: 'Stairs', other: 'Other',
};

export function getCrossTrainingLabel(key) {
  return CT_LABELS[key] || key;
}


/**
 * Build cross-training items for a specific day of the week.
 * dayIdx: 0=Mon ... 6=Sun
 * crossTrainingDaysFull: { monday: ['run','swim'], ... }
 */
const DAY_KEY_MAP = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
export function getCrossTrainingForDay(crossTrainingDaysFull, dayIdx) {
  if (!crossTrainingDaysFull) return [];
  const dayKey = DAY_KEY_MAP[dayIdx];
  const items = crossTrainingDaysFull[dayKey];
  if (!items || !Array.isArray(items) || items.length === 0) return [];
  return items.map(key => ({
    key,
    label: getCrossTrainingLabel(key),
    color: CROSS_TRAINING_COLOR,
  }));
}
