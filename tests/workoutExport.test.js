/**
 * Offline tests for server/src/lib/workoutExport — the ZWO/MRC export
 * generator for indoor sessions. Pure-function module so we just feed
 * it sample activities and verify the output structure.
 *
 * Run: node tests/workoutExport.test.js
 */
const { toZwo, toMrc, suggestedFilename, blocksForActivity } = require('../server/src/lib/workoutExport');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  \u2705', msg); }
  else      { fail++; console.log('  \u274C', msg); }
}

// ── Sample activities ────────────────────────────────────────────────
const steadyEndurance = {
  title: 'Easy Endurance Ride',
  description: 'Steady aerobic at conversational pace',
  notes: 'Building base — keep it easy.',
  durationMins: 60,
  effort: 'easy',
};

const intervalsSession = {
  title: 'VO2max Intervals — 5×3',
  description: 'Warm up, then 5 × 3 min very hard with 3 min easy.',
  notes: 'Peak phase.',
  durationMins: 75,
  effort: 'hard',
  structure: {
    warmup:  { durationMins: 15, description: 'Easy spin building to tempo', effort: 'easy' },
    main: {
      type: 'intervals',
      reps: 5,
      workMins: 3,
      restMins: 3,
      description: '5 × 3 min at VO2max',
      intensity: { rpe: 9, hrZone: 5, powerZone: 5, powerPctOfFtpLow: 106, powerPctOfFtpHigh: 120 },
    },
    cooldown: { durationMins: 15, description: 'Easy spin', effort: 'easy' },
  },
};

const tempoSession = {
  title: 'Threshold 2×20',
  durationMins: 70,
  effort: 'hard',
  structure: {
    warmup:  { durationMins: 15, description: 'Build to threshold', effort: 'easy' },
    main: {
      type: 'tempo',
      blockMins: 40,
      description: '40 min at threshold',
      intensity: { powerPctOfFtpLow: 91, powerPctOfFtpHigh: 100 },
    },
    cooldown: { durationMins: 15, description: 'Easy', effort: 'easy' },
  },
};

console.log('\n\u25B6 blocksForActivity');
let blocks = blocksForActivity(steadyEndurance);
assert(blocks.length === 1, 'steady endurance → single block');
assert(blocks[0].kind === 'steady', 'steady endurance block.kind === "steady"');
assert(blocks[0].seconds === 3600, 'steady endurance 60 min = 3600s');
assert(blocks[0].power >= 0.5 && blocks[0].power <= 0.8, 'steady endurance power within easy range');

blocks = blocksForActivity(intervalsSession);
assert(blocks.length === 3, 'intervals → 3 blocks (warmup, intervals, cooldown)');
assert(blocks[0].kind === 'warmup' && blocks[1].kind === 'intervals' && blocks[2].kind === 'cooldown', 'intervals block order correct');
assert(blocks[1].reps === 5 && blocks[1].onSeconds === 180, 'intervals 5 × 3 min preserved');
assert(blocks[1].onPower >= 1.05 && blocks[1].onPower <= 1.20, 'intervals on-power in VO2max range');

blocks = blocksForActivity(tempoSession);
assert(blocks.length === 3, 'tempo → 3 blocks');
assert(blocks[1].kind === 'steady', 'tempo main block is "steady"');
assert(blocks[1].seconds === 2400, 'tempo 40 min = 2400s');

console.log('\n\u25B6 toZwo');
const zwo1 = toZwo(steadyEndurance);
assert(zwo1.startsWith('<?xml'), 'ZWO starts with XML declaration');
assert(zwo1.includes('<workout_file>') && zwo1.includes('</workout_file>'), 'ZWO has workout_file root');
assert(zwo1.includes('<sportType>bike</sportType>'), 'ZWO marks sport as bike');
assert(zwo1.includes('Easy Endurance Ride'), 'ZWO carries the title');
assert(zwo1.includes('<SteadyState'), 'ZWO steady endurance produces SteadyState block');

const zwo2 = toZwo(intervalsSession);
assert(zwo2.includes('<Warmup '), 'ZWO intervals has Warmup');
assert(zwo2.includes('<IntervalsT '), 'ZWO intervals has IntervalsT');
assert(zwo2.includes('Repeat="5"'), 'ZWO repeats 5 times');
assert(zwo2.includes('OnDuration="180"'), 'ZWO on-duration 180s');
assert(zwo2.includes('<Cooldown '), 'ZWO has Cooldown');

console.log('\n\u25B6 toMrc');
const mrc1 = toMrc(steadyEndurance);
assert(mrc1.includes('[COURSE HEADER]') && mrc1.includes('[END COURSE DATA]'), 'MRC has section markers');
assert(mrc1.includes('MINUTES PERCENT'), 'MRC declares MINUTES PERCENT');
assert(!/^FTP\s*=/m.test(mrc1), 'MRC does NOT include the non-standard FTP field');
assert(/^VERSION\s*=\s*2$/m.test(mrc1), 'MRC declares VERSION = 2');
assert(/^UNITS\s*=\s*ENGLISH$/m.test(mrc1), 'MRC declares UNITS = ENGLISH');

const mrc2 = toMrc(intervalsSession);
const lines = mrc2.split('\n');
const dataStart = lines.indexOf('[COURSE DATA]');
const dataEnd = lines.indexOf('[END COURSE DATA]');
const dataLines = lines.slice(dataStart + 1, dataEnd);
assert(dataLines.length >= 4, 'MRC intervals produces multiple data points');
const lastTime = parseFloat(dataLines[dataLines.length - 1].split(/\s+/)[0]);
// 15 + (5×3) + (4×3 rest) + 15 = 15 + 15 + 12 + 15 = 57 min
assert(lastTime > 50 && lastTime < 70, `MRC last time ${lastTime} min in expected range (~57)`);

console.log('\n\u25B6 suggestedFilename');
assert(suggestedFilename(steadyEndurance, 'zwo') === 'easy-endurance-ride.zwo', 'simple title slugged');
assert(suggestedFilename(intervalsSession, 'zwo') === 'vo2max-intervals-5-3.zwo', 'intervals slug strips × and lowercases');
assert(suggestedFilename({}, 'mrc') === 'etapa-session.mrc', 'fallback when title missing');

console.log('\n' + '='.repeat(62));
console.log(`  WORKOUT EXPORT: ${pass} passed, ${fail} failed`);
console.log('='.repeat(62) + '\n');
process.exit(fail ? 1 : 0);
