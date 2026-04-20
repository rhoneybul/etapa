#!/usr/bin/env bash
# Quick manual deploy of the Etapa MCP to Railway (for when you don't want to
# push to main and wait for the GitHub integration to pick it up).
#
# Run from the mcp-server folder:  ./scripts/railway-deploy.sh
set -euo pipefail

SERVICE_NAME="${RAILWAY_SERVICE:-etapa-mcp}"

if ! command -v railway &> /dev/null; then
  echo "✗ Railway CLI not installed. Run ./scripts/railway-setup.sh first." >&2
  exit 1
fi

if ! railway whoami &> /dev/null; then
  echo "✗ Not logged in. Run: railway login" >&2
  exit 1
fi

echo "→ Deploying to service: $SERVICE_NAME"
railway up --service "$SERVICE_NAME"
echo "✓ Deploy complete"
