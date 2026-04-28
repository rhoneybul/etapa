/**
 * bikeSwap — utility for adjusting a session's distance/duration when the
 * rider swaps the bike they'll ride it on.
 *
 * Rules come from a Q&A with the Etapa coach (April 2026):
 *
 *   Hold the clock, change the kilometres.
 *
 *   The aerobic system cares about effort × time, not surface. So
 *   duration stays put and distance flexes.
 *
 *     Road → Gravel : × 0.75 distance, duration unchanged
 *     Road → MTB    : × 0.65 distance, duration unchanged
 *     Road → Indoor : drop distance entirely (meaningless), duration same
 *     Road → E-bike : × 1.05 distance, duration unchanged (warn: don't extend)
 *
 *   Per-session-type overrides:
 *     - Intervals / threshold / VO2 → surface noise breaks the stimulus.
 *       Block by default. If overridden, trim duration −15 %.
 *     - Recovery → duration only, distance irrelevant.
 *     - Long ride (≥ 120 min) → swapping to gravel or MTB also drops
 *       duration 10–15 % because technical-terrain time-cost compounds.
 *     - Specifically: road intervals → MTB and threshold → heavy gravel
 *       are flagged as "won't work well" but allow override.
 *
 * Reverse swaps invert the multiplier (Gravel → Road = × 1/0.75 ≈ 1.33).
 *
 * The util is side-effect-free — it returns a result object the caller
 * applies to its own state. Easy to unit test, easy to share between
 * the activity-detail screen and any future quick-swap UI.
 */

const ROAD_DISTANCE_FACTOR = {
  road:   1.00,
  gravel: 0.75,
  mtb:    0.65,
  ebike:  1.05,
  indoor: null, // distance is meaningless indoors
};

const KNOWN_BIKES = Object.keys(ROAD_DISTANCE_FACTOR);

// Effort/intensity buckets the rules need to distinguish.
//
// Note on effort labels: in this app `effort: 'easy'` means Zone 2 / endurance
// (steady aerobic), NOT recovery. Recovery is a distinct effort label
// `'recovery'` (Zone 1). Don't conflate them — classifying easy/Z2 as
// recovery would skip the bike-swap distance adjustments those rides
// genuinely need.
function classifySession(session) {
  const sub = (session?.subType || '').toLowerCase();
  const effort = (session?.effort || '').toLowerCase();
  if (sub === 'recovery' || effort === 'recovery' || /\bz1\b/.test(effort)) return 'recovery';
  if (sub === 'intervals' || sub === 'threshold' || sub === 'tempo' || /threshold|interval|tempo|z3|z4|z5|vo2|hard|max/.test(effort)) return 'intensity';
  // Long-ride classification by duration when subtype is endurance (or unset)
  const dur = Number(session?.durationMins || 0);
  if (dur >= 120) return 'longRide';
  return 'endurance';
}

/**
 * Compute the suggested adjustment when a session's bike type changes.
 *
 * @param {object} session  the session being swapped — uses durationMins,
 *                          distanceKm, subType, effort.
 * @param {string} fromBike one of road | gravel | mtb | ebike | indoor.
 *                          Pass the bike currently associated with the
 *                          session (or 'road' when unknown — most plans
 *                          target road as the baseline).
 * @param {string} toBike   one of road | gravel | mtb | ebike | indoor.
 * @returns {object}
 *   {
 *     proposedDuration: number|null  // mins, null if input was null
 *     proposedDistance: number|null  // km, null if dropped (e.g. indoor)
 *     dropDistance:     boolean       // true if we want to hide distance
 *     blocked:          boolean       // true for combos we recommend against
 *     blockReason:      string|null   // user-facing why
 *     warning:          string|null   // user-facing nuance even if not blocked
 *     summary:          string        // 1-line e.g. "−11 km, 90 min unchanged"
 *   }
 */
export function computeBikeSwap(session, fromBike, toBike) {
  const from = (fromBike || 'road').toLowerCase();
  const to = (toBike || '').toLowerCase();

  const baseDuration = Number(session?.durationMins) || null;
  const baseDistance = Number(session?.distanceKm) || null;

  // Unknown destination bike — return a no-op so the caller can display
  // the original numbers without any surprise math.
  if (!KNOWN_BIKES.includes(to) || from === to) {
    return {
      proposedDuration: baseDuration,
      proposedDistance: baseDistance,
      dropDistance: to === 'indoor',
      blocked: false,
      blockReason: null,
      warning: null,
      summary: 'No change.',
    };
  }

  const cls = classifySession(session);

  // Convert any bike → road first (so we can apply the road→toBike rule)
  // by inverting the from-bike factor.
  const fromFactor = ROAD_DISTANCE_FACTOR[from] ?? 1.00;
  const toFactor = ROAD_DISTANCE_FACTOR[to];

  // Indoor handling: distance drops, duration stays. We flag a warning
  // for long rides because mental fatigue is the real cost.
  if (to === 'indoor') {
    const longWarn = cls === 'longRide'
      ? "Long rides indoors are mentally tough. Consider splitting into two sessions or shortening to 90 min."
      : null;
    return {
      proposedDuration: baseDuration,
      proposedDistance: null,
      dropDistance: true,
      blocked: false,
      blockReason: null,
      warning: longWarn,
      summary: longWarn || 'Same time, distance is meaningless indoors.',
    };
  }

  // Road-equivalent distance derived from the rider's current bike, then
  // mapped onto the destination bike. fromFactor will never be null
  // because we exit early above for indoor/unknown.
  const roadDistance = baseDistance != null && fromFactor != null
    ? baseDistance / fromFactor
    : null;
  let proposedDistance = roadDistance != null && toFactor != null
    ? Math.round(roadDistance * toFactor)
    : null;
  let proposedDuration = baseDuration;

  // Intensity sessions: pacing-dependent. If the destination is a less
  // predictable surface (gravel / mtb), block by default and trim 15 %
  // when overridden.
  let blocked = false;
  let blockReason = null;
  let warning = null;
  if (cls === 'intensity' && (to === 'gravel' || to === 'mtb')) {
    blocked = true;
    blockReason = "Bumpy terrain breaks the consistent pacing these intervals are built on. Pick another bike or reschedule for a road day.";
    if (baseDuration != null) proposedDuration = Math.round(baseDuration * 0.85); // −15 % override
    warning = "If you override, we'll trim the session by 15 % and drop one interval. Don't trust your heart rate — surface noise will spike it.";
  }

  // Long rides onto rough surfaces: extra duration drag.
  if (cls === 'longRide' && (to === 'gravel' || to === 'mtb') && baseDuration != null) {
    const trimmed = Math.round(baseDuration * 0.875); // −12.5 % midpoint
    proposedDuration = trimmed;
    if (!warning) {
      warning = `Technical terrain compounds over time. We've also trimmed duration to ${trimmed} min so the session stays sustainable.`;
    }
  }

  // E-bike: don't let the user extend duration sneakily.
  if (to === 'ebike' && cls !== 'recovery' && !warning) {
    warning = "E-bikes feel easier — keep duration the same. Adding time turns a Z2 ride into junk volume.";
  }

  // Recovery: distance is irrelevant. We still surface the math but flag
  // that the rider can ignore distance entirely.
  if (cls === 'recovery') {
    warning = warning || "Recovery rides are pure time-on-bike. Don't sweat the distance.";
  }

  // Build a short summary string — useful for the suggestion sheet header.
  const distDelta = baseDistance != null && proposedDistance != null
    ? Math.round(proposedDistance - baseDistance)
    : null;
  const summary = (() => {
    if (proposedDistance == null) return 'Same time, no distance target.';
    if (distDelta == null) return `${proposedDuration} min`;
    if (distDelta === 0) return 'Same numbers.';
    const sign = distDelta > 0 ? '+' : '−';
    return `${sign}${Math.abs(distDelta)} km, ${proposedDuration} min ${proposedDuration === baseDuration ? 'unchanged' : 'adjusted'}`;
  })();

  return {
    proposedDuration,
    proposedDistance,
    dropDistance: false,
    blocked,
    blockReason,
    warning,
    summary,
  };
}

export const BIKE_LABELS = {
  road:   'Road',
  gravel: 'Gravel',
  mtb:    'MTB',
  ebike:  'E-bike',
  indoor: 'Indoor',
};

export const BIKE_KEYS = KNOWN_BIKES;
