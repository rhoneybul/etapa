#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Etapa MCP — one-shot Railway setup via the Railway CLI.
#
# What it does (idempotent — safe to re-run):
#   1. Installs the Railway CLI if missing
#   2. Logs you in if needed
#   3. Links this folder to a Railway project (creates a new one if you want)
#   4. Creates/ensures an `etapa-mcp` service
#   5. Sets the required env vars (prompts only for ones not already set)
#   6. Generates a public domain
#   7. Deploys
#   8. Prints the URL + a ready-to-paste Claude Desktop config snippet
#
# Prereqs: curl, and either a Railway account or willingness to create one.
# Run from the mcp-server folder:   ./scripts/railway-setup.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${BLUE}→${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
error() { echo -e "${RED}✗${NC} $*" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$MCP_DIR"

# ── 1. Ensure Railway CLI ────────────────────────────────────────────────────
if ! command -v railway &> /dev/null; then
  info "Railway CLI not found. Installing..."
  if command -v brew &> /dev/null; then
    brew install railway
  else
    # Cross-platform installer from Railway
    curl -fsSL https://railway.com/install.sh | sh
    export PATH="$HOME/.railway/bin:$PATH"
  fi
  ok "Railway CLI installed"
else
  ok "Railway CLI found: $(railway --version)"
fi

# ── 2. Login ─────────────────────────────────────────────────────────────────
if ! railway whoami &> /dev/null; then
  info "Logging in to Railway (a browser window will open)..."
  railway login
else
  ok "Already logged in as: $(railway whoami)"
fi

# ── 3. Link to a project ─────────────────────────────────────────────────────
if [ ! -f ".railway/config.json" ] && [ ! -f "../.railway/config.json" ]; then
  info "This folder isn't linked to a Railway project yet."
  echo "    Pick an option:"
  echo "      1) Link to an EXISTING project (your main Etapa project is a good choice)"
  echo "      2) Create a NEW project for the MCP"
  read -r -p "    Enter 1 or 2: " choice

  case "$choice" in
    1) railway link ;;
    2)
      read -r -p "    Project name [etapa-mcp]: " PROJECT_NAME
      PROJECT_NAME="${PROJECT_NAME:-etapa-mcp}"
      railway init --name "$PROJECT_NAME"
      ;;
    *) error "Invalid choice"; exit 1 ;;
  esac
  ok "Project linked"
else
  ok "Already linked to a Railway project"
fi

# ── 4. Ensure an 'etapa-mcp' service exists ──────────────────────────────────
SERVICE_NAME="etapa-mcp"
info "Ensuring service '$SERVICE_NAME' exists..."
# `railway service` lists services; if not found, `railway add --service` creates it
if ! railway service 2>/dev/null | grep -q "$SERVICE_NAME"; then
  railway add --service "$SERVICE_NAME" --variables "ETAPA_API_URL=https://etapa.up.railway.app" || {
    warn "Could not auto-create service via CLI. Create it in the Railway dashboard with Root Directory = /mcp-server, then re-run."
  }
fi
railway service "$SERVICE_NAME" 2>/dev/null || true
ok "Service ready: $SERVICE_NAME"

# ── 5. Set env vars (only if not already set) ────────────────────────────────
info "Setting environment variables..."
set_var_if_missing() {
  local key="$1" default="$2" prompt="$3"
  local current
  current=$(railway variables --service "$SERVICE_NAME" --kv 2>/dev/null | grep "^${key}=" | cut -d= -f2- || true)
  if [ -z "$current" ]; then
    if [ -n "$prompt" ]; then
      read -r -p "    $prompt [$default]: " value
      value="${value:-$default}"
    else
      value="$default"
    fi
    if [ -n "$value" ]; then
      railway variables --service "$SERVICE_NAME" --set "${key}=${value}" > /dev/null
      ok "Set $key"
    fi
  else
    ok "$key already set"
  fi
}

set_var_if_missing "ETAPA_API_URL" "https://etapa.up.railway.app" "Etapa API URL"
set_var_if_missing "MCP_AUTH_TOKEN" "" "Optional bearer token (leave empty for public MCP)"
set_var_if_missing "NODE_ENV" "production" ""

# ── 6. Generate a public domain ──────────────────────────────────────────────
info "Generating a public domain..."
DOMAIN_OUTPUT=$(railway domain --service "$SERVICE_NAME" 2>&1 || true)
DOMAIN=$(echo "$DOMAIN_OUTPUT" | grep -oE 'https?://[a-zA-Z0-9.-]+' | head -1)

if [ -z "$DOMAIN" ]; then
  warn "Could not auto-generate a domain. Open the Railway dashboard → Settings → Networking → Generate Domain."
else
  ok "Public domain: $DOMAIN"
fi

# ── 7. Deploy ────────────────────────────────────────────────────────────────
info "Deploying..."
railway up --service "$SERVICE_NAME" --detach
ok "Deployment triggered (it runs async — watch 'railway logs' to follow)"

# ── 8. Print the result ──────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}   Etapa MCP is deploying!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
if [ -n "$DOMAIN" ]; then
  echo "  URL:        $DOMAIN"
  echo "  Health:     $DOMAIN/health"
  echo "  MCP:        ${DOMAIN}/mcp"
fi
echo "  Logs:       railway logs --service $SERVICE_NAME"
echo "  Dashboard:  railway open"
echo ""
echo "  Add this to your Claude Desktop config to use the hosted MCP:"
echo ""
cat <<EOF
  {
    "mcpServers": {
      "etapa": {
        "command": "npx",
        "args": ["-y", "mcp-remote", "${DOMAIN:-https://YOUR-MCP.up.railway.app}/mcp"]
      }
    }
  }
EOF
echo ""
