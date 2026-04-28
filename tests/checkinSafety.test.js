/**
 * Offline tests for server/src/lib/checkinSafety — crisis screening
 * and medical-drift output sanitisation. Conservative-by-design module
 * so we test both directions: we want positive matches to fire AND we
 * don't want common cycling vocabulary ("killer pace", "die hard climb")
 * to trigger false positives.
 */
const { detectCrisisInput, sanitiseSuggestions, PHYSIO_REFERRAL } =
  require('../server/src/lib/checkinSafety');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  \u2705', msg); } else { fail++; console.log('  \u274C', msg); } }

console.log('\n\u25B6 Crisis screening — positive cases');
ok(detectCrisisInput({ modifications: 'I want to die honestly' }).matched, 'plain "want to die"');
ok(detectCrisisInput({ lifeEvents: "Honestly I can't go on at the moment" }).matched, '"can\'t go on"');
ok(detectCrisisInput({ injury: { description: 'Thinking about ending it all' } }).matched, '"ending it all" in injury desc');
ok(detectCrisisInput({ sessionComments: { abc: 'I want to disappear, sorry' } }).matched, 'session comment hit');
ok(detectCrisisInput({ modifications: 'feeling suicidal' }).matched, '"suicidal"');
ok(detectCrisisInput({ modifications: 'thought about self-harm last week' }).matched, '"self-harm" hyphenated');
ok(detectCrisisInput({ modifications: 'thought about self harm last week' }).matched, '"self harm" spaced');
ok(detectCrisisInput({ modifications: 'no point in living' }).matched, '"no point in living"');
ok(detectCrisisInput({ modifications: 'better off dead' }).matched, '"better off dead"');

console.log('\n\u25B6 Crisis screening — negative cases (no false positives)');
ok(!detectCrisisInput({ modifications: 'killer pace on Sunday' }).matched, '"killer pace"');
ok(!detectCrisisInput({ modifications: 'die-hard hill repeats are my favourite' }).matched, '"die-hard"');
ok(!detectCrisisInput({ modifications: 'thinking about ending the season strong' }).matched, '"ending the season" — should not match');
ok(!detectCrisisInput({ modifications: 'I love hurt training' }).matched, '"hurt" alone — not crisis');
ok(!detectCrisisInput({ modifications: 'self-harm prevention talks at school' }).matched === false, 'mention of "self-harm" still triggers (conservative)');
ok(!detectCrisisInput({ lifeEvents: 'Daughter wants to dye her hair' }).matched, '"dye" not "die"');
ok(!detectCrisisInput({}).matched, 'empty responses');

console.log('\n\u25B6 Medical-drift sanitisation');
let s = sanitiseSuggestions({
  summary: 'Rest for two weeks and apply ice — knee should settle.',
  changes: [
    { activityId: 'a1', kind: 'modify', reason: 'Lay off heavy efforts and take ibuprofen' },
    { activityId: 'a2', kind: 'skip', reason: 'Tuesday tempo too hard given travel' },
  ],
});
ok(s.summary === PHYSIO_REFERRAL, 'summary with rest+ice rewritten to physio referral');
ok(s.changes[0].reason === PHYSIO_REFERRAL, 'reason mentioning ibuprofen rewritten');
ok(s.changes[1].reason === 'Tuesday tempo too hard given travel', 'clean reason untouched');
ok(s._sanitised === true, '_sanitised flag set');

s = sanitiseSuggestions({
  summary: 'Tuesday tempo to recovery — bonk on Sunday suggests fuelling not fitness.',
  changes: [{ activityId: 'a1', kind: 'modify', reason: 'Cut Tuesday distance to ease the leg.' }],
});
ok(s.summary.includes('bonk'), 'clean summary preserved');
ok(s.changes[0].reason.includes('Cut Tuesday'), 'clean reason preserved');
ok(s._sanitised === undefined || s._sanitised === false, '_sanitised not set on clean output');

s = sanitiseSuggestions({
  summary: 'You probably have patellar tendinitis based on what you wrote.',
  changes: [],
});
ok(s.summary === PHYSIO_REFERRAL, 'diagnosis attempt rewritten');

s = sanitiseSuggestions({
  summary: 'Rehab exercises for the knee should help.',
  changes: [],
});
ok(s.summary === PHYSIO_REFERRAL, '"rehab exercises" caught');

s = sanitiseSuggestions({
  summary: 'Recommending you ice it nightly for 10 days.',
  changes: [],
});
ok(s.summary === PHYSIO_REFERRAL, 'icing recommendation caught');

console.log('\n' + '='.repeat(60));
console.log(`  CHECK-IN SAFETY: ${pass} passed, ${fail} failed`);
console.log('='.repeat(60) + '\n');
process.exit(fail ? 1 : 0);
