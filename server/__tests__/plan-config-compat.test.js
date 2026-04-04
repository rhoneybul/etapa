const {
  isMissingPlanConfigCoachIdColumn,
  removeCoachIdField,
} = require('../src/lib/planConfigCompat');

describe('planConfigCompat', () => {
  test('detects PostgREST missing coach_id schema-cache error', () => {
    const error = {
      code: 'PGRST204',
      message: "Could not find the 'coach_id' column of 'plan_configs' in the schema cache",
    };
    expect(isMissingPlanConfigCoachIdColumn(error)).toBe(true);
  });

  test('detects PostgreSQL undefined-column error for coach_id', () => {
    const error = {
      code: '42703',
      message: 'column "coach_id" does not exist',
      details: 'while inserting into plan_configs',
    };
    expect(isMissingPlanConfigCoachIdColumn(error)).toBe(true);
  });

  test('does not match unrelated errors', () => {
    const error = {
      code: 'PGRST204',
      message: "Could not find the 'user_id' column of 'plans' in the schema cache",
    };
    expect(isMissingPlanConfigCoachIdColumn(error)).toBe(false);
  });

  test('removes coach_id while preserving other fields', () => {
    const row = {
      id: 'cfg_1',
      user_id: 'u_1',
      coach_id: 'matteo',
      fitness_level: 'beginner',
    };
    expect(removeCoachIdField(row)).toEqual({
      id: 'cfg_1',
      user_id: 'u_1',
      fitness_level: 'beginner',
    });
  });
});
