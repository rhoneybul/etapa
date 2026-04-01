/**
 * Expo config plugin — set SWIFT_STRICT_CONCURRENCY = minimal for every
 * native target so that Xcode 16.3+ (Swift 6) doesn't reject the
 * concurrency annotations emitted by Expo / RN native modules.
 *
 * Also forces C++20 coroutine flags that Folly needs, preventing the
 * 'folly/coro/Coroutine.h file not found' build error.
 */
const {
  withXcodeProject,
} = require('@expo/config-plugins');

function withSwiftConcurrency(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const xcBuildConfigs = project.hash.project.objects.XCBuildConfiguration;

    for (const key of Object.keys(xcBuildConfigs)) {
      const entry = xcBuildConfigs[key];
      if (typeof entry !== 'object' || !entry.buildSettings) continue;

      // Disable Swift 6 strict concurrency checking
      // Values must be quoted — the pbxproj parser (Nanaimo) rejects bare
      // tokens that contain special characters like '+'.
      entry.buildSettings.SWIFT_STRICT_CONCURRENCY = '"minimal"';

      // Ensure C++ dialect supports coroutines (Folly requirement)
      const cxxStd = entry.buildSettings.CLANG_CXX_LANGUAGE_STANDARD;
      if (
        cxxStd === undefined ||
        cxxStd === '"c++17"' ||
        cxxStd === 'c++17'
      ) {
        entry.buildSettings.CLANG_CXX_LANGUAGE_STANDARD = '"c++20"';
      }
    }

    return cfg;
  });
}

module.exports = withSwiftConcurrency;
