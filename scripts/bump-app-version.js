#!/usr/bin/env node
/**
 * Bumps the app version in app.json (source of truth for Expo).
 *
 * Usage:
 *   node scripts/bump-app-version.js patch      # 0.95.11 → 0.95.12
 *   node scripts/bump-app-version.js minor      # 0.95.11 → 0.96.0
 *   node scripts/bump-app-version.js major      # 0.95.11 → 1.0.0
 *   node scripts/bump-app-version.js none       # print current version, no changes
 *   node scripts/bump-app-version.js 0.96.0     # set to exact version (tag-driven releases)
 *
 * Outputs the resulting version to stdout so CI can capture it:
 *   NEW_VERSION=$(node scripts/bump-app-version.js patch)
 *
 * Note: we do NOT bump ios.buildNumber or android.versionCode here —
 * eas.json has `autoIncrement: true` on every profile, so EAS Build
 * handles those automatically on each build.
 */
const fs = require('fs');
const path = require('path');

const ARG = (process.argv[2] || '').toLowerCase();
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const isExplicit = SEMVER_RE.test(ARG);

if (!['patch', 'minor', 'major', 'none'].includes(ARG) && !isExplicit) {
  console.error(
    `Usage: node ${path.basename(__filename)} patch|minor|major|none|<explicit-version>\n` +
    `  Examples: patch  |  minor  |  none  |  0.96.0`
  );
  process.exit(1);
}

const APP_JSON = path.join(__dirname, '..', 'app.json');
const app = JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));

const current = app.expo.version;
const match = current.match(SEMVER_RE);
if (!match) {
  console.error(`Unexpected version format in app.json: ${current}`);
  process.exit(1);
}

let next;

if (isExplicit) {
  // Explicit version (e.g. from a tag like app-v0.96.0)
  next = ARG;
} else {
  let [, maj, min, pat] = match.map(Number);
  if (ARG === 'patch') pat += 1;
  else if (ARG === 'minor') { min += 1; pat = 0; }
  else if (ARG === 'major') { maj += 1; min = 0; pat = 0; }
  // 'none' = no change
  next = `${maj}.${min}.${pat}`;
}

app.expo.version = next;

// Only write the file if the version actually changed
if (next !== current) {
  fs.writeFileSync(APP_JSON, JSON.stringify(app, null, 2) + '\n');
}

// Machine-readable output for CI
process.stdout.write(next);
