/**
 * Plan Generator Test Suite
 *
 * Tests the local generatePlan() with many different configurations.
 *
 * Run local tests:
 *   node --import ./tests/loader.mjs tests/planGenerator.test.js
 *
 * Run local + API tests:
 *   node --import ./tests/loader.mjs tests/planGenerator.test.js --api http://localhost:3000
 */

import { generatePlan, suggestWeeks } from '../src/services/planGenerator.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function dateStr(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(dateString, n) {
  const [y, m, d] = dateString.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setDate(dt.getDate() + n);
  return dateStr(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

function getDayOfWeekName(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  const jsDay = dt.getDay(); // 0=Sun
  const idx = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon
  return DAY_NAMES[idx];
}

// ── Test scenarios ──────────────────────────────────────────────────────────

const SCENARIOS = [
  // ─── 1. Beginner, 3 days/week, 8 weeks, no target date ───
  {
    name: 'Beginner - General Fitness - 3 days/week',
    goal: {
      id: 'g1', goalType: 'improve', cyclingType: 'road', planName: 'Get Fit Plan',
    },
    config: {
      id: 'c1', daysPerWeek: 3, weeks: 8, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'wednesday', 'saturday'], fitnessLevel: 'beginner',
      startDate: '2026-04-06', // Monday
    },
  },

  // ─── 2. Intermediate, 4 days/week, race with target date ───
  {
    name: 'Intermediate - Race Prep - 4 days/week - 12 weeks',
    goal: {
      id: 'g2', goalType: 'race', cyclingType: 'road', eventName: 'London to Brighton',
      targetDistance: 90, targetDate: '2026-07-05', planName: 'L2B Prep',
    },
    config: {
      id: 'c2', daysPerWeek: 4, weeks: 12, trainingTypes: ['outdoor'],
      availableDays: ['tuesday', 'thursday', 'saturday', 'sunday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-06',
    },
  },

  // ─── 3. Advanced, 5 days/week, with strength ───
  {
    name: 'Advanced - 5 days + strength - 10 weeks',
    goal: {
      id: 'g3', goalType: 'distance', cyclingType: 'road', targetDistance: 160,
      targetDate: '2026-06-20', planName: 'Century Ride Prep',
    },
    config: {
      id: 'c3', daysPerWeek: 5, weeks: 10, trainingTypes: ['outdoor', 'strength'],
      availableDays: ['monday', 'tuesday', 'thursday', 'friday', 'sunday'],
      fitnessLevel: 'advanced', startDate: '2026-04-13',
      crossTrainingDays: { wednesday: 'yoga' },
    },
  },

  // ─── 4. Expert, 6 days/week, with recurring rides ───
  {
    name: 'Expert - 6 days + recurring group ride - 8 weeks',
    goal: {
      id: 'g4', goalType: 'race', cyclingType: 'road', eventName: 'Gran Fondo',
      targetDistance: 130, targetDate: '2026-06-07', planName: 'Gran Fondo Prep',
    },
    config: {
      id: 'c4', daysPerWeek: 6, weeks: 8, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'saturday', 'sunday'],
      fitnessLevel: 'expert', startDate: '2026-04-06',
      recurringRides: [
        { id: 'rr1', day: 'saturday', durationMins: 120, distanceKm: 60, notes: 'Club Ride' },
      ],
      longRideDay: 'sunday',
    },
  },

  // ─── 5. Beginner, 2 days/week, very short plan ───
  {
    name: 'Beginner - 2 days/week - 4 weeks (minimum)',
    goal: { id: 'g5', goalType: 'improve', cyclingType: 'road', planName: 'Quick Start' },
    config: {
      id: 'c5', daysPerWeek: 2, weeks: 4, trainingTypes: ['outdoor'],
      availableDays: ['wednesday', 'sunday'], fitnessLevel: 'beginner',
      startDate: '2026-04-08', // Wednesday — NOT a Monday
    },
  },

  // ─── 6. Mid-week start date (Wednesday) with organised rides ───
  {
    name: 'Wednesday start + 2 organised rides (YOUR bug scenario)',
    goal: {
      id: 'g6', goalType: 'race', cyclingType: 'road', eventName: 'Sportive',
      targetDistance: 100, targetDate: '2026-06-14', planName: 'Sportive Plan',
    },
    config: {
      id: 'c6', daysPerWeek: 3, weeks: 9, trainingTypes: ['outdoor'],
      availableDays: ['tuesday', 'thursday', 'saturday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-08', // Wednesday
      oneOffRides: [
        { date: '2026-04-10', durationMins: 90, distanceKm: 40, notes: 'Charity Ride' },
        { date: '2026-04-13', durationMins: 120, distanceKm: 55, notes: 'Sportive Recce' },
      ],
    },
  },

  // ─── 7. Saturday start date with organised ride on Sunday ───
  {
    name: 'Saturday start + organised ride next day',
    goal: {
      id: 'g7', goalType: 'distance', cyclingType: 'road', targetDistance: 80,
      targetDate: '2026-06-30', planName: 'Build Plan',
    },
    config: {
      id: 'c7', daysPerWeek: 4, weeks: 10, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'wednesday', 'friday', 'sunday'], fitnessLevel: 'advanced',
      startDate: '2026-04-18', // Saturday
      oneOffRides: [
        { date: '2026-04-19', durationMins: 150, distanceKm: 70, notes: 'Audax 70k' },
      ],
    },
  },

  // ─── 8. E-bike beginner, 3 days/week ───
  {
    name: 'E-bike beginner - 3 days/week - 8 weeks',
    goal: { id: 'g8', goalType: 'improve', cyclingType: 'ebike', planName: 'E-Bike Explorer' },
    config: {
      id: 'c8', daysPerWeek: 3, weeks: 8, trainingTypes: ['outdoor'],
      availableDays: ['tuesday', 'thursday', 'saturday'], fitnessLevel: 'beginner',
      startDate: '2026-04-06',
    },
  },

  // ─── 9. Intermediate with indoor + outdoor + strength ───
  {
    name: 'Mixed indoor/outdoor + strength - 6 weeks',
    goal: { id: 'g9', goalType: 'improve', cyclingType: 'road', planName: 'Winter Fitness' },
    config: {
      id: 'c9', daysPerWeek: 4, weeks: 6, trainingTypes: ['outdoor', 'indoor', 'strength'],
      availableDays: ['monday', 'wednesday', 'friday', 'sunday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-06',
      crossTrainingDays: { tuesday: 'swimming', thursday: 'running' },
    },
  },

  // ─── 10. Long plan (24 weeks) with recurring + target ───
  {
    name: '24-week plan with elevation + recurring rides',
    goal: {
      id: 'g10', goalType: 'race', cyclingType: 'road', eventName: 'Etape du Tour',
      targetDistance: 170, targetElevation: 4500, targetTime: 9,
      targetDate: '2026-09-20', planName: 'Etape Prep',
    },
    config: {
      id: 'c10', daysPerWeek: 5, weeks: 24, trainingTypes: ['outdoor', 'strength'],
      availableDays: ['monday', 'tuesday', 'thursday', 'saturday', 'sunday'],
      fitnessLevel: 'advanced', startDate: '2026-04-06', longRideDay: 'sunday',
      recurringRides: [
        { id: 'rr2', day: 'saturday', durationMins: 90, distanceKm: 45, notes: 'Group Ride' },
      ],
      crossTrainingDays: { wednesday: 'core workout' },
    },
  },

  // ─── 11. Organised ride on first day of plan ───
  {
    name: 'Edge: organised ride on plan start day (Monday)',
    goal: { id: 'g11', goalType: 'improve', cyclingType: 'road', planName: 'Start with Event' },
    config: {
      id: 'c11', daysPerWeek: 3, weeks: 6, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'wednesday', 'friday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-06',
      oneOffRides: [
        { date: '2026-04-06', durationMins: 120, distanceKm: 50, notes: 'Kickoff Ride' },
      ],
    },
  },

  // ─── 12. Multiple organised rides in same week ───
  {
    name: 'Edge: 3 consecutive organised rides (multi-day tour)',
    goal: {
      id: 'g12', goalType: 'race', cyclingType: 'road', eventName: 'Multi-day Tour',
      targetDate: '2026-06-28', planName: 'Tour Prep',
    },
    config: {
      id: 'c12', daysPerWeek: 4, weeks: 10, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'wednesday', 'friday', 'sunday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-20', // Monday
      oneOffRides: [
        { date: '2026-05-15', durationMins: 180, distanceKm: 80, notes: 'Stage 1 Recce' },
        { date: '2026-05-16', durationMins: 150, distanceKm: 65, notes: 'Stage 2 Recce' },
        { date: '2026-05-17', durationMins: 120, distanceKm: 50, notes: 'Stage 3 Recce' },
      ],
    },
  },

  // ─── 13. Organised ride 2 days before event ───
  {
    name: 'Edge: organised ride 2 days before target event',
    goal: {
      id: 'g13', goalType: 'race', cyclingType: 'road', eventName: 'Local Crit',
      targetDistance: 40, targetDate: '2026-05-17', planName: 'Crit Plan',
    },
    config: {
      id: 'c13', daysPerWeek: 3, weeks: 6, trainingTypes: ['outdoor'],
      availableDays: ['tuesday', 'thursday', 'saturday'], fitnessLevel: 'advanced',
      startDate: '2026-04-06',
      oneOffRides: [
        { date: '2026-05-15', durationMins: 60, distanceKm: 25, notes: 'Pre-race shakeout' },
      ],
    },
  },

  // ─── 14. Recurring rides + organised rides on same day ───
  {
    name: 'Conflict: recurring vs organised on same Saturday',
    goal: { id: 'g14', goalType: 'improve', cyclingType: 'road', planName: 'Conflict Test' },
    config: {
      id: 'c14', daysPerWeek: 3, weeks: 6, trainingTypes: ['outdoor'],
      availableDays: ['tuesday', 'thursday', 'saturday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-06',
      recurringRides: [
        { id: 'rr3', day: 'saturday', durationMins: 90, distanceKm: 40, notes: 'Club Ride' },
      ],
      oneOffRides: [
        { date: '2026-04-18', durationMins: 180, distanceKm: 80, notes: 'Charity Sportive' },
      ],
    },
  },

  // ─── 15. 1 day per week — minimal plan ───
  {
    name: 'Minimal: 1 day/week - 8 weeks',
    goal: { id: 'g15', goalType: 'improve', cyclingType: 'road', planName: 'Weekend Warrior' },
    config: {
      id: 'c15', daysPerWeek: 1, weeks: 8, trainingTypes: ['outdoor'],
      availableDays: ['sunday'], fitnessLevel: 'beginner', startDate: '2026-04-06',
    },
  },

  // ─── 16. Friday start — exercises the Monday-snap logic ───
  {
    name: 'Friday start + organised ride on Sunday',
    goal: {
      id: 'g16', goalType: 'race', cyclingType: 'road', eventName: 'TT',
      targetDistance: 25, targetDate: '2026-06-06', planName: 'TT Prep',
    },
    config: {
      id: 'c16', daysPerWeek: 3, weeks: 8, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'wednesday', 'friday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-10', // Friday
      oneOffRides: [
        { date: '2026-04-12', durationMins: 60, distanceKm: 25, notes: 'Test TT effort' },
      ],
    },
  },

  // ─── 17. Sunday start — another edge for Monday snap ───
  {
    name: 'Sunday start - Monday snap edge case',
    goal: { id: 'g17', goalType: 'improve', cyclingType: 'road', planName: 'Sunday Starter' },
    config: {
      id: 'c17', daysPerWeek: 3, weeks: 6, trainingTypes: ['outdoor'],
      availableDays: ['tuesday', 'thursday', 'sunday'], fitnessLevel: 'beginner',
      startDate: '2026-04-12', // Sunday
    },
  },

  // ─── 18. Kitchen sink — expert with everything ───
  {
    name: 'Kitchen sink: expert, all options, max complexity',
    goal: {
      id: 'g18', goalType: 'race', cyclingType: 'road', eventName: 'Marmotte',
      targetDistance: 175, targetElevation: 5000, targetTime: 10,
      targetDate: '2026-08-30', planName: 'Marmotte Beast Mode',
    },
    config: {
      id: 'c18', daysPerWeek: 6, weeks: 20, trainingTypes: ['outdoor', 'indoor', 'strength'],
      availableDays: ['monday', 'tuesday', 'wednesday', 'friday', 'saturday', 'sunday'],
      fitnessLevel: 'expert', startDate: '2026-04-13', longRideDay: 'sunday',
      recurringRides: [
        { id: 'rr4', day: 'saturday', durationMins: 150, distanceKm: 70, elevationM: 800, notes: 'Mountain Group Ride' },
        { id: 'rr5', day: 'wednesday', durationMins: 60, distanceKm: 25, notes: 'Track Night' },
      ],
      oneOffRides: [
        { date: '2026-05-10', durationMins: 240, distanceKm: 100, elevationM: 2000, notes: 'Recce Ride A' },
        { date: '2026-06-14', durationMins: 300, distanceKm: 140, elevationM: 3500, notes: 'Full Dress Rehearsal' },
        { date: '2026-07-19', durationMins: 180, distanceKm: 90, elevationM: 1500, notes: 'Sharpener' },
      ],
      crossTrainingDays: { thursday: 'yoga', friday: 'core workout' },
    },
  },
];

// ── Validation checks ───────────────────────────────────────────────────────

function validate(plan, scenario) {
  const errors = [];
  const warnings = [];
  const { goal, config } = scenario;

  if (!plan || !plan.activities) {
    errors.push('Plan or activities is null/undefined');
    return { errors, warnings, stats: {} };
  }

  const acts = plan.activities;

  // StartDate should be a Monday
  if (plan.startDate) {
    const [y, m, d] = plan.startDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    if (dt.getDay() !== 1) {
      errors.push(`startDate ${plan.startDate} is not a Monday (it's ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()]})`);
    }
  }

  // Every activity has a date and scheduleType
  const missingDates = acts.filter(a => !a.date);
  if (missingDates.length > 0) errors.push(`${missingDates.length} activities missing 'date' field`);
  const missingType = acts.filter(a => !a.scheduleType);
  if (missingType.length > 0) errors.push(`${missingType.length} activities missing 'scheduleType' field`);

  // dayOfWeek values match the actual date
  for (const a of acts) {
    if (!a.date) continue;
    const actualDayName = getDayOfWeekName(a.date);
    const expectedDayName = DAY_NAMES[a.dayOfWeek];
    if (actualDayName !== expectedDayName) {
      errors.push(`"${a.title}" on ${a.date}: dayOfWeek=${a.dayOfWeek} (${expectedDayName}) but date is ${actualDayName}`);
    }
  }

  // Organised rides are on exact correct dates
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

  // No duplicate rides on same day
  const dayTypeMap = {};
  for (const a of acts) {
    const key = `${a.week}-${a.dayOfWeek}-${a.type}`;
    if (dayTypeMap[key]) {
      errors.push(`Duplicate ${a.type} on week ${a.week}, day ${a.dayOfWeek}: "${dayTypeMap[key]}" and "${a.title}"`);
    }
    dayTypeMap[key] = a.title;
  }

  // No activities on or after event date
  if (goal.targetDate) {
    const tp = goal.targetDate.split('T')[0];
    const afterEvent = acts.filter(a => a.date && a.date >= tp);
    if (afterEvent.length > 0) {
      errors.push(`${afterEvent.length} activities on/after event ${tp}`);
    }
  }

  // Correct scheduleType flags
  for (const a of acts) {
    if (a.isOneOff && a.scheduleType !== 'organised')
      errors.push(`"${a.title}" isOneOff but scheduleType="${a.scheduleType}"`);
    if (a.isRecurring && a.scheduleType !== 'recurring')
      errors.push(`"${a.title}" isRecurring but scheduleType="${a.scheduleType}"`);
  }

  // Recovery checks around organised rides
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

  // Weeks don't exceed plan.weeks
  const maxWeek = Math.max(...acts.map(a => a.week), 0);
  if (maxWeek > plan.weeks) errors.push(`Max week (${maxWeek}) exceeds plan.weeks (${plan.weeks})`);

  // Recurring rides appear in most weeks
  for (const rr of (config.recurringRides || [])) {
    const rrActs = acts.filter(a => a.isRecurring && a.recurringRideId === rr.id);
    if (rrActs.length === 0) {
      errors.push(`Recurring "${rr.notes || rr.day}" not in any week`);
    } else if (rrActs.length < plan.weeks * 0.5) {
      warnings.push(`Recurring "${rr.notes || rr.day}" only in ${rrActs.length}/${plan.weeks} weeks`);
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

// ── Run all local tests ─────────────────────────────────────────────────────

function runLocalTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ETAPA PLAN GENERATOR — LOCAL TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let totalPass = 0, totalFail = 0, totalWarn = 0;
  const results = [];

  for (const scenario of SCENARIOS) {
    process.stdout.write(`▶ ${scenario.name}... `);
    try {
      const plan = generatePlan(scenario.goal, scenario.config);
      const { errors, warnings, stats } = validate(plan, scenario);

      if (errors.length === 0) {
        console.log(`✅ PASS (${stats.totalActivities} acts, ${stats.organised} org, ${stats.recurring} rec)`);
        totalPass++;
      } else {
        console.log(`❌ FAIL`);
        errors.forEach(e => console.log(`   ✗ ${e}`));
        totalFail++;
      }
      if (warnings.length > 0) {
        warnings.forEach(w => console.log(`   ⚠ ${w}`));
        totalWarn += warnings.length;
      }
      results.push({ name: scenario.name, pass: errors.length === 0, errors, warnings, stats });
    } catch (err) {
      console.log(`💥 ERROR: ${err.message}`);
      totalFail++;
      results.push({ name: scenario.name, pass: false, errors: [err.message], warnings: [], stats: {} });
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${totalPass} passed, ${totalFail} failed, ${totalWarn} warnings`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Scenario                                            | Result | Acts | Org | Rec | Plan | Recov');
  console.log('----------------------------------------------------|--------|------|-----|-----|------|------');
  for (const r of results) {
    const nm = r.name.substring(0, 51).padEnd(51);
    const rs = r.pass ? ' PASS ' : ' FAIL ';
    const a = String(r.stats.totalActivities || 0).padStart(4);
    const o = String(r.stats.organised || 0).padStart(3);
    const rc = String(r.stats.recurring || 0).padStart(3);
    const p = String(r.stats.planned || 0).padStart(4);
    const rv = String(r.stats.recovery || 0).padStart(4);
    console.log(`${nm} | ${rs} | ${a} | ${o} | ${rc} | ${p} | ${rv}`);
  }

  return totalFail === 0;
}

// ── API evaluation mode ─────────────────────────────────────────────────────

async function runApiTests(serverUrl) {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  ETAPA PLAN GENERATOR — API EVALUATION (${serverUrl})`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  let totalPass = 0, totalFail = 0;
  const results = [];

  for (const scenario of SCENARIOS) {
    process.stdout.write(`▶ [API] ${scenario.name}... `);
    try {
      const startRes = await fetch(`${serverUrl}/api/ai/generate-plan-async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: scenario.goal, config: scenario.config }),
      });

      if (!startRes.ok) {
        console.log(`❌ FAIL (${startRes.status})`);
        totalFail++;
        continue;
      }

      const { jobId } = await startRes.json();
      let plan = null;
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const pollRes = await fetch(`${serverUrl}/api/ai/plan-job/${jobId}`);
        if (!pollRes.ok) continue;
        const pollData = await pollRes.json();
        if (pollData.status === 'completed') { plan = pollData.plan; break; }
        if (pollData.status === 'failed') throw new Error(pollData.error);
        if (i % 10 === 0 && i > 0) process.stdout.write('.');
      }

      if (!plan) { console.log(`❌ TIMEOUT`); totalFail++; continue; }

      const { errors, warnings, stats } = validate(plan, scenario);
      if (errors.length === 0) {
        console.log(`✅ PASS (${stats.totalActivities} acts)`);
        totalPass++;
      } else {
        console.log(`❌ FAIL`);
        errors.forEach(e => console.log(`   ✗ ${e}`));
        totalFail++;
      }
      warnings.forEach(w => console.log(`   ⚠ ${w}`));
      results.push({ name: scenario.name, pass: errors.length === 0, errors, warnings, stats });
    } catch (err) {
      console.log(`💥 ${err.message}`);
      totalFail++;
    }
  }

  console.log(`\n  API RESULTS: ${totalPass}/${SCENARIOS.length} passed, ${totalFail} failed\n`);
  return totalFail === 0;
}

// ── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const apiIdx = args.indexOf('--api');

const localOk = runLocalTests();

if (apiIdx >= 0 && args[apiIdx + 1]) {
  await runApiTests(args[apiIdx + 1]);
} else {
  console.log('\nTip: Run with --api http://localhost:3000 to also test server-side LLM generation\n');
}

process.exit(localOk ? 0 : 1);
