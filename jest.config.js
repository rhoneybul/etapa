/**
 * Jest configuration for the mobile app (UI / interaction tests).
 *
 * What this covers:
 *   - React Native + Expo screens and components in src/screens, src/components
 *   - Utility hooks and functions that import RN at the module level
 *
 * Lives alongside the existing /tests/*.test.js plain-Node suites — those
 * keep running via the top-level `npm test` script and exercise pure
 * server libraries (rideTips, slack, workoutExport, etc.). Anything
 * that needs RN or JSX rendering should land in __tests__/mobile/ and
 * be picked up by THIS config.
 *
 * Runner: jest-expo preset. Handles the RN + Expo transforms and ships
 * sensible mocks for native-module-heavy bits out of the box.
 */
module.exports = {
  preset: 'jest-expo',

  // We keep the existing tests/ folder for plain-Node tests and put
  // RN-aware tests under __tests__/mobile/ so the two worlds don't
  // collide. tests/*.test.js is intentionally NOT picked up here —
  // those are run by `node tests/foo.test.js` from the top-level
  // `test` script.
  testMatch: ['<rootDir>/__tests__/mobile/**/*.test.{js,jsx}'],

  setupFiles: ['<rootDir>/jest.setup.js'],

  // Extend jest-expo's default transformIgnorePatterns rather than
  // replacing it (the preset's pattern is the known-good baseline —
  // our additions are the few packages it doesn't pre-allowlist).
  // Pattern shape mirrors jest-expo's exactly: `/node_modules/` + a
  // negative lookahead alt-list with NO trailing slash inside the
  // group, so prefix matching works for nested packages like
  // expo-modules-core.
  transformIgnorePatterns: [
    '/node_modules/(?!' +
      '(' +
        '\\.pnpm|' +
        'react-native|@react-native|@react-native-community|' +
        'expo|@expo|@expo-google-fonts|' +
        'react-navigation|@react-navigation|' +
        '@sentry/react-native|native-base|' +
        // App-specific extras below — packages that ship untranspiled
        // ESM and aren't covered by jest-expo's default whitelist.
        'react-native-sse|' +
        'react-native-purchases|' +
        'react-native-svg|' +
        'posthog-react-native|' +
        '@react-native-async-storage' +
      ')' +
      ')',
    '/node_modules/react-native-reanimated/plugin/',
  ],

  testTimeout: 10000,
  verbose: false,
  clearMocks: true,
};
