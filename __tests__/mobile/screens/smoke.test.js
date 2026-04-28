/**
 * Smoke tests — every screen below should mount without throwing.
 *
 * What this catches:
 *   - "screen broke after a service signature change" (e.g. api.js
 *     adds a new endpoint and the screen calls something that doesn't
 *     exist in the mock — surfaces as a render-time crash).
 *   - Missing default exports, broken JSX, runtime require errors.
 *   - Imports that pull in native code we haven't mocked yet.
 *
 * What this does NOT catch:
 *   - Layout regressions (no visual diff)
 *   - Interaction bugs (covered in flow tests)
 *   - Async data that arrives after the initial render
 *
 * The test mocks every service before importing each screen so we can
 * keep the behaviour predictable across the whole suite.
 */

jest.mock('../../../src/services/api');
jest.mock('../../../src/services/storageService');
jest.mock('../../../src/services/llmPlanService');
jest.mock('../../../src/services/authService');
jest.mock('../../../src/services/notificationService');
jest.mock('../../../src/services/revenueCatService');
jest.mock('../../../src/services/subscriptionService');
jest.mock('../../../src/services/stravaService');
jest.mock('../../../src/services/analyticsService');
jest.mock('../../../src/services/remoteConfig');
jest.mock('../../../src/services/useRemoteConfig');

const { renderScreen, seedPlan } = require('../test-utils');

// Seed storage with a basic plan so screens that rely on it have
// something to chew on. Plain require because our mock exposes
// __seed; Jest hoists the jest.mock() call above so the mock is
// already wired by the time we read it here.
const storage = require('../../../src/services/storageService');

describe('Screen smoke tests — render without crashing', () => {
  beforeEach(() => {
    storage.__reset();
    const { goal, plan, planConfig } = seedPlan();
    storage.__seed({ goals: [goal], plans: [plan], planConfigs: [planConfig], onboardingDone: true });
  });

  // Static / simple screens — no required route params, no heavy
  // initial fetch beyond what's already mocked.
  const STATIC_SCREENS = [
    ['WelcomeScreen', () => require('../../../src/screens/WelcomeScreen').default],
    ['AboutScreen', () => require('../../../src/screens/AboutScreen').default],
    ['MaintenanceScreen', () => require('../../../src/screens/MaintenanceScreen').default],
    ['ForceUpgradeScreen', () => require('../../../src/screens/ForceUpgradeScreen').default],
    ['SignInScreen', () => require('../../../src/screens/SignInScreen').default],
    ['OnboardingNameScreen', () => require('../../../src/screens/OnboardingNameScreen').default],
    ['BeginnerProgramScreen', () => require('../../../src/screens/BeginnerProgramScreen').default],
    ['SettingsScreen', () => require('../../../src/screens/SettingsScreen').default],
    ['ChangeCoachScreen', () => require('../../../src/screens/ChangeCoachScreen').default],
    ['FeedbackScreen', () => require('../../../src/screens/FeedbackScreen').default],
    ['NotificationsScreen', () => require('../../../src/screens/NotificationsScreen').default],
    ['PaywallScreen', () => require('../../../src/screens/PaywallScreen').default],
  ];

  for (const [name, load] of STATIC_SCREENS) {
    it(`${name} mounts`, () => {
      const Screen = load();
      expect(Screen).toBeDefined();
      expect(() => renderScreen(Screen)).not.toThrow();
    });
  }

  // Screens that take a route param — pass enough of one to mount.
  it('ActivityDetailScreen mounts with an activityId', () => {
    const Screen = require('../../../src/screens/ActivityDetailScreen').default;
    expect(() => renderScreen(Screen, { route: { params: { activityId: 'a-1' } } })).not.toThrow();
  });

  it('CoachChatScreen mounts in plan-scope', () => {
    const Screen = require('../../../src/screens/CoachChatScreen').default;
    expect(() => renderScreen(Screen, { route: { params: {} } })).not.toThrow();
  });

  it('WeekViewScreen mounts', () => {
    const Screen = require('../../../src/screens/WeekViewScreen').default;
    expect(() => renderScreen(Screen, { route: { params: { weekNum: 1 } } })).not.toThrow();
  });

  it('PlanOverviewScreen mounts', () => {
    const Screen = require('../../../src/screens/PlanOverviewScreen').default;
    expect(() => renderScreen(Screen)).not.toThrow();
  });

  it('PlanPickerScreen mounts', () => {
    const Screen = require('../../../src/screens/PlanPickerScreen').default;
    expect(() => renderScreen(Screen)).not.toThrow();
  });

  it('GoalSetupScreen mounts', () => {
    const Screen = require('../../../src/screens/GoalSetupScreen').default;
    expect(() => renderScreen(Screen)).not.toThrow();
  });

  it('PlanConfigScreen mounts when given a seeded goal', () => {
    const Screen = require('../../../src/screens/PlanConfigScreen').default;
    // The screen reads goal.targetDate during initial render via
    // recommended-start logic. We pass the seeded goal directly via
    // route params so the screen has something to chew on.
    const goal = storage.__get().goals[0];
    expect(() => renderScreen(Screen, {
      route: { params: { goalId: 'goal-1', goal } },
    })).not.toThrow();
  });
});
