/**
 * Shared helpers for mobile UI tests.
 *
 * - renderScreen(Component, { route, navigation, ... })
 *     Wraps the component in a NavigationContainer (so useNavigation /
 *     useRoute work) and passes a sensible default `navigation` /
 *     `route` prop. Override via the options object.
 *
 * - flush() — small await helper for tests that need to let pending
 *   promises resolve without spamming waitFor with custom predicates.
 *
 * - seedPlan({ activities }) — convenience that returns a fully-formed
 *   plan + goal pair you can pass to storageService.__seed().
 *
 * Keep this file boring. Anything fancy belongs in the test file
 * itself; this exists to remove the boilerplate that every test would
 * otherwise duplicate.
 */
const React = require('react');
const { render } = require('@testing-library/react-native');
const { NavigationContainer } = require('@react-navigation/native');

function makeNavigation(overrides = {}) {
  return {
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    goBack: jest.fn(),
    pop: jest.fn(),
    popToTop: jest.fn(),
    reset: jest.fn(),
    setParams: jest.fn(),
    setOptions: jest.fn(),
    addListener: jest.fn(() => () => {}),
    removeListener: jest.fn(),
    isFocused: jest.fn(() => true),
    canGoBack: jest.fn(() => true),
    dispatch: jest.fn(),
    getParent: jest.fn(() => null),
    getState: jest.fn(() => ({ routes: [], index: 0 })),
    ...overrides,
  };
}

function makeRoute(overrides = {}) {
  return {
    key: 'mock-route',
    name: 'MockScreen',
    params: {},
    ...overrides,
  };
}

/**
 * Render a screen component with sensible navigation defaults.
 * Returns the standard RNTL render result (queries + rerender etc.).
 */
function renderScreen(Component, opts = {}) {
  const navigation = makeNavigation(opts.navigation);
  const route = makeRoute(opts.route);

  const Wrapped = (
    React.createElement(
      NavigationContainer,
      null,
      React.createElement(Component, { navigation, route, ...(opts.props || {}) })
    )
  );

  return { ...render(Wrapped), navigation, route };
}

const flush = () => new Promise((r) => setImmediate(r));

/**
 * Build a minimal plan + goal pair suitable for screens that read from
 * storageService. Defaults give one ride this week so HomeScreen has
 * something to render.
 */
function seedPlan({ activities, goal, planConfig } = {}) {
  const goalRow = {
    id: 'goal-1',
    goalType: 'event',
    eventName: 'Etape du Tour',
    targetDistance: 100,
    targetDate: '2026-07-01',
    cyclingType: 'road',
    cyclingTypes: ['road'],
    ...goal,
  };

  const planRow = {
    id: 'plan-1',
    goalId: goalRow.id,
    name: 'Test plan',
    weeks: 12,
    currentWeek: 1,
    startDate: '2026-04-26',
    status: 'active',
    activities: activities || [
      {
        id: 'a-1',
        planId: 'plan-1',
        week: 1, dayOfWeek: 1,
        type: 'ride', subType: 'endurance',
        title: 'Easy endurance', description: '60 min steady',
        durationMins: 60, distanceKm: 18, effort: 'easy',
        bikeType: 'road', completed: false,
      },
      {
        id: 'a-2',
        planId: 'plan-1',
        week: 1, dayOfWeek: 3,
        type: 'ride', subType: 'intervals',
        title: '4x4 VO2max', description: 'Hard intervals',
        durationMins: 60, distanceKm: 16, effort: 'hard',
        bikeType: 'road', completed: false,
        structure: { warmup: { durationMins: 10 }, main: { type: 'intervals', reps: 4, workMins: 4, restMins: 3 }, cooldown: { durationMins: 10 } },
      },
    ],
    configId: 'cfg-1',
  };

  const cfg = {
    id: 'cfg-1',
    coachId: 'clara',
    fitnessLevel: 'beginner',
    cyclingTypes: ['road'],
    daysPerWeek: 3,
    ...planConfig,
  };

  return { goal: goalRow, plan: planRow, planConfig: cfg };
}

module.exports = {
  renderScreen,
  makeNavigation,
  makeRoute,
  flush,
  seedPlan,
};
