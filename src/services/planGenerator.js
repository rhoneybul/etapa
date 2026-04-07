/**
 * Plan generator — builds a structured training plan from a goal + config.
 *
 * Algorithm:
 *  1. Determine plan duration (weeks), ensuring it fits before target date
 *  2. Periodise into phases: Base → Build → Peak → Taper
 *  3. For each week, allocate activities across available days
 *  4. Mix ride types based on cycling type and fitness level
 *  5. Add strength sessions if requested
 *  6. Progressive overload within each phase
 *  7. Every 4th week is a recovery/deload week (unless in taper)
 *  8. Final 1–2 weeks are taper (reduced volume, maintained intensity)
 */

import { uid } from './storageService';

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// ── Ride templates ───────────────────────────────────────────────────────────

const RIDE_TEMPLATES = {
  endurance: {
    subType: 'endurance',
    title: 'Endurance Ride',
    effort: 'easy',
    description: 'Steady pace, stay in zone 2. Focus on building your aerobic base.',
  },
  tempo: {
    subType: 'tempo',
    title: 'Tempo Ride',
    effort: 'moderate',
    description: 'Sustained effort at a comfortably hard pace. Zone 3-4.',
  },
  intervals: {
    subType: 'intervals',
    title: 'Interval Session',
    effort: 'hard',
    description: 'Alternate between hard efforts and recovery. Push into zone 4-5 during intervals.',
  },
  recovery: {
    subType: 'recovery',
    title: 'Recovery Ride',
    effort: 'recovery',
    description: 'Very easy spin. Keep heart rate low. Active recovery only.',
  },
  longRide: {
    subType: 'endurance',
    title: 'Long Ride',
    effort: 'easy',
    description: 'Your longest ride of the week. Steady effort, practice fueling and pacing.',
  },
  racePrep: {
    subType: 'tempo',
    title: 'Race-Pace Effort',
    effort: 'moderate',
    description: 'Practice at your target race pace. Work on fueling strategy and pacing.',
  },
  opener: {
    subType: 'intervals',
    title: 'Opener',
    effort: 'moderate',
    description: 'Short ride with a few sharp efforts to open the legs before your event. Keep it short and snappy.',
  },
};

const STRENGTH_TEMPLATES = [
  {
    title: 'Lower Body Strength',
    description: 'Squats, lunges, deadlifts, calf raises. Focus on legs and glutes to build power on the bike.',
    notes: '3 sets of 10-12 reps each. Rest 60-90s between sets.',
  },
  {
    title: 'Core & Stability',
    description: 'Planks, Russian twists, dead bugs, bird dogs. A strong core means better bike handling and less fatigue.',
    notes: '3 rounds, 30-45s per exercise. Keep it controlled.',
  },
  {
    title: 'Upper Body & Core',
    description: 'Push-ups, rows, shoulder press, planks. Maintain upper body for long rides and climbing.',
    notes: '3 sets of 10-12 reps. Light to moderate weight.',
  },
];

// ── Base durations/distances by fitness level ────────────────────────────────

const BASE_PARAMS = {
  beginner:     { shortMins: 30, medMins: 45, longMins: 60,  shortKm: 10, medKm: 18, longKm: 30 },
  intermediate: { shortMins: 45, medMins: 60, longMins: 90,  shortKm: 18, medKm: 35, longKm: 55 },
  advanced:     { shortMins: 60, medMins: 75, longMins: 120, shortKm: 28, medKm: 50, longKm: 80 },
  expert:       { shortMins: 60, medMins: 90, longMins: 150, shortKm: 35, medKm: 65, longKm: 110 },
};

// ── Periodisation: split weeks into phases ──────────────────────────────────

function getPeriodisation(totalWeeks, hasTargetDate) {
  // phases array: each entry = { phase: string, weekStart, weekEnd }
  // With target date: Base (40%) → Build (30%) → Peak (15%) → Taper (15%, min 1 week)
  // Without target date: Base (50%) → Build (35%) → Peak (15%), no taper
  const phases = [];

  if (hasTargetDate && totalWeeks >= 6) {
    const taperWeeks = totalWeeks >= 12 ? 2 : 1;
    const remaining = totalWeeks - taperWeeks;
    const baseWeeks = Math.max(2, Math.round(remaining * 0.4));
    const buildWeeks = Math.max(2, Math.round(remaining * 0.35));
    const peakWeeks = Math.max(1, remaining - baseWeeks - buildWeeks);

    let w = 1;
    phases.push({ phase: 'base', start: w, end: w + baseWeeks - 1 }); w += baseWeeks;
    phases.push({ phase: 'build', start: w, end: w + buildWeeks - 1 }); w += buildWeeks;
    phases.push({ phase: 'peak', start: w, end: w + peakWeeks - 1 }); w += peakWeeks;
    phases.push({ phase: 'taper', start: w, end: totalWeeks });
  } else if (hasTargetDate && totalWeeks >= 4) {
    // Short plan with target: base → build → 1 week taper
    const taperWeeks = 1;
    const remaining = totalWeeks - taperWeeks;
    const baseWeeks = Math.max(1, Math.round(remaining * 0.5));
    const buildWeeks = remaining - baseWeeks;

    let w = 1;
    phases.push({ phase: 'base', start: w, end: w + baseWeeks - 1 }); w += baseWeeks;
    phases.push({ phase: 'build', start: w, end: w + buildWeeks - 1 }); w += buildWeeks;
    phases.push({ phase: 'taper', start: w, end: totalWeeks });
  } else {
    // No target date or very short: progressive build
    const baseWeeks = Math.max(2, Math.round(totalWeeks * 0.45));
    const buildWeeks = Math.max(1, Math.round(totalWeeks * 0.35));
    const peakWeeks = Math.max(1, totalWeeks - baseWeeks - buildWeeks);

    let w = 1;
    phases.push({ phase: 'base', start: w, end: w + baseWeeks - 1 }); w += baseWeeks;
    phases.push({ phase: 'build', start: w, end: w + buildWeeks - 1 }); w += buildWeeks;
    phases.push({ phase: 'peak', start: w, end: totalWeeks });
  }

  return phases;
}

function getPhaseForWeek(phases, week) {
  for (const p of phases) {
    if (week >= p.start && week <= p.end) return p.phase;
  }
  return 'base';
}

// ── Main generator ───────────────────────────────────────────────────────────

export function generatePlan(goal, config) {
  const {
    daysPerWeek = 3,
    weeks: rawWeeks = 8,
    trainingTypes = ['outdoor'],
    availableDays = ['monday', 'wednesday', 'saturday'],
    fitnessLevel = 'beginner',
    recurringRides = [],
    longRideDay = null,
  } = config;

  // Guard against NaN weeks (can happen if suggestWeeks fails) — default to 8
  const weeks = (typeof rawWeeks === 'number' && !isNaN(rawWeeks) && rawWeeks > 0)
    ? rawWeeks
    : 8;

  const base = BASE_PARAMS[fitnessLevel] || BASE_PARAMS.beginner;
  const includeStrength = trainingTypes.includes('strength');
  const includeIndoor = trainingTypes.includes('indoor');
  const hasTargetDate = !!goal.targetDate;

  // How many ride days vs strength days per week
  const strengthDaysPerWeek = includeStrength ? Math.min(1, Math.floor(daysPerWeek / 3)) || 1 : 0;
  const rideDaysPerWeek = daysPerWeek - strengthDaysPerWeek;

  // Map available days to indices
  const dayIndices = availableDays
    .map(d => DAY_NAMES.indexOf(d.toLowerCase()))
    .filter(i => i >= 0)
    .sort((a, b) => a - b);

  while (dayIndices.length < daysPerWeek) {
    for (let d = 0; d < 7 && dayIndices.length < daysPerWeek; d++) {
      if (!dayIndices.includes(d)) dayIndices.push(d);
    }
    dayIndices.sort((a, b) => a - b);
  }

  // Build periodisation
  const phases = getPeriodisation(weeks, hasTargetDate);

  const activities = [];
  let strengthIdx = 0;

  for (let week = 1; week <= weeks; week++) {
    const phase = getPhaseForWeek(phases, week);
    const phaseObj = phases.find(p => week >= p.start && week <= p.end);
    const weekInPhase = phaseObj ? week - phaseObj.start + 1 : 1;
    const phaseLength = phaseObj ? phaseObj.end - phaseObj.start + 1 : 1;

    // Deload: every 4th week in base/build phases (not during taper or peak)
    const isDeload = (phase === 'base' || phase === 'build') && week % 4 === 0;
    const isTaper = phase === 'taper';
    const isPeak = phase === 'peak';
    const isLastTaperWeek = isTaper && week === weeks;

    // Progressive multiplier by phase
    let progressMultiplier;
    if (isDeload) {
      progressMultiplier = 0.7;
    } else if (isTaper) {
      // Taper: reduce volume progressively (60-70% of peak), maintain some intensity
      const taperProgress = weekInPhase / phaseLength;
      progressMultiplier = 0.7 - (taperProgress * 0.15); // 70% → 55%
    } else if (phase === 'base') {
      // Base: start at 1.0, build ~6% per week
      progressMultiplier = 1 + (weekInPhase - 1) * 0.06;
    } else if (phase === 'build') {
      // Build: continue from where base left off, increase ~8% per week
      const baseEnd = phases.find(p => p.phase === 'base');
      const baseEndMultiplier = baseEnd ? 1 + (baseEnd.end - baseEnd.start) * 0.06 : 1;
      progressMultiplier = baseEndMultiplier + (weekInPhase - 1) * 0.08;
    } else if (isPeak) {
      // Peak: hold at highest volume, maybe slightly increase
      const buildEnd = phases.find(p => p.phase === 'build');
      const baseEnd = phases.find(p => p.phase === 'base');
      const baseEndMult = baseEnd ? 1 + (baseEnd.end - baseEnd.start) * 0.06 : 1;
      const buildEndMult = buildEnd ? baseEndMult + (buildEnd.end - buildEnd.start) * 0.08 : baseEndMult;
      progressMultiplier = buildEndMult + (weekInPhase - 1) * 0.03;
    } else {
      progressMultiplier = 1 + (week - 1) * 0.08;
    }

    // ── Ride day slots: use ALL cycling days from availableDays directly.
    // Do NOT slice by rideDaysPerWeek — that incorrectly steals cycling slots for
    // strength. Strength days come from crossTrainingDays config instead.
    const rideDaySlots = dayIndices; // dayIndices is built only from availableDays (cycling days)

    // Strength slots: pull from crossTrainingDays config so they land on the
    // days the user actually chose for those sessions.
    const ctDaysConfig = config.crossTrainingDays || {};
    const strengthDaySlots = includeStrength
      ? Object.keys(ctDaysConfig)
          .map(d => DAY_NAMES.indexOf(d.toLowerCase()))
          .filter(i => i >= 0)
          .sort((a, b) => a - b)
      : [];

    // Build ride templates for the number of cycling day slots we actually have
    const weekRides = buildWeekRides(rideDaySlots.length, isDeload, isTaper, isLastTaperWeek, isPeak, goal);

    // ── Lock the Long Ride to the chosen longRideDay ──────────────────────────
    const longRideDayIdx = longRideDay ? DAY_NAMES.indexOf(longRideDay) : -1;
    if (longRideDayIdx >= 0 && rideDaySlots.includes(longRideDayIdx)) {
      const targetSlotPos = rideDaySlots.indexOf(longRideDayIdx);

      // If the current phase doesn't produce a Long Ride template (e.g. taper),
      // inject one so the day is never left empty or mistyped.
      let longIdx = weekRides.findIndex(r => r.title === 'Long Ride');
      if (longIdx < 0 && !isTaper && !isLastTaperWeek) {
        // Replace the last endurance/tempo with a Long Ride
        const replaceIdx = weekRides.reduce((best, r, i) =>
          (r.effort !== 'hard' && i !== targetSlotPos) ? i : best, -1);
        if (replaceIdx >= 0) {
          weekRides[replaceIdx] = { ...RIDE_TEMPLATES.longRide };
          longIdx = replaceIdx;
        }
      }

      // Swap the Long Ride into the correct slot
      if (longIdx >= 0 && targetSlotPos < weekRides.length && targetSlotPos !== longIdx) {
        [weekRides[longIdx], weekRides[targetSlotPos]] = [weekRides[targetSlotPos], weekRides[longIdx]];
      }

      // ── Adjust adjacent rides for proper recovery ─────────────────────────
      // Day before long ride → no hard/interval sessions (swap to endurance)
      if (targetSlotPos > 0) {
        const before = weekRides[targetSlotPos - 1];
        if (before && before.effort === 'hard') {
          weekRides[targetSlotPos - 1] = { ...RIDE_TEMPLATES.endurance };
        }
      }
      // Day after long ride → always recovery
      if (targetSlotPos < weekRides.length - 1) {
        weekRides[targetSlotPos + 1] = { ...RIDE_TEMPLATES.recovery };
      }
    }

    // Add recurring rides as fixed activities for this week
    recurringRides.forEach(rr => {
      const rrDayIdx = DAY_NAMES.indexOf(rr.day);
      if (rrDayIdx < 0) return;
      const rrDuration = rr.durationMins || 60;
      const rrDistance = rr.distanceKm || null;
      const rrElevation = rr.elevationM || null;

      // Scale recurring ride slightly with progression (but never reduce below base)
      const scaledDuration = Math.round(rrDuration * Math.min(progressMultiplier, 1.0)); // keep original or less in deload
      const scaledDistance = rrDistance ? Math.round(rrDistance * Math.min(progressMultiplier, 1.0) * 10) / 10 : null;

      activities.push({
        id: uid(),
        planId: null,
        week,
        dayOfWeek: rrDayIdx,
        type: 'ride',
        subType: 'recurring',
        title: rr.notes ? `Recurring: ${rr.notes}` : 'Recurring Ride',
        description: rr.notes || 'Your regular weekly ride. The plan is built around this.',
        notes: rrElevation ? `${rrElevation}m elevation` : null,
        durationMins: isDeload ? Math.round(scaledDuration * 0.7) : scaledDuration,
        distanceKm: isDeload && scaledDistance ? Math.round(scaledDistance * 0.7 * 10) / 10 : scaledDistance,
        elevationM: rrElevation,
        effort: isDeload ? 'easy' : 'moderate',
        completed: false,
        completedAt: null,
        isRecurring: true,
        recurringRideId: rr.id,
        stravaActivityId: null,
        stravaData: null,
      });
    });

    weekRides.forEach((template, i) => {
      const dayIdx = rideDaySlots[i] ?? rideDaySlots[0];
      const isLong = template.title === 'Long Ride';
      const isShort = template.effort === 'recovery';

      let baseDist = isLong ? base.longKm : isShort ? base.shortKm : base.medKm;
      let baseDur = isLong ? base.longMins : isShort ? base.shortMins : base.medMins;

      // During taper: reduce volume but keep intensity
      const volumeMultiplier = isTaper ? progressMultiplier : progressMultiplier;
      const effortOverride = isDeload ? 'recovery' : (isTaper && !isLastTaperWeek ? template.effort : template.effort);

      // Phase label for notes
      let phaseNote = null;
      if (isDeload) phaseNote = 'Recovery week \u2014 take it easy, let your body adapt.';
      else if (isTaper && isLastTaperWeek) phaseNote = 'Race week \u2014 stay sharp, keep efforts short. Trust your training!';
      else if (isTaper) phaseNote = 'Taper week \u2014 reduced volume to let your body peak. Stay fresh.';
      else if (isPeak) phaseNote = 'Peak week \u2014 you\'re at your fittest. Maintain intensity, recover well.';

      activities.push({
        id: uid(),
        planId: null,
        week,
        dayOfWeek: dayIdx,
        type: 'ride',
        subType: includeIndoor && !isLong && Math.random() > 0.6 ? 'indoor' : template.subType,
        title: template.title + (isDeload ? ' (Deload)' : isTaper ? ' (Taper)' : ''),
        description: template.description,
        notes: phaseNote,
        durationMins: Math.round(baseDur * volumeMultiplier),
        distanceKm: Math.round(baseDist * volumeMultiplier),
        effort: effortOverride,
        completed: false,
        completedAt: null,
        stravaActivityId: null,
        stravaData: null,
      });
    });

    // Add strength sessions (skip during final taper week)
    if (!isLastTaperWeek) {
      strengthDaySlots.forEach((dayIdx) => {
        const tmpl = STRENGTH_TEMPLATES[strengthIdx % STRENGTH_TEMPLATES.length];
        strengthIdx++;
        const isLightStrength = isDeload || isTaper;
        activities.push({
          id: uid(),
          planId: null,
          week,
          dayOfWeek: dayIdx,
          type: 'strength',
          subType: null,
          title: tmpl.title + (isLightStrength ? ' (Light)' : ''),
          description: tmpl.description,
          notes: isDeload ? 'Deload week \u2014 reduce weight by 30-40%, focus on form.' : (isTaper ? 'Taper \u2014 lighter weights, fewer sets. Stay mobile.' : tmpl.notes),
          durationMins: isLightStrength ? 20 : 35,
          distanceKm: null,
          effort: isLightStrength ? 'easy' : 'moderate',
          completed: false,
          completedAt: null,
          stravaActivityId: null,
          stravaData: null,
        });
      });
    }
  }

  // Use config start date if provided, otherwise next Monday
  let startDateStr;
  if (config.startDate) {
    startDateStr = config.startDate.split('T')[0];
  } else {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() + daysUntilMonday);
    const y = startDate.getFullYear();
    const m = String(startDate.getMonth() + 1).padStart(2, '0');
    const d = String(startDate.getDate()).padStart(2, '0');
    startDateStr = `${y}-${m}-${d}`;
  }

  // ── Snap plan start to Monday for date calculations ──
  // All dayOfWeek values (0=Mon … 6=Sun) are relative to the week's Monday, so
  // planMonday MUST be used as the stored startDate — otherwise WeekViewScreen
  // adds dayOfWeek to a non-Monday date and every activity lands on the wrong day.
  const sdParts = startDateStr.split('-').map(Number);
  const planStart = new Date(sdParts[0], sdParts[1] - 1, sdParts[2], 12, 0, 0);
  const jsDayStart = planStart.getDay();
  const mondayOff = jsDayStart === 0 ? -6 : -(jsDayStart - 1);
  const planMonday = new Date(planStart);
  planMonday.setDate(planMonday.getDate() + mondayOff);
  // Always persist the Monday as startDate so display and scheduling stay in sync
  const planMondayStr = `${planMonday.getFullYear()}-${String(planMonday.getMonth() + 1).padStart(2, '0')}-${String(planMonday.getDate()).padStart(2, '0')}`;

  // ── Inject one-off planned rides deterministically ──
  const oneOffRides = config.oneOffRides || [];
  if (oneOffRides.length > 0) {
    for (const oo of oneOffRides) {
      if (!oo.date) continue;
      const ooParts = oo.date.split('T')[0].split('-').map(Number);
      const ooDate = new Date(ooParts[0], ooParts[1] - 1, ooParts[2], 12, 0, 0);
      const diffDays = Math.round((ooDate - planMonday) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) continue;
      const ooWeek = Math.floor(diffDays / 7) + 1;
      const ooDayOfWeek = diffDays % 7;
      if (ooWeek > weeks) continue;

      activities.push({
        id: uid(),
        planId: null,
        week: ooWeek,
        dayOfWeek: ooDayOfWeek,
        type: 'ride',
        subType: 'oneoff',
        title: oo.notes ? `Planned: ${oo.notes}` : 'Planned Ride',
        description: oo.notes || 'A specific ride you have planned for this date.',
        notes: oo.elevationM ? `${oo.elevationM}m elevation` : null,
        durationMins: oo.durationMins || 60,
        distanceKm: oo.distanceKm || null,
        elevationM: oo.elevationM || null,
        effort: 'moderate',
        completed: false,
        completedAt: null,
        isOneOff: true,
        oneOffDate: oo.date,
        stravaActivityId: null,
        stravaData: null,
      });
    }
  }

  // ── Hard filter: remove any activity whose date falls on or after the event ──
  if (goal.targetDate) {
    const tp = goal.targetDate.split('T')[0].split('-').map(Number);
    const eventDate = new Date(tp[0], tp[1] - 1, tp[2], 12, 0, 0);
    const eventMs = eventDate.getTime();

    for (let i = activities.length - 1; i >= 0; i--) {
      const a = activities[i];
      const actOffset = (a.week - 1) * 7 + (a.dayOfWeek ?? 0);
      const actDate = new Date(planMonday);
      actDate.setDate(actDate.getDate() + actOffset);
      if (actDate.getTime() >= eventMs) {
        activities.splice(i, 1);
      }
    }
  }

  return {
    id: uid(),
    goalId: goal.id,
    configId: config.id,
    name: goal.planName || null,
    status: 'active',
    startDate: planMondayStr,
    weeks,
    currentWeek: 1,
    activities,
    createdAt: new Date().toISOString(),
  };
}

// ── Build a week's ride mix ──────────────────────────────────────────────────

function buildWeekRides(rideDays, isDeload, isTaper, isLastTaperWeek, isPeak, goal) {
  if (rideDays <= 0) return [];

  if (isDeload) {
    return Array.from({ length: rideDays }, (_, i) =>
      i === rideDays - 1 ? RIDE_TEMPLATES.endurance : RIDE_TEMPLATES.recovery
    );
  }

  if (isLastTaperWeek) {
    // Race week: opener + easy spins, very low volume
    if (rideDays === 1) return [RIDE_TEMPLATES.opener];
    if (rideDays === 2) return [RIDE_TEMPLATES.recovery, RIDE_TEMPLATES.opener];
    // 3+ days: recovery, opener, rest days easy
    const rides = [RIDE_TEMPLATES.recovery, RIDE_TEMPLATES.opener];
    for (let i = 2; i < rideDays; i++) rides.splice(i, 0, RIDE_TEMPLATES.recovery);
    return rides.slice(0, rideDays);
  }

  if (isTaper) {
    // Taper: keep some quality but reduce volume
    const patterns = {
      1: ['tempo'],
      2: ['intervals', 'endurance'],
      3: ['intervals', 'recovery', 'endurance'],
      4: ['intervals', 'recovery', 'tempo', 'endurance'],
      5: ['intervals', 'recovery', 'tempo', 'recovery', 'endurance'],
    };
    const pattern = patterns[Math.min(rideDays, 5)] || patterns[3];
    return pattern.map(key => RIDE_TEMPLATES[key]);
  }

  if (isPeak && goal.goalType === 'race') {
    // Peak: include race-pace efforts
    const patterns = {
      1: ['racePrep'],
      2: ['intervals', 'racePrep'],
      3: ['intervals', 'racePrep', 'longRide'],
      4: ['intervals', 'racePrep', 'endurance', 'longRide'],
      5: ['intervals', 'recovery', 'racePrep', 'endurance', 'longRide'],
    };
    const pattern = patterns[Math.min(rideDays, 5)] || patterns[3];
    return pattern.map(key => RIDE_TEMPLATES[key]);
  }

  // Normal week patterns
  const patterns = {
    1: ['longRide'],
    2: ['intervals', 'longRide'],
    3: ['intervals', 'tempo', 'longRide'],
    4: ['intervals', 'endurance', 'tempo', 'longRide'],
    5: ['intervals', 'recovery', 'tempo', 'endurance', 'longRide'],
    6: ['intervals', 'recovery', 'tempo', 'endurance', 'recovery', 'longRide'],
  };

  const pattern = patterns[Math.min(rideDays, 6)] || patterns[3];
  return pattern.map(key => RIDE_TEMPLATES[key]);
}

// ── Determine plan duration from goal ────────────────────────────────────────

export function suggestWeeks(goal, fitnessLevel, startDate) {
  if (goal.targetDate) {
    let from;
    if (startDate) {
      // startDate may be a Date object or a string — handle both
      if (startDate instanceof Date) {
        from = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 12, 0, 0);
      } else {
        const sp = String(startDate).split('T')[0].split('-');
        from = new Date(Number(sp[0]), Number(sp[1]) - 1, Number(sp[2]), 12, 0, 0);
      }
    } else {
      from = new Date();
    }
    const tp = goal.targetDate.split('T')[0].split('-');
    const target = new Date(Number(tp[0]), Number(tp[1]) - 1, Number(tp[2]), 12, 0, 0);
    // Plan should finish BEFORE the event — last training week ends before event day
    const msToTarget = target - from;
    const weeksToTarget = Math.floor(msToTarget / (7 * 24 * 60 * 60 * 1000));
    // At least 4 weeks, at most 24
    return Math.min(Math.max(4, weeksToTarget), 24);
  }

  // Default durations by fitness level
  const defaults = { beginner: 10, intermediate: 8, advanced: 6, expert: 6 };
  return defaults[fitnessLevel] || 8;
}
