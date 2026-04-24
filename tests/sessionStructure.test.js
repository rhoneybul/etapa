/**
 * Session structure tests.
 *
 * Unit-style checks for the new structured-interval pipeline:
 *   - shouldHaveStructure classifies activities correctly
 *   - isValidStructure accepts good shapes, rejects bad ones
 *   - buildStructureFor produces valid fallbacks for intervals + tempo
 *   - enforceSessionStructure fills gaps without overwriting Claude's work
 *   - every hard / intervals / tempo session ends up with a populated
 *     intensity block after the post-processor runs
 *
 * Run:
 *   node tests/sessionStructure.test.js
 *   # or alongside the rest of the suite:
 *   node --import ./tests/loader.mjs tests/sessionStructure.test.js
 *
 * Uses the same pass/fail style as planGenerator.test.js — no extra test
 * framework. Exits non-zero if any assertion fails, so CI will catch it.
 */

const {
  shouldHaveStructure,
  buildStructureFor,
  isValidStructure,
  enforceSessionStructure,
  INTENSITY_PRESETS,
} = require('../server/src/lib/sessionStructure');

let pass = 0;
let fail = 0;
const failures = [];

function assert(label, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    failures.push(`${label}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

function group(name, fn) {
  console.log(`\n${name}`);
  fn();
}

// ─── shouldHaveStructure ────────────────────────────────────────────────────
group('shouldHaveStructure — classifier', () => {
  // Positive cases: anything intense / structured
  assert('intervals+hard → true',
    shouldHaveStructure({ type: 'ride', subType: 'intervals', effort: 'hard' }) === true);
  assert('intervals+max → true',
    shouldHaveStructure({ type: 'ride', subType: 'intervals', effort: 'max' }) === true);
  assert('tempo+moderate → true',
    shouldHaveStructure({ type: 'ride', subType: 'tempo', effort: 'moderate' }) === true);
  assert('endurance+hard → true (rare but the breakdown still helps)',
    shouldHaveStructure({ type: 'ride', subType: 'endurance', effort: 'hard' }) === true);

  // Negative cases: steady-state / beginner / strength
  assert('endurance+easy → false',
    shouldHaveStructure({ type: 'ride', subType: 'endurance', effort: 'easy' }) === false);
  assert('recovery → false',
    shouldHaveStructure({ type: 'ride', subType: 'recovery', effort: 'recovery' }) === false);
  assert('long_ride+easy → false',
    shouldHaveStructure({ type: 'ride', subType: 'long_ride', effort: 'easy' }) === false);
  assert('strength → false',
    shouldHaveStructure({ type: 'strength', subType: null, effort: 'moderate' }) === false);
  assert('missing activity → false',
    shouldHaveStructure(null) === false);
});

// ─── isValidStructure ───────────────────────────────────────────────────────
group('isValidStructure — shape gate', () => {
  const good = {
    warmup: { durationMins: 10, description: 'easy', effort: 'easy' },
    main: {
      type: 'intervals', reps: 4, workMins: 4, restMins: 3,
      description: '4×4 hard',
      intensity: {
        rpe: 8, rpeCue: 'hard', hrZone: 4,
        hrPctOfMaxLow: 85, hrPctOfMaxHigh: 92,
        powerZone: 4, powerPctOfFtpLow: 91, powerPctOfFtpHigh: 105,
      },
    },
    cooldown: { durationMins: 10, description: 'easy', effort: 'easy' },
  };
  assert('well-formed structure accepted', isValidStructure(good) === true);
  assert('null rejected', isValidStructure(null) === false);
  assert('missing main rejected', isValidStructure({ warmup: {}, cooldown: {} }) === false);
  assert('missing intensity rejected', isValidStructure({ main: { type: 'intervals' } }) === false);
  assert('missing rpe rejected',
    isValidStructure({ main: { intensity: { hrPctOfMaxLow: 85, hrPctOfMaxHigh: 92 } } }) === false);
  assert('missing hr rejected',
    isValidStructure({ main: { intensity: { rpe: 8 } } }) === false);
});

// ─── buildStructureFor — fallback synth ────────────────────────────────────
group('buildStructureFor — produces valid fallbacks', () => {
  const interval = buildStructureFor({
    type: 'ride', subType: 'intervals', effort: 'hard',
    title: '4×4 min hard', description: 'VO2 work', durationMins: 60,
  });
  assert('interval fallback is valid', isValidStructure(interval));
  assert('interval fallback has main.type=intervals', interval?.main?.type === 'intervals');
  assert('interval fallback has reps',
    typeof interval?.main?.reps === 'number',
    `reps was ${interval?.main?.reps}`);
  assert('interval fallback parses "4×4" title correctly',
    interval?.main?.reps === 4 && interval?.main?.workMins === 4);

  const tempo = buildStructureFor({
    type: 'ride', subType: 'tempo', effort: 'moderate',
    title: 'Sweet spot', description: '20 min tempo block', durationMins: 75,
  });
  assert('tempo fallback is valid', isValidStructure(tempo));
  assert('tempo fallback has main.type=tempo', tempo?.main?.type === 'tempo');
  assert('tempo fallback blockMins is reasonable',
    typeof tempo?.main?.blockMins === 'number' && tempo.main.blockMins >= 15 && tempo.main.blockMins <= 40);

  const easy = buildStructureFor({
    type: 'ride', subType: 'endurance', effort: 'easy',
    title: 'Zone 2', description: 'easy spin', durationMins: 60,
  });
  assert('easy endurance returns null (no breakdown needed)', easy === null);

  // Short-rep intervals should use the VO2 preset, not threshold
  const vo2 = buildStructureFor({
    type: 'ride', subType: 'intervals', effort: 'hard',
    title: '8×30sec hard', description: '', durationMins: 45,
  });
  assert('short-rep intervals use VO2 RPE=9',
    vo2?.main?.intensity?.rpe === INTENSITY_PRESETS.vo2.rpe,
    `got rpe=${vo2?.main?.intensity?.rpe}, expected ${INTENSITY_PRESETS.vo2.rpe}`);
});

// ─── enforceSessionStructure — post-processor stage ────────────────────────
group('enforceSessionStructure — fills gaps, preserves good output', () => {
  const input = [
    // 1. Hard intervals, NO structure — should get one synthesised
    { id: 'a1', type: 'ride', subType: 'intervals', effort: 'hard',
      title: '4×4 min hard', durationMins: 60, week: 5, dayOfWeek: 3 },
    // 2. Easy endurance — should be left alone, no structure needed
    { id: 'a2', type: 'ride', subType: 'endurance', effort: 'easy',
      title: 'Zone 2', durationMins: 90, week: 5, dayOfWeek: 5 },
    // 3. Tempo WITH valid structure already — should be preserved as-is
    { id: 'a3', type: 'ride', subType: 'tempo', effort: 'moderate',
      title: 'Sweet spot', durationMins: 75, week: 5, dayOfWeek: 1,
      structure: {
        warmup: { durationMins: 15, description: 'easy', effort: 'easy' },
        main: {
          type: 'tempo', blockMins: 25,
          description: 'Custom block the user edited',
          intensity: {
            rpe: 6, rpeCue: 'custom', hrZone: 3,
            hrPctOfMaxLow: 75, hrPctOfMaxHigh: 85,
            powerZone: 3, powerPctOfFtpLow: 76, powerPctOfFtpHigh: 90,
          },
        },
        cooldown: { durationMins: 10, description: 'easy', effort: 'easy' },
      },
    },
    // 4. Strength — should be left alone
    { id: 'a4', type: 'strength', subType: null, effort: 'moderate',
      title: 'Squats', durationMins: 30, week: 5, dayOfWeek: 2 },
  ];

  const { activities, violations } = enforceSessionStructure(input, {}, {});

  // Hard intervals got a structure
  const a1 = activities.find(a => a.id === 'a1');
  assert('hard intervals gained structure', !!a1.structure);
  assert('synthesised structure is valid', isValidStructure(a1.structure));
  assert('synthesised structure has rpe', typeof a1.structure?.main?.intensity?.rpe === 'number');
  assert('synthesised structure has hr range',
    typeof a1.structure?.main?.intensity?.hrPctOfMaxLow === 'number'
      && typeof a1.structure?.main?.intensity?.hrPctOfMaxHigh === 'number');
  assert('synthesised structure has power range',
    typeof a1.structure?.main?.intensity?.powerPctOfFtpLow === 'number'
      && typeof a1.structure?.main?.intensity?.powerPctOfFtpHigh === 'number');

  // Easy endurance was NOT touched
  const a2 = activities.find(a => a.id === 'a2');
  assert('easy endurance left unchanged (no structure)', a2.structure === undefined);

  // User's custom tempo structure was preserved
  const a3 = activities.find(a => a.id === 'a3');
  assert('custom tempo structure preserved',
    a3.structure?.main?.description === 'Custom block the user edited');
  assert('custom tempo structure still valid', isValidStructure(a3.structure));

  // Strength was not touched
  const a4 = activities.find(a => a.id === 'a4');
  assert('strength session untouched', a4.structure === undefined);

  // Violations only logged for the synthesised one
  const synthViolations = violations.filter(v => v.severity === 'info');
  assert('exactly one synth violation logged',
    synthViolations.length === 1,
    `got ${synthViolations.length} violations: ${JSON.stringify(synthViolations)}`);
});

// ─── Regression: every hard/intervals/tempo session gets intensity ─────────
group('regression — mixed plan all get intensity blocks where needed', () => {
  // Simulates a realistic plan mixing easy rides and hard intervals
  const plan = [
    { id: 'r1', type: 'ride', subType: 'endurance', effort: 'easy', title: 'Z2', durationMins: 60, week: 1, dayOfWeek: 1 },
    { id: 'r2', type: 'ride', subType: 'intervals', effort: 'hard', title: '5×5 min', durationMins: 75, week: 3, dayOfWeek: 2 },
    { id: 'r3', type: 'ride', subType: 'tempo', effort: 'moderate', title: 'Tempo ride', durationMins: 60, week: 3, dayOfWeek: 4 },
    { id: 'r4', type: 'ride', subType: 'long_ride', effort: 'easy', title: 'Long', durationMins: 180, week: 3, dayOfWeek: 5 },
    { id: 'r5', type: 'ride', subType: 'recovery', effort: 'recovery', title: 'Recovery spin', durationMins: 30, week: 3, dayOfWeek: 6 },
    { id: 'r6', type: 'ride', subType: 'intervals', effort: 'max', title: '6×1 min all-out', durationMins: 60, week: 7, dayOfWeek: 2 },
  ];
  const { activities } = enforceSessionStructure(plan, {}, {});

  const needs = activities.filter(a => shouldHaveStructure(a));
  const missing = needs.filter(a => !isValidStructure(a.structure));
  assert(`every hard/structured session has valid structure (${needs.length} checked)`,
    missing.length === 0,
    missing.length ? `missing: ${missing.map(a => a.id).join(',')}` : '');

  // And every populated intensity has rpe+hr+power
  needs.forEach((a) => {
    const i = a.structure?.main?.intensity;
    assert(`${a.id} has rpe`, typeof i?.rpe === 'number');
    assert(`${a.id} has hr range`, typeof i?.hrPctOfMaxLow === 'number' && typeof i?.hrPctOfMaxHigh === 'number');
    assert(`${a.id} has power range`, typeof i?.powerPctOfFtpLow === 'number' && typeof i?.powerPctOfFtpHigh === 'number');
  });
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n────────\n${pass} passed, ${fail} failed\n`);
if (fail > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
process.exit(0);
