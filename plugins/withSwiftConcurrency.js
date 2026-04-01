/**
 * Expo config plugin that fixes two iOS build issues:
 *
 * 1. Swift 6 strict concurrency — Xcode 16.3+ / 26+ rejects the concurrency
 *    annotations emitted by Expo & RN native modules. We set
 *    SWIFT_STRICT_CONCURRENCY = minimal to downgrade errors to warnings.
 *
 * 2. folly/coro/Coroutine.h not found — React Native 0.83.x ships prebuilt
 *    Folly binaries that do NOT include the coroutine headers. Newer Xcode
 *    toolchains define __cpp_impl_coroutine which makes FOLLY_HAS_COROUTINES
 *    evaluate to 1, causing Expected.h to #include a header that doesn't
 *    exist. We force FOLLY_HAS_COROUTINES=0 via preprocessor definitions.
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

      // ── Swift 6 strict concurrency ──
      entry.buildSettings.SWIFT_STRICT_CONCURRENCY = '"minimal"';

      // ── Folly coroutine fix ──
      // Inject FOLLY_HAS_COROUTINES=0 into GCC_PREPROCESSOR_DEFINITIONS so
      // the prebuilt Folly headers never try to #include coro/Coroutine.h.
      const defs = entry.buildSettings.GCC_PREPROCESSOR_DEFINITIONS;
      const follyFlag = '"FOLLY_HAS_COROUTINES=0"';

      if (!defs) {
        // No existing definitions — create the array
        entry.buildSettings.GCC_PREPROCESSOR_DEFINITIONS = [
          '"$(inherited)"',
          follyFlag,
        ];
      } else if (Array.isArray(defs)) {
        if (!defs.some((d) => d.includes('FOLLY_HAS_COROUTINES'))) {
          defs.push(follyFlag);
        }
      } else if (typeof defs === 'string') {
        if (!defs.includes('FOLLY_HAS_COROUTINES')) {
          entry.buildSettings.GCC_PREPROCESSOR_DEFINITIONS = [
            defs,
            follyFlag,
          ];
        }
      }
    }

    return cfg;
  });
}

module.exports = withSwiftConcurrency;
