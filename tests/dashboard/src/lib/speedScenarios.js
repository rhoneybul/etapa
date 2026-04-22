/**
 * Speed-rule scenarios for the test dashboard.
 *
 * These are pure unit tests — they don't call the server or Claude. Each
 * scenario asserts that server/src/lib/rideSpeedRules.js produces a
 * distance inside the expected band for a given (level, subType, effort,
 * durationMins) combination.
 *
 * They appear in the dashboard sidebar alongside the plan scenarios, with
 * the same pass/fail treatment. The run-tests API route evaluates them
 * inline by requiring the rules module directly.
 *
 * Shape:
 *   {
 *     name:         display name in sidebar
 *     kind:         'speed-unit'  (tells run-tests to skip the LLM)
 *     group:        grouping label for the UI
 *     fitnessLevel, subType, effort, durationMins, isLongRide
 *     expect:       { minKm, maxKm } — the assertion
 *   }
 */

function range(minKm, maxKm) { return { minKm, maxKm }; }

export const SPEED_SCENARIOS = [
  // ── 1. Per-level, per-subtype target speeds ────────────────────────────
  {
    name: 'SPEED: Beginner recovery — 11–13 km/h target',
    kind: 'speed-unit', group: 'Speed rules — target speed per level',
    fitnessLevel: 'beginner', subType: 'recovery', effort: 'recovery',
    checkSpeedOnly: true, expectSpeed: range(10, 13),
  },
  {
    name: 'SPEED: Beginner endurance — 14–17 km/h target',
    kind: 'speed-unit', group: 'Speed rules — target speed per level',
    fitnessLevel: 'beginner', subType: 'endurance', effort: 'easy',
    checkSpeedOnly: true, expectSpeed: range(14, 17),
  },
  {
    name: 'SPEED: Beginner tempo — 16–20 km/h target',
    kind: 'speed-unit', group: 'Speed rules — target speed per level',
    fitnessLevel: 'beginner', subType: 'tempo', effort: 'moderate',
    checkSpeedOnly: true, expectSpeed: range(16, 20),
  },
  {
    name: 'SPEED: Expert recovery — 19–23 km/h target',
    kind: 'speed-unit', group: 'Speed rules — target speed per level',
    fitnessLevel: 'expert', subType: 'recovery', effort: 'recovery',
    checkSpeedOnly: true, expectSpeed: range(19, 23),
  },
  {
    name: 'SPEED: Expert endurance — 27–31 km/h target',
    kind: 'speed-unit', group: 'Speed rules — target speed per level',
    fitnessLevel: 'expert', subType: 'endurance', effort: 'easy',
    checkSpeedOnly: true, expectSpeed: range(27, 31),
  },
  {
    name: 'SPEED: Expert intervals — 29–33 km/h target',
    kind: 'speed-unit', group: 'Speed rules — target speed per level',
    fitnessLevel: 'expert', subType: 'intervals', effort: 'hard',
    checkSpeedOnly: true, expectSpeed: range(29, 33),
  },
  {
    name: 'SPEED: Expert long ride — 26–30 km/h target',
    kind: 'speed-unit', group: 'Speed rules — target speed per level',
    fitnessLevel: 'expert', subType: 'endurance', effort: 'easy', isLongRide: true,
    checkSpeedOnly: true, expectSpeed: range(26, 30),
  },

  // ── 2. Hard-cap sanity check ────────────────────────────────────────────
  {
    name: 'SPEED: Beginner tempo-max can\'t exceed 22 km/h cap',
    kind: 'speed-unit', group: 'Speed rules — hard caps',
    fitnessLevel: 'beginner', subType: 'tempo', effort: 'max', durationMins: 60,
    expect: range(10, 22),
  },
  {
    name: 'SPEED: Intermediate tempo-max can\'t exceed 28 km/h cap',
    kind: 'speed-unit', group: 'Speed rules — hard caps',
    fitnessLevel: 'intermediate', subType: 'tempo', effort: 'max', durationMins: 60,
    expect: range(14, 28),
  },
  {
    name: 'SPEED: Advanced tempo-max can\'t exceed 32 km/h cap',
    kind: 'speed-unit', group: 'Speed rules — hard caps',
    fitnessLevel: 'advanced', subType: 'tempo', effort: 'max', durationMins: 60,
    expect: range(16, 32),
  },
  {
    name: 'SPEED: Expert tempo-max can\'t exceed 36 km/h cap',
    kind: 'speed-unit', group: 'Speed rules — hard caps',
    fitnessLevel: 'expert', subType: 'tempo', effort: 'max', durationMins: 60,
    expect: range(18, 36),
  },

  // ── 3. Realistic distances — screenshot regression row by row ──────────
  {
    name: 'SPEED: Expert 90m endurance ≈ 43 km (not 65)',
    kind: 'speed-unit', group: 'Speed rules — screenshot regression',
    fitnessLevel: 'expert', subType: 'endurance', effort: 'easy', durationMins: 90,
    expect: range(39, 46),
  },
  {
    name: 'SPEED: Expert 150m long ride ≈ 70 km (not 110)',
    kind: 'speed-unit', group: 'Speed rules — screenshot regression',
    fitnessLevel: 'expert', subType: 'endurance', effort: 'easy', durationMins: 150, isLongRide: true,
    expect: range(65, 75),
  },
  {
    name: 'SPEED: Expert 60m recovery ≈ 20 km (not 35)',
    kind: 'speed-unit', group: 'Speed rules — screenshot regression',
    fitnessLevel: 'expert', subType: 'recovery', effort: 'recovery', durationMins: 60,
    expect: range(18, 24),
  },
  {
    name: 'SPEED: Expert 90m intervals ≈ 45 km (not 65)',
    kind: 'speed-unit', group: 'Speed rules — screenshot regression',
    fitnessLevel: 'expert', subType: 'intervals', effort: 'hard', durationMins: 90,
    expect: range(40, 50),
  },
  {
    name: 'SPEED: Expert 90m tempo ≈ 49 km (not 65)',
    kind: 'speed-unit', group: 'Speed rules — screenshot regression',
    fitnessLevel: 'expert', subType: 'tempo', effort: 'hard', durationMins: 90,
    expect: range(45, 55),
  },

  // ── 4. Beginner distances ────────────────────────────────────────────
  {
    name: 'SPEED: Beginner 45m endurance ≈ 11–13 km',
    kind: 'speed-unit', group: 'Speed rules — beginner distances',
    fitnessLevel: 'beginner', subType: 'endurance', effort: 'easy', durationMins: 45,
    expect: range(10, 14),
  },
  {
    name: 'SPEED: Beginner 30m recovery ≈ 5–7 km',
    kind: 'speed-unit', group: 'Speed rules — beginner distances',
    fitnessLevel: 'beginner', subType: 'recovery', effort: 'recovery', durationMins: 30,
    expect: range(5, 7),
  },
  {
    name: 'SPEED: Beginner 60m endurance ≈ 14–17 km',
    kind: 'speed-unit', group: 'Speed rules — beginner distances',
    fitnessLevel: 'beginner', subType: 'endurance', effort: 'easy', durationMins: 60,
    expect: range(13, 17),
  },

  // ── 5. Intermediate distances ────────────────────────────────────────
  {
    name: 'SPEED: Intermediate 90m endurance ≈ 32–38 km',
    kind: 'speed-unit', group: 'Speed rules — intermediate distances',
    fitnessLevel: 'intermediate', subType: 'endurance', effort: 'easy', durationMins: 90,
    expect: range(30, 39),
  },
  {
    name: 'SPEED: Intermediate 120m long ride ≈ 40–48 km',
    kind: 'speed-unit', group: 'Speed rules — intermediate distances',
    fitnessLevel: 'intermediate', subType: 'endurance', effort: 'easy', durationMins: 120, isLongRide: true,
    expect: range(40, 48),
  },
  {
    name: 'SPEED: Intermediate 60m tempo ≈ 24–28 km',
    kind: 'speed-unit', group: 'Speed rules — intermediate distances',
    fitnessLevel: 'intermediate', subType: 'tempo', effort: 'moderate', durationMins: 60,
    expect: range(23, 29),
  },

  // ── 6. Advanced distances ────────────────────────────────────────────
  {
    name: 'SPEED: Advanced 120m endurance ≈ 48–58 km',
    kind: 'speed-unit', group: 'Speed rules — advanced distances',
    fitnessLevel: 'advanced', subType: 'endurance', effort: 'easy', durationMins: 120,
    expect: range(46, 58),
  },
  {
    name: 'SPEED: Advanced 180m long ride ≈ 72–84 km',
    kind: 'speed-unit', group: 'Speed rules — advanced distances',
    fitnessLevel: 'advanced', subType: 'endurance', effort: 'easy', durationMins: 180, isLongRide: true,
    expect: range(70, 86),
  },
  {
    name: 'SPEED: Advanced 75m intervals ≈ 31–37 km',
    kind: 'speed-unit', group: 'Speed rules — advanced distances',
    fitnessLevel: 'advanced', subType: 'intervals', effort: 'hard', durationMins: 75,
    expect: range(30, 38),
  },

  // ── 7. Normalisation — clamp round-trip ──────────────────────────────
  {
    name: 'SPEED: Claude\'s 65km expert endurance → clamped to ~43',
    kind: 'speed-unit', group: 'Speed rules — clamp behaviour',
    fitnessLevel: 'expert', subType: 'endurance', effort: 'easy', durationMins: 90,
    clampFrom: 65,
    expect: range(39, 46),
  },
  {
    name: 'SPEED: Claude\'s 110km expert long ride → clamped to ~70',
    kind: 'speed-unit', group: 'Speed rules — clamp behaviour',
    fitnessLevel: 'expert', subType: 'endurance', effort: 'easy', durationMins: 150, isLongRide: true,
    clampFrom: 110,
    expect: range(65, 75),
  },
  {
    name: 'SPEED: Claude\'s realistic 42km (within band) → kept as-is',
    kind: 'speed-unit', group: 'Speed rules — clamp behaviour',
    fitnessLevel: 'expert', subType: 'endurance', effort: 'easy', durationMins: 90,
    clampFrom: 42,
    expect: range(42, 42),
  },
  {
    name: 'SPEED: Strength session → distanceKm forced to null',
    kind: 'speed-unit', group: 'Speed rules — clamp behaviour',
    fitnessLevel: 'expert', type: 'strength', effort: 'moderate', durationMins: 30,
    clampFrom: 15,
    expectNull: true,
  },

  // ── 8. Edge cases ────────────────────────────────────────────────────
  {
    name: 'SPEED: 0-min duration → null distance (no crash)',
    kind: 'speed-unit', group: 'Speed rules — edge cases',
    fitnessLevel: 'intermediate', subType: 'endurance', effort: 'easy', durationMins: 0,
    clampFrom: 10,
    expectNull: true,
  },
  {
    name: 'SPEED: Unknown subType → default multiplier',
    kind: 'speed-unit', group: 'Speed rules — edge cases',
    fitnessLevel: 'intermediate', subType: 'space-laser', effort: 'easy', durationMins: 60,
    expect: range(20, 24),
  },
  {
    name: 'SPEED: Indoor subType produces lower distance than endurance',
    kind: 'speed-unit', group: 'Speed rules — edge cases',
    fitnessLevel: 'intermediate',
    compareIndoorVsEndurance: true,
    durationMins: 60,
  },
];
