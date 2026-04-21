/**
 * Plan Generator Test Suite
 *
 * Tests the local generatePlan() with many different configurations.
 *
 * Run local tests:
 *   node --import ./tests/loader.mjs tests/planGenerator.test.js
 *
 * Run local + API tests (local server):
 *   node --import ./tests/loader.mjs tests/planGenerator.test.js --api http://localhost:3001
 *
 * Run against production (requires TEST_API_KEY set on server):
 *   node --import ./tests/loader.mjs tests/planGenerator.test.js --api https://etapa-production.up.railway.app --key YOUR_TEST_API_KEY
 */

import { generatePlan, suggestWeeks } from '../src/services/planGenerator.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function dateStr(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(dateString, n) {
  const [y, m, d] = dateString.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setDate(dt.getDate() + n);
  return dateStr(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

function getDayOfWeekName(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  const jsDay = dt.getDay(); // 0=Sun
  const idx = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon
  return DAY_NAMES[idx];
}

// ── Test scenarios ──────────────────────────────────────────────────────────

const SCENARIOS = [
  // ─── 1. Beginner, 3 days/week, 8 weeks, no target date ───
  {
    name: 'Beginner - General Fitness - 3 days/week',
    goal: {
      id: 'g1', goalType: 'improve', cyclingType: 'road', planName: 'Get Fit Plan',
    },
    config: {
      id: 'c1', daysPerWeek: 3, weeks: 8, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'wednesday', 'saturday'], fitnessLevel: 'beginner',
      startDate: '2026-04-06', // Monday
    },
  },

  // ─── 2. Intermediate, 4 days/week, race with target date ───
  {
    name: 'Intermediate - Race Prep - 4 days/week - 12 weeks',
    goal: {
      id: 'g2', goalType: 'race', cyclingType: 'road', eventName: 'London to Brighton',
      targetDistance: 90, targetDate: '2026-07-05', planName: 'L2B Prep',
    },
    config: {
      id: 'c2', daysPerWeek: 4, weeks: 12, trainingTypes: ['outdoor'],
      availableDays: ['tuesday', 'thursday', 'saturday', 'sunday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-06',
    },
  },

  // ─── 3. Advanced, 5 days/week, with strength ───
  {
    name: 'Advanced - 5 days + strength - 10 weeks',
    goal: {
      id: 'g3', goalType: 'distance', cyclingType: 'road', targetDistance: 160,
      targetDate: '2026-06-20', planName: 'Century Ride Prep',
    },
    config: {
      id: 'c3', daysPerWeek: 5, weeks: 10, trainingTypes: ['outdoor', 'strength'],
      availableDays: ['monday', 'tuesday', 'thursday', 'friday', 'sunday'],
      fitnessLevel: 'advanced', startDate: '2026-04-13',
      crossTrainingDays: { wednesday: 'yoga' },
    },
  },

  // ─── 4. Expert, 6 days/week, with recurring rides ───
  {
    name: 'Expert - 6 days + recurring group ride - 8 weeks',
    goal: {
      id: 'g4', goalType: 'race', cyclingType: 'road', eventName: 'Gran Fondo',
      targetDistance: 130, targetDate: '2026-06-07', planName: 'Gran Fondo Prep',
    },
    config: {
      id: 'c4', daysPerWeek: 6, weeks: 8, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'saturday', 'sunday'],
      fitnessLevel: 'expert', startDate: '2026-04-06',
      recurringRides: [
        { id: 'rr1', day: 'saturday', durationMins: 120, distanceKm: 60, notes: 'Club Ride' },
      ],
      longRideDay: 'sunday',
    },
  },

  // ─── 5. Beginner, 2 days/week, very short plan ───
  {
    name: 'Beginner - 2 days/week - 4 weeks (minimum)',
    goal: { id: 'g5', goalType: 'improve', cyclingType: 'road', planName: 'Quick Start' },
    config: {
      id: 'c5', daysPerWeek: 2, weeks: 4, trainingTypes: ['outdoor'],
      availableDays: ['wednesday', 'sunday'], fitnessLevel: 'beginner',
      startDate: '2026-04-08', // Wednesday — NOT a Monday
    },
  },

  // ─── 6. Mid-week start date (Wednesday) with organised rides ───
  {
    name: 'Wednesday start + 2 organised rides (YOUR bug scenario)',
    goal: {
      id: 'g6', goalType: 'race', cyclingType: 'road', eventName: 'Sportive',
      targetDistance: 100, targetDate: '2026-06-14', planName: 'Sportive Plan',
    },
    config: {
      id: 'c6', daysPerWeek: 3, weeks: 9, trainingTypes: ['outdoor'],
      availableDays: ['tuesday', 'thursday', 'saturday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-08', // Wednesday
      oneOffRides: [
        { date: '2026-04-10', durationMins: 90, distanceKm: 40, notes: 'Charity Ride' },
        { date: '2026-04-13', durationMins: 120, distanceKm: 55, notes: 'Sportive Recce' },
      ],
    },
  },

  // ─── 7. Saturday start date with organised ride on Sunday ───
  {
    name: 'Saturday start + organised ride next day',
    goal: {
      id: 'g7', goalType: 'distance', cyclingType: 'road', targetDistance: 80,
      targetDate: '2026-06-30', planName: 'Build Plan',
    },
    config: {
      id: 'c7', daysPerWeek: 4, weeks: 10, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'wednesday', 'friday', 'sunday'], fitnessLevel: 'advanced',
      startDate: '2026-04-18', // Saturday
      oneOffRides: [
        { date: '2026-04-19', durationMins: 150, distanceKm: 70, notes: 'Audax 70k' },
      ],
    },
  },

  // ─── 8. E-bike beginner, 3 days/week ───
  {
    name: 'E-bike beginner - 3 days/week - 8 weeks',
    goal: { id: 'g8', goalType: 'improve', cyclingType: 'ebike', planName: 'E-Bike Explorer' },
    config: {
      id: 'c8', daysPerWeek: 3, weeks: 8, trainingTypes: ['outdoor'],
      availableDays: ['tuesday', 'thursday', 'saturday'], fitnessLevel: 'beginner',
      startDate: '2026-04-06',
    },
  },

  // ─── 9. Intermediate with indoor + outdoor + strength ───
  {
    name: 'Mixed indoor/outdoor + strength - 6 weeks',
    goal: { id: 'g9', goalType: 'improve', cyclingType: 'road', planName: 'Winter Fitness' },
    config: {
      id: 'c9', daysPerWeek: 4, weeks: 6, trainingTypes: ['outdoor', 'indoor', 'strength'],
      availableDays: ['monday', 'wednesday', 'friday', 'sunday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-06',
      crossTrainingDays: { tuesday: 'swimming', thursday: 'running' },
    },
  },

  // ─── 10. Long plan (24 weeks) with recurring + target ───
  {
    name: '24-week plan with elevation + recurring rides',
    goal: {
      id: 'g10', goalType: 'race', cyclingType: 'road', eventName: 'Etape du Tour',
      targetDistance: 170, targetElevation: 4500, targetTime: 9,
      targetDate: '2026-09-20', planName: 'Etape Prep',
    },
    config: {
      id: 'c10', daysPerWeek: 5, weeks: 24, trainingTypes: ['outdoor', 'strength'],
      availableDays: ['monday', 'tuesday', 'thursday', 'saturday', 'sunday'],
      fitnessLevel: 'advanced', startDate: '2026-04-06', longRideDay: 'sunday',
      recurringRides: [
        { id: 'rr2', day: 'saturday', durationMins: 90, distanceKm: 45, notes: 'Group Ride' },
      ],
      crossTrainingDays: { wednesday: 'core workout' },
    },
  },

  // ─── 11. Organised ride on first day of plan ───
  {
    name: 'Edge: organised ride on plan start day (Monday)',
    goal: { id: 'g11', goalType: 'improve', cyclingType: 'road', planName: 'Start with Event' },
    config: {
      id: 'c11', daysPerWeek: 3, weeks: 6, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'wednesday', 'friday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-06',
      oneOffRides: [
        { date: '2026-04-06', durationMins: 120, distanceKm: 50, notes: 'Kickoff Ride' },
      ],
    },
  },

  // ─── 12. Multiple organised rides in same week ───
  {
    name: 'Edge: 3 consecutive organised rides (multi-day tour)',
    goal: {
      id: 'g12', goalType: 'race', cyclingType: 'road', eventName: 'Multi-day Tour',
      targetDate: '2026-06-28', planName: 'Tour Prep',
    },
    config: {
      id: 'c12', daysPerWeek: 4, weeks: 10, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'wednesday', 'friday', 'sunday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-20', // Monday
      oneOffRides: [
        { date: '2026-05-15', durationMins: 180, distanceKm: 80, notes: 'Stage 1 Recce' },
        { date: '2026-05-16', durationMins: 150, distanceKm: 65, notes: 'Stage 2 Recce' },
        { date: '2026-05-17', durationMins: 120, distanceKm: 50, notes: 'Stage 3 Recce' },
      ],
    },
  },

  // ─── 13. Organised ride 2 days before event ───
  {
    name: 'Edge: organised ride 2 days before target event',
    goal: {
      id: 'g13', goalType: 'race', cyclingType: 'road', eventName: 'Local Crit',
      targetDistance: 40, targetDate: '2026-05-17', planName: 'Crit Plan',
    },
    config: {
      id: 'c13', daysPerWeek: 3, weeks: 6, trainingTypes: ['outdoor'],
      availableDays: ['tuesday', 'thursday', 'saturday'], fitnessLevel: 'advanced',
      startDate: '2026-04-06',
      oneOffRides: [
        { date: '2026-05-15', durationMins: 60, distanceKm: 25, notes: 'Pre-race shakeout' },
      ],
    },
  },

  // ─── 14. Recurring rides + organised rides on same day ───
  {
    name: 'Conflict: recurring vs organised on same Saturday',
    goal: { id: 'g14', goalType: 'improve', cyclingType: 'road', planName: 'Conflict Test' },
    config: {
      id: 'c14', daysPerWeek: 3, weeks: 6, trainingTypes: ['outdoor'],
      availableDays: ['tuesday', 'thursday', 'saturday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-06',
      recurringRides: [
        { id: 'rr3', day: 'saturday', durationMins: 90, distanceKm: 40, notes: 'Club Ride' },
      ],
      oneOffRides: [
        { date: '2026-04-18', durationMins: 180, distanceKm: 80, notes: 'Charity Sportive' },
      ],
    },
  },

  // ─── 15. 1 day per week — minimal plan ───
  {
    name: 'Minimal: 1 day/week - 8 weeks',
    goal: { id: 'g15', goalType: 'improve', cyclingType: 'road', planName: 'Weekend Warrior' },
    config: {
      id: 'c15', daysPerWeek: 1, weeks: 8, trainingTypes: ['outdoor'],
      availableDays: ['sunday'], fitnessLevel: 'beginner', startDate: '2026-04-06',
    },
  },

  // ─── 16. Friday start — exercises the Monday-snap logic ───
  {
    name: 'Friday start + organised ride on Sunday',
    goal: {
      id: 'g16', goalType: 'race', cyclingType: 'road', eventName: 'TT',
      targetDistance: 25, targetDate: '2026-06-06', planName: 'TT Prep',
    },
    config: {
      id: 'c16', daysPerWeek: 3, weeks: 8, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'wednesday', 'friday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-10', // Friday
      oneOffRides: [
        { date: '2026-04-12', durationMins: 60, distanceKm: 25, notes: 'Test TT effort' },
      ],
    },
  },

  // ─── 17. Sunday start — another edge for Monday snap ───
  {
    name: 'Sunday start - Monday snap edge case',
    goal: { id: 'g17', goalType: 'improve', cyclingType: 'road', planName: 'Sunday Starter' },
    config: {
      id: 'c17', daysPerWeek: 3, weeks: 6, trainingTypes: ['outdoor'],
      availableDays: ['tuesday', 'thursday', 'sunday'], fitnessLevel: 'beginner',
      startDate: '2026-04-12', // Sunday
    },
  },

  // ─── 18. Kitchen sink — expert with everything ───
  {
    name: 'Kitchen sink: expert, all options, max complexity',
    goal: {
      id: 'g18', goalType: 'race', cyclingType: 'road', eventName: 'Marmotte',
      targetDistance: 175, targetElevation: 5000, targetTime: 10,
      targetDate: '2026-08-30', planName: 'Marmotte Beast Mode',
    },
    config: {
      id: 'c18', daysPerWeek: 6, weeks: 20, trainingTypes: ['outdoor', 'indoor', 'strength'],
      availableDays: ['monday', 'tuesday', 'wednesday', 'friday', 'saturday', 'sunday'],
      fitnessLevel: 'expert', startDate: '2026-04-13', longRideDay: 'sunday',
      recurringRides: [
        { id: 'rr4', day: 'saturday', durationMins: 150, distanceKm: 70, elevationM: 800, notes: 'Mountain Group Ride' },
        { id: 'rr5', day: 'wednesday', durationMins: 60, distanceKm: 25, notes: 'Track Night' },
      ],
      oneOffRides: [
        { date: '2026-05-10', durationMins: 240, distanceKm: 100, elevationM: 2000, notes: 'Recce Ride A' },
        { date: '2026-06-14', durationMins: 300, distanceKm: 140, elevationM: 3500, notes: 'Full Dress Rehearsal' },
        { date: '2026-07-19', durationMins: 180, distanceKm: 90, elevationM: 1500, notes: 'Sharpener' },
      ],
      crossTrainingDays: { thursday: 'yoga', friday: 'core workout' },
    },
  },

  // ─── 19. Beginner "Get Into Cycling" program ───
  {
    name: 'Beginner Get Into Cycling - 12 weeks',
    goal: {
      id: 'g19', goalType: 'beginner', cyclingType: 'road', planName: 'Get Into Cycling',
    },
    config: {
      id: 'c19', daysPerWeek: 3, weeks: 12, trainingTypes: ['outdoor'],
      availableDays: ['tuesday', 'thursday', 'saturday'], fitnessLevel: 'beginner',
      startDate: '2026-04-06',
    },
  },

  // ─── 20. Strength-heavy plan (ensure strength sessions appear) ───
  {
    name: 'Intermediate with strength focus - 8 weeks',
    goal: {
      id: 'g20', goalType: 'improve', cyclingType: 'road', planName: 'Strength Builder',
    },
    config: {
      id: 'c20', daysPerWeek: 4, weeks: 8, trainingTypes: ['outdoor', 'strength'],
      availableDays: ['monday', 'wednesday', 'friday', 'sunday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-06',
      crossTrainingDays: { tuesday: 'running', thursday: 'swimming' },
    },
  },

  // ─── 21. Short race plan with tight deadline (6 weeks, should taper) ───
  {
    name: 'Short race plan - 6 weeks with taper',
    goal: {
      id: 'g21', goalType: 'race', cyclingType: 'road', eventName: '50k TT',
      targetDistance: 50, targetDate: '2026-05-18', planName: '50k TT Prep',
    },
    config: {
      id: 'c21', daysPerWeek: 4, weeks: 6, trainingTypes: ['outdoor'],
      availableDays: ['tuesday', 'wednesday', 'friday', 'sunday'], fitnessLevel: 'advanced',
      startDate: '2026-04-06',
    },
  },

  // ─── 22. E-bike with elevation target ───
  {
    name: 'E-bike intermediate with elevation goal',
    goal: {
      id: 'g22', goalType: 'distance', cyclingType: 'ebike', eventName: 'Peak District Loop',
      targetDistance: 100, targetElevation: 2000, targetDate: '2026-07-12',
      planName: 'E-Bike Peak District',
    },
    config: {
      id: 'c22', daysPerWeek: 3, weeks: 12, trainingTypes: ['outdoor'],
      availableDays: ['wednesday', 'saturday', 'sunday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-13', longRideDay: 'sunday',
    },
  },

  // ─── 23. Recurring rides + strength + cross-training (all features) ───
  {
    name: 'All features: recurring + strength + cross-training - 10 weeks',
    goal: {
      id: 'g23', goalType: 'race', cyclingType: 'road', eventName: 'Century Ride',
      targetDistance: 160, targetDate: '2026-06-21', planName: 'Century All-In',
    },
    config: {
      id: 'c23', daysPerWeek: 5, weeks: 10, trainingTypes: ['outdoor', 'indoor', 'strength'],
      availableDays: ['monday', 'tuesday', 'thursday', 'saturday', 'sunday'],
      fitnessLevel: 'advanced', startDate: '2026-04-13', longRideDay: 'sunday',
      recurringRides: [
        { id: 'rr6', day: 'saturday', durationMins: 120, distanceKm: 55, notes: 'Weekend Club Ride' },
      ],
      crossTrainingDays: { wednesday: 'yoga', friday: 'running' },
    },
  },

  // ─── 24. 3 days/week beginner with target time ───
  {
    name: 'Beginner with target time - 80km in 5 hours',
    goal: {
      id: 'g24', goalType: 'distance', cyclingType: 'road',
      targetDistance: 80, targetTime: 5, targetDate: '2026-07-05',
      planName: '80k Target',
    },
    config: {
      id: 'c24', daysPerWeek: 3, weeks: 12, trainingTypes: ['outdoor'],
      availableDays: ['tuesday', 'thursday', 'sunday'], fitnessLevel: 'beginner',
      startDate: '2026-04-06',
    },
  },

  // ─── 25. Heavy running cross-training (high injury risk) ───
  {
    name: 'Cross-training: running 3x/week + cycling (injury prevention)',
    goal: {
      id: 'g25', goalType: 'improve', cyclingType: 'road', planName: 'Runner-Cyclist Plan',
    },
    config: {
      id: 'c25', daysPerWeek: 4, weeks: 8, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'wednesday', 'friday', 'sunday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-06',
      crossTrainingDays: { tuesday: 'running', thursday: 'running', saturday: 'running' },
    },
  },

  // ─── 26. Rowing + swimming cross-training ───
  {
    name: 'Cross-training: rowing + swimming (mixed impact)',
    goal: {
      id: 'g26', goalType: 'race', cyclingType: 'road', eventName: 'Sprint Triathlon',
      targetDistance: 40, targetDate: '2026-06-28', planName: 'Tri Bike Prep',
    },
    config: {
      id: 'c26', daysPerWeek: 3, weeks: 10, trainingTypes: ['outdoor', 'strength'],
      availableDays: ['monday', 'wednesday', 'saturday'], fitnessLevel: 'advanced',
      startDate: '2026-04-13',
      crossTrainingDays: { tuesday: 'rowing', thursday: 'swimming', friday: 'running' },
    },
  },

  // ─── 27. Yoga + pilates (low impact — should not restrict cycling) ───
  {
    name: 'Cross-training: yoga + pilates (low impact, no restrictions)',
    goal: {
      id: 'g27', goalType: 'improve', cyclingType: 'road', planName: 'Balanced Wellness',
    },
    config: {
      id: 'c27', daysPerWeek: 4, weeks: 8, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'tuesday', 'thursday', 'saturday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-06',
      crossTrainingDays: { wednesday: 'yoga', friday: 'pilates', sunday: 'yoga' },
    },
  },

  // ─── 28. Gym/weight training + running (highest combined stress) ───
  {
    name: 'Cross-training: gym + running (max stress combo)',
    goal: {
      id: 'g28', goalType: 'distance', cyclingType: 'road',
      targetDistance: 100, targetDate: '2026-07-19', planName: 'Ironman Bike Leg',
    },
    config: {
      id: 'c28', daysPerWeek: 4, weeks: 12, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'tuesday', 'thursday', 'saturday'], fitnessLevel: 'advanced',
      startDate: '2026-04-13', longRideDay: 'saturday',
      crossTrainingDays: { wednesday: 'weight training', friday: 'running', sunday: 'hiking' },
    },
  },

  // ─── 29. Multi-activity per day cross-training ───
  {
    name: 'Cross-training: multi-activity days (high cumulative fatigue)',
    goal: {
      id: 'g29', goalType: 'improve', cyclingType: 'road', planName: 'Multi-Sport Plan',
    },
    config: {
      id: 'c29', daysPerWeek: 3, weeks: 8, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'wednesday', 'saturday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-06',
      crossTrainingDays: { tuesday: 'running', thursday: 'swimming', friday: 'rowing', sunday: 'hiking' },
      crossTrainingDaysFull: {
        tuesday: ['running', 'core workout'],
        thursday: ['swimming', 'yoga'],
        friday: ['rowing'],
        sunday: ['hiking'],
      },
    },
  },

  // ─── 30. Recurring ride + running on adjacent days (stress combo) ───
  {
    name: 'Cross-training + recurring ride: running day before club ride',
    goal: {
      id: 'g30', goalType: 'improve', cyclingType: 'road', planName: 'Multi-Sport Club',
    },
    config: {
      id: 'c30', daysPerWeek: 4, weeks: 8, trainingTypes: ['outdoor'],
      availableDays: ['monday', 'tuesday', 'thursday', 'saturday'], fitnessLevel: 'intermediate',
      startDate: '2026-04-06',
      recurringRides: [
        { id: 'rr7', day: 'saturday', durationMins: 120, distanceKm: 50, notes: 'Club Ride' },
      ],
      crossTrainingDays: { wednesday: 'running', friday: 'running', sunday: 'yoga' },
    },
  },
];

// ── Edit/mutation test scenarios ─────────────────────────────────────────────
// These test plan edit and activity edit endpoints.
// Each defines a base plan scenario to generate first, then edits to apply + validate.

const EDIT_SCENARIOS = [
  {
    name: 'Make plan easier — reduce volume',
    // Use a simple beginner plan as the base
    baseScenario: {
      goal: { id: 'eg1', goalType: 'improve', cyclingType: 'road', planName: 'Edit Test Base' },
      config: {
        id: 'ec1', daysPerWeek: 3, weeks: 6, trainingTypes: ['outdoor'],
        availableDays: ['monday', 'wednesday', 'friday'], fitnessLevel: 'intermediate',
        startDate: '2026-04-06',
      },
    },
    edit: {
      instruction: 'Make the plan easier — I\'m feeling tired. Reduce distances and effort levels.',
      scope: 'remaining',
      currentWeek: 2,
    },
    validate: (originalPlan, editedActivities) => {
      const errors = [];
      if (!editedActivities || editedActivities.length === 0) {
        errors.push('No edited activities returned');
        return errors;
      }
      // Edited activities should generally have lower distances/durations
      const origWeek2Plus = originalPlan.activities.filter(a => a.week >= 2);
      const origTotalKm = origWeek2Plus.reduce((s, a) => s + (a.distanceKm || 0), 0);
      const editTotalKm = editedActivities.reduce((s, a) => s + (a.distanceKm || 0), 0);
      if (editTotalKm >= origTotalKm) {
        errors.push(`Expected reduced volume: original=${Math.round(origTotalKm)}km, edited=${Math.round(editTotalKm)}km`);
      }
      // All activities should still have valid fields
      for (const a of editedActivities) {
        if (!a.type) errors.push(`Activity "${a.title}" missing type`);
        if (a.type === 'ride' && !a.distanceKm && a.distanceKm !== null) errors.push(`Ride "${a.title}" missing distanceKm`);
      }
      return errors;
    },
  },
  {
    name: 'Make plan harder — increase intensity',
    baseScenario: {
      goal: { id: 'eg2', goalType: 'improve', cyclingType: 'road', planName: 'Edit Test Harder' },
      config: {
        id: 'ec2', daysPerWeek: 3, weeks: 6, trainingTypes: ['outdoor'],
        availableDays: ['tuesday', 'thursday', 'saturday'], fitnessLevel: 'intermediate',
        startDate: '2026-04-06',
      },
    },
    edit: {
      instruction: 'I want more of a challenge. Add more interval sessions and increase distances.',
      scope: 'remaining',
      currentWeek: 3,
    },
    validate: (originalPlan, editedActivities) => {
      const errors = [];
      if (!editedActivities || editedActivities.length === 0) {
        errors.push('No edited activities returned');
        return errors;
      }
      // Edited activities should have higher total distance or more hard efforts
      const origWeek3Plus = originalPlan.activities.filter(a => a.week >= 3);
      const origHard = origWeek3Plus.filter(a => a.effort === 'hard' || a.subType === 'intervals').length;
      const editHard = editedActivities.filter(a => a.effort === 'hard' || a.subType === 'intervals').length;
      if (editHard < origHard) {
        errors.push(`Expected more hard sessions: original=${origHard}, edited=${editHard}`);
      }
      return errors;
    },
  },
  {
    name: 'Edit single activity — make shorter',
    baseScenario: {
      goal: { id: 'eg3', goalType: 'improve', cyclingType: 'road', planName: 'Single Edit Test' },
      config: {
        id: 'ec3', daysPerWeek: 3, weeks: 6, trainingTypes: ['outdoor'],
        availableDays: ['monday', 'wednesday', 'saturday'], fitnessLevel: 'beginner',
        startDate: '2026-04-06',
      },
    },
    editActivity: {
      instruction: 'Make this session 30 minutes shorter',
    },
    validate: (originalActivity, result) => {
      const errors = [];
      if (!result) {
        errors.push('No result returned');
        return errors;
      }
      if (!result.answer) {
        errors.push('Missing answer field in response');
      }
      if (result.updatedActivity) {
        const orig = originalActivity.durationMins || 45;
        const updated = result.updatedActivity.durationMins;
        if (updated >= orig) {
          errors.push(`Expected shorter duration: original=${orig}min, updated=${updated}min`);
        }
        if (result.updatedActivity.type !== originalActivity.type) {
          errors.push(`Type changed from "${originalActivity.type}" to "${result.updatedActivity.type}"`);
        }
      } else {
        errors.push('updatedActivity is null — expected an edit');
      }
      return errors;
    },
  },
  {
    name: 'Edit single activity — ask a question (should NOT modify)',
    baseScenario: {
      goal: { id: 'eg4', goalType: 'improve', cyclingType: 'road', planName: 'Question Test' },
      config: {
        id: 'ec4', daysPerWeek: 3, weeks: 6, trainingTypes: ['outdoor'],
        availableDays: ['tuesday', 'thursday', 'sunday'], fitnessLevel: 'intermediate',
        startDate: '2026-04-06',
      },
    },
    editActivity: {
      instruction: 'Why is this session here? What am I trying to achieve with it?',
    },
    validate: (_originalActivity, result) => {
      const errors = [];
      if (!result) {
        errors.push('No result returned');
        return errors;
      }
      if (!result.answer || result.answer.length < 10) {
        errors.push(`Expected a coaching answer, got: "${result.answer}"`);
      }
      // A question should NOT modify the activity
      if (result.updatedActivity !== null && result.updatedActivity !== undefined) {
        errors.push('Question should return updatedActivity: null, but got an update');
      }
      return errors;
    },
  },

  // ─── 5. Add a strength session on a specific day ───
  {
    name: 'Edit plan — add strength session on Wednesday',
    baseScenario: {
      goal: { id: 'eg5', goalType: 'improve', cyclingType: 'road', planName: 'Add Strength Test' },
      config: {
        id: 'ec5', daysPerWeek: 3, weeks: 6, trainingTypes: ['outdoor'],
        availableDays: ['monday', 'wednesday', 'friday'], fitnessLevel: 'intermediate',
        startDate: '2026-04-06',
      },
    },
    edit: {
      instruction: 'Add a 45-minute strength/gym session every Wednesday for the remaining weeks.',
      scope: 'remaining',
      currentWeek: 2,
    },
    validate: (originalPlan, editedActivities) => {
      const errors = [];
      if (!editedActivities || editedActivities.length === 0) {
        errors.push('No edited activities returned');
        return errors;
      }
      // Should have at least some strength sessions
      const strengthActs = editedActivities.filter(a => a.type === 'strength');
      if (strengthActs.length === 0) {
        errors.push('No strength sessions found after asking to add them');
      }
      // Strength sessions should exist on Wednesdays (dayOfWeek=2)
      const wednesdayStrength = strengthActs.filter(a => a.dayOfWeek === 2);
      if (wednesdayStrength.length === 0 && strengthActs.length > 0) {
        // Check by date too
        const wedByDate = strengthActs.filter(a => a.date && getDayOfWeekName(a.date).toLowerCase() === 'wednesday');
        if (wedByDate.length === 0) {
          errors.push('Strength sessions added but none on Wednesday as requested');
        }
      }
      // Duration should be roughly 45 mins as requested
      for (const s of strengthActs) {
        if (s.durationMins && (s.durationMins < 30 || s.durationMins > 75)) {
          errors.push(`Strength session "${s.title}" has duration ${s.durationMins}min — asked for 45min`);
        }
      }
      // All activities should still have valid fields
      for (const a of editedActivities) {
        if (!a.type) errors.push(`Activity "${a.title}" missing type`);
      }
      return errors;
    },
  },

  // ─── 6. Move the long ride to Saturday ───
  {
    name: 'Edit plan — move long ride to Saturday',
    baseScenario: {
      goal: { id: 'eg6', goalType: 'distance', cyclingType: 'road', targetDistance: 100, planName: 'Move Long Ride Test' },
      config: {
        id: 'ec6', daysPerWeek: 4, weeks: 8, trainingTypes: ['outdoor'],
        availableDays: ['tuesday', 'thursday', 'saturday', 'sunday'], fitnessLevel: 'intermediate',
        startDate: '2026-04-06',
      },
    },
    edit: {
      instruction: 'Move my long ride each week to Saturday. I prefer doing my longest ride on Saturdays.',
      scope: 'remaining',
      currentWeek: 2,
    },
    validate: (originalPlan, editedActivities) => {
      const errors = [];
      if (!editedActivities || editedActivities.length === 0) {
        errors.push('No edited activities returned');
        return errors;
      }
      // Saturday = dayOfWeek 5
      // Find the longest ride each week and check it's on Saturday
      const weekMap = {};
      for (const a of editedActivities) {
        if (a.type !== 'ride') continue;
        if (!weekMap[a.week]) weekMap[a.week] = [];
        weekMap[a.week].push(a);
      }
      let saturdayLongCount = 0;
      let totalWeeksChecked = 0;
      for (const [week, rides] of Object.entries(weekMap)) {
        if (rides.length === 0) continue;
        totalWeeksChecked++;
        const longest = rides.reduce((a, b) => ((a.distanceKm || 0) > (b.distanceKm || 0) ? a : b));
        if (longest.dayOfWeek === 5) saturdayLongCount++;
      }
      // At least half the weeks should have their longest ride on Saturday
      if (totalWeeksChecked > 0 && saturdayLongCount < totalWeeksChecked * 0.5) {
        errors.push(`Only ${saturdayLongCount}/${totalWeeksChecked} weeks have the longest ride on Saturday — asked to move it there`);
      }
      return errors;
    },
  },

  // ─── 7. Single activity edit — change ride to indoor trainer ───
  {
    name: 'Edit single activity — swap to indoor trainer',
    baseScenario: {
      goal: { id: 'eg7', goalType: 'improve', cyclingType: 'road', planName: 'Indoor Swap Test' },
      config: {
        id: 'ec7', daysPerWeek: 3, weeks: 6, trainingTypes: ['outdoor'],
        availableDays: ['monday', 'wednesday', 'saturday'], fitnessLevel: 'intermediate',
        startDate: '2026-04-06',
      },
    },
    editActivity: {
      instruction: 'I can\'t ride outside today because of rain. Convert this to an indoor trainer session with the same effort level but slightly shorter.',
    },
    validate: (originalActivity, result) => {
      const errors = [];
      if (!result) {
        errors.push('No result returned');
        return errors;
      }
      if (!result.answer) {
        errors.push('Missing answer field');
      }
      if (result.updatedActivity) {
        const updated = result.updatedActivity;
        // Should still be a ride
        if (updated.type !== 'ride') {
          errors.push(`Expected ride type, got "${updated.type}"`);
        }
        // Title or description should mention indoor/trainer/turbo
        const combined = `${updated.title || ''} ${updated.description || ''} ${updated.subType || ''}`.toLowerCase();
        if (!combined.includes('indoor') && !combined.includes('trainer') && !combined.includes('turbo') && !combined.includes('zwift')) {
          errors.push('Updated activity doesn\'t mention indoor/trainer — should reflect the swap');
        }
        // Duration should be same or shorter
        const origDuration = originalActivity.durationMins || 45;
        if (updated.durationMins && updated.durationMins > origDuration + 5) {
          errors.push(`Expected same or shorter duration: original=${origDuration}min, updated=${updated.durationMins}min`);
        }
      } else {
        errors.push('updatedActivity is null — expected an edit to indoor');
      }
      return errors;
    },
  },

  // ─── 8. Edit plan — add a recovery ride after every hard session ───
  {
    name: 'Edit plan — add recovery after hard days',
    baseScenario: {
      goal: { id: 'eg8', goalType: 'improve', cyclingType: 'road', planName: 'Recovery Edit Test' },
      config: {
        id: 'ec8', daysPerWeek: 4, weeks: 6, trainingTypes: ['outdoor'],
        availableDays: ['monday', 'tuesday', 'thursday', 'saturday'], fitnessLevel: 'intermediate',
        startDate: '2026-04-06',
      },
    },
    edit: {
      instruction: 'After every interval or hard effort ride, please schedule a short easy recovery spin the next day (30 minutes, easy effort).',
      scope: 'remaining',
      currentWeek: 2,
    },
    validate: (originalPlan, editedActivities) => {
      const errors = [];
      if (!editedActivities || editedActivities.length === 0) {
        errors.push('No edited activities returned');
        return errors;
      }
      // Should have some recovery rides
      const recoveryActs = editedActivities.filter(a =>
        a.effort === 'recovery' || a.effort === 'easy' ||
        (a.subType && a.subType.toLowerCase().includes('recovery'))
      );
      if (recoveryActs.length === 0) {
        errors.push('No recovery/easy rides found after requesting them');
      }
      // Count hard efforts — there should be at least some recovery rides relative to hard rides
      const hardActs = editedActivities.filter(a =>
        a.effort === 'hard' || a.effort === 'max' || a.subType === 'intervals'
      );
      if (hardActs.length > 0 && recoveryActs.length === 0) {
        errors.push(`${hardActs.length} hard sessions but zero recovery rides — asked for recovery after each hard day`);
      }
      // All activities should have valid fields
      for (const a of editedActivities) {
        if (!a.type) errors.push(`Activity "${a.title}" missing type`);
        if (!a.week) errors.push(`Activity "${a.title}" missing week`);
      }
      return errors;
    },
  },
];

// ── Validation checks ───────────────────────────────────────────────────────

function validate(plan, scenario) {
  const errors = [];
  const warnings = [];
  const { goal, config } = scenario;

  if (!plan || !plan.activities) {
    errors.push('Plan or activities is null/undefined');
    return { errors, warnings, stats: {} };
  }

  const acts = plan.activities;

  // StartDate should be a Monday
  if (plan.startDate) {
    const [y, m, d] = plan.startDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    if (dt.getDay() !== 1) {
      errors.push(`startDate ${plan.startDate} is not a Monday (it's ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()]})`);
    }
  }

  // Every activity has a date and scheduleType
  const missingDates = acts.filter(a => !a.date);
  if (missingDates.length > 0) errors.push(`${missingDates.length} activities missing 'date' field`);
  const missingType = acts.filter(a => !a.scheduleType);
  if (missingType.length > 0) errors.push(`${missingType.length} activities missing 'scheduleType' field`);

  // dayOfWeek values match the actual date
  for (const a of acts) {
    if (!a.date) continue;
    const actualDayName = getDayOfWeekName(a.date);
    const expectedDayName = DAY_NAMES[a.dayOfWeek];
    if (actualDayName !== expectedDayName) {
      errors.push(`"${a.title}" on ${a.date}: dayOfWeek=${a.dayOfWeek} (${expectedDayName}) but date is ${actualDayName}`);
    }
  }

  // Organised rides are on exact correct dates
  for (const oo of (config.oneOffRides || [])) {
    if (!oo.date) continue;
    const ooDateStr = oo.date.split('T')[0];
    const matchingActs = acts.filter(a => a.isOneOff && a.date === ooDateStr);
    if (matchingActs.length === 0) {
      errors.push(`Organised ride "${oo.notes || oo.date}" NOT found on ${ooDateStr}`);
    } else if (matchingActs.length > 1) {
      warnings.push(`Multiple organised rides found on ${ooDateStr}`);
    }
  }

  // No duplicate rides on same day
  const dayTypeMap = {};
  for (const a of acts) {
    const key = `${a.week}-${a.dayOfWeek}-${a.type}`;
    if (dayTypeMap[key]) {
      errors.push(`Duplicate ${a.type} on week ${a.week}, day ${a.dayOfWeek}: "${dayTypeMap[key]}" and "${a.title}"`);
    }
    dayTypeMap[key] = a.title;
  }

  // No activities on or after event date
  if (goal.targetDate) {
    const tp = goal.targetDate.split('T')[0];
    const afterEvent = acts.filter(a => a.date && a.date >= tp);
    if (afterEvent.length > 0) {
      errors.push(`${afterEvent.length} activities on/after event ${tp}`);
    }
  }

  // Correct scheduleType flags
  for (const a of acts) {
    if (a.isOneOff && a.scheduleType !== 'organised')
      errors.push(`"${a.title}" isOneOff but scheduleType="${a.scheduleType}"`);
    if (a.isRecurring && a.scheduleType !== 'recurring')
      errors.push(`"${a.title}" isRecurring but scheduleType="${a.scheduleType}"`);
  }

  // Recovery checks around organised rides
  for (const a of acts) {
    if (a.scheduleType !== 'organised') continue;
    const dayAfterDate = addDays(a.date, 1);
    const dayAfterActs = acts.filter(b => b.date === dayAfterDate && b.type === 'ride' && b.scheduleType === 'planned');
    for (const after of dayAfterActs) {
      if (after.effort === 'hard' || after.subType === 'intervals') {
        warnings.push(`Day after "${a.title}" (${a.date}): "${after.title}" is ${after.effort}/${after.subType} — should be recovery`);
      }
    }
  }

  // Weeks don't exceed plan.weeks
  const maxWeek = Math.max(...acts.map(a => a.week), 0);
  if (maxWeek > plan.weeks) errors.push(`Max week (${maxWeek}) exceeds plan.weeks (${plan.weeks})`);

  // Cross-training injury risk: hard cycling should not be adjacent to high-impact cross-training
  const HIGH_IMPACT_CT = ['running', 'rowing', 'weight training', 'gym', 'hiking', 'crossfit'];
  const ctDays = config.crossTrainingDays || {};
  const ctDaysFull = config.crossTrainingDaysFull || null;
  const ctSource = ctDaysFull || ctDays;
  if (ctSource && Object.keys(ctSource).length > 0) {
    // Map dayName → list of activities
    const ctMap = {};
    for (const [day, act] of Object.entries(ctSource)) {
      const activities = Array.isArray(act) ? act : [act];
      ctMap[day.toLowerCase()] = activities.map(a => a.toLowerCase());
    }

    // Check if any high-impact cross-training day is followed by a hard cycling session
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const [ctDay, activities] of Object.entries(ctMap)) {
      const hasHighImpact = activities.some(a => HIGH_IMPACT_CT.some(hi => a.includes(hi)));
      if (!hasHighImpact) continue;

      const ctDayIdx = dayOrder.indexOf(ctDay);
      if (ctDayIdx < 0) continue;
      const nextDayIdx = (ctDayIdx + 1) % 7;
      const nextDayName = dayOrder[nextDayIdx];

      // Find cycling activities on the day after this high-impact cross-training day
      for (const a of acts) {
        if (!a.date) continue;
        const actDayName = getDayOfWeekName(a.date).toLowerCase();
        if (actDayName === nextDayName && a.type === 'ride' && (a.effort === 'hard' || a.effort === 'max' || a.subType === 'intervals')) {
          warnings.push(`Hard ride "${a.title}" (week ${a.week}, ${a.effort}/${a.subType}) scheduled day after ${ctDay} ${activities.join('+')} — injury risk`);
        }
      }
    }
  }

  // Strength sessions should exist if training types include strength
  if (config.trainingTypes?.includes('strength')) {
    const strengthCount = acts.filter(a => a.type === 'strength').length;
    if (strengthCount === 0) {
      errors.push('Config includes strength training but zero strength sessions found');
    } else if (strengthCount < plan.weeks * 0.5) {
      warnings.push(`Only ${strengthCount} strength sessions across ${plan.weeks} weeks (expected ~1 per week)`);
    }
  }

  // Recurring rides appear in most weeks
  for (const rr of (config.recurringRides || [])) {
    const rrActs = acts.filter(a => a.isRecurring && a.recurringRideId === rr.id);
    if (rrActs.length === 0) {
      errors.push(`Recurring "${rr.notes || rr.day}" not in any week`);
    } else if (rrActs.length < plan.weeks * 0.5) {
      warnings.push(`Recurring "${rr.notes || rr.day}" only in ${rrActs.length}/${plan.weeks} weeks`);
    }
  }

  // ── Plan covers exactly the configured number of weeks ──
  // Every week from 1 to plan.weeks should have at least 1 activity
  const weeksWithActivities = new Set(acts.map(a => a.week));
  const configuredWeeks = config.weeks || plan.weeks;
  if (plan.weeks !== configuredWeeks) {
    errors.push(`Plan weeks (${plan.weeks}) does not match configured weeks (${configuredWeeks})`);
  }
  const emptyWeeks = [];
  for (let w = 1; w <= plan.weeks; w++) {
    if (!weeksWithActivities.has(w)) emptyWeeks.push(w);
  }
  if (emptyWeeks.length > 0) {
    errors.push(`${emptyWeeks.length} empty weeks with zero activities: [${emptyWeeks.join(', ')}]`);
  }

  // ── No massive volume spikes week-to-week ──
  // Weekly ride distance should not increase by more than 30% vs the previous non-deload week
  // (we allow 30% to account for the return from deload weeks)
  const weeklyRideKm = [];
  for (let w = 1; w <= plan.weeks; w++) {
    const weekRides = acts.filter(a => a.week === w && a.type === 'ride');
    weeklyRideKm.push(weekRides.reduce((s, a) => s + (a.distanceKm || 0), 0));
  }
  for (let w = 1; w < weeklyRideKm.length; w++) {
    const prev = weeklyRideKm[w - 1];
    const curr = weeklyRideKm[w];
    if (prev > 20 && curr > prev * 1.35) {
      // Check if previous week was a deload (significantly lower than the one before it)
      const isReturnFromDeload = w >= 2 && weeklyRideKm[w - 2] > 0 && weeklyRideKm[w - 1] < weeklyRideKm[w - 2] * 0.8;
      if (!isReturnFromDeload) {
        warnings.push(`Volume spike: week ${w} → ${w + 1}: ${Math.round(prev)}km → ${Math.round(curr)}km (+${Math.round((curr / prev - 1) * 100)}%)`);
      }
    }
  }

  // ── Not too many consecutive hard days (overtraining / injury risk) ──
  // No more than 2 hard/max effort rides in a row without a recovery/easy day
  const sortedActs = [...acts].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let consecutiveHard = 0;
  let lastDate = null;
  for (const a of sortedActs) {
    if (!a.date || a.type !== 'ride') continue;
    // Only count consecutive calendar days
    if (lastDate && a.date !== lastDate) {
      const dayGap = Math.round((new Date(a.date + 'T12:00:00') - new Date(lastDate + 'T12:00:00')) / 86400000);
      if (dayGap > 1) consecutiveHard = 0; // rest day between — reset
    }
    if (a.effort === 'hard' || a.effort === 'max' || a.subType === 'intervals') {
      consecutiveHard++;
      if (consecutiveHard > 2) {
        warnings.push(`${consecutiveHard} consecutive hard rides ending "${a.title}" (week ${a.week}) — overtraining risk`);
      }
    } else {
      consecutiveHard = 0;
    }
    lastDate = a.date;
  }

  // ── Total weekly sessions should not vastly exceed daysPerWeek ──
  // Allow +1 for strength sessions on cycling days, but flag if way over
  for (let w = 1; w <= plan.weeks; w++) {
    const weekActs = acts.filter(a => a.week === w);
    const maxExpected = (config.daysPerWeek || 3) + 2; // allow some overhead for strength + recurring
    if (weekActs.length > maxExpected) {
      warnings.push(`Week ${w} has ${weekActs.length} sessions (config says ${config.daysPerWeek}/week) — possibly too many`);
    }
  }

  // ── Total weekly sessions should not be FAR FEWER than daysPerWeek ──
  // This catches the bug the user reported: "I asked for 3 rides, got 1".
  // Rules:
  //   - Build-phase weeks (first 75% of the plan) must honour the full count,
  //     allowing 1 session of slack for deload weeks.
  //   - Peak/taper weeks (last 25%) may drop more — taper is an intentional
  //     volume reduction. We still flag weeks with zero planned sessions
  //     because that's never correct.
  //   - Recurring + one-off rides don't count, since they're auto-injected
  //     and would otherwise mask the bug.
  const requestedPerWeek = Object.values(config.sessionCounts || {}).reduce((s, v) => s + v, 0)
    || (config.daysPerWeek || 0);
  if (requestedPerWeek > 0 && plan.weeks >= 1) {
    const taperStartWeek = Math.max(2, Math.floor(plan.weeks * 0.75) + 1);
    const buildFloor = Math.max(1, requestedPerWeek - 1); // 1 slack for deload
    for (let w = 1; w <= plan.weeks; w++) {
      const weekActs = acts.filter(a => a.week === w && !a.isRecurring && !a.isOneOff);
      const inTaper = w >= taperStartWeek;
      const floor = inTaper ? 1 : buildFloor;
      if (weekActs.length < floor) {
        const phase = inTaper ? 'taper' : 'build';
        errors.push(
          `Week ${w} (${phase}) has only ${weekActs.length} planned session${weekActs.length === 1 ? '' : 's'} but config requests ${requestedPerWeek}/week ` +
          `(${Object.entries(config.sessionCounts || { outdoor: config.daysPerWeek }).map(([k, v]) => `${v}×${k}`).join(', ')}) ` +
          `— plan is NOT honouring the user's input.`
        );
      }
    }
  }

  // ── Strength sessions should NOT appear if the user didn't request them ──
  // The user reported "I asked for 3 rides, got 1 ride + 1 strength" — the
  // strength appearing uninvited is a clear bug.
  if (!config.trainingTypes?.includes('strength')) {
    const unrequestedStrength = acts.filter(a => a.type === 'strength').length;
    if (unrequestedStrength > 0) {
      errors.push(
        `Found ${unrequestedStrength} strength session(s) but config.trainingTypes does not include 'strength' ` +
        `(trainingTypes=${JSON.stringify(config.trainingTypes || [])}) — plan is inventing session types.`
      );
    }
  }

  // ── Deload / rest weeks for plans 8+ weeks ──
  // Every 3-4 weeks there should be a noticeably lighter week (at least 20% less volume)
  if (plan.weeks >= 8 && weeklyRideKm.length >= 8) {
    // Check that at least one week in every 4-week block (after the first block) is lighter
    let hasAnyDeload = false;
    for (let w = 2; w < weeklyRideKm.length; w++) {
      // Compare to the average of the 2 weeks before
      const avgPrev = (weeklyRideKm[w - 1] + weeklyRideKm[w - 2]) / 2;
      if (avgPrev > 10 && weeklyRideKm[w] < avgPrev * 0.8) {
        hasAnyDeload = true;
        break;
      }
    }
    // Also count taper weeks (last 1-2 weeks with reduced volume) as deloads
    if (!hasAnyDeload && weeklyRideKm.length >= 3) {
      const lastWeekKm = weeklyRideKm[weeklyRideKm.length - 1];
      const peakKm = Math.max(...weeklyRideKm.slice(0, -2));
      if (peakKm > 10 && lastWeekKm < peakKm * 0.7) hasAnyDeload = true;
    }
    if (!hasAnyDeload) {
      warnings.push(`No deload/rest week detected in ${plan.weeks}-week plan — recovery weeks help prevent injury and allow adaptation`);
    }
  }

  // ── Beginner "Get Into Cycling" plans: final ride should approach target distance ──
  if (goal.goalType === 'beginner' || (goal.goalType === 'distance' && config.fitnessLevel === 'beginner')) {
    const targetDist = goal.targetDistance || 40; // beginner default is ~40km
    const lastWeekRides = acts.filter(a => a.week === plan.weeks && a.type === 'ride');
    const longestLastWeek = Math.max(...lastWeekRides.map(a => a.distanceKm || 0), 0);
    // The second-to-last week might have the "graduation ride" if last week is taper
    const penultimateRides = acts.filter(a => a.week === plan.weeks - 1 && a.type === 'ride');
    const longestPenultimate = Math.max(...penultimateRides.map(a => a.distanceKm || 0), 0);
    const longestFinalRide = Math.max(longestLastWeek, longestPenultimate);
    if (longestFinalRide < targetDist * 0.6) {
      warnings.push(`Beginner plan: longest ride in final weeks is ${Math.round(longestFinalRide)}km but target is ${targetDist}km — should build closer to goal`);
    }
  }

  // ── For distance/race goals: peak ride should approach target distance ──
  if (goal.targetDistance && (goal.goalType === 'race' || goal.goalType === 'distance')) {
    const allRideDistances = acts.filter(a => a.type === 'ride').map(a => a.distanceKm || 0);
    const peakRide = Math.max(...allRideDistances, 0);
    if (peakRide < goal.targetDistance * 0.65) {
      warnings.push(`Peak ride is ${Math.round(peakRide)}km but event target is ${goal.targetDistance}km — should reach at least 70-85% in training`);
    }
  }

  const stats = {
    totalActivities: acts.length,
    rides: acts.filter(a => a.type === 'ride').length,
    strength: acts.filter(a => a.type === 'strength').length,
    organised: acts.filter(a => a.scheduleType === 'organised').length,
    recurring: acts.filter(a => a.scheduleType === 'recurring').length,
    planned: acts.filter(a => a.scheduleType === 'planned').length,
    recovery: acts.filter(a => a.effort === 'recovery' || a.subType === 'recovery').length,
    weeks: plan.weeks,
    startDate: plan.startDate,
  };

  return { errors, warnings, stats };
}

// ── Run all local tests ─────────────────────────────────────────────────────

function runLocalTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ETAPA PLAN GENERATOR — LOCAL TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let totalPass = 0, totalFail = 0, totalWarn = 0;
  const results = [];

  for (const scenario of SCENARIOS) {
    process.stdout.write(`▶ ${scenario.name}... `);
    try {
      const plan = generatePlan(scenario.goal, scenario.config);
      const { errors, warnings, stats } = validate(plan, scenario);

      if (errors.length === 0) {
        const warnTag = warnings.length > 0 ? ` ⚠ ${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : '';
        console.log(`✅ PASS (${stats.totalActivities} acts, ${stats.organised} org, ${stats.recurring} rec)${warnTag}`);
        totalPass++;
      } else {
        console.log(`❌ FAIL`);
        errors.forEach(e => console.log(`   ✗ ${e}`));
        totalFail++;
      }
      if (warnings.length > 0) {
        warnings.forEach(w => console.log(`   ⚠ ${w}`));
        totalWarn += warnings.length;
      }
      results.push({ name: scenario.name, pass: errors.length === 0, errors, warnings, stats });
    } catch (err) {
      console.log(`💥 ERROR: ${err.message}`);
      totalFail++;
      results.push({ name: scenario.name, pass: false, errors: [err.message], warnings: [], stats: {} });
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${totalPass} passed, ${totalFail} failed, ${totalWarn} warnings`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Scenario                                            | Result | Acts | Org | Rec | Plan | Recov | Warn');
  console.log('----------------------------------------------------|--------|------|-----|-----|------|-------|-----');
  for (const r of results) {
    const nm = r.name.substring(0, 51).padEnd(51);
    const rs = r.pass ? (r.warnings.length > 0 ? ' WARN ' : ' PASS ') : ' FAIL ';
    const a = String(r.stats.totalActivities || 0).padStart(4);
    const o = String(r.stats.organised || 0).padStart(3);
    const rc = String(r.stats.recurring || 0).padStart(3);
    const p = String(r.stats.planned || 0).padStart(4);
    const rv = String(r.stats.recovery || 0).padStart(4);
    const w = r.warnings.length > 0 ? String(r.warnings.length).padStart(4) : '   -';
    console.log(`${nm} | ${rs} | ${a} | ${o} | ${rc} | ${p} | ${rv} | ${w}`);
  }

  return totalFail === 0;
}

// ── API evaluation mode ─────────────────────────────────────────────────────

async function runApiTests(serverUrl, apiKey, outputPath) {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  ETAPA PLAN GENERATOR — API EVALUATION (${serverUrl})`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const authHeaders = apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {};

  let totalPass = 0, totalFail = 0;
  const results = [];
  const runStartedAt = new Date().toISOString();

  for (const scenario of SCENARIOS) {
    process.stdout.write(`▶ [API] ${scenario.name}... `);
    const scenarioStartTime = Date.now();
    let result = {
      name: scenario.name,
      pass: false,
      input: { goal: scenario.goal, config: scenario.config },
      plan: null,
      errors: [],
      warnings: [],
      stats: null,
      durationMs: null,
      error: null,
    };

    try {
      const startRes = await fetch(`${serverUrl}/api/ai/generate-plan-async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ goal: scenario.goal, config: scenario.config }),
      });

      if (!startRes.ok) {
        const body = await startRes.text().catch(() => '');
        console.log(`❌ FAIL (${startRes.status})`);
        result.error = `HTTP ${startRes.status}: ${body}`;
        result.durationMs = Date.now() - scenarioStartTime;
        totalFail++;
        results.push(result);
        continue;
      }

      const { jobId } = await startRes.json();
      result.jobId = jobId;
      let plan = null;
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const pollRes = await fetch(`${serverUrl}/api/ai/plan-job/${jobId}`, { headers: authHeaders });
        if (!pollRes.ok) continue;
        const pollData = await pollRes.json();
        if (pollData.status === 'completed') { plan = pollData.plan; break; }
        if (pollData.status === 'failed') throw new Error(pollData.error);
        if (i % 10 === 0 && i > 0) process.stdout.write('.');
      }

      result.durationMs = Date.now() - scenarioStartTime;

      if (!plan) {
        console.log(`❌ TIMEOUT`);
        result.error = 'TIMEOUT after 120s';
        totalFail++;
        results.push(result);
        continue;
      }

      result.plan = plan;
      const { errors, warnings, stats } = validate(plan, scenario);
      result.errors = errors;
      result.warnings = warnings;
      result.stats = stats;
      result.pass = errors.length === 0;

      if (errors.length === 0) {
        const warnTag = warnings.length > 0 ? ` ⚠ ${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : '';
        console.log(`✅ PASS (${stats.totalActivities} acts, ${(result.durationMs / 1000).toFixed(1)}s)${warnTag}`);
        totalPass++;
      } else {
        console.log(`❌ FAIL`);
        errors.forEach(e => console.log(`   ✗ ${e}`));
        totalFail++;
      }
      warnings.forEach(w => console.log(`   ⚠ ${w}`));
    } catch (err) {
      result.durationMs = Date.now() - scenarioStartTime;
      result.error = err.message;
      console.log(`💥 ${err.message}`);
      totalFail++;
    }

    results.push(result);
  }

  const totalWarn = results.reduce((s, r) => s + (r.warnings?.length || 0), 0);
  console.log(`\n  API RESULTS: ${totalPass}/${SCENARIOS.length} passed, ${totalFail} failed, ${totalWarn} warnings\n`);

  // Write full results to JSON
  const output = {
    runAt: runStartedAt,
    server: serverUrl,
    totalScenarios: SCENARIOS.length,
    passed: totalPass,
    failed: totalFail,
    results,
  };

  const outFile = outputPath || `tests/api-results-${runStartedAt.replace(/[:.]/g, '-').slice(0, 19)}.json`;
  const fs = await import('fs');
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`  📄 Full results saved to ${outFile}\n`);

  return totalFail === 0;
}

// ── Edit/mutation API tests ─────────────────────────────────────────────────

async function generatePlanViaApi(serverUrl, authHeaders, scenario) {
  const startRes = await fetch(`${serverUrl}/api/ai/generate-plan-async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ goal: scenario.goal, config: scenario.config }),
  });
  if (!startRes.ok) throw new Error(`HTTP ${startRes.status}`);
  const { jobId } = await startRes.json();

  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const pollRes = await fetch(`${serverUrl}/api/ai/plan-job/${jobId}`, { headers: authHeaders });
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    if (pollData.status === 'completed') return pollData.plan;
    if (pollData.status === 'failed') throw new Error(pollData.error);
  }
  throw new Error('TIMEOUT');
}

async function runEditTests(serverUrl, apiKey, outputPath) {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  ETAPA PLAN EDITOR — MUTATION TESTS (${serverUrl})`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const authHeaders = apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {};
  let totalPass = 0, totalFail = 0;
  const results = [];

  for (const scenario of EDIT_SCENARIOS) {
    process.stdout.write(`▶ [EDIT] ${scenario.name}... `);
    const startTime = Date.now();
    let result = { name: scenario.name, pass: false, errors: [], durationMs: null };

    try {
      // Step 1: Generate the base plan
      process.stdout.write('gen...');
      const plan = await generatePlanViaApi(serverUrl, authHeaders, scenario.baseScenario);
      if (!plan || !plan.activities || plan.activities.length === 0) {
        throw new Error('Base plan generation returned empty plan');
      }

      if (scenario.editActivity) {
        // ── Single activity edit test ──
        // Pick the first ride activity from week 2 (or week 1 fallback)
        const target = plan.activities.find(a => a.week === 2 && a.type === 'ride')
                    || plan.activities.find(a => a.type === 'ride');
        if (!target) throw new Error('No ride activity found in plan to edit');

        process.stdout.write('edit...');
        const editRes = await fetch(`${serverUrl}/api/ai/edit-activity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            activity: target,
            goal: scenario.baseScenario.goal,
            instruction: scenario.editActivity.instruction,
          }),
        });

        if (!editRes.ok) {
          const body = await editRes.text().catch(() => '');
          throw new Error(`Edit API returned ${editRes.status}: ${body}`);
        }

        const editResult = await editRes.json();
        const errors = scenario.validate(target, editResult);
        result.errors = errors;
        result.pass = errors.length === 0;
        result.originalActivity = target;
        result.editResult = editResult;

      } else if (scenario.edit) {
        // ── Plan-level edit test ──
        process.stdout.write('edit...');
        const editRes = await fetch(`${serverUrl}/api/ai/edit-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            plan,
            goal: scenario.baseScenario.goal,
            instruction: scenario.edit.instruction,
            scope: scenario.edit.scope,
            currentWeek: scenario.edit.currentWeek,
          }),
        });

        if (!editRes.ok) {
          const body = await editRes.text().catch(() => '');
          throw new Error(`Edit API returned ${editRes.status}: ${body}`);
        }

        const { activities: editedActivities } = await editRes.json();
        const errors = scenario.validate(plan, editedActivities);
        result.errors = errors;
        result.pass = errors.length === 0;
        result.originalPlanStats = {
          totalActivities: plan.activities.length,
          totalKm: Math.round(plan.activities.reduce((s, a) => s + (a.distanceKm || 0), 0)),
        };
        result.editedStats = editedActivities ? {
          totalActivities: editedActivities.length,
          totalKm: Math.round(editedActivities.reduce((s, a) => s + (a.distanceKm || 0), 0)),
        } : null;
      }

      result.durationMs = Date.now() - startTime;

      if (result.pass) {
        console.log(`✅ PASS (${(result.durationMs / 1000).toFixed(1)}s)`);
        totalPass++;
      } else {
        console.log(`❌ FAIL`);
        result.errors.forEach(e => console.log(`   ✗ ${e}`));
        totalFail++;
      }
    } catch (err) {
      result.durationMs = Date.now() - startTime;
      result.errors = [err.message];
      console.log(`💥 ${err.message}`);
      totalFail++;
    }

    results.push(result);
  }

  console.log(`\n  EDIT RESULTS: ${totalPass}/${EDIT_SCENARIOS.length} passed, ${totalFail} failed\n`);

  return { passed: totalPass, failed: totalFail, results };
}

// ── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const apiIdx = args.indexOf('--api');
const keyIdx = args.indexOf('--key');
const outIdx = args.indexOf('--output');
const skipEdits = args.includes('--skip-edits');

const localOk = runLocalTests();

if (apiIdx >= 0 && args[apiIdx + 1]) {
  const apiKey = keyIdx >= 0 ? args[keyIdx + 1] : null;
  const outputPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const apiOk = await runApiTests(args[apiIdx + 1], apiKey, outputPath);

  let editSummary = null;
  if (!skipEdits) {
    editSummary = await runEditTests(args[apiIdx + 1], apiKey, outputPath);
  }

  // Consolidate everything into one output file
  if (outputPath) {
    const fs = await import('fs');
    // Re-read the api results file that was already written
    let combined;
    try {
      combined = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    } catch {
      combined = { runAt: new Date().toISOString(), server: args[apiIdx + 1], results: [] };
    }
    // Merge edit results in
    if (editSummary) {
      combined.editResults = editSummary.results;
      combined.editPassed = editSummary.passed;
      combined.editFailed = editSummary.failed;
    }
    fs.writeFileSync(outputPath, JSON.stringify(combined, null, 2));
    console.log(`  📄 Combined results (scenarios + edits) saved to ${outputPath}\n`);
  }
} else {
  console.log('\nTip: Run with --api http://localhost:3001 to also test server-side LLM generation');
  console.log('     Add --key YOUR_TEST_API_KEY to authenticate against production');
  console.log('     Add --output results.json to save full plans to a file');
  console.log('     Add --skip-edits to skip edit/mutation tests\n');
}

process.exit(localOk ? 0 : 1);
