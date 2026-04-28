/**
 * Offline tests for utils/bikeSwap.
 * Validates the multipliers + blocked combos match the coach's rules.
 *
 * Run: node tests/bikeSwap.test.js
 */
const { computeBikeSwap } = require('../src/utils/bikeSwap');

let pass = 0;
let fail = 0;

function approx(a, b, tol = 1) {
  return Math.abs(a - b) <= tol;
}

function eq(actual, expected, label) {
  if (actual === expected) {
    pass++;
    console.log('  \u2705', label, '→', actual);
  } else {
    fail++;
    console.log('  \u274C', label, 'expected', expected, 'got', actual);
  }
}

function near(actual, expected, label, tol = 1) {
  if (approx(actual, expected, tol)) {
    pass++;
    console.log('  \u2705', label, '→', actual, '(\u2248', expected, ')');
  } else {
    fail++;
    console.log('  \u274C', label, 'expected ~', expected, 'got', actual);
  }
}

console.log('\n\u25B6 Endurance rides — Road baseline 90 min / 45 km');
const baseEnd = { durationMins: 90, distanceKm: 45, subType: 'endurance', effort: 'easy' };

let r;
r = computeBikeSwap(baseEnd, 'road', 'gravel');
eq(r.proposedDuration, 90, 'Road \u2192 Gravel duration unchanged');
near(r.proposedDistance, 34, 'Road \u2192 Gravel distance \u2248 0.75\u00D7');
eq(r.blocked, false, 'Road \u2192 Gravel not blocked');

r = computeBikeSwap(baseEnd, 'road', 'mtb');
eq(r.proposedDuration, 90, 'Road \u2192 MTB duration unchanged');
near(r.proposedDistance, 29, 'Road \u2192 MTB distance \u2248 0.65\u00D7');

r = computeBikeSwap(baseEnd, 'road', 'indoor');
eq(r.proposedDuration, 90, 'Road \u2192 Indoor duration unchanged');
eq(r.proposedDistance, null, 'Road \u2192 Indoor distance dropped');
eq(r.dropDistance, true, 'Road \u2192 Indoor flags dropDistance');

r = computeBikeSwap(baseEnd, 'road', 'ebike');
eq(r.proposedDuration, 90, 'Road \u2192 E-bike duration unchanged');
near(r.proposedDistance, 47, 'Road \u2192 E-bike distance \u2248 1.05\u00D7');
if (r.warning && /e-bike/i.test(r.warning)) {
  pass++; console.log('  \u2705 E-bike warning includes the right hint');
} else { fail++; console.log('  \u274C E-bike warning missing'); }

console.log('\n\u25B6 Reverse swap — Gravel \u2192 Road');
const gravelStart = { durationMins: 90, distanceKm: 34, subType: 'endurance', effort: 'easy' };
r = computeBikeSwap(gravelStart, 'gravel', 'road');
near(r.proposedDistance, 45, 'Gravel \u2192 Road distance back \u2248 1.33\u00D7');

console.log('\n\u25B6 Intensity sessions — should be blocked on rough surfaces');
const intervals = { durationMins: 75, distanceKm: 35, subType: 'intervals', effort: 'hard' };
r = computeBikeSwap(intervals, 'road', 'mtb');
eq(r.blocked, true, 'Road intervals \u2192 MTB blocked');
near(r.proposedDuration, 64, 'Override duration trimmed by 15%');

r = computeBikeSwap(intervals, 'road', 'gravel');
eq(r.blocked, true, 'Road intervals \u2192 Gravel blocked');

r = computeBikeSwap(intervals, 'road', 'indoor');
eq(r.blocked, false, 'Road intervals \u2192 Indoor allowed (controlled environment)');

console.log('\n\u25B6 Long ride onto rough surfaces — duration trim');
const longRide = { durationMins: 180, distanceKm: 75, subType: 'endurance', effort: 'easy' };
r = computeBikeSwap(longRide, 'road', 'gravel');
near(r.proposedDuration, 158, 'Long ride \u2192 Gravel duration trimmed ~12.5%');

console.log('\n\u25B6 Recovery rides — duration kept, distance irrelevant');
const recovery = { durationMins: 30, distanceKm: 10, subType: 'recovery', effort: 'recovery' };
r = computeBikeSwap(recovery, 'road', 'gravel');
eq(r.proposedDuration, 30, 'Recovery \u2192 Gravel duration unchanged');
if (r.warning && /distance/i.test(r.warning)) {
  pass++; console.log('  \u2705 Recovery warning mentions distance is not the point');
} else { fail++; console.log('  \u274C Recovery warning missing'); }

console.log('\n\u25B6 Edge cases');
r = computeBikeSwap(baseEnd, 'road', 'road');
eq(r.proposedDistance, 45, 'Same bike no-op');
r = computeBikeSwap(baseEnd, 'road', 'unknown');
eq(r.proposedDistance, 45, 'Unknown destination = no-op');
r = computeBikeSwap({ subType: 'endurance', durationMins: null, distanceKm: null }, 'road', 'gravel');
eq(r.proposedDistance, null, 'Null inputs return null cleanly');

console.log('\n' + '='.repeat(62));
console.log(`  BIKE SWAP RULES: ${pass} passed, ${fail} failed`);
console.log('='.repeat(62) + '\n');
process.exit(fail ? 1 : 0);
