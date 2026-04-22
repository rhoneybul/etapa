/**
 * Regression test for the "Felix first plan 22nd of April" bug.
 *
 * Bug: when the user sets config.dayAssignments (e.g. Mon=strength,
 * Tue=outdoor, Wed=strength, Thu=outdoor, Sat=outdoor), Claude was
 * ignoring the field and putting strength on Tue/Thu alongside recurring
 * rides, with regular rides on Mon/Wed — the opposite of what was asked.
 *
 * Fix has three parts:
 *   1. buildPlanPrompt now renders dayAssignments as a HARD CONSTRAINT.
 *   2. planPostProcessors.enforceDayAssignments swaps ride↔strength pairs
 *      when they land on the wrong day (this test).
 *   3. Test scenario "Felix first plan 22nd of April" locks in the bug.
 *
 * This test covers (2) deterministically — no Claude call, no network.
 */

// Silence supabase-missing warnings at load.
const origWarn = console.warn;
console.warn = () => {};
const pp = require('../src/lib/planPostProcessors');
console.warn = origWarn;

const FELIX_DAY_ASSIGNMENTS = {
  monday:    'strength',
  tuesday:   'outdoor',
  wednesday: 'strength',
  thursday:  'outdoor',
  saturday:  'outdoor',
};

function mkMisplacedFelixWeek(week = 1) {
  // Reproduces exactly what Claude produced pre-fix: strength on Tue/Thu,
  // rides on Mon/Wed, long ride on Sat (correct), plus two recurring rides
  // on Tue + Thu.
  return [
    { week, dayOfWeek: 0, type: 'ride',     subType: 'endurance', title: 'Mon ride (wrong)' },
    { week, dayOfWeek: 1, type: 'strength', subType: null,        title: 'Tue strength (wrong)' },
    { week, dayOfWeek: 1, type: 'ride',     subType: 'recurring', title: 'Recurring Tue', isRecurring: true },
    { week, dayOfWeek: 2, type: 'ride',     subType: 'recovery',  title: 'Wed ride (wrong)' },
    { week, dayOfWeek: 3, type: 'strength', subType: null,        title: 'Thu strength (wrong)' },
    { week, dayOfWeek: 3, type: 'ride',     subType: 'recurring', title: 'Recurring Thu', isRecurring: true },
    { week, dayOfWeek: 5, type: 'ride',     subType: 'long_ride', title: 'Sat long' },
  ];
}

describe('enforceDayAssignments — Felix regression', () => {
  test('swaps ride↔strength so strength lands on Mon/Wed and rides on Tue/Thu', () => {
    const activities = mkMisplacedFelixWeek();
    const { activities: fixed, violations } = pp.enforceDayAssignments(
      activities, { goalType: 'improve' }, { dayAssignments: FELIX_DAY_ASSIGNMENTS }
    );

    // Strength moved onto the strength-assigned days.
    const monNonRec = fixed.find(a => a.dayOfWeek === 0 && !a.isRecurring);
    const wedNonRec = fixed.find(a => a.dayOfWeek === 2 && !a.isRecurring);
    expect(monNonRec?.type).toBe('strength');
    expect(wedNonRec?.type).toBe('strength');

    // Tue/Thu planned (non-recurring) slots now hold a ride, not strength.
    const tueNonRec = fixed.filter(a => a.dayOfWeek === 1 && !a.isRecurring);
    const thuNonRec = fixed.filter(a => a.dayOfWeek === 3 && !a.isRecurring);
    expect(tueNonRec).toHaveLength(1);
    expect(tueNonRec[0].type).toBe('ride');
    expect(thuNonRec).toHaveLength(1);
    expect(thuNonRec[0].type).toBe('ride');

    // Critical violation emitted so it shows up in admin debug logs.
    const swapViolation = violations.find(v => v.code === 'day_assignment');
    expect(swapViolation).toBeDefined();
    expect(swapViolation.severity).toBe('critical');
  });

  test('never moves recurring or one-off rides (they are user-pinned)', () => {
    const activities = mkMisplacedFelixWeek();
    const originalRecurringDays = activities
      .filter(a => a.isRecurring)
      .map(a => ({ title: a.title, dayOfWeek: a.dayOfWeek }));

    const { activities: fixed } = pp.enforceDayAssignments(
      activities, { goalType: 'improve' }, { dayAssignments: FELIX_DAY_ASSIGNMENTS }
    );

    for (const original of originalRecurringDays) {
      const stillThere = fixed.find(a => a.title === original.title && a.isRecurring);
      expect(stillThere).toBeDefined();
      expect(stillThere.dayOfWeek).toBe(original.dayOfWeek);
    }
  });

  test('no-op when dayAssignments is absent', () => {
    const activities = mkMisplacedFelixWeek();
    const { activities: fixed, violations } = pp.enforceDayAssignments(
      activities, { goalType: 'improve' }, {}  // no dayAssignments
    );
    expect(fixed).toEqual(activities);
    expect(violations).toHaveLength(0);
  });

  test('leaves correctly-placed activities alone', () => {
    // Already correct: strength on Mon/Wed, rides on Tue/Thu/Sat.
    const correct = [
      { week: 1, dayOfWeek: 0, type: 'strength', subType: null,        title: 'Mon strength' },
      { week: 1, dayOfWeek: 1, type: 'ride',     subType: 'endurance', title: 'Tue ride' },
      { week: 1, dayOfWeek: 2, type: 'strength', subType: null,        title: 'Wed strength' },
      { week: 1, dayOfWeek: 3, type: 'ride',     subType: 'endurance', title: 'Thu ride' },
      { week: 1, dayOfWeek: 5, type: 'ride',     subType: 'long_ride', title: 'Sat long' },
    ];
    const { activities: fixed, violations } = pp.enforceDayAssignments(
      correct, { goalType: 'improve' }, { dayAssignments: FELIX_DAY_ASSIGNMENTS }
    );
    expect(fixed).toEqual(correct);
    expect(violations).toHaveLength(0);
  });

  test('runAll orchestrator includes dayAssignments in its pipeline', () => {
    const activities = mkMisplacedFelixWeek();
    const { activities: fixed, violations } = pp.runAll(
      activities,
      { goalType: 'improve' },
      { dayAssignments: FELIX_DAY_ASSIGNMENTS, fitnessLevel: 'advanced' }
    );
    // Proves runAll invokes the enforcer, not just that enforceDayAssignments
    // works in isolation.
    const swap = violations.find(v => v.code === 'day_assignment');
    expect(swap).toBeDefined();
    const monNonRec = fixed.find(a => a.dayOfWeek === 0 && !a.isRecurring);
    expect(monNonRec?.type).toBe('strength');
  });
});
