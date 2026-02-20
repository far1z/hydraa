#!/usr/bin/env bash
set -euo pipefail

# Hydraa post-install script
# Runs after `openclaw skill install hydraa`

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

success() { echo -e "${GREEN}  $1${NC}"; }
warn()    { echo -e "${YELLOW}  $1${NC}"; }
error()   { echo -e "${RED}  $1${NC}"; }
info()    { echo -e "${CYAN}  $1${NC}"; }

echo ""
echo -e "${CYAN}"
echo "  ██╗  ██╗██╗   ██╗██████╗ ██████╗  █████╗  █████╗ "
echo "  ██║  ██║╚██╗ ██╔╝██╔══██╗██╔══██╗██╔══██╗██╔══██╗"
echo "  ███████║ ╚████╔╝ ██║  ██║██████╔╝███████║███████║"
echo "  ██╔══██║  ╚██╔╝  ██║  ██║██╔══██╗██╔══██║██╔══██║"
echo "  ██║  ██║   ██║   ██████╔╝██║  ██║██║  ██║██║  ██║"
echo "  ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝"
echo -e "${NC}"
echo "  Post-install setup"
echo ""

# Check Node version
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/' || echo "0")
if [ "$NODE_MAJOR" -lt 22 ]; then
    error "Node 22+ is required. You have $(node -v 2>/dev/null || echo 'no Node installed')."
    error "Install Node 22+: https://nodejs.org"
    exit 1
fi
success "Node $(node -v) OK"

# Check if OpenClaw is installed
if ! command -v openclaw &>/dev/null; then
    warn "OpenClaw CLI not found in PATH."
    info "Hydraa is an OpenClaw skill. Install OpenClaw first: https://openclaw.org"
    info "Continuing setup anyway..."
else
    success "OpenClaw found"
fi

# Determine workspace
if [ -d "$HOME/.openclaw" ]; then
    WORKSPACE="$HOME/.openclaw"
elif [ -d ".openclaw" ]; then
    WORKSPACE="$(pwd)/.openclaw"
else
    WORKSPACE="$HOME/.openclaw"
    mkdir -p "$WORKSPACE"
    info "Created workspace: $WORKSPACE"
fi
success "Workspace: $WORKSPACE"

# Create Hydraa config directory
SKILL_DIR="$WORKSPACE/skills/hydraa"
mkdir -p "$SKILL_DIR"

# Generate Nostr keypair if config doesn't exist
CONFIG_FILE="$SKILL_DIR/config.yaml"
if [ ! -f "$CONFIG_FILE" ]; then
    info "Run 'hydraa init' to generate your Nostr keypair and config."
else
    success "Config already exists: $CONFIG_FILE"
fi

echo ""
echo -e "${BOLD}  Setup complete!${NC}"
echo ""
echo "  Next steps:"
echo "  ─────────────────────────────────────────────"
info "1. Initialize:                hydraa init"
info "2. Fund your AKT wallet:     hydraa fund"
info "3. Deploy to Akash:          hydraa deploy"
info "4. Check status:             hydraa status"
echo ""
info "Docs: https://github.com/openclaw/hydraa"
echo ""
