# Mobile UX testing — work-in-progress handoff

This branch (`mobile-ux-tests`) stands up Jest + React Native Testing
Library for the Expo app, with all native modules and our own services
mocked. It runs on a Linux GitHub Actions runner (no simulator), so a
full pass takes seconds.

The scaffold is in place and one component test passes cleanly. The
broader smoke suite hangs intermittently — almost certainly because
several screens kick off background polling loops (setInterval,
`await ...` chains) that don't unmount cleanly inside Jest's fake
runtime. Resolving that, plus writing the key-flow tests, is the open
work.

## What's done

- **Deps installed** — `jest@^29`, `jest-expo@~55.0.0`,
  `@testing-library/react-native@^13`, `react-test-renderer@^19`.
  Already in `package.json` devDependencies.
- **Jest config** — `jest.config.js` at repo root. Uses jest-expo
  preset, extended `transformIgnorePatterns` for the few packages the
  preset doesn't whitelist (`react-native-sse`, `react-native-purchases`,
  `posthog-react-native`, `@react-native-async-storage`).
- **Global setup** — `jest.setup.js` mocks: AsyncStorage,
  RevenueCat, PostHog, Sentry, expo-notifications, expo-store-review,
  expo-linking, expo-web-browser, expo-clipboard, expo-image-picker,
  expo-image-manipulator, expo-file-system, expo-apple-authentication,
  expo-crypto, expo-device, expo-updates, expo-splash-screen,
  expo-font, @expo-google-fonts/poppins, @expo/vector-icons,
  react-native-sse, react-native-gesture-handler,
  react-native-safe-area-context, @supabase/supabase-js.
- **Service mocks** — manual mocks live in `src/services/__mocks__/`
  and mirror the real export surface. Files: `api.js`,
  `storageService.js` (with `__seed`/`__reset` helpers backed by an
  in-memory store), `llmPlanService.js`, `authService.js`,
  `revenueCatService.js`, `notificationService.js`, `stravaService.js`,
  `analyticsService.js`, `subscriptionService.js`, `remoteConfig.js`,
  `useRemoteConfig.js`.
- **Test helper** — `__tests__/mobile/test-utils.js` exposes
  `renderScreen(Component, { route, navigation, props })` (wraps in
  `NavigationContainer`, supplies a fake `navigation` prop with all
  the methods stubbed) and `seedPlan({ activities, goal, planConfig })`
  for storage seeding.
- **Component test (passing)** — `__tests__/mobile/components/BikeSwapModal.test.js`.
  Three cases: renders target label + body copy, returns null when
  not visible, fires `onApply` with the new `bikeType` on confirm. Use
  this as the working template.
- **Smoke test scaffold (partial)** — `__tests__/mobile/screens/smoke.test.js`.
  19 cases covering Welcome / About / Maintenance / ForceUpgrade /
  SignIn / OnboardingName / BeginnerProgram / Settings / ChangeCoach /
  Feedback / Notifications / Paywall / ActivityDetail / CoachChat /
  WeekView / PlanOverview / PlanPicker / GoalSetup / PlanConfig.
  **At last run: ~15 passed, ~4 failed and the suite intermittently
  hangs on the full-suite run.**

## Open issues to resolve

1. **Suite-level hang.** `npx jest __tests__/mobile/screens/smoke.test.js`
   times out (>30s) on the full-suite run, even when individual cases
   pass quickly. Probable causes:
   - Screens with `setInterval` (e.g. PlanLoadingScreen polling job
     status, CoachChatScreen polling chat-job, NotificationsScreen
     unread-count poll) keep timers alive after unmount because RNTL
     calls `unmount()` after each test but Jest's fake timers aren't
     enabled.
   - Effects that fire `await api.foo()` without cancellation can hold
     pending promises through teardown.
   - Fix likely: add `jest.useFakeTimers()` + `afterEach(() => jest.runOnlyPendingTimers())`
     in `jest.setup.js`, or call `cleanup()` from RNTL explicitly. May
     also need `--detectOpenHandles` to find the offender.
2. **Remaining smoke failures.** When last run individually:
   - `SignInScreen`: `_remoteConfig.default.t is not a function` —
     the remote-config mock now exports `t`, so this should be
     resolved on next run. Confirm.
   - `SettingsScreen`: needed `getPrices`, `isStravaConnected` — both
     added to the mocks. Confirm.
   - `PaywallScreen`, `CoachChatScreen`, `PlanOverviewScreen`,
     `PlanConfigScreen`: needed `remoteConfig.getJson` — added.
     Confirm.
3. **Key-flow tests not yet written.** See task list below — eight to
   ten interaction-driven tests, mostly regression-flavoured (one per
   recent bug-fix commit where the surface is testable in isolation).
4. **CI workflow not yet added.** `.github/workflows/mobile-tests.yml`
   needs to land. Should run on PR + push to main, Linux runner,
   `npm ci` + `npm run test:mobile`. Don't touch the existing Maestro
   workflow.

## Pending tasks (from the in-flight task list)

- **#78** Smoke tests — every screen renders without crashing.
  Currently in-progress; finish the suite once #1 above is resolved.
- **#79** Key flow tests (8-10):
  - Multi-bike onboarding select (regression: "checkmarks didn't
    look multi-select").
  - PlanPicker keyboard avoidance on the longest-ride custom-km
    field.
  - CheckInScreen submit happy path + empty-submission guard.
  - CheckInScreen crisis screening (free-text → resources card, no
    suggestions call).
  - CheckInScreen draft persistence (navigate away → come back,
    fields prefilled from AsyncStorage).
  - ActivityDetail "Show ride tips" → calls `explainTips` → renders;
    failure path falls back to deterministic.
  - ExportInstructionsModal — picker selection drives copy, "don't
    show again" toggle persists.
  - CoachChat session-scope payload includes `tips` + `structure`.
  - HomeScreen unread filter — session-scoped notifications excluded
    from chip count (regression #34).
  - Activity completion toggle — tap circle → spinner → updated UI.
- **#80** Add `mobile-tests.yml` GH Actions workflow (Linux,
  ubuntu-latest, node 20, `npm ci` + `npm run test:mobile`).
- **#81** Run the suite, iterate until green.
- **#82** Document coverage gaps in `tests/MOBILE_TESTS.md`. See
  "What's intentionally not tested" below as the seed.

## What's intentionally not tested (flag these in the gaps doc)

- Strava OAuth (mocked at the service boundary).
- RevenueCat purchase flow (mocked).
- Real push notifications (mocked).
- Apple Sign In (mocked — needs an Apple device in CI).
- OTA update flow / `expo-updates` (mocked).
- Maestro E2E flows (left as-is in `.github/workflows/test-e2e.yml`).
- Visual regression / screenshot diffs (no snapshot tooling).
- Performance / startup time.
- Real device behaviour (gestures, real keyboard, system share sheet).
- Backend integration (always mocked at the api.js / llmPlanService.js
  boundary — server tests live separately under `tests/` and `server/`).

## Running locally

```bash
# Once
npm install

# Single component test (works today)
npx jest --config jest.config.js __tests__/mobile/components/BikeSwapModal.test.js

# Full mobile suite (currently hangs — see open issues)
npm run test:mobile

# Watch mode
npm run test:mobile:watch
```

## Handoff prompt

Use this verbatim to resume the work in a new session:

> I'm picking up the mobile UX test scaffold on the `mobile-ux-tests`
> branch. The scaffold (Jest + RNTL + jest-expo) is already in place
> with all native modules and our own services mocked under
> `src/services/__mocks__/`, and one component test
> (`__tests__/mobile/components/BikeSwapModal.test.js`) passes
> cleanly. The smoke suite at `__tests__/mobile/screens/smoke.test.js`
> hangs on the full-suite run — almost certainly because some screens
> (PlanLoadingScreen, CoachChatScreen, NotificationsScreen) start
> background `setInterval` polling that doesn't unmount cleanly under
> Jest's real-timers default. Read `automated-testing.md` for full
> context.
>
> Please finish the work in this order:
>
> 1. Fix the suite-level hang. Add `jest.useFakeTimers({ legacyFakeTimers: false })`
>    plus `afterEach(() => { jest.clearAllTimers(); })` to
>    `jest.setup.js`, run with `--detectOpenHandles` to surface any
>    remaining offender, and patch the mocks until the smoke suite
>    completes in under 15 seconds.
> 2. Confirm all 19 smoke tests pass. Add or skip individual cases
>    that need extra wiring (annotated with a comment explaining why).
> 3. Write the eight to ten key-flow tests listed under "Pending
>    tasks" → "#79" in `automated-testing.md`. One per file under
>    `__tests__/mobile/flows/`. Each should be regression-flavoured —
>    name the bug or commit it covers in the file's docstring.
>    Constraints: use `renderScreen` from
>    `__tests__/mobile/test-utils.js`; mock services via the existing
>    manual mocks (override per-test with
>    `require('../../../src/services/api').default.X.mockResolvedValueOnce(...)`).
> 4. Add `.github/workflows/mobile-tests.yml`. Trigger on PR + push to
>    main, ubuntu-latest, node 20, `npm ci`, `npm run test:mobile`.
>    Don't touch the existing Maestro workflow at
>    `.github/workflows/test-e2e.yml`.
> 5. Add `tests/MOBILE_TESTS.md` documenting what's covered and
>    what's intentionally not — use the "What's intentionally not
>    tested" section in `automated-testing.md` as the seed.
> 6. Run `npm run test:mobile` and `npm test` to confirm both old and
>    new suites pass. Commit with a clear message and provide a
>    `git push` line.
>
> Please ask me before changing any production code in `src/screens/`
> or `src/components/` — the goal is to test what's there, not refactor
> it. If a screen really can't be tested without a refactor, flag it
> as an "intentionally skipped" smoke case with a docstring pointing
> at the issue.

## Files added on this branch

- `jest.config.js` (new)
- `jest.setup.js` (new)
- `automated-testing.md` (this file)
- `package.json` — added `jest`, `jest-expo`, `@testing-library/react-native`,
  `@testing-library/jest-native`, `react-test-renderer` to devDependencies;
  added `test:mobile`, `test:mobile:watch` scripts
- `package-lock.json` — regenerated
- `__tests__/mobile/test-utils.js`
- `__tests__/mobile/components/BikeSwapModal.test.js`
- `__tests__/mobile/screens/smoke.test.js`
- `src/services/__mocks__/api.js`
- `src/services/__mocks__/storageService.js`
- `src/services/__mocks__/llmPlanService.js`
- `src/services/__mocks__/authService.js`
- `src/services/__mocks__/revenueCatService.js`
- `src/services/__mocks__/notificationService.js`
- `src/services/__mocks__/stravaService.js`
- `src/services/__mocks__/analyticsService.js`
- `src/services/__mocks__/subscriptionService.js`
- `src/services/__mocks__/remoteConfig.js`
- `src/services/__mocks__/useRemoteConfig.js`
