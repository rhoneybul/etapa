/**
 * Version adaptation helper.
 *
 * See REMOTE_FIRST_CHECKLIST.md §"Version adaptation — when it's actually
 * needed". Most config changes don't need this — adding fields is always
 * safe. But when a shape change is unavoidable, use this helper to gate
 * the new shape behind a minimum client version so old apps continue to
 * receive the legacy shape they know how to parse.
 *
 * Clients send X-App-Version on every /api/app-config request. The
 * helper parses that header and compares against a minimum using the
 * standard X.Y.Z semver rules.
 *
 *   const { atLeast, parseVersion } = require('./versionAdapt');
 *
 *   if (atLeast(req.headers['x-app-version'], '1.5.0')) {
 *     payload.coaches = groupedCoachesShape;     // new clients
 *   } else {
 *     payload.coaches = flatLegacyShape;         // old clients — don't break
 *   }
 *
 * Zero-cost when not used. Adding gates is opt-in.
 */

/**
 * Parse a version string like "1.5.3" or "1.5.3-beta.2" into
 * { major, minor, patch } numbers. Pre-release suffixes are dropped.
 *
 * Returns null when the input is not parseable — callers should treat null
 * as "unknown client, assume newest shape is fine" OR "unknown client,
 * fall back to legacy shape" depending on how pessimistic they want to be.
 * The atLeast helper below treats null as "assume modern" because most
 * unknown clients hitting the endpoint are our own admin dashboard or the
 * testing harness.
 */
function parseVersion(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  // Strip leading "v" and any pre-release / build suffix.
  const core = trimmed.replace(/^v/i, '').split(/[-+]/)[0];
  const parts = core.split('.');
  if (parts.length < 1) return null;
  const toNum = (x) => {
    const n = Number(x);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const major = toNum(parts[0]);
  const minor = parts[1] != null ? toNum(parts[1]) : 0;
  const patch = parts[2] != null ? toNum(parts[2]) : 0;
  if (major == null || minor == null || patch == null) return null;
  return { major, minor, patch };
}

/**
 * Compare two parsed versions. Returns:
 *   -1 if a < b
 *    0 if a == b
 *    1 if a > b
 */
function compareVersions(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

/**
 * atLeast('1.5.3', '1.5.0') → true
 * atLeast('1.4.9', '1.5.0') → false
 * atLeast(undefined, '1.5.0') → true  (unknown client — assume modern)
 * atLeast('garbage', '1.5.0') → true  (unparseable — assume modern)
 *
 * The optimistic-on-unknown default is deliberate: most sources of "unknown"
 * clients are our own tooling (admin dashboard, test harness, curl debug)
 * and we want them to see the current shape. If a bad actor wants to spoof
 * an ancient X-App-Version they can — but they already have the whole public
 * payload, so no security benefit to hiding new shapes from them.
 */
function atLeast(versionHeader, minVersion) {
  const parsed = parseVersion(versionHeader);
  if (!parsed) return true;  // unknown → optimistic
  const min = parseVersion(minVersion);
  if (!min) return true;     // we mis-specified the minimum → don't gate
  return compareVersions(parsed, min) >= 0;
}

/**
 * Convenience: returns true if the client version is BELOW the given
 * minimum. Useful for conditions like "force-upgrade required".
 */
function below(versionHeader, minVersion) {
  const parsed = parseVersion(versionHeader);
  if (!parsed) return false;
  const min = parseVersion(minVersion);
  if (!min) return false;
  return compareVersions(parsed, min) < 0;
}

module.exports = {
  parseVersion,
  compareVersions,
  atLeast,
  below,
};
