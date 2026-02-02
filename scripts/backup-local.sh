#!/bin/bash
# Backup local project files and global configs to Dropbox
# Run manually: ./scripts/backup-local.sh
# Or schedule with cron: 0 9 * * * /path/to/backup-local.sh
#
# What gets backed up:
# - Project: .claude/, .local/, .bmad/
# - Global: ~/.claude/ (skills, settings, CLAUDE.md)
# - Dotfiles: ~/.zshrc, ~/.gitconfig
# - Brewfile snapshot

BACKUP_DIR="$HOME/Dropbox/Backups/claritypledge"
SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Logging
log() { echo -e "[$TIMESTAMP] $1"; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
error() { echo -e "${RED}✗ $1${NC}"; }

echo "=========================================="
echo "  Backup Script - $DATE"
echo "=========================================="
echo ""

# Create backup directories
mkdir -p "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR/global"
mkdir -p "$BACKUP_DIR/dotfiles"

###########################################
# SECTION 1: Project-level backups
###########################################
echo "=== Project Backups (from $SOURCE_DIR) ==="

# Backup project .claude
if [ -d "$SOURCE_DIR/.claude" ]; then
    log "Backing up project .claude..."
    rsync -av --delete "$SOURCE_DIR/.claude/" "$BACKUP_DIR/claude/"
    success ".claude backed up"
else
    warn ".claude not found"
fi

# Backup .local
if [ -d "$SOURCE_DIR/.local" ]; then
    log "Backing up .local..."
    rsync -av --delete "$SOURCE_DIR/.local/" "$BACKUP_DIR/local/"
    success ".local backed up"
else
    warn ".local not found"
fi

# Backup .bmad (workflow state)
if [ -d "$SOURCE_DIR/.bmad" ]; then
    log "Backing up .bmad..."
    rsync -av --delete "$SOURCE_DIR/.bmad/" "$BACKUP_DIR/bmad/"
    success ".bmad backed up"
fi

# Skip env files - regenerate from Supabase dashboard if needed
warn "Skipping .env files (regenerate from Supabase if needed)"

echo ""

###########################################
# SECTION 2: Global Claude backups
###########################################
echo "=== Global Claude Backups (from ~/.claude) ==="

if [ -d "$HOME/.claude" ]; then
    log "Backing up global ~/.claude..."

    # Backup with exclusions (no credentials, cache, or large temp files)
    rsync -av --delete \
        --exclude='.credentials.json' \
        --exclude='cache/' \
        --exclude='debug/' \
        --exclude='file-history/' \
        --exclude='session-env/' \
        --exclude='paste-cache/' \
        --exclude='history.jsonl' \
        "$HOME/.claude/" "$BACKUP_DIR/global/claude/"

    success "Global ~/.claude backed up (excluding sensitive/temp files)"

    # List what was backed up
    echo "  Included: CLAUDE.md, settings.json, skills/, commands/, plugins/, plans/"
    echo "  Excluded: .credentials.json, cache/, debug/, history.jsonl"
else
    warn "~/.claude not found"
fi

echo ""

###########################################
# SECTION 3: Dotfiles backup
###########################################
echo "=== Dotfiles Backup ==="

# Shell config
if [ -f "$HOME/.zshrc" ]; then
    cp "$HOME/.zshrc" "$BACKUP_DIR/dotfiles/zshrc"
    success ".zshrc backed up"
fi

if [ -f "$HOME/.zprofile" ]; then
    cp "$HOME/.zprofile" "$BACKUP_DIR/dotfiles/zprofile"
    success ".zprofile backed up"
fi

# Git config
if [ -f "$HOME/.gitconfig" ]; then
    cp "$HOME/.gitconfig" "$BACKUP_DIR/dotfiles/gitconfig"
    success ".gitconfig backed up"
fi

if [ -f "$HOME/.gitignore_global" ]; then
    cp "$HOME/.gitignore_global" "$BACKUP_DIR/dotfiles/gitignore_global"
    success ".gitignore_global backed up"
fi

# Skip .cursor/mcp.json - contains API tokens
warn "Skipping .cursor/mcp.json (contains API tokens)"

echo ""

###########################################
# SECTION 4: Brewfile snapshot
###########################################
echo "=== Homebrew Snapshot ==="

if command -v brew &> /dev/null; then
    log "Generating Brewfile..."
    brew bundle dump --force --file="$BACKUP_DIR/dotfiles/Brewfile" 2>/dev/null
    success "Brewfile generated ($(wc -l < "$BACKUP_DIR/dotfiles/Brewfile" | tr -d ' ') packages)"
else
    warn "Homebrew not installed"
fi

echo ""

###########################################
# Summary
###########################################
echo "=========================================="
echo "  Backup Complete!"
echo "=========================================="
echo "Location: $BACKUP_DIR"
echo ""
echo "Contents:"
ls -la "$BACKUP_DIR"
echo ""
echo "Global Claude:"
ls -la "$BACKUP_DIR/global/claude/" 2>/dev/null | head -10
echo ""
echo "Dotfiles:"
ls -la "$BACKUP_DIR/dotfiles/"
