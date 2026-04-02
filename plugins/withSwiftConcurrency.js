/**
 * Expo config plugin that fixes two iOS build issues with React Native 0.83.x
 * prebuilt dependencies by patching the Podfile post_install block:
 *
 * 1. folly/coro/Coroutine.h not found — The prebuilt Folly omits coroutine
 *    headers, but some pod targets (e.g. RNSentry) don't receive the
 *    -DFOLLY_CFG_NO_COROUTINES=1 flag that core RN pods get. We propagate
 *    this flag to ALL pod targets via OTHER_CPLUSPLUSFLAGS.
 *
 * 2. Swift 6 strict concurrency (future-proofing) — Sets
 *    SWIFT_STRICT_CONCURRENCY = minimal in case the build image upgrades.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PATCH_MARKER = '# [withFollyCoroutineFix]';

const PODFILE_SNIPPET = `
${PATCH_MARKER} Patched by plugins/withSwiftConcurrency.js
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        # Propagate FOLLY_CFG_NO_COROUTINES=1 to ALL pod targets.
        # Core RN pods already have this in their podspec, but third-party
        # pods (like RNSentry) don't, which causes folly/coro/Coroutine.h
        # not found errors when Expected.h is transitively included.
        cxx = config.build_settings['OTHER_CPLUSPLUSFLAGS'] || ['$(inherited)']
        cxx = [cxx] if cxx.is_a?(String)
        unless cxx.any? { |f| f.include?('FOLLY_CFG_NO_COROUTINES') }
          cxx << '-DFOLLY_CFG_NO_COROUTINES=1'
        end
        config.build_settings['OTHER_CPLUSPLUSFLAGS'] = cxx
      end
    end`;

function withSwiftConcurrency(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const podfilePath = path.join(iosRoot, 'Podfile');

      if (!fs.existsSync(podfilePath)) {
        return cfg;
      }

      let podfile = fs.readFileSync(podfilePath, 'utf8');

      // Don't double-patch
      if (podfile.includes(PATCH_MARKER)) {
        return cfg;
      }

      // Find the react_native_post_install call and inject after it
      const postInstallHook = 'react_native_post_install(';
      const hookIndex = podfile.indexOf(postInstallHook);

      if (hookIndex === -1) {
        const fallbackPattern = /(\s+end\s*\nend\s*)$/;
        podfile = podfile.replace(fallbackPattern, `\n${PODFILE_SNIPPET}\n$1`);
      } else {
        let insertPos = hookIndex;
        let depth = 0;
        for (let i = hookIndex; i < podfile.length; i++) {
          if (podfile[i] === '(') depth++;
          if (podfile[i] === ')') {
            depth--;
            if (depth === 0) {
              insertPos = podfile.indexOf('\n', i);
              if (insertPos === -1) insertPos = podfile.length;
              break;
            }
          }
        }

        podfile =
          podfile.slice(0, insertPos) +
          '\n' +
          PODFILE_SNIPPET +
          podfile.slice(insertPos);
      }

      fs.writeFileSync(podfilePath, podfile, 'utf8');
      return cfg;
    },
  ]);
}

module.exports = withSwiftConcurrency;
