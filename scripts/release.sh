#!/usr/bin/env bash
# Usage:
#   ./scripts/release.sh          → bumps patch (0.85.0 → 0.85.1)
#   ./scripts/release.sh minor    → bumps minor (0.85.0 → 0.86.0)
#   ./scripts/release.sh major    → bumps major (0.85.0 → 1.0.0)
#
# Fully automatic: app.json is the single source of truth.
# eas.json uses appVersionSource: "local" so EAS reads version from app.json.
# autoIncrement: true handles the build number automatically.
# No interactive prompts — just run and go.

set -e

BUMP=${1:-patch}
APP_JSON="$(cd "$(dirname "$0")/.." && pwd)/app.json"

# Read current version from app.json
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
echo "Building iOS + submitting to TestFlight..."
npx eas build --platform ios --profile production --auto-submit --non-interactive

echo ""
echo "Building Android + submitting to Play Store..."
npx eas build --platform android --profile production --auto-submit --non-interactive

echo ""
echo "✅ Released $NEW_VERSION"
