#!/usr/bin/env bash
# Usage:
#   ./scripts/release.sh          → bumps patch (0.7.2 → 0.7.3)
#   ./scripts/release.sh minor    → bumps minor (0.7.2 → 0.8.0)
#   ./scripts/release.sh major    → bumps major (0.7.2 → 1.0.0)
#
# app.json is the single source of truth for the version number.
# eas.json uses appVersionSource: "local" so EAS reads it directly.

set -e

BUMP=${1:-patch}
APP_JSON="$(cd "$(dirname "$0")/.." && pwd)/app.json"

# Read current version from app.json (single source of truth)
CURRENT=$(node -p "require('$APP_JSON').expo.version")
echo "Current version: $CURRENT"

# Split into parts
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
  *)
    echo "Unknown bump type '$BUMP'. Use: patch | minor | major"
    exit 1
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "New version:     $NEW_VERSION"

# Write new version into app.json
node -e "
  const fs = require('fs');
  const path = '$APP_JSON';
  const json = JSON.parse(fs.readFileSync(path, 'utf8'));
  json.expo.version = '$NEW_VERSION';
  fs.writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  console.log('app.json updated');
"

# Commit the bump
git add "$APP_JSON"
git commit -m "chore: bump version to $NEW_VERSION"

echo ""
echo "Building + submitting to TestFlight (iOS)"
echo ""

# Build and auto-submit to TestFlight
npx eas build --platform ios --profile production --auto-submit

echo ""
echo "Building + submitting to Play Store (Android)"
echo ""

# Build and auto-submit to Play Store
npx eas build --platform android --profile production --auto-submit

echo ""
echo "✅ Released $NEW_VERSION"
