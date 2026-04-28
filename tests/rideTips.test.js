/**
 * Offline tests for server/src/lib/rideTips — the icon/category
 * sanitiser, the deterministic fallback, and the prompt builder.
 *
 * These cover the safety rails that protect the activity-tips card
 * from a misbehaving model:
 *   - unknown categories get dropped (the client has no render path)
 *   - unknown icons are replaced with the category default (don't
 *     drop the whole tip just because the glyph is wrong)
 *   - medical-drift text gets the physio-referral substitution
 *   - the deterministic fallback always returns a non-empty array
 *
 * Same shape as tests/checkinSafety.test.js so it slots into the
 * existing test runner without ceremony.
 */
const {
  ICON_ALLOWLIST,
  ALLOWED_CATEGORIES,
  CATEGORY_DEFAULT_ICON,
  sanitiseTips,
  buildDeterministicTips,
  buildTipsPrompt,
} = require('../server/src/lib/rideTips');
const { PHYSIO_REFERRAL } = require('../server/src/lib/checkinSafety');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  \u2705', msg); } else { fail++; console.log('  \u274C', msg); } }

console.log('\n\u25B6 sanitiseTips — happy path');
{
  const tips = sanitiseTips([
    { category: 'warmup',   icon: 'arm-flex-outline',     title: 'Warm up',  text: '10 min easy spinning then 2 openers.' },
    { category: 'pacing',   icon: 'speedometer',          title: 'Pacing',   text: 'Talk in full sentences.' },
    { category: 'injury',   icon: 'shield-check-outline', title: 'Watch for', text: 'Knee pain → stop and book a physio.' },
  ]);
  ok(tips.length === 3, 'all three pass through');
  ok(tips.every(t => ALLOWED_CATEGORIES.has(t.category)), 'categories preserved');
  ok(tips.every(t => ICON_ALLOWLIST.has(t.icon)), 'icons preserved');
}

console.log('\n\u25B6 sanitiseTips — drops unknown category');
{
  const tips = sanitiseTips([
    { category: 'warmup', icon: 'arm-flex-outline', title: 'Warm up', text: '10 min easy.' },
    { category: 'banter', icon: 'arm-flex-outline', title: 'Random',  text: 'Talk to your bike.' },
  ]);
  ok(tips.length === 1, 'banter category dropped');
  ok(tips[0].category === 'warmup', 'warmup kept');
}

console.log('\n\u25B6 sanitiseTips — swaps unknown icon for category default');
{
  const tips = sanitiseTips([
    { category: 'fuel', icon: 'burger-supreme', title: 'Fuel', text: 'Eat early.' },
  ]);
  ok(tips.length === 1, 'tip kept (icon repaired)');
  ok(tips[0].icon === CATEGORY_DEFAULT_ICON.fuel, 'icon defaulted');
}

console.log('\n\u25B6 sanitiseTips — medical-drift swap');
{
  const tips = sanitiseTips([
    { category: 'injury', icon: 'shield-check-outline', title: 'Knee', text: 'Rest for two weeks and apply ice.' },
    { category: 'fuel',   icon: 'food-apple-outline',   title: 'Fuel', text: 'Eat 60g carbs per hour.' },
  ]);
  ok(tips[0].text === PHYSIO_REFERRAL, 'medical drift in text → physio referral');
  ok(tips[1].text.includes('60g carbs'), 'normal fuel tip untouched');
}

console.log('\n\u25B6 sanitiseTips — drops empty / malformed entries');
{
  const tips = sanitiseTips([
    null,
    'not-an-object',
    { category: 'warmup', icon: 'arm-flex-outline', title: '', text: '' }, // empty text
    { category: 'warmup', icon: 'arm-flex-outline', title: 'Warm up', text: 'Real text.' },
  ]);
  ok(tips.length === 1, 'only the real one survived');
}

console.log('\n\u25B6 buildDeterministicTips — coverage');
{
  const easy = buildDeterministicTips({ durationMins: 45, effort: 'easy', subType: 'endurance' });
  ok(easy.length >= 5, 'easy ride: at least warmup/hydration/fuel/pacing/cooldown/injury');
  ok(!easy.some(t => t.category === 'recovery'), 'easy ride: no recovery tip');

  const long = buildDeterministicTips({ durationMins: 180, effort: 'easy', subType: 'endurance' });
  ok(long.some(t => t.category === 'recovery'), 'long ride: recovery tip added');

  const hard = buildDeterministicTips({ durationMins: 75, effort: 'hard', subType: 'intervals' });
  ok(hard.some(t => t.category === 'recovery'), 'hard ride: recovery tip added');

  const recovery = buildDeterministicTips({ durationMins: 30, effort: 'recovery', subType: 'recovery' });
  const rTip = recovery.find(t => t.category === 'pacing');
  ok(rTip && rTip.icon === 'speedometer-slow', 'recovery: slow speedometer icon');

  // All deterministic tips must use icons in the allowlist.
  for (const set of [easy, long, hard, recovery]) {
    ok(set.every(t => ICON_ALLOWLIST.has(t.icon)), 'all deterministic icons in allowlist');
  }
}

console.log('\n\u25B6 buildTipsPrompt — shape');
{
  const p = buildTipsPrompt(
    { id: 'a', title: 'VO2', subType: 'intervals', durationMins: 60, effort: 'hard', structure: { main: { reps: 5, workMins: 4 } } },
    { goalType: 'event', eventName: 'Etape', targetDistance: 100, targetDate: '2026-07-01' },
    null
  );
  ok(typeof p === 'string' && p.length > 200, 'returns a non-trivial string');
  ok(p.includes('VO2') && p.includes('Etape'), 'inlines session + goal');
  ok(p.includes('No medical advice'), 'includes the no-medical guardrail');
  ok(p.includes('Allowed icons'), 'includes the icon allowlist');
}

console.log(`\n${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
