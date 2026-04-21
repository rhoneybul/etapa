import { SCENARIOS, EDIT_SCENARIOS } from '@/lib/scenarios';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// How many plan generations to run at the same time.
// Keep at 5 to avoid hammering the AI API with rate limits.
const CONCURRENCY = 5;

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function addDays(dateString, n) {
  const [y, m, d] = dateString.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function getDayOfWeekName(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  const jsDay = dt.getDay();
  return DAY_NAMES[jsDay === 0 ? 6 : jsDay - 1];
}

function validate(plan, scenario) {
  const errors = [];
  const warnings = [];
  const { goal, config } = scenario;

  if (!plan || !plan.activities) {
    errors.push('Plan or activities is null/undefined');
    return { errors, warnings, stats: {} };
  }

  const acts = plan.activities;

  if (plan.startDate) {
    const [y, m, d] = plan.startDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    if (dt.getDay() !== 1) {
      errors.push(`startDate ${plan.startDate} is not a Monday (it's ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()]})`);
    }
  }

  const missingDates = acts.filter(a => !a.date);
  if (missingDates.length > 0) errors.push(`${missingDates.length} activities missing 'date' field`);
  const missingType = acts.filter(a => !a.scheduleType);
  if (missingType.length > 0) errors.push(`${missingType.length} activities missing 'scheduleType' field`);

  for (const a of acts) {
    if (!a.date) continue;
    const actualDayName = getDayOfWeekName(a.date);
    const expectedDayName = DAY_NAMES[a.dayOfWeek];
    if (actualDayName !== expectedDayName) {
      errors.push(`"${a.title}" on ${a.date}: dayOfWeek=${a.dayOfWeek} (${expectedDayName}) but date is ${actualDayName}`);
    }
  }

  for (const oo of (config.oneOffRides || [])) {
    if (!oo.date) continue;
    const ooDateStr = oo.date.split('T')[0];
    const matchingActs = acts.filter(a => a.isOneOff && a.date === ooDateStr);
    if (matchingActs.length === 0) {
      errors.push(`Organised ride "${oo.notes || oo.date}" NOT found on ${ooDateStr}`);
    } else if (matchingActs.length > 1) {
      warnings.push(`Multiple organised rides found on ${ooDateStr}`);
    }
  }

  const dayTypeMap = {};
  for (const a of acts) {
    const key = `${a.week}-${a.dayOfWeek}-${a.type}`;
    if (dayTypeMap[key]) {
      errors.push(`Duplicate ${a.type} on week ${a.week}, day ${a.dayOfWeek}: "${dayTypeMap[key]}" and "${a.title}"`);
    }
    dayTypeMap[key] = a.title;
  }

  if (goal.targetDate) {
    const tp = goal.targetDate.split('T')[0];
    const afterEvent = acts.filter(a => a.date && a.date >= tp);
    if (afterEvent.length > 0) {
      errors.push(`${afterEvent.length} activities on/after event ${tp}`);
    }
  }

  for (const a of acts) {
    if (a.isOneOff && a.scheduleType !== 'organised')
      errors.push(`"${a.title}" isOneOff but scheduleType="${a.scheduleType}"`);
    if (a.isRecurring && a.scheduleType !== 'recurring')
      errors.push(`"${a.title}" isRecurring but scheduleType="${a.scheduleType}"`);
  }

  for (const a of acts) {
    if (a.scheduleType !== 'organised') continue;
    const dayAfterDate = addDays(a.date, 1);
    const dayAfterActs = acts.filter(b => b.date === dayAfterDate && b.type === 'ride' && b.scheduleType === 'planned');
    for (const after of dayAfterActs) {
      if (after.effort === 'hard' || after.subType === 'intervals') {
        warnings.push(`Day after "${a.title}" (${a.date}): "${after.title}" is ${after.effort}/${after.subType} — should be recovery`);
      }
    }
  }

  const maxWeek = Math.max(...acts.map(a => a.week), 0);
  if (maxWeek > plan.weeks) errors.push(`Max week (${maxWeek}) exceeds plan.weeks (${plan.weeks})`);

  const HIGH_IMPACT_CT = ['running', 'rowing', 'weight training', 'gym', 'hiking', 'crossfit'];
  const ctDays = config.crossTrainingDays || {};
  if (Object.keys(ctDays).length > 0) {
    const ctMap = {};
    for (const [day, act] of Object.entries(ctDays)) {
      const activities = Array.isArray(act) ? act : [act];
      ctMap[day.toLowerCase()] = activities.map(a => a.toLowerCase());
    }
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const [ctDay, activities] of Object.entries(ctMap)) {
      const hasHighImpact = activities.some(a => HIGH_IMPACT_CT.some(hi => a.includes(hi)));
      if (!hasHighImpact) continue;
      const ctDayIdx = dayOrder.indexOf(ctDay);
      if (ctDayIdx < 0) continue;
      const nextDayName = dayOrder[(ctDayIdx + 1) % 7];
      for (const a of acts) {
        if (!a.date) continue;
        const actDayName = getDayOfWeekName(a.date).toLowerCase();
        if (actDayName === nextDayName && a.type === 'ride' && (a.effort === 'hard' || a.effort === 'max' || a.subType === 'intervals')) {
          warnings.push(`Hard ride "${a.title}" (week ${a.week}) scheduled day after ${ctDay} ${activities.join('+')} — injury risk`);
        }
      }
    }
  }

  if (config.trainingTypes?.includes('strength')) {
    const strengthCount = acts.filter(a => a.type === 'strength').length;
    if (strengthCount === 0) {
      errors.push('Config includes strength training but zero strength sessions found');
    } else if (strengthCount < plan.weeks * 0.5) {
      warnings.push(`Only ${strengthCount} strength sessions across ${plan.weeks} weeks`);
    }
  }

  for (const rr of (config.recurringRides || [])) {
    const rrActs = acts.filter(a => a.isRecurring && a.recurringRideId === rr.id);
    if (rrActs.length === 0) {
      errors.push(`Recurring "${rr.notes || rr.day}" not in any week`);
    } else if (rrActs.length < plan.weeks * 0.5) {
      warnings.push(`Recurring "${rr.notes || rr.day}" only in ${rrActs.length}/${plan.weeks} weeks`);
    }
  }

  const weeksWithActivities = new Set(acts.map(a => a.week));
  const configuredWeeks = config.weeks || plan.weeks;
  if (plan.weeks !== configuredWeeks) {
    errors.push(`Plan weeks (${plan.weeks}) does not match configured weeks (${configuredWeeks})`);
  }
  const emptyWeeks = [];
  for (let w = 1; w <= plan.weeks; w++) {
    if (!weeksWithActivities.has(w)) emptyWeeks.push(w);
  }
  if (emptyWeeks.length > 0) {
    errors.push(`${emptyWeeks.length} empty weeks: [${emptyWeeks.join(', ')}]`);
  }

  const weeklyRideKm = [];
  for (let w = 1; w <= plan.weeks; w++) {
    const weekRides = acts.filter(a => a.week === w && a.type === 'ride');
    weeklyRideKm.push(weekRides.reduce((s, a) => s + (a.distanceKm || 0), 0));
  }
  for (let w = 1; w < weeklyRideKm.length; w++) {
    const prev = weeklyRideKm[w - 1];
    const curr = weeklyRideKm[w];
    if (prev > 20 && curr > prev * 1.35) {
      const isReturnFromDeload = w >= 2 && weeklyRideKm[w - 2] > 0 && weeklyRideKm[w - 1] < weeklyRideKm[w - 2] * 0.8;
      if (!isReturnFromDeload) {
        warnings.push(`Volume spike: week ${w} → ${w + 1}: ${Math.round(prev)}km → ${Math.round(curr)}km (+${Math.round((curr / prev - 1) * 100)}%)`);
      }
    }
  }

  const sortedActs = [...acts].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let consecutiveHard = 0;
  let lastDate = null;
  for (const a of sortedActs) {
    if (!a.date || a.type !== 'ride') continue;
    if (lastDate && a.date !== lastDate) {
      const dayGap = Math.round((new Date(a.date + 'T12:00:00') - new Date(lastDate + 'T12:00:00')) / 86400000);
      if (dayGap > 1) consecutiveHard = 0;
    }
    if (a.effort === 'hard' || a.effort === 'max' || a.subType === 'intervals') {
      consecutiveHard++;
      if (consecutiveHard > 2) {
        warnings.push(`${consecutiveHard} consecutive hard rides ending "${a.title}" (week ${a.week}) — overtraining risk`);
      }
    } else {
      consecutiveHard = 0;
    }
    lastDate = a.date;
  }

  for (let w = 1; w <= plan.weeks; w++) {
    const weekActs = acts.filter(a => a.week === w);
    const maxExpected = (config.daysPerWeek || 3) + 2;
    if (weekActs.length > maxExpected) {
      warnings.push(`Week ${w} has ${weekActs.length} sessions (config says ${config.daysPerWeek}/week)`);
    }
  }

  // ── Lower-bound session count — regression guard ──
  // Locks in the fix for "I asked for 3 rides, got 1". Build-phase weeks must
  // honour the requested count (1 slack for deload); taper weeks (last 25%)
  // may drop. Excludes recurring/one-off rides which are auto-injected.
  const requestedPerWeek = Object.values(config.sessionCounts || {}).reduce((s, v) => s + v, 0)
    || (config.daysPerWeek || 0);
  if (requestedPerWeek > 0 && plan.weeks >= 1) {
    const taperStartWeek = Math.max(2, Math.floor(plan.weeks * 0.75) + 1);
    const buildFloor = Math.max(1, requestedPerWeek - 1);
    for (let w = 1; w <= plan.weeks; w++) {
      const weekActs = acts.filter(a => a.week === w && !a.isRecurring && !a.isOneOff);
      const inTaper = w >= taperStartWeek;
      const floor = inTaper ? 1 : buildFloor;
      if (weekActs.length < floor) {
        const phase = inTaper ? 'taper' : 'build';
        errors.push(
          `Week ${w} (${phase}) has only ${weekActs.length} planned session${weekActs.length === 1 ? '' : 's'} but config requests ${requestedPerWeek}/week ` +
          `(${Object.entries(config.sessionCounts || { outdoor: config.daysPerWeek }).map(([k, v]) => `${v}×${k}`).join(', ')}) — plan is NOT honouring user input.`
        );
      }
    }
  }

  // ── Uninvited strength — regression guard ──
  // Locks in the fix for "I got a strength session I didn't ask for". If
  // trainingTypes doesn't include strength, zero strength activities allowed.
  if (!config.trainingTypes?.includes('strength')) {
    const unrequestedStrength = acts.filter(a => a.type === 'strength').length;
    if (unrequestedStrength > 0) {
      errors.push(
        `Found ${unrequestedStrength} strength session(s) but config.trainingTypes does not include 'strength' ` +
        `(trainingTypes=${JSON.stringify(config.trainingTypes || [])}) — plan inventing session types.`
      );
    }
  }

  if (plan.weeks >= 8 && weeklyRideKm.length >= 8) {
    let hasAnyDeload = false;
    for (let w = 2; w < weeklyRideKm.length; w++) {
      const avgPrev = (weeklyRideKm[w - 1] + weeklyRideKm[w - 2]) / 2;
      if (avgPrev > 10 && weeklyRideKm[w] < avgPrev * 0.8) { hasAnyDeload = true; break; }
    }
    if (!hasAnyDeload && weeklyRideKm.length >= 3) {
      const lastWeekKm = weeklyRideKm[weeklyRideKm.length - 1];
      const peakKm = Math.max(...weeklyRideKm.slice(0, -2));
      if (peakKm > 10 && lastWeekKm < peakKm * 0.7) hasAnyDeload = true;
    }
    if (!hasAnyDeload) {
      warnings.push(`No deload/rest week detected in ${plan.weeks}-week plan`);
    }
  }

  // Beginner with explicit target distance — strict. Peak long ride must
  // reach 80%+ of target AND final two weeks must contain a ride within
  // 15% of the target (the "graduation" ride).
  if (goal.goalType === 'beginner' && goal.targetDistance) {
    const targetDist = goal.targetDistance;
    const allRideDistances = acts.filter(a => a.type === 'ride').map(a => a.distanceKm || 0);
    const peakRide = Math.max(...allRideDistances, 0);
    if (peakRide < targetDist * 0.8) {
      errors.push(
        `Beginner-with-target (${targetDist}km): peak long ride is only ${Math.round(peakRide)}km ` +
        `(must reach ≥${Math.round(targetDist * 0.8)}km to prepare the athlete safely).`
      );
    }
    const lastTwoRides = acts.filter(a => (a.week === plan.weeks || a.week === plan.weeks - 1) && a.type === 'ride');
    const longestInFinale = Math.max(...lastTwoRides.map(a => a.distanceKm || 0), 0);
    if (longestInFinale < targetDist * 0.85) {
      errors.push(
        `Beginner-with-target (${targetDist}km): no graduation ride in last 2 weeks — longest is ${Math.round(longestInFinale)}km.`
      );
    }
  } else if (goal.goalType === 'distance' && config.fitnessLevel === 'beginner') {
    const targetDist = goal.targetDistance || 40;
    const lastWeekRides = acts.filter(a => a.week === plan.weeks && a.type === 'ride');
    const longestLastWeek = Math.max(...lastWeekRides.map(a => a.distanceKm || 0), 0);
    const penultimateRides = acts.filter(a => a.week === plan.weeks - 1 && a.type === 'ride');
    const longestPenultimate = Math.max(...penultimateRides.map(a => a.distanceKm || 0), 0);
    const longestFinalRide = Math.max(longestLastWeek, longestPenultimate);
    if (longestFinalRide < targetDist * 0.6) {
      warnings.push(`Beginner plan: longest ride in final weeks is ${Math.round(longestFinalRide)}km but target is ${targetDist}km`);
    }
  }

  if (goal.targetDistance && (goal.goalType === 'race' || goal.goalType === 'distance')) {
    const allRideDistances = acts.filter(a => a.type === 'ride').map(a => a.distanceKm || 0);
    const peakRide = Math.max(...allRideDistances, 0);
    if (peakRide < goal.targetDistance * 0.65) {
      warnings.push(`Peak ride is ${Math.round(peakRide)}km but event target is ${goal.targetDistance}km`);
    }
  }

  const stats = {
    totalActivities: acts.length,
    rides: acts.filter(a => a.type === 'ride').length,
    strength: acts.filter(a => a.type === 'strength').length,
    organised: acts.filter(a => a.scheduleType === 'organised').length,
    recurring: acts.filter(a => a.scheduleType === 'recurring').length,
    planned: acts.filter(a => a.scheduleType === 'planned').length,
    recovery: acts.filter(a => a.effort === 'recovery' || a.subType === 'recovery').length,
    weeks: plan.weeks,
    startDate: plan.startDate,
  };

  return { errors, warnings, stats };
}

async function generatePlan(serverUrl, authHeaders, scenario) {
  const startRes = await fetch(`${serverUrl}/api/ai/generate-plan-async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ goal: scenario.goal, config: scenario.config }),
  });
  if (!startRes.ok) {
    const body = await startRes.text().catch(() => '');
    throw new Error(`HTTP ${startRes.status}: ${body}`);
  }
  const { jobId } = await startRes.json();

  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const pollRes = await fetch(`${serverUrl}/api/ai/plan-job/${jobId}`, { headers: authHeaders });
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    if (pollData.status === 'completed') return pollData.plan;
    if (pollData.status === 'failed') throw new Error(pollData.error);
  }
  throw new Error('TIMEOUT after 120s');
}

/**
 * Run tasks with a max concurrency limit.
 * tasks: array of () => Promise<T>
 * Returns results in the same order as tasks.
 */
async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function POST(req) {
  const { serverUrl, apiKey } = await req.json();
  if (!serverUrl) return new Response('Missing serverUrl', { status: 400 });

  const authHeaders = apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {};

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      const runStartedAt = new Date().toISOString();
      let totalPass = 0, totalFail = 0;
      // Pre-allocate results array to preserve scenario order in final output
      const results = new Array(SCENARIOS.length).fill(null);

      send({ type: 'start', total: SCENARIOS.length, totalEdits: EDIT_SCENARIOS.length, concurrency: CONCURRENCY });

      // ── Run generation scenarios in parallel (CONCURRENCY at a time) ──────────
      const generationTasks = SCENARIOS.map((scenario, i) => async () => {
        send({ type: 'scenario-start', index: i, name: scenario.name });

        const scenarioStartTime = Date.now();
        const result = {
          name: scenario.name,
          pass: false,
          input: { goal: scenario.goal, config: scenario.config },
          plan: null,
          errors: [],
          warnings: [],
          stats: null,
          durationMs: null,
          error: null,
        };

        try {
          const plan = await generatePlan(serverUrl, authHeaders, scenario);
          result.durationMs = Date.now() - scenarioStartTime;
          result.plan = plan;

          const { errors, warnings, stats } = validate(plan, scenario);
          result.errors = errors;
          result.warnings = warnings;
          result.stats = stats;
          result.pass = errors.length === 0;
        } catch (err) {
          result.durationMs = Date.now() - scenarioStartTime;
          result.error = err.message;
          result.errors = [err.message];
        }

        results[i] = result;

        send({
          type: 'scenario-done',
          index: i,
          name: scenario.name,
          pass: result.pass,
          errors: result.errors,
          warnings: result.warnings,
          stats: result.stats,
          durationMs: result.durationMs,
        });

        return result;
      });

      // ── Build edit tasks (each generates its own base plan independently) ──────
      const editResults = new Array(EDIT_SCENARIOS.length).fill(null);
      let editPass = 0, editFail = 0;
      const baseScenario = SCENARIOS[0];

      const editTasks = EDIT_SCENARIOS.map((editScenario, i) => async () => {
        send({ type: 'edit-start', index: i, name: editScenario.name });

        const startTime = Date.now();
        const result = { name: editScenario.name, pass: false, errors: [], durationMs: null };

        try {
          // Each edit scenario generates its own independent base plan
          let basePlan;
          try {
            basePlan = await generatePlan(serverUrl, authHeaders, baseScenario);
            if (!basePlan || !basePlan.activities?.length) throw new Error('Base plan is empty');
          } catch (err) {
            throw new Error(`Base plan generation failed: ${err.message}`);
          }

          if (editScenario.type === 'activity-edit') {
            const target = basePlan.activities.find(a => a.week === 2 && a.type === 'ride')
                        || basePlan.activities.find(a => a.type === 'ride');
            if (!target) throw new Error('No ride activity found');

            const editRes = await fetch(`${serverUrl}/api/ai/edit-activity`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...authHeaders },
              body: JSON.stringify({
                activity: target,
                goal: baseScenario.goal,
                instruction: editScenario.instruction,
              }),
            });

            if (!editRes.ok) throw new Error(`Edit API ${editRes.status}`);
            const editData = await editRes.json();
            if (!editData) throw new Error('Edit returned null');
            result.pass = true;

          } else if (editScenario.type === 'plan-edit') {
            const editRes = await fetch(`${serverUrl}/api/ai/edit-plan`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...authHeaders },
              body: JSON.stringify({
                plan: basePlan,
                goal: baseScenario.goal,
                instruction: editScenario.instruction,
                scope: editScenario.scope,
                currentWeek: editScenario.currentWeek,
              }),
            });

            if (!editRes.ok) throw new Error(`Edit API ${editRes.status}`);
            const editData = await editRes.json();
            if (!editData?.activities) throw new Error('Edit returned no activities');
            result.pass = true;
          }

          result.durationMs = Date.now() - startTime;
        } catch (err) {
          result.durationMs = Date.now() - startTime;
          result.errors = [err.message];
        }

        editResults[i] = result;

        send({
          type: 'edit-done',
          index: i,
          name: editScenario.name,
          pass: result.pass,
          errors: result.errors,
          durationMs: result.durationMs,
        });

        return result;
      });

      // ── Run generation and edit workflows fully in parallel ───────────────────
      const [completedResults, completedEdits] = await Promise.all([
        runWithConcurrency(generationTasks, CONCURRENCY),
        runWithConcurrency(editTasks, CONCURRENCY),
      ]);

      for (const r of completedResults) {
        if (r.pass) totalPass++;
        else totalFail++;
      }
      for (const r of completedEdits) {
        if (r.pass) editPass++;
        else editFail++;
      }

      // ── Final summary ──────────────────────────────────────────────────────────
      send({
        type: 'complete',
        output: {
          runAt: runStartedAt,
          server: serverUrl,
          totalScenarios: SCENARIOS.length,
          passed: totalPass,
          failed: totalFail,
          results,
          editResults,
          editPassed: editPass,
          editFailed: editFail,
        },
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
