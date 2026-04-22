/**
 * Plan post-processors.
 *
 * Deterministic "clamp" functions that run on Claude's output after the
 * speed-rules normaliser. These fix the most common generator failure
 * modes surfaced by the LLM-as-judge test runs without another Claude
 * call. See api-results-partial-*.json analyses for the failure themes
 * this addresses.
 *
 * Each function:
 *   - Takes the current activities array + goal + config
 *   - Returns { activities, violations: [...] } — violations list is for
 *     the retry loop; even when a clamp fixes the issue, we still log it
 *     so admins can see what was auto-corrected
 *   - Never throws — worst case, returns the input unchanged
 *
 * Order of application matters: runAllPostProcessors runs them in a safe
 * order. See runAll at the bottom.
 */

const { normaliseActivities } = require('./rideSpeedRules');

// ── Helpers ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function dayNameToIndex(name) {
  if (typeof name === 'number') return name;
  if (typeof name !== 'string') return null;
  const i = DAY_NAMES.indexOf(name.toLowerCase().trim());
  return i >= 0 ? i : null;
}

// Group activities by week number. Returns Map<week, activity[]>.
function groupByWeek(acts) {
  const m = new Map();
  for (const a of acts) {
    if (!a || typeof a.week !== 'number') continue;
    if (!m.has(a.week)) m.set(a.week, []);
    m.get(a.week).push(a);
  }
  return m;
}

function weekTotalKm(acts) {
  return acts.reduce((s, a) => s + (Number(a.distanceKm) || 0), 0);
}

function peakWeekKm(byWeek) {
  let peak = 0;
  for (const acts of byWeek.values()) {
    const km = weekTotalKm(acts);
    if (km > peak) peak = km;
  }
  return peak;
}

function maxWeek(byWeek) {
  return Math.max(...Array.from(byWeek.keys()));
}

// Is this plan a "beginner pathway"? Used to decide if we strip intervals.
function isBeginnerPathway(goal, config) {
  if (!goal && !config) return false;
  const name = String(goal?.planName || '').toLowerCase();
  if (goal?.goalType === 'beginner') return true;
  if (config?.fitnessLevel === 'beginner' && goal?.goalType === 'improve') return true;
  if (/explorer|starter|into cycling|just get|ride my first|first \d+/.test(name)) return true;
  return false;
}

// ── 1. Enforce final-week taper ─────────────────────────────────────────────
// When the athlete has a target date, the final 1-2 weeks of the plan
// should be a taper: total volume ≤ ~55% of peak, and no hard efforts.
// If Claude skipped the taper, we clamp the final weeks here.

function enforceTaper(acts, goal, config) {
  const violations = [];
  if (!goal?.targetDate) return { activities: acts, violations };

  const byWeek = groupByWeek(acts);
  if (byWeek.size < 3) return { activities: acts, violations };

  const last = maxWeek(byWeek);
  const peakKm = peakWeekKm(byWeek);
  if (peakKm < 20) return { activities: acts, violations };  // tiny plan

  const finalActs = byWeek.get(last) || [];
  const finalKm = weekTotalKm(finalActs);
  const TAPER_CAP_RATIO = 0.55;
  const targetFinalKm = peakKm * TAPER_CAP_RATIO;

  let next = acts.slice();

  // Volume clamp: if final week is over 55% of peak, scale every ride in
  // the final week proportionally.
  if (finalKm > targetFinalKm * 1.05) {
    const scale = targetFinalKm / finalKm;
    next = next.map((a) => {
      if (a.week !== last || a.type !== 'ride') return a;
      const newDur = Math.max(25, Math.round((a.durationMins || 0) * scale));
      return { ...a, durationMins: newDur };
    });
    violations.push({
      severity: 'critical',
      code: 'taper_volume',
      message: `Final week volume was ${Math.round(finalKm)}km (${Math.round((finalKm / peakKm) * 100)}% of peak). Clamped durations by ×${scale.toFixed(2)} to land at ~${Math.round(targetFinalKm)}km.`,
    });
  }

  // Intensity clamp: strip hard/max efforts in the final 2 weeks + downgrade
  // intervals/tempo subtypes to easy endurance in those weeks.
  const weeksToStrip = byWeek.size >= 6 ? new Set([last, last - 1]) : new Set([last]);
  let strippedCount = 0;
  next = next.map((a) => {
    if (!weeksToStrip.has(a.week) || a.type !== 'ride') return a;
    const wasHard = a.effort === 'hard' || a.effort === 'max';
    const wasInterval = a.subType === 'intervals' || (a.subType === 'tempo' && a.effort !== 'easy');
    if (wasHard || wasInterval) {
      strippedCount++;
      return {
        ...a,
        effort: 'easy',
        subType: a.subType === 'intervals' ? 'endurance' : a.subType,
        title: a.title || 'Easy spin',
      };
    }
    return a;
  });
  if (strippedCount > 0) {
    violations.push({
      severity: 'warning',
      code: 'taper_intensity',
      message: `Stripped ${strippedCount} hard/interval session(s) from the final ${weeksToStrip.size} week(s) — tapers require easy volume only.`,
    });
  }

  // Re-run speed normaliser since we changed durations.
  next = normaliseActivities(next, { fitnessLevel: config?.fitnessLevel });

  return { activities: next, violations };
}

// ── 2. Enforce session count per week ───────────────────────────────────────
// daysPerWeek == 6 but Claude returned 4 sessions some weeks → insert
// filler endurance rides on the available days not yet used.

function enforceSessionCount(acts, goal, config) {
  const violations = [];
  const target = Number(config?.daysPerWeek);
  if (!Number.isFinite(target) || target <= 0) return { activities: acts, violations };

  const available = Array.isArray(config?.availableDays)
    ? config.availableDays.map(dayNameToIndex).filter((x) => x != null)
    : DAY_NAMES.map((_, i) => i);
  if (available.length === 0) return { activities: acts, violations };

  const byWeek = groupByWeek(acts);
  if (byWeek.size === 0) return { activities: acts, violations };

  const last = maxWeek(byWeek);
  let next = acts.slice();
  const fillerKm = config?.fitnessLevel === 'expert'   ? 40
                 : config?.fitnessLevel === 'advanced' ? 32
                 : config?.fitnessLevel === 'intermediate' ? 24 : 15;
  const fillerMins = config?.fitnessLevel === 'expert'   ? 90
                   : config?.fitnessLevel === 'advanced' ? 75
                   : config?.fitnessLevel === 'intermediate' ? 60 : 45;

  for (const [week, weekActs] of byWeek.entries()) {
    // Allow 1 session slack for deload/taper weeks.
    const slack = (week === last || weekActs.some((a) => /deload|taper/i.test(a.title || ''))) ? 1 : 0;
    const floor = Math.max(1, target - slack);
    if (weekActs.length >= floor) continue;

    const missing = target - weekActs.length;
    const usedDays = new Set(weekActs.map((a) => a.dayOfWeek));
    const freeDays = available.filter((d) => !usedDays.has(d)).slice(0, missing);

    for (const d of freeDays) {
      next.push({
        id: null,  // caller assigns id in the save step
        week,
        dayOfWeek: d,
        type: 'ride',
        subType: 'endurance',
        title: 'Easy endurance ride',
        description: 'Steady, comfortable pace. Zone 2 feel — you should be able to hold a conversation.',
        notes: 'Filler session inserted to match your weekly session count.',
        durationMins: fillerMins,
        distanceKm: fillerKm,
        effort: 'easy',
      });
    }

    if (freeDays.length > 0) {
      violations.push({
        severity: 'critical',
        code: 'session_count',
        message: `Week ${week} had only ${weekActs.length}/${target} sessions — inserted ${freeDays.length} filler endurance ride(s) on ${freeDays.map((d) => DAY_NAMES[d]).join(', ')}.`,
      });
    }
  }

  next = normaliseActivities(next, { fitnessLevel: config?.fitnessLevel });
  return { activities: next, violations };
}

// ── 3. Enforce longRideDay ──────────────────────────────────────────────────
// If config.longRideDay is set, the week's longest ride by duration must
// land on that day. Swap with whatever's currently there.

function enforceLongRideDay(acts, goal, config) {
  const violations = [];
  const target = dayNameToIndex(config?.longRideDay);
  if (target == null) return { activities: acts, violations };

  const byWeek = groupByWeek(acts);
  let next = acts.slice();
  let movedCount = 0;

  for (const [week, weekActs] of byWeek.entries()) {
    const rides = weekActs.filter((a) => a.type === 'ride');
    if (rides.length === 0) continue;

    const longest = rides.reduce((m, a) =>
      (Number(a.durationMins) || 0) > (Number(m?.durationMins) || 0) ? a : m, null);
    if (!longest || longest.dayOfWeek === target) continue;

    // Swap: whatever is currently on `target`, move to longest's old day.
    const onTarget = weekActs.find((a) => a.dayOfWeek === target);

    next = next.map((a) => {
      if (a.week !== week) return a;
      if (a === longest) return { ...a, dayOfWeek: target };
      if (onTarget && a === onTarget) return { ...a, dayOfWeek: longest.dayOfWeek };
      return a;
    });
    movedCount++;
  }

  if (movedCount > 0) {
    violations.push({
      severity: 'warning',
      code: 'long_ride_day',
      message: `Moved the long ride to ${DAY_NAMES[target]} on ${movedCount} week(s) to honour longRideDay config.`,
    });
  }

  return { activities: next, violations };
}

// ── 4. Strip intensity from beginner pathways ───────────────────────────────
// Beginner + Explorer plans should never have hard intervals or threshold.

function enforceBeginnerIntensityCap(acts, goal, config) {
  const violations = [];
  if (!isBeginnerPathway(goal, config)) return { activities: acts, violations };

  let stripped = 0;
  const next = acts.map((a) => {
    if (a.type !== 'ride') return a;
    const wasHard = a.effort === 'hard' || a.effort === 'max';
    const wasInterval = a.subType === 'intervals';
    if (!wasHard && !wasInterval) return a;
    stripped++;
    return {
      ...a,
      subType: 'endurance',
      effort: 'easy',
      title: a.title || 'Easy ride',
      notes: a.notes || 'Kept easy — beginners build fitness on volume, not intensity.',
    };
  });

  if (stripped > 0) {
    violations.push({
      severity: 'warning',
      code: 'beginner_intensity',
      message: `Stripped ${stripped} hard/interval session(s) — beginner/explorer plans should stay in easy endurance zones.`,
    });
  }

  return { activities: next, violations };
}

// ── 5. Enforce cross-training days ──────────────────────────────────────────
// Days listed in crossTrainingDays must not have rides. If one exists,
// nudge it to the next available day.

function enforceCrossTrainingDays(acts, goal, config) {
  const violations = [];
  const ctDays = config?.crossTrainingDays || {};
  const ctDayIndexes = new Set(
    Object.keys(ctDays).map(dayNameToIndex).filter((x) => x != null)
  );
  if (ctDayIndexes.size === 0) return { activities: acts, violations };

  const available = Array.isArray(config?.availableDays)
    ? config.availableDays.map(dayNameToIndex).filter((x) => x != null)
    : DAY_NAMES.map((_, i) => i);

  let moved = 0;
  const byWeek = groupByWeek(acts);
  let next = acts.slice();

  for (const [week, weekActs] of byWeek.entries()) {
    const usedDays = new Set(weekActs.map((a) => a.dayOfWeek));
    for (const a of weekActs) {
      if (a.type === 'ride' && ctDayIndexes.has(a.dayOfWeek)) {
        // find an available day not used and not a CT day
        const candidate = available.find((d) => !usedDays.has(d) && !ctDayIndexes.has(d));
        if (candidate != null) {
          next = next.map((x) => (x === a ? { ...x, dayOfWeek: candidate } : x));
          usedDays.add(candidate);
          moved++;
        }
      }
    }
  }

  if (moved > 0) {
    violations.push({
      severity: 'warning',
      code: 'cross_training_day',
      message: `Moved ${moved} ride(s) off cross-training days (${Array.from(ctDayIndexes).map((d) => DAY_NAMES[d]).join(', ')}).`,
    });
  }

  return { activities: next, violations };
}

// ── 6. Enforce target distance ──────────────────────────────────────────────
// If goal.targetDistance is set, the peak phase must include at least one
// ride reaching 85%+ of it. If Claude fell short, stretch the longest ride.

function enforceTargetDistance(acts, goal, config) {
  const violations = [];
  const target = Number(goal?.targetDistance);
  if (!Number.isFinite(target) || target <= 0) return { activities: acts, violations };

  const byWeek = groupByWeek(acts);
  if (byWeek.size < 3) return { activities: acts, violations };

  const last = maxWeek(byWeek);
  // Peak phase = last 3 weeks excluding the very final (taper)
  const peakWeeks = [last - 3, last - 2, last - 1].filter((w) => byWeek.has(w));
  if (peakWeeks.length === 0) return { activities: acts, violations };

  const peakRides = peakWeeks.flatMap((w) => (byWeek.get(w) || []).filter((a) => a.type === 'ride'));
  const longest = peakRides.reduce((m, a) =>
    (Number(a.distanceKm) || 0) > (Number(m?.distanceKm) || 0) ? a : m, null);
  if (!longest) return { activities: acts, violations };

  const longestKm = Number(longest.distanceKm) || 0;
  const minAcceptable = target * 0.85;
  if (longestKm >= minAcceptable) return { activities: acts, violations };

  // Stretch the longest ride — increase distance AND duration proportionally
  // to keep speed rules happy. Speed rules will clamp if we overshoot.
  const targetKm = Math.round(target * 0.95);
  const ratio = targetKm / Math.max(longestKm, 1);
  const next = acts.map((a) => {
    if (a !== longest) return a;
    return {
      ...a,
      distanceKm: targetKm,
      durationMins: Math.round((a.durationMins || 60) * ratio),
      title: a.title ? a.title.replace(/\d+\s*km/gi, `${targetKm} km`) : `${targetKm} km peak ride`,
    };
  });

  violations.push({
    severity: 'critical',
    code: 'target_distance',
    message: `Peak long ride was ${Math.round(longestKm)}km vs ${target}km target (${Math.round((longestKm / target) * 100)}%). Stretched to ${targetKm}km (${Math.round((targetKm / target) * 100)}%) in week ${longest.week}.`,
  });

  const normalised = normaliseActivities(next, { fitnessLevel: config?.fitnessLevel });
  return { activities: normalised, violations };
}

// ── Orchestrator ────────────────────────────────────────────────────────────
// Run all clamps in a safe order. Order matters because e.g. taper
// intensity clamp is cheaper if session-count clamp runs first.

function runAll(acts, goal, config) {
  if (!Array.isArray(acts)) return { activities: acts, violations: [] };

  let current = acts;
  const allViolations = [];

  const stages = [
    ['sessionCount',        enforceSessionCount],
    ['longRideDay',         enforceLongRideDay],
    ['crossTrainingDays',   enforceCrossTrainingDays],
    ['beginnerIntensity',   enforceBeginnerIntensityCap],
    ['targetDistance',      enforceTargetDistance],
    ['taper',               enforceTaper],
  ];

  for (const [name, fn] of stages) {
    try {
      const { activities, violations } = fn(current, goal, config);
      current = Array.isArray(activities) ? activities : current;
      for (const v of (violations || [])) allViolations.push({ stage: name, ...v });
    } catch (err) {
      console.warn(`[planPostProcessors] stage ${name} threw:`, err?.message);
    }
  }

  return { activities: current, violations: allViolations };
}

module.exports = {
  runAll,
  enforceTaper,
  enforceSessionCount,
  enforceLongRideDay,
  enforceBeginnerIntensityCap,
  enforceCrossTrainingDays,
  enforceTargetDistance,
  isBeginnerPathway,
};
