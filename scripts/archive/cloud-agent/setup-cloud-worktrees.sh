#!/bin/bash
# Setup Cloud Worktrees - One-time setup of parallel worktrees on cloud VM
# Creates worktrees 1-3 for parallel agent execution

set -e

VM_NAME="clarity-agent"
ZONE="us-central1-a"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Load gcloud
source "$(brew --prefix)/share/google-cloud-sdk/path.zsh.inc" 2>/dev/null || true

echo -e "${BLUE}☁️  Setting up cloud worktrees...${NC}"
echo ""

gcloud compute ssh $VM_NAME --zone=$ZONE --tunnel-through-iap --command='
    cd ~/claritypledge || { echo "Error: ~/claritypledge not found"; exit 1; }

    echo "Creating worktrees 1-3..."
    echo ""

    for i in 1 2 3; do
        BRANCH="worktree-cloud-$i"
        DIR="../claritypledge-$i"

        if [ -d "$DIR" ]; then
            echo "✓ Worktree $i already exists at $DIR"
        else
            # Create worktree from main
            git worktree add "$DIR" -b "$BRANCH" main 2>/dev/null || \
            git worktree add "$DIR" "$BRANCH" 2>/dev/null || \
            { echo "Creating fresh branch..."; git worktree add "$DIR" -b "$BRANCH" HEAD; }
            echo "✓ Created worktree $i at $DIR on branch $BRANCH"
        fi
    done

    echo ""
    echo "All worktrees:"
    git worktree list

    echo ""
    echo "Linking environment variables..."
    for i in 1 2 3; do
        DIR="../claritypledge-$i"
        if [ -d "$DIR" ] && [ -f ~/claritypledge/.env.local ]; then
            ln -sf ~/claritypledge/.env.local "$DIR/.env.local"
            echo "  ✓ Linked .env.local to worktree-$i"
        fi
    done

    echo ""
    echo "Installing dependencies in each worktree..."
    for i in 1 2 3; do
        DIR="../claritypledge-$i"
        if [ -d "$DIR" ] && [ -f "$DIR/package.json" ]; then
            echo "  Installing in worktree-$i..."
            cd "$DIR" && npm install --silent 2>/dev/null
            cd ~/claritypledge
        fi
    done

    echo ""
    echo "✅ Cloud worktrees ready!"
' 2>/dev/null

echo ""
echo -e "${GREEN}✅ Cloud worktrees setup complete!${NC}"
echo ""
echo "Worktrees available:"
echo "  0 (main): ~/claritypledge      - port 5001"
echo "  1:        ~/claritypledge-1    - port 5100"
echo "  2:        ~/claritypledge-2    - port 5200"
echo "  3:        ~/claritypledge-3    - port 5300"
echo ""
echo -e "${YELLOW}Usage:${NC}"
echo "  /c claude \"task\"                    # Auto-picks available worktree"
echo "  /c claude --worktree 2 \"task\"       # Use specific worktree"
echo "  /c status                           # See all running agents"
echo ""
