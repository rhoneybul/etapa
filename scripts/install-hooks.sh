#!/usr/bin/env bash
# Point this repo's git at the tracked hooks in .githooks/ instead of the
# default (gitignored) .git/hooks/. Run once after cloning.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

git config core.hooksPath .githooks
chmod +x .githooks/*

echo "✓ Pre-commit hooks installed."
echo "  Bypass for emergencies: git commit --no-verify"
