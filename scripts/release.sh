#!/usr/bin/env bash
# Usage:
#   ./scripts/release.sh           → bumps patch (0.94.0 → 0.94.1) + build numbers, build & submit
#   ./scripts/release.sh minor     → bumps minor (0.94.0 → 0.95.0) + build numbers, build & submit
#   ./scripts/release.sh major     → bumps major (0.94.0 → 1.0.0)  + build numbers, build & submit
#   ./scripts/release.sh build     → bumps build numbers only (versionCode + buildNumber),
#                                    no semver change, then build & submit both platforms.
#                                    Use this when you need to resubmit the same feature version.
#
# app.json is the single source of truth (eas.json: appVersionSource: "local").
# No interactive prompts — just run and go.

set -e

BUMP=${1:-patch}
APP_JSON="$(cd "$(dirname "$0")/.." && pwd)/app.json"

# Read current version from app.json
CURRENT=$(node -p "require('$APP_JSON').expo.version")

if [ "$BUMP" = "build" ]; then
  # ── Build-only bump: increment versionCode + buildNumber, keep semver ──────
  echo "Version: $CURRENT (no semver change)"

  node -e "
    const fs = require('fs');
    const path = '$APP_JSON';
    const json = JSON.parse(fs.readFileSync(path, 'utf8'));
    const oldVC = json.expo.android.versionCode || 0;
    json.expo.android.versionCode = oldVC + 1;
    const oldBN = parseInt(json.expo.ios.buildNumber || '0', 10);
    json.expo.ios.buildNumber = String(oldBN + 1);
    fs.writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
    console.log('app.json updated');
    console.log('  android.versionCode: ' + oldVC + ' → ' + json.expo.android.versionCode);
    console.log('  ios.buildNumber:     ' + oldBN + ' → ' + json.expo.ios.buildNumber);
  "

  git add "$APP_JSON"
  git commit -m "chore: bump build numbers (versionCode + buildNumber)"

else
  # ── Semver bump: also increments versionCode + buildNumber ─────────────────
  echo "Current version: $CURRENT"

  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

  case "$BUMP" in
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    patch) PATCH=$((PATCH + 1)) ;;
    *)
      echo "Unknown bump type '$BUMP'. Use: patch | minor | major | build"
      exit 1
      ;;
  esac

  NEW_VERSION="$MAJOR.$MINOR.$PATCH"
  echo "New version:     $NEW_VERSION"

  node -e "
    const fs = require('fs');
    const path = '$APP_JSON';
    const json = JSON.parse(fs.readFileSync(path, 'utf8'));
    json.expo.version = '$NEW_VERSION';
    const oldVC = json.expo.android.versionCode || 0;
    json.expo.android.versionCode = oldVC + 1;
    const oldBN = parseInt(json.expo.ios.buildNumber || '0', 10);
    json.expo.ios.buildNumber = String(oldBN + 1);
    fs.writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
    console.log('app.json updated');
    console.log('  android.versionCode: ' + oldVC + ' → ' + json.expo.android.versionCode);
    console.log('  ios.buildNumber:     ' + oldBN + ' → ' + json.expo.ios.buildNumber);
  "

  git add "$APP_JSON"
  git commit -m "chore: bump version to $NEW_VERSION"
fi

echo ""
echo "Building iOS + submitting to TestFlight..."
npx eas build --platform ios --profile production --auto-submit --non-interactive

echo ""
echo "Building Android + submitting to Play Store..."
npx eas build --platform android --profile production --auto-submit --non-interactive

echo ""
echo "✅ Done (version: $CURRENT)"
