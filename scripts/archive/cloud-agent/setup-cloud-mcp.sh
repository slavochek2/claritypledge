#!/bin/bash
# Setup Playwright MCP and dependencies on the cloud agent VM
# Run this once after VM is created or reset

set -e

VM_NAME="clarity-agent"
ZONE="us-central1-a"
PROJECT_DIR="claritypledge"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Load gcloud
source "$(brew --prefix)/share/google-cloud-sdk/path.zsh.inc" 2>/dev/null || true

echo -e "${BLUE}☁️  Setting up Playwright MCP on cloud agent...${NC}"
echo ""

# Step 1: Install Node.js dependencies and Playwright
echo "1. Installing Playwright and browsers..."
gcloud compute ssh $VM_NAME --zone=$ZONE --tunnel-through-iap --command="
    cd ~/$PROJECT_DIR
    
    # Ensure we have latest npm packages
    npm install
    
    # Install Playwright as a dev dependency if not present
    npm install -D @playwright/test
    
    # Install Chromium browser for Playwright
    npx playwright install chromium
    
    # Install system dependencies for Playwright (headless browser)
    sudo npx playwright install-deps chromium
"

echo ""
echo "2. Configuring Playwright MCP for Claude Code..."
gcloud compute ssh $VM_NAME --zone=$ZONE --tunnel-through-iap --command="
    cd ~/$PROJECT_DIR
    
    # Add Playwright MCP to Claude Code using @playwright/mcp (official package)
    # Uses npx so it downloads on demand, no global install needed
    claude mcp add playwright --transport stdio -- npx @playwright/mcp --headless
    
    echo ''
    echo 'Verifying MCP configuration...'
    claude mcp list
    
    echo ''
    echo 'Testing Playwright MCP connection...'
    claude mcp get playwright
"

echo ""
echo "3. Verifying installation..."
gcloud compute ssh $VM_NAME --zone=$ZONE --tunnel-through-iap --command="
    cd ~/$PROJECT_DIR
    
    echo 'Node version:'
    node --version
    
    echo ''
    echo 'Playwright version:'
    npx playwright --version
    
    echo ''
    echo 'Claude Code version:'
    claude --version 2>/dev/null || echo 'Claude CLI not found in PATH'
    
    echo ''
    echo 'MCP servers:'
    claude mcp list
"

echo ""
echo -e "${GREEN}✅ Playwright MCP setup complete!${NC}"
echo ""
echo "The cloud agent can now:"
echo "  - Take screenshots of web pages"
echo "  - Navigate and interact with browser"
echo "  - Run visual checks for /loop workflow"
echo ""
echo -e "${YELLOW}Note:${NC} The dev server must be running on the VM for UI checks."
echo "The /loop workflow will start the dev server automatically when needed."

