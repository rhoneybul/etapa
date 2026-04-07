/**
 * Session label + colour system.
 * Replaces emojis with a clean text + colour approach.
 * Every activity gets a short descriptor (e.g. "Easy", "Intervals", "Long")
 * and a colour that encodes its intensity at a glance.
 */

// ── Colour palette ──────────────────────────────────────────────────────────
export const SESSION_COLORS = {
  easy:       '#22C55E', // green
  moderate:   '#E8458B', // amber
  hard:       '#EF4444', // red
  max:        '#DC2626', // deep red
  recovery:   '#64748B', // slate
  strength:   '#8B5CF6', // purple
  indoor:     '#3B82F6', // blue
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

// ── Minimal metric only ─────────────────────────────────────────────────────
export function getMetricLabel(activity) {
  if (activity.distanceKm) return `${activity.distanceKm}km`;
  if (activity.durationMins) return `${activity.durationMins}m`;
  if (activity.type === 'strength') return 'str';
  return '';
}

// ── Cross-training ──────────────────────────────────────────────────────────
export const CROSS_TRAINING_COLOR = '#06B6D4'; // cyan

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
