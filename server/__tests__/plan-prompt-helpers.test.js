/**
 * Unit tests for the pure prompt helpers in routes/ai.js.
 *
 * These helpers feed into plan generation:
 *   - getFewShotExemplar — picks the right worked-example plan based on
 *     goalType + fitnessLevel + targetDate
 *   - buildRetryPrompt   — appends corrective feedback to the original
 *     prompt when the post-processor surfaces critical violations
 *
 * We only test the STRING-SHAPED behaviour — no Claude call, no DB, no
 * network. The goal is a fast regression net so we notice when a refactor
 * changes the contract (e.g. beginner plans losing their graduation line).
 */

// Silence the supabase stub warnings that run at module load.
const originalWarn = console.warn;
console.warn = () => {};
const { _testing } = require('../src/routes/ai');
console.warn = originalWarn;

const { buildPlanPrompt, buildRetryPrompt, getFewShotExemplar } = _testing;

describe('getFewShotExemplar', () => {
  test('beginner goal returns the beginner exemplar with a graduation ride', () => {
    const goal = { goalType: 'beginner', targetDistance: 50 };
    const config = { fitnessLevel: 'beginner' };
    const out = getFewShotExemplar(goal, config);
    expect(out).toMatch(/beginner/i);
    expect(out).toMatch(/graduation/i);
    expect(out).toMatch(/confidence/i);
  });

  test('beginner-level improve goal also uses the beginner exemplar', () => {
    const goal = { goalType: 'improve' };
    const config = { fitnessLevel: 'beginner' };
    const out = getFewShotExemplar(goal, config);
    expect(out).toMatch(/beginner/i);
    expect(out).toMatch(/no intervals/i);
  });

  test('event plan with target date returns the taper exemplar', () => {
    const goal = { goalType: 'race', targetDate: '2026-07-01', targetDistance: 100 };
    const config = { fitnessLevel: 'intermediate' };
    const out = getFewShotExemplar(goal, config);
    expect(out).toMatch(/taper/i);
    expect(out).toMatch(/interval/i);
    expect(out).toMatch(/Deload|deload/);
  });

  test('distance goal without date returns the improvement exemplar', () => {
    const goal = { goalType: 'distance', targetDistance: 80 };
    const config = { fitnessLevel: 'intermediate' };
    const out = getFewShotExemplar(goal, config);
    expect(out).toMatch(/general improvement/i);
    expect(out).toMatch(/deload/i);
  });

  test('exemplar is tagged as "shape only — do not copy verbatim" so it guides without dictating', () => {
    const out = getFewShotExemplar({ goalType: 'race', targetDate: '2026-07-01' }, { fitnessLevel: 'advanced' });
    expect(out.toLowerCase()).toContain('shape only');
  });
});

describe('buildRetryPrompt', () => {
  const originalPrompt = 'ORIGINAL_PROMPT_BODY';
  const priorActs = [
    { week: 1, dayOfWeek: 0, type: 'ride', subType: 'endurance', distanceKm: 10, durationMins: 30 },
    { week: 1, dayOfWeek: 5, type: 'ride', subType: 'long_ride', distanceKm: 25, durationMins: 90 },
    { week: 2, dayOfWeek: 0, type: 'ride', subType: 'endurance', distanceKm: 12, durationMins: 30 },
  ];

  test('includes the original prompt verbatim so system constraints still apply', () => {
    const out = buildRetryPrompt(originalPrompt, [], priorActs, {}, {});
    expect(out).toContain('ORIGINAL_PROMPT_BODY');
  });

  test('renders critical violations as a bullet list with stage + message', () => {
    const violations = [
      { stage: 'taper', code: 'taper_volume', severity: 'critical', message: 'Final week was 95% of peak.' },
      { stage: 'sessionCount', code: 'session_count', severity: 'critical', message: 'Week 3 had only 2/4 sessions.' },
    ];
    const out = buildRetryPrompt(originalPrompt, violations, priorActs, {}, {});
    expect(out).toContain('[taper] Final week was 95% of peak.');
    expect(out).toContain('[sessionCount] Week 3 had only 2/4 sessions.');
  });

  test('emits a week-by-week summary so Claude can diff against its own output', () => {
    const out = buildRetryPrompt(originalPrompt, [], priorActs, {}, {});
    expect(out).toMatch(/Week 1: 2 sessions/);
    expect(out).toMatch(/longest ride 25 km/);
    expect(out).toMatch(/Week 2: 1 sessions/);
  });

  test('filters warnings and only surfaces critical-severity items', () => {
    const violations = [
      { stage: 'taper', code: 'taper_volume', severity: 'critical', message: 'CRITICAL_MSG' },
      { stage: 'longRideDay', code: 'long_ride_day', severity: 'warning', message: 'WARNING_MSG' },
    ];
    const out = buildRetryPrompt(originalPrompt, violations, priorActs, {}, {});
    expect(out).toContain('CRITICAL_MSG');
    expect(out).not.toContain('WARNING_MSG');
  });

  test('asks Claude to return JSON only (guards against commentary)', () => {
    const out = buildRetryPrompt(originalPrompt, [], priorActs, {}, {});
    expect(out).toMatch(/Return ONLY the JSON array/);
  });
});

describe('buildPlanPrompt', () => {
  test('beginner vague goal gets an implicit target distance default', () => {
    const goal = { goalType: 'improve' };
    const config = { fitnessLevel: 'beginner', weeks: 8, daysPerWeek: 3 };
    const out = buildPlanPrompt(goal, config);
    // Beginner vague default is 30 km per the fallback ladder.
    expect(out).toMatch(/implicit target as 30 km/);
  });

  test('hard constraints block is present and contains session count target', () => {
    const goal = { goalType: 'improve', targetDistance: 50 };
    const config = { fitnessLevel: 'beginner', weeks: 8, daysPerWeek: 4 };
    const out = buildPlanPrompt(goal, config);
    expect(out).toContain('HARD CONSTRAINTS');
    expect(out).toMatch(/EXACTLY 4 sessions/);
  });

  test('few-shot exemplar is injected into the plan prompt', () => {
    const goal = { goalType: 'beginner', targetDistance: 25 };
    const config = { fitnessLevel: 'beginner', weeks: 8, daysPerWeek: 3 };
    const out = buildPlanPrompt(goal, config);
    expect(out).toContain('EXEMPLAR');
    expect(out).toMatch(/shape only/i);
  });
});
