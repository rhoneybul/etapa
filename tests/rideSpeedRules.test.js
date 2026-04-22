/**
 * Ride Speed Rules — Test Suite
 *
 * Deterministic unit tests for server/src/lib/rideSpeedRules.js. No LLM
 * required. Covers the full level × subType × effort matrix so the speed
 * clamp never regresses: beginner through expert, recovery through
 * intervals, with and without the isLongRide flag.
 *
 * Run:
 *   node tests/rideSpeedRules.test.js
 *
 * These tests also serve as documentation of the realistic-speed rules —
 * read the assertions below to see exactly what a 90-min expert endurance
 * ride is expected to be (43 km, NOT 65 km).
 */

// Use require() — the speed module is CommonJS on the server side.
// The dashboard/ESM side mirrors this via a separate import wrapper.
const path = require('path');

// Resolve relative to this file so it works from anywhere.
const rules = require(path.resolve(__dirname, '..', 'server', 'src', 'lib', 'rideSpeedRules.js'));
const {
  targetSpeedKmh,
  realisticDistanceKm,
  normaliseActivity,
  normaliseActivities,
  diagnose,
  BASE_AVG_SPEED_KMH,
  MAX_AVG_SPEED_KMH,
} = rules;

// ── Assertion helpers ───────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
const failures = [];

function assert(name, actual, expected, epsilon = 0) {
  const ok = epsilon === 0
    ? JSON.stringify(actual) === JSON.stringify(expected)
    : Math.abs(actual - expected) <= epsilon;
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    const msg = `  ❌ ${name}\n       expected ${JSON.stringify(expected)} (±${epsilon})\n       actual   ${JSON.stringify(actual)}`;
    console.log(msg);
    failures.push(msg);
  }
}

function assertBetween(name, actual, lo, hi) {
  const ok = actual >= lo && actual <= hi;
  if (ok) {
    pass++;
    console.log(`  ✅ ${name} (got ${actual})`);
  } else {
    fail++;
    const msg = `  ❌ ${name}\n       expected in [${lo}, ${hi}]\n       actual   ${actual}`;
    console.log(msg);
    failures.push(msg);
  }
}

function describe(name, fn) {
  console.log(`\n▶ ${name}`);
  fn();
}

// ── 1. Target speed per level + subtype ─────────────────────────────────────

describe('1. Target speed — beginner across subtypes', () => {
  // Base 17 km/h, hard cap 22.
  // recovery 0.70 → 11.9 km/h
  assertBetween('beginner recovery ~11-13 km/h', targetSpeedKmh({ fitnessLevel: 'beginner', subType: 'recovery', effort: 'recovery' }), 10, 13);
  // endurance 0.90 → 15.3 km/h
  assertBetween('beginner endurance ~14-17 km/h', targetSpeedKmh({ fitnessLevel: 'beginner', subType: 'endurance', effort: 'easy' }), 14, 17);
  // tempo 1.02 × moderate → ~18 km/h (under cap 22)
  assertBetween('beginner tempo ~16-20 km/h', targetSpeedKmh({ fitnessLevel: 'beginner', subType: 'tempo', effort: 'moderate' }), 16, 20);
});

describe('2. Target speed — expert across subtypes', () => {
  // Base 32, hard cap 36.
  // recovery 0.70 × recovery effort 0.92 = 20.6 km/h
  assertBetween('expert recovery ~19-23 km/h', targetSpeedKmh({ fitnessLevel: 'expert', subType: 'recovery', effort: 'recovery' }), 19, 23);
  // endurance 0.90 × easy 1.0 = 28.8
  assertBetween('expert endurance ~27-31 km/h', targetSpeedKmh({ fitnessLevel: 'expert', subType: 'endurance', effort: 'easy' }), 27, 31);
  // intervals 0.88 × hard 1.08 = ~30.4
  assertBetween('expert intervals ~29-33 km/h', targetSpeedKmh({ fitnessLevel: 'expert', subType: 'intervals', effort: 'hard' }), 29, 33);
  // long ride — 0.88 × easy 1.0 = 28.2
  assertBetween('expert long ride ~26-30 km/h', targetSpeedKmh({ fitnessLevel: 'expert', isLongRide: true, effort: 'easy' }), 26, 30);
});

describe('3. Hard caps — nothing exceeds per-level ceiling', () => {
  for (const level of Object.keys(BASE_AVG_SPEED_KMH)) {
    const fastest = targetSpeedKmh({ fitnessLevel: level, subType: 'tempo', effort: 'max' });
    const cap = MAX_AVG_SPEED_KMH[level];
    if (fastest <= cap) {
      pass++;
      console.log(`  ✅ ${level}: fastest subtype+effort (${fastest.toFixed(1)}) ≤ cap ${cap}`);
    } else {
      fail++;
      const msg = `  ❌ ${level}: fastest ${fastest.toFixed(1)} exceeds cap ${cap}`;
      console.log(msg);
      failures.push(msg);
    }
  }
});

// ── 4. Realistic distance — the exact problem from the screenshot ───────────

describe('4. Expert 90-min endurance ≈ 43 km (not 65)', () => {
  const km = realisticDistanceKm({ durationMins: 90, fitnessLevel: 'expert', subType: 'endurance', effort: 'easy' });
  assertBetween('expert 90m endurance', km, 39, 46);
});

describe('5. Expert 150-min long ride ≈ 70 km (not 110)', () => {
  const km = realisticDistanceKm({ durationMins: 150, fitnessLevel: 'expert', subType: 'endurance', effort: 'easy', isLongRide: true });
  assertBetween('expert 150m long ride', km, 65, 75);
});

describe('6. Expert 60-min recovery ≈ 20 km (not 35)', () => {
  const km = realisticDistanceKm({ durationMins: 60, fitnessLevel: 'expert', subType: 'recovery', effort: 'recovery' });
  assertBetween('expert 60m recovery', km, 18, 24);
});

describe('7. Expert 90-min intervals ≈ 45 km (not 65)', () => {
  const km = realisticDistanceKm({ durationMins: 90, fitnessLevel: 'expert', subType: 'intervals', effort: 'hard' });
  assertBetween('expert 90m intervals', km, 40, 50);
});

describe('8. Expert 90-min tempo ≈ 49 km (not 65)', () => {
  const km = realisticDistanceKm({ durationMins: 90, fitnessLevel: 'expert', subType: 'tempo', effort: 'hard' });
  assertBetween('expert 90m tempo', km, 45, 55);
});

// ── Beginner distances ──────────────────────────────────────────────────────

describe('9. Beginner 45-min endurance ≈ 11-13 km', () => {
  const km = realisticDistanceKm({ durationMins: 45, fitnessLevel: 'beginner', subType: 'endurance', effort: 'easy' });
  assertBetween('beginner 45m endurance', km, 10, 14);
});

describe('10. Beginner 30-min recovery ≈ 5-7 km', () => {
  const km = realisticDistanceKm({ durationMins: 30, fitnessLevel: 'beginner', subType: 'recovery', effort: 'recovery' });
  assertBetween('beginner 30m recovery', km, 5, 7);
});

describe('11. Beginner 60-min endurance ≈ 14-17 km', () => {
  const km = realisticDistanceKm({ durationMins: 60, fitnessLevel: 'beginner', subType: 'endurance', effort: 'easy' });
  assertBetween('beginner 60m endurance', km, 13, 17);
});

// ── Intermediate distances ──────────────────────────────────────────────────

describe('12. Intermediate 90-min endurance ≈ 32-38 km', () => {
  const km = realisticDistanceKm({ durationMins: 90, fitnessLevel: 'intermediate', subType: 'endurance', effort: 'easy' });
  assertBetween('intermediate 90m endurance', km, 30, 39);
});

describe('13. Intermediate 120-min long ride ≈ 40-48 km', () => {
  const km = realisticDistanceKm({ durationMins: 120, fitnessLevel: 'intermediate', subType: 'endurance', effort: 'easy', isLongRide: true });
  assertBetween('intermediate 120m long ride', km, 40, 48);
});

describe('14. Intermediate 60-min tempo ≈ 24-28 km', () => {
  const km = realisticDistanceKm({ durationMins: 60, fitnessLevel: 'intermediate', subType: 'tempo', effort: 'moderate' });
  assertBetween('intermediate 60m tempo', km, 23, 29);
});

// ── Advanced distances ──────────────────────────────────────────────────────

describe('15. Advanced 120-min endurance ≈ 48-58 km', () => {
  const km = realisticDistanceKm({ durationMins: 120, fitnessLevel: 'advanced', subType: 'endurance', effort: 'easy' });
  assertBetween('advanced 120m endurance', km, 46, 58);
});

describe('16. Advanced 180-min long ride ≈ 72-84 km', () => {
  const km = realisticDistanceKm({ durationMins: 180, fitnessLevel: 'advanced', subType: 'endurance', effort: 'easy', isLongRide: true });
  assertBetween('advanced 180m long ride', km, 70, 86);
});

describe('17. Advanced 75-min intervals ≈ 31-37 km', () => {
  const km = realisticDistanceKm({ durationMins: 75, fitnessLevel: 'advanced', subType: 'intervals', effort: 'hard' });
  assertBetween('advanced 75m intervals', km, 30, 38);
});

// ── Normalisation — replaces bad Claude values ──────────────────────────────

describe('18. normaliseActivity clamps 65km expert endurance to ~43km', () => {
  const out = normaliseActivity(
    { type: 'ride', subType: 'endurance', effort: 'easy', durationMins: 90, distanceKm: 65 },
    { fitnessLevel: 'expert' }
  );
  assertBetween('clamped expert endurance 65km → ~43', out.distanceKm, 39, 46);
});

describe('19. normaliseActivity clamps 110km expert long ride to ~70km', () => {
  const out = normaliseActivity(
    { type: 'ride', subType: 'endurance', effort: 'easy', durationMins: 150, distanceKm: 110 },
    { fitnessLevel: 'expert', isLongRide: true }
  );
  assertBetween('clamped expert long ride 110km → ~70', out.distanceKm, 65, 75);
});

describe('20. normaliseActivity keeps realistic value (no flattening)', () => {
  // Within 15% of target (43): 42 is fine, should not be touched.
  const out = normaliseActivity(
    { type: 'ride', subType: 'endurance', effort: 'easy', durationMins: 90, distanceKm: 42 },
    { fitnessLevel: 'expert' }
  );
  assert('keeps Claude\'s 42 (within 15% band)', out.distanceKm, 42);
});

describe('21. normaliseActivity forces null distance on strength', () => {
  const out = normaliseActivity(
    { type: 'strength', subType: null, effort: 'moderate', durationMins: 30, distanceKm: 15 },
    { fitnessLevel: 'expert' }
  );
  assert('strength distanceKm forced null', out.distanceKm, null);
});

describe('22. normaliseActivity handles missing duration', () => {
  const out = normaliseActivity(
    { type: 'ride', subType: 'endurance', effort: 'easy', durationMins: null, distanceKm: 20 },
    { fitnessLevel: 'intermediate' }
  );
  assert('missing duration → null distance', out.distanceKm, null);
});

describe('23. normaliseActivity handles missing level defaults beginner', () => {
  // 45-min endurance with no level → treated as beginner → ~11km
  const out = normaliseActivity(
    { type: 'ride', subType: 'endurance', effort: 'easy', durationMins: 45, distanceKm: 30 },
    {}
  );
  assertBetween('unknown level defaults to beginner', out.distanceKm, 10, 14);
});

// ── Whole-plan normalisation ────────────────────────────────────────────────

describe('24. normaliseActivities detects long ride per week by longest duration', () => {
  const week = [
    { week: 1, dayOfWeek: 0, type: 'ride', subType: 'intervals', effort: 'hard', durationMins: 60, distanceKm: 999 },
    { week: 1, dayOfWeek: 2, type: 'ride', subType: 'endurance', effort: 'easy', durationMins: 90, distanceKm: 999 },
    { week: 1, dayOfWeek: 5, type: 'ride', subType: 'endurance', effort: 'easy', durationMins: 150, distanceKm: 999 },
  ];
  const out = normaliseActivities(week, { fitnessLevel: 'expert' });
  // Week's longest duration is 150 → that one gets the long-ride multiplier.
  // 150 min × 32 × 0.88 = ~70 km.
  assertBetween('longest of week treated as long ride', out[2].distanceKm, 65, 75);
  // The 90-min endurance uses the endurance multiplier → ~43.
  assertBetween('non-longest endurance stays endurance', out[1].distanceKm, 39, 46);
});

describe('25. normaliseActivities applies per-week long-ride detection independently', () => {
  const acts = [
    { week: 1, type: 'ride', subType: 'endurance', effort: 'easy', durationMins: 150, distanceKm: 999 },
    { week: 2, type: 'ride', subType: 'endurance', effort: 'easy', durationMins: 120, distanceKm: 999 },
  ];
  const out = normaliseActivities(acts, { fitnessLevel: 'intermediate' });
  // Week 1 long ride: 150m × 24 × 0.88 = ~53
  assertBetween('week 1 long ride normalised', out[0].distanceKm, 49, 56);
  // Week 2 long ride (only ride that week): 120m × 24 × 0.88 = ~42
  assertBetween('week 2 long ride normalised', out[1].distanceKm, 40, 46);
});

// ── Diagnostics ─────────────────────────────────────────────────────────────

describe('26. diagnose flags 65km/90min expert endurance as above cap', () => {
  const d = diagnose(
    { type: 'ride', durationMins: 90, distanceKm: 65 },
    { fitnessLevel: 'expert' }
  );
  assert('diagnose flags above cap', d.ok, false);
  assert('diagnose reports speed-above-cap', d.reason, 'speed-above-cap');
});

describe('27. diagnose accepts realistic 43km/90min expert endurance', () => {
  const d = diagnose(
    { type: 'ride', durationMins: 90, distanceKm: 43 },
    { fitnessLevel: 'expert' }
  );
  assert('diagnose accepts realistic', d.ok, true);
});

// ── Regression of the exact screenshot row values ───────────────────────────

describe('28. Regression of screenshot: all 5 rows should be flagged as too fast', () => {
  // Reasons we expect:
  // - rows above 36 km/h absolute cap → speed-above-cap
  // - rows within cap but wrong for subType (e.g. 35 km/h "recovery") → speed-above-subtype-target
  const offenders = [
    { name: 'Interval Session 65km/90m', a: { type: 'ride', subType: 'intervals', effort: 'hard', durationMins: 90, distanceKm: 65 } },
    { name: 'Recovery Ride 35km/60m', a: { type: 'ride', subType: 'recovery', effort: 'recovery', durationMins: 60, distanceKm: 35 } },
    { name: 'Tempo Ride 65km/90m', a: { type: 'ride', subType: 'tempo', effort: 'moderate', durationMins: 90, distanceKm: 65 } },
    { name: 'Endurance Ride 65km/90m', a: { type: 'ride', subType: 'endurance', effort: 'easy', durationMins: 90, distanceKm: 65 } },
    { name: 'Long Ride 110km/150m', a: { type: 'ride', subType: 'endurance', effort: 'easy', durationMins: 150, distanceKm: 110 }, isLongRide: true },
  ];
  const allowedReasons = new Set(['speed-above-cap', 'speed-above-subtype-target']);
  for (const { name, a, isLongRide } of offenders) {
    const d = diagnose(a, { fitnessLevel: 'expert', isLongRide });
    if (d.ok === false && allowedReasons.has(d.reason)) {
      pass++;
      console.log(`  ✅ ${name} correctly flagged (${d.impliedSpeedKmh} km/h, ${d.reason})`);
    } else {
      fail++;
      const msg = `  ❌ ${name} NOT flagged (${JSON.stringify(d)})`;
      console.log(msg);
      failures.push(msg);
    }
  }
});

describe('29. Regression: after normalisation all 5 rows are within cap', () => {
  const input = [
    { week: 1, type: 'ride', subType: 'intervals', effort: 'hard', durationMins: 90, distanceKm: 65 },
    { week: 1, type: 'ride', subType: 'recovery', effort: 'recovery', durationMins: 60, distanceKm: 35 },
    { week: 1, type: 'ride', subType: 'tempo', effort: 'hard', durationMins: 90, distanceKm: 65 },
    { week: 1, type: 'ride', subType: 'endurance', effort: 'easy', durationMins: 90, distanceKm: 65 },
    { week: 1, type: 'ride', subType: 'endurance', effort: 'easy', durationMins: 150, distanceKm: 110 },
  ];
  const out = normaliseActivities(input, { fitnessLevel: 'expert' });
  for (const a of out) {
    const d = diagnose(a, { fitnessLevel: 'expert' });
    if (d.ok) {
      pass++;
      console.log(`  ✅ post-norm ${a.subType} ${a.durationMins}m: ${a.distanceKm}km @ ${d.impliedSpeedKmh}km/h`);
    } else {
      fail++;
      const msg = `  ❌ post-norm ${a.subType} ${a.durationMins}m: ${a.distanceKm}km STILL out of band (${JSON.stringify(d)})`;
      console.log(msg);
      failures.push(msg);
    }
  }
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('30. Edge — 0 duration returns null distance, no crash', () => {
  const out = normaliseActivity(
    { type: 'ride', subType: 'endurance', effort: 'easy', durationMins: 0, distanceKm: 10 },
    { fitnessLevel: 'intermediate' }
  );
  assert('0 duration → null distance', out.distanceKm, null);
});

describe('31. Edge — unknown subType falls back to default multiplier', () => {
  const km = realisticDistanceKm({ durationMins: 60, fitnessLevel: 'intermediate', subType: 'unknown-thing', effort: 'easy' });
  // Default multiplier 0.90 × 24 = 21.6 km/h → 22 km
  assertBetween('unknown subType → default multiplier', km, 20, 24);
});

describe('32. Edge — indoor subType slower than endurance', () => {
  const indoorKm = realisticDistanceKm({ durationMins: 60, fitnessLevel: 'intermediate', subType: 'indoor', effort: 'easy' });
  const endurKm = realisticDistanceKm({ durationMins: 60, fitnessLevel: 'intermediate', subType: 'endurance', effort: 'easy' });
  if (indoorKm < endurKm) {
    pass++;
    console.log(`  ✅ indoor (${indoorKm}) < endurance (${endurKm})`);
  } else {
    fail++;
    const msg = `  ❌ indoor (${indoorKm}) not < endurance (${endurKm})`;
    console.log(msg);
    failures.push(msg);
  }
});

describe('33. Edge — beginner cannot exceed beginner cap even on tempo', () => {
  const km = realisticDistanceKm({ durationMins: 60, fitnessLevel: 'beginner', subType: 'tempo', effort: 'max' });
  // Cap = 22 km/h × 1h = 22km max. Even "tempo max" should be bounded.
  if (km <= 22) {
    pass++;
    console.log(`  ✅ beginner tempo max capped at ${km} (≤22)`);
  } else {
    fail++;
    const msg = `  ❌ beginner tempo max = ${km}, above 22 cap`;
    console.log(msg);
    failures.push(msg);
  }
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  RIDE SPEED RULES: ${pass} passed, ${fail} failed`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (fail > 0) {
  console.log('FAILURES:');
  failures.forEach(f => console.log(f));
  process.exit(1);
}

process.exit(0);
