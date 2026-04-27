import { SCENARIOS, EDIT_SCENARIOS } from '@/lib/scenarios';
import { SPEED_SCENARIOS } from '@/lib/speedScenarios';
import path from 'path';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// How many plan generations to run at the same time. Doubled from 5 to 10
// because a full 80-scenario run was taking ~15 minutes with Sonnet and the
// dominant constraint is serial waiting, not Claude rate limits. Override
// via TEST_CONCURRENCY env on Vercel if you hit 429s from Anthropic.
const CONCURRENCY = Number(process.env.TEST_CONCURRENCY) || 10;

// ── In-memory run registry ─────────────────────────────────────────────────
// A run is kicked off by POST /api/run-tests. It gets a runId and a mutable
// state object tracked here. Clients can:
//   - Attach to an existing run via GET /api/run-tests?runId=... (SSE stream)
//   - Cancel a run via POST /api/run-tests/cancel with { runId }
// The run keeps executing even if all clients disconnect — the fetch stream
// can be abandoned without stopping the Claude work. The registry is process-
// scoped (good enough; next reload clears it; not a cluster concern for our
// single-instance Vercel serverless deployment).
const runs = new Map();
function newRunId() { return `run_${crypto.randomBytes(8).toString('hex')}`; }

// Model the test runner uses to GENERATE plans. Matches production by default
// so the dashboard exercises exactly what customers get. Override via
// TEST_MODEL env if you want to compare against a stronger / weaker model.
const TEST_GENERATOR_MODEL = process.env.TEST_MODEL || 'claude-sonnet-4-6';

// Model the test runner uses to VERIFY each generated plan (LLM-as-judge).
// Deliberately DIFFERENT family from the generator so it can catch errors the
// generator wouldn't self-correct. Haiku 4.5 is cheap + fast — about 10× less
// than Opus per run, still catches the obvious coaching flaws. Override via
// TEST_JUDGE_MODEL env if you want Opus-level scrutiny for a specific run.
const TEST_JUDGE_MODEL = process.env.TEST_JUDGE_MODEL || 'claude-haiku-4-5-20251001';

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

  // ── Day assignments check ──────────────────────────────────────────────
  // Locks in the "Felix first plan 22nd of April" bug: when the user sets
  // config.dayAssignments (e.g. Mon=strength, Tue=outdoor, Wed=strength),
  // strength activities MUST land on strength days and rides on ride days.
  // Recurring / one-off rides are pinned by the user so we don't check
  // those — but non-pinned planned activities must match the assignment.
  const da = config.dayAssignments;
  if (da && typeof da === 'object' && Object.keys(da).length > 0) {
    const DAY_INDEX = DAY_NAMES;  // already lowercase array
    const assignByDow = new Map();
    for (const [dayName, type] of Object.entries(da)) {
      const dow = DAY_INDEX.indexOf(String(dayName).toLowerCase());
      if (dow >= 0 && type) assignByDow.set(dow, type);
    }
    const RIDE_KINDS = new Set(['outdoor', 'indoor']);
    const mismatches = [];
    for (const a of acts) {
      if (a.isRecurring || a.isOneOff || a.subType === 'recurring' || a.subType === 'oneoff') continue;
      const assigned = assignByDow.get(a.dayOfWeek);
      if (!assigned) continue;
      if (a.type === 'ride' && assigned === 'strength') {
        mismatches.push(`${DAY_INDEX[a.dayOfWeek]} wk${a.week}: ride "${a.title}" on a strength day`);
      } else if (a.type === 'strength' && RIDE_KINDS.has(assigned)) {
        mismatches.push(`${DAY_INDEX[a.dayOfWeek]} wk${a.week}: strength "${a.title}" on a ${assigned} ride day`);
      }
    }
    if (mismatches.length > 0) {
      errors.push(
        `${mismatches.length} activit${mismatches.length === 1 ? 'y' : 'ies'} violated dayAssignments: ${mismatches.slice(0, 5).join('; ')}${mismatches.length > 5 ? '…' : ''}`
      );
    }
  }

  // ── Speed realism check ────────────────────────────────────────────────
  // Catch activities that slipped past the server-side normaliser. For
  // each ride, compute implied average speed and flag anything above the
  // level's hard cap. Numbers match server/src/lib/rideSpeedRules.js.
  const SPEED_CAPS = { beginner: 22, intermediate: 28, advanced: 32, expert: 36 };
  const levelCap = SPEED_CAPS[config.fitnessLevel] || SPEED_CAPS.beginner;
  for (const a of acts) {
    if (a.type !== 'ride') continue;
    const mins = Number(a.durationMins) || 0;
    const km = Number(a.distanceKm) || 0;
    if (mins <= 0 || km <= 0) continue;
    const impliedSpeed = km / (mins / 60);
    if (impliedSpeed > levelCap) {
      errors.push(
        `"${a.title}" wk${a.week}: ${km}km / ${mins}min = ${impliedSpeed.toFixed(1)} km/h — above ${config.fitnessLevel} cap of ${levelCap} km/h`
      );
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

// Max wait for a single generation. Needs to be long enough for Opus 4.6
// (the TEST_GENERATOR_MODEL) on the biggest scenarios — a 20-week / 6 day
// plan routinely runs 180-240s. Sonnet 4 comes in well under 120s so prod
// runs don't need this headroom, but the dashboard calls Opus deliberately.
// Override via TEST_POLL_TIMEOUT_S env if you're hitting genuine hangs.
const POLL_TIMEOUT_S = Number(process.env.TEST_POLL_TIMEOUT_S) || 300;
const POLL_INTERVAL_MS = 1500;

async function generatePlan(serverUrl, authHeaders, scenario, ctx = {}) {
  const { testModel = TEST_GENERATOR_MODEL, trackJob, cancelled } = ctx;

  const startRes = await fetch(`${serverUrl}/api/ai/generate-plan-async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    // Pass the test model — server only honours this field when the caller
    // is authenticated via TEST_API_KEY (see ai.js).
    body: JSON.stringify({ goal: scenario.goal, config: scenario.config, testModel }),
  });
  if (!startRes.ok) {
    const body = await startRes.text().catch(() => '');
    throw new Error(`HTTP ${startRes.status}: ${body}`);
  }
  const { jobId } = await startRes.json();
  trackJob?.(jobId);

  const maxIterations = Math.ceil((POLL_TIMEOUT_S * 1000) / POLL_INTERVAL_MS);
  for (let i = 0; i < maxIterations; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    if (cancelled?.()) {
      throw new Error('cancelled-by-client');
    }
    const pollRes = await fetch(`${serverUrl}/api/ai/plan-job/${jobId}`, { headers: authHeaders });
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    if (pollData.status === 'completed') return pollData.plan;
    if (pollData.status === 'failed') throw new Error(pollData.error);
  }
  throw new Error(`TIMEOUT after ${POLL_TIMEOUT_S}s (model=${testModel}, scenario=${scenario.name})`);
}

// Call the server-side judge endpoint to critique a generated plan.
// Returns { model, durationMs, verdict: { score, summary, issues[] } }.
// Throws with the server's error text on non-200.
async function verifyPlan(serverUrl, authHeaders, scenario, plan) {
  const res = await fetch(`${serverUrl}/api/ai/verify-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({
      goal: scenario.goal,
      config: scenario.config,
      plan,
      judgeModel: TEST_JUDGE_MODEL,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Judge HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
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

// Fisher-Yates shuffle for picking a random scenario sample. Deterministic
// output-structure-wise — each run picks a different subset. If you want
// reproducibility, pass `sampleSeed` in the POST body and we'll shuffle with
// that (not implemented yet — future work).
function pickRandomIndexes(total, n) {
  const arr = Array.from({ length: total }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n).sort((a, b) => a - b);
}

export async function POST(req) {
  const { serverUrl, apiKey, sampleSize, scenarioName, skipEdits, skipSpeed } = await req.json();
  if (!serverUrl) return new Response('Missing serverUrl', { status: 400 });

  // scenarioName: run exactly one named scenario (e.g. "Felix first plan 22nd
  // of April"). Takes precedence over sampleSize. Useful when iterating on a
  // specific bug without burning budget on the full random sample.
  //
  // sampleSize:
  //   - undefined / null → default to 25 random generation scenarios
  //   - a number 1..SCENARIOS.length → run that many random scenarios
  //   - 'all' or >= SCENARIOS.length → run everything
  // Edit + speed scenarios are cheap and always run regardless — unless the
  // caller sets skipEdits / skipSpeed (typically for single-scenario runs).
  let genIndexes;
  if (scenarioName) {
    const idx = SCENARIOS.findIndex(s => s.name === scenarioName);
    if (idx < 0) {
      return new Response(JSON.stringify({ error: `Unknown scenarioName: "${scenarioName}"` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    genIndexes = [idx];
  } else {
    let genSampleCount;
    if (sampleSize === 'all' || sampleSize === -1) {
      genSampleCount = SCENARIOS.length;
    } else if (typeof sampleSize === 'number' && sampleSize > 0) {
      genSampleCount = Math.min(Math.floor(sampleSize), SCENARIOS.length);
    } else {
      genSampleCount = Math.min(25, SCENARIOS.length);
    }
    genIndexes = genSampleCount >= SCENARIOS.length
      ? Array.from({ length: SCENARIOS.length }, (_, i) => i)  // preserve order when running all
      : pickRandomIndexes(SCENARIOS.length, genSampleCount);
  }
  const genSampleCount = genIndexes.length;
  const selectedScenarios = genIndexes.map(i => ({ ...SCENARIOS[i], _originalIndex: i }));
  // Single-scenario runs default to skipping edit + speed tests so the user
  // gets their answer back in one Claude call, not 40.
  const effectiveSkipEdits = skipEdits ?? !!scenarioName;
  const effectiveSkipSpeed = skipSpeed ?? !!scenarioName;

  const authHeaders = apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {};

  // ── Cancellation, decoupled from the client stream ─────────────────────────
  // Earlier we aborted the run the moment the browser disconnected — easy
  // to reason about but meant "closing the tab" == "wasting every scenario
  // already in flight". Users want to be able to navigate away and let the
  // run finish; only EXPLICIT cancel (via the Cancel button) should stop
  // work.
  //
  // How the new flow works:
  //   1. POST /api/run-tests assigns a runId and registers { isCancelled,
  //      activeJobIds } in `runs`.
  //   2. The run continues writing SSE events; if the client disconnects,
  //      `controller.enqueue` throws which we swallow — the run keeps
  //      executing in the same function invocation.
  //   3. POST /api/run-tests/cancel with { runId } flips isCancelled on
  //      the registry entry; the run sees it on the next cancelled() check
  //      and short-circuits + sends DELETE to in-flight plan-job ids.
  //   4. When the run completes or is cancelled, we clean up the registry
  //      entry so it doesn't leak across invocations.
  const runId = newRunId();
  const activeJobIds = new Set();
  const run = { runId, startedAt: Date.now(), isCancelled: false, activeJobIds, authHeaders, serverUrl };
  runs.set(runId, run);

  const trackJob = (id) => { if (id) activeJobIds.add(id); };
  const cancelled = () => run.isCancelled;

  async function cancelAllJobs() {
    if (activeJobIds.size === 0) return;
    console.log(`[run-tests ${runId}] cancelling ${activeJobIds.size} in-flight jobs`);
    await Promise.allSettled(
      Array.from(activeJobIds).map(id =>
        fetch(`${serverUrl}/api/ai/plan-job/${id}`, {
          method: 'DELETE',
          headers: authHeaders,
        }).catch(() => {})
      )
    );
    activeJobIds.clear();
  }

  // Expose the per-run cancel function on the registry so the cancel
  // endpoint can reach it without being in this closure.
  run.cancelAllJobs = cancelAllJobs;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller closed (client disconnected) — swallow
        }
      }

      // ── Heartbeat ─────────────────────────────────────────────────────────
      // Proxies (Vercel edge, Cloudflare, nginx) close idle connections after
      // 60-120s of no bytes. During a long plan generation (60-300s each),
      // an individual scenario emits nothing between scenario-start and
      // scenario-done, so the stream goes silent long enough for the proxy
      // to drop it — the client sees "stuck". A 15s SSE comment ping keeps
      // the connection warm without triggering event handlers on the client
      // (comments start with ":" per the SSE spec).
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);
      // Make sure we stop the heartbeat when the run finishes.
      run.stopHeartbeat = () => clearInterval(heartbeat);

      const runStartedAt = new Date().toISOString();
      let totalPass = 0, totalFail = 0;
      // Pre-allocate results array sized to the SAMPLE — index matches the
      // send order below. The client renders by index so there's no mismatch.
      const results = new Array(selectedScenarios.length).fill(null);

      send({
        type: 'start',
        runId,                              // client stores this to call /cancel
        total: selectedScenarios.length,    // how many gens are being run
        totalAvailable: SCENARIOS.length,   // how many exist in total (for UI)
        sampleSize: genSampleCount,
        // Which original scenario indexes were picked — lets the dashboard
        // highlight the selected rows in its sidebar.
        selectedIndexes: genIndexes,
        selectedNames: selectedScenarios.map(s => s.name),
        totalEdits: EDIT_SCENARIOS.length,
        totalSpeed: SPEED_SCENARIOS.length,
        concurrency: CONCURRENCY,
      });

      // ── Run generation scenarios in parallel (CONCURRENCY at a time) ──────────
      // Iterate over the random sample — edit + speed scenarios still run
      // against the full set because they're cheap. Each scenario reports
      // its INDEX INTO THE SAMPLE as `index`, and its original-list index
      // as `originalIndex` for dashboard row highlighting.
      const generationTasks = selectedScenarios.map((scenario, i) => async () => {
        send({
          type: 'scenario-start',
          index: i,
          originalIndex: scenario._originalIndex,
          name: scenario.name,
        });

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
          const plan = await generatePlan(serverUrl, authHeaders, scenario, { trackJob, cancelled });
          result.durationMs = Date.now() - scenarioStartTime;
          result.plan = plan;

          const { errors, warnings, stats } = validate(plan, scenario);
          result.errors = errors;
          result.warnings = warnings;
          result.stats = stats;

          // ── LLM-as-judge verification ────────────────────────────────
          // Ask Opus 4.6 (different family to the generator) to critique
          // the plan. Critical-severity issues fail the scenario alongside
          // the deterministic validator errors. Best-effort — if the
          // judge errors we log a warning but don't flip the scenario.
          if (!cancelled?.()) {
            try {
              const judge = await verifyPlan(serverUrl, authHeaders, scenario, plan);
              result.judge = judge;
              if (judge?.verdict?.issues) {
                const criticals = judge.verdict.issues.filter(x => x.severity === 'critical');
                for (const c of criticals) {
                  result.errors.push(`JUDGE: ${c.message}`);
                }
                const warns = judge.verdict.issues.filter(x => x.severity === 'warning');
                for (const w of warns) {
                  result.warnings.push(`JUDGE: ${w.message}`);
                }
              }
            } catch (judgeErr) {
              result.warnings.push(`Judge failed: ${judgeErr.message}`);
            }
          }

          result.pass = result.errors.length === 0;
        } catch (err) {
          result.durationMs = Date.now() - scenarioStartTime;
          result.error = err.message;
          result.errors = [err.message];
        }

        results[i] = result;

        send({
          type: 'scenario-done',
          index: i,
          originalIndex: scenario._originalIndex,
          name: scenario.name,
          pass: result.pass,
          errors: result.errors,
          warnings: result.warnings,
          stats: result.stats,
          durationMs: result.durationMs,
          judge: result.judge || null,
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
            basePlan = await generatePlan(serverUrl, authHeaders, baseScenario, { trackJob, cancelled });
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

      // ── Run generation and (optionally) edit workflows fully in parallel ──
      // Single-scenario runs skip the edits by default so a focused rerun
      // doesn't also regenerate 8 edit plans.
      const [completedResults, completedEdits] = await Promise.all([
        runWithConcurrency(generationTasks, CONCURRENCY),
        effectiveSkipEdits ? Promise.resolve([]) : runWithConcurrency(editTasks, CONCURRENCY),
      ]);

      for (const r of completedResults) {
        if (r.pass) totalPass++;
        else totalFail++;
      }
      for (const r of completedEdits) {
        if (r.pass) editPass++;
        else editFail++;
      }

      // ── Run speed-rule unit scenarios (no LLM, pure deterministic checks) ─────
      // These validate the rideSpeedRules module directly — they appear in the
      // sidebar alongside plan scenarios so a full "Run Tests" covers BOTH the
      // generator (via LLM) AND the speed clamp logic in a single pass.
      let speedPass = 0, speedFail = 0;
      const speedResults = new Array(SPEED_SCENARIOS.length).fill(null);
      let rulesMod = null;
      try {
        // tests/dashboard/.next → repoRoot/server/src/lib. process.cwd() in Next
        // production is tests/dashboard/, so two parents up.
        const rulesPath = path.resolve(
          process.cwd(), '..', '..', 'server', 'src', 'lib', 'rideSpeedRules.js'
        );
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        rulesMod = require(rulesPath);
      } catch (err) {
        console.error('[run-tests] Could not load rideSpeedRules:', err);
      }

      // Skip speed unit tests on single-scenario runs too — they're fast but
      // clutter a focused debug run.
      const speedLoopCount = effectiveSkipSpeed ? 0 : SPEED_SCENARIOS.length;
      for (let i = 0; i < speedLoopCount; i++) {
        if (run.isCancelled) break;
        const sc = SPEED_SCENARIOS[i];
        send({ type: 'speed-start', index: i, name: sc.name });

        const startedAt = Date.now();
        const result = { name: sc.name, kind: 'speed-unit', group: sc.group, pass: false, errors: [], durationMs: null };

        if (!rulesMod) {
          result.errors = ['Could not load rideSpeedRules module'];
        } else {
          try {
            const { targetSpeedKmh, realisticDistanceKm, normaliseActivity } = rulesMod;

            if (sc.compareIndoorVsEndurance) {
              // Indoor should produce a smaller distance than endurance.
              const indoor = realisticDistanceKm({ durationMins: sc.durationMins, fitnessLevel: sc.fitnessLevel, subType: 'indoor', effort: 'easy' });
              const endur  = realisticDistanceKm({ durationMins: sc.durationMins, fitnessLevel: sc.fitnessLevel, subType: 'endurance', effort: 'easy' });
              if (!(indoor < endur)) result.errors.push(`indoor ${indoor} must be less than endurance ${endur}`);
              result.actual = { indoor, endurance: endur };
            } else if (sc.checkSpeedOnly) {
              const speed = targetSpeedKmh({
                fitnessLevel: sc.fitnessLevel,
                subType: sc.subType,
                effort: sc.effort,
                isLongRide: sc.isLongRide,
              });
              result.actual = { targetSpeedKmh: Number(speed.toFixed(2)) };
              if (speed < sc.expectSpeed.minKm || speed > sc.expectSpeed.maxKm) {
                result.errors.push(`expected ${sc.expectSpeed.minKm}–${sc.expectSpeed.maxKm} km/h, got ${speed.toFixed(2)}`);
              }
            } else if (sc.clampFrom != null) {
              // Normalise an activity that CAME from Claude with a specific
              // distanceKm, then check the output is in the expected range.
              const out = normaliseActivity({
                type: sc.type || 'ride',
                subType: sc.subType,
                effort: sc.effort,
                durationMins: sc.durationMins,
                distanceKm: sc.clampFrom,
              }, { fitnessLevel: sc.fitnessLevel, isLongRide: sc.isLongRide });
              result.actual = { distanceKm: out.distanceKm };
              if (sc.expectNull) {
                if (out.distanceKm !== null) result.errors.push(`expected null, got ${out.distanceKm}`);
              } else {
                const { minKm, maxKm } = sc.expect;
                if (out.distanceKm < minKm || out.distanceKm > maxKm) {
                  result.errors.push(`expected ${minKm}–${maxKm} km, got ${out.distanceKm}`);
                }
              }
            } else {
              // Default path — compute realistic distance and check range.
              const km = realisticDistanceKm({
                durationMins: sc.durationMins,
                fitnessLevel: sc.fitnessLevel,
                subType: sc.subType,
                effort: sc.effort,
                isLongRide: sc.isLongRide,
                type: sc.type,
              });
              result.actual = { distanceKm: km };
              const { minKm, maxKm } = sc.expect;
              if (km == null) {
                result.errors.push('realisticDistanceKm returned null');
              } else if (km < minKm || km > maxKm) {
                result.errors.push(`expected ${minKm}–${maxKm} km, got ${km}`);
              }
            }

            result.pass = result.errors.length === 0;
          } catch (err) {
            result.errors = [`exception: ${err.message}`];
          }
        }

        result.durationMs = Date.now() - startedAt;
        speedResults[i] = result;
        if (result.pass) speedPass++; else speedFail++;

        send({
          type: 'speed-done',
          index: i,
          name: sc.name,
          pass: result.pass,
          errors: result.errors,
          durationMs: result.durationMs,
          actual: result.actual,
        });
      }

      // ── Final summary ──────────────────────────────────────────────────────────
      send({
        type: 'complete',
        output: {
          runAt: runStartedAt,
          server: serverUrl,
          // totalScenarios now reflects the SAMPLE count, not the full library.
          // The downloaded JSON shape stays compatible — viewers that used to
          // expect 80 now see e.g. 25 and the results[] array matches.
          totalScenarios: selectedScenarios.length,
          totalScenariosAvailable: SCENARIOS.length,
          sampleSize: genSampleCount,
          selectedIndexes: genIndexes,
          selectedNames: selectedScenarios.map(s => s.name),
          passed: totalPass,
          failed: totalFail,
          results,
          editResults,
          editPassed: editPass,
          editFailed: editFail,
          speedResults,
          speedPassed: speedPass,
          speedFailed: speedFail,
        },
      });

      // Run finished (completed or cancelled) — drop from registry.
      // Keep the entry around for a few seconds in case the cancel endpoint
      // races with completion, then delete to avoid memory leaking.
      run.stopHeartbeat?.();
      setTimeout(() => { runs.delete(runId); }, 5000);

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

// Exported so the cancel route can reach into the process-local registry.
// On Vercel serverless this is per-function-instance — cancels only work
// when the same lambda invocation serves both the run and the cancel call.
// That's almost always the case for a single dashboard session; if you hit
// a case where cancel doesn't take effect, the run will still finish within
// Vercel's function timeout.
export { runs };
