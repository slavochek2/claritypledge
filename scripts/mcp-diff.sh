#!/bin/bash
# MCP Configuration Diff Script
# Compare current MCP configs with a backup
#
# Usage:
#   ./scripts/mcp-diff.sh                    # Compare with latest backup
#   ./scripts/mcp-diff.sh backup-name        # Compare with specific backup

set -euo pipefail

BACKUP_ROOT="$HOME/.claude/mcp-backups"
BACKUP_NAME="${1:-}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "[$(date '+%H:%M:%S')] $1"; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
error() { echo -e "${RED}✗ $1${NC}"; }
info() { echo -e "${BLUE}ℹ $1${NC}"; }

# Get latest backup if not specified
if [ -z "$BACKUP_NAME" ]; then
    BACKUP_NAME=$(ls -1t "$BACKUP_ROOT" 2>/dev/null | head -1)
    if [ -z "$BACKUP_NAME" ]; then
        error "No backups found"
        exit 1
    fi
    info "Using latest backup: $BACKUP_NAME"
fi

BACKUP_DIR="$BACKUP_ROOT/$BACKUP_NAME"

if [ ! -d "$BACKUP_DIR" ]; then
    error "Backup not found: $BACKUP_NAME"
    exit 1
fi

echo "=========================================="
echo "  MCP Configuration Diff"
echo "=========================================="
echo "Comparing: current state vs $BACKUP_NAME"
echo ""

CHANGES_FOUND=false

# Compare claude-cli
echo "--- claude-cli ---"
if [ -f "$BACKUP_DIR/claude-cli.json" ] && [ -f "$HOME/.claude.json" ]; then
    if diff -q "$BACKUP_DIR/claude-cli.json" "$HOME/.claude.json" > /dev/null 2>&1; then
        success "No changes"
    else
        warn "CHANGED"
        CHANGES_FOUND=true
        echo ""
        if command -v git &> /dev/null; then
            git diff --no-index --color=always "$BACKUP_DIR/claude-cli.json" "$HOME/.claude.json" | tail -n +5 || true
        else
            diff -u "$BACKUP_DIR/claude-cli.json" "$HOME/.claude.json" || true
        fi
    fi
elif [ -f "$BACKUP_DIR/claude-cli.json" ] && [ ! -f "$HOME/.claude.json" ]; then
    warn "DELETED (exists in backup, not in current)"
    CHANGES_FOUND=true
elif [ ! -f "$BACKUP_DIR/claude-cli.json" ] && [ -f "$HOME/.claude.json" ]; then
    warn "ADDED (exists in current, not in backup)"
    CHANGES_FOUND=true
else
    info "Not found in either location"
fi
echo ""

# Compare claude-settings
echo "--- claude-settings ---"
if [ -f "$BACKUP_DIR/claude-settings.json" ] && [ -f "$HOME/.claude/settings.json" ]; then
    if diff -q "$BACKUP_DIR/claude-settings.json" "$HOME/.claude/settings.json" > /dev/null 2>&1; then
        success "No changes"
    else
        warn "CHANGED"
        CHANGES_FOUND=true
        echo ""
        if command -v git &> /dev/null; then
            git diff --no-index --color=always "$BACKUP_DIR/claude-settings.json" "$HOME/.claude/settings.json" | tail -n +5 || true
        else
            diff -u "$BACKUP_DIR/claude-settings.json" "$HOME/.claude/settings.json" || true
        fi
    fi
elif [ -f "$BACKUP_DIR/claude-settings.json" ] && [ ! -f "$HOME/.claude/settings.json" ]; then
    warn "DELETED (exists in backup, not in current)"
    CHANGES_FOUND=true
elif [ ! -f "$BACKUP_DIR/claude-settings.json" ] && [ -f "$HOME/.claude/settings.json" ]; then
    warn "ADDED (exists in current, not in backup)"
    CHANGES_FOUND=true
else
    info "Not found in either location"
fi
echo ""

# Compare claude-desktop
echo "--- claude-desktop ---"
DESKTOP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
if [ -f "$BACKUP_DIR/claude-desktop.json" ] && [ -f "$DESKTOP_CONFIG" ]; then
    if diff -q "$BACKUP_DIR/claude-desktop.json" "$DESKTOP_CONFIG" > /dev/null 2>&1; then
        success "No changes"
    else
        warn "CHANGED"
        CHANGES_FOUND=true
        echo ""
        if command -v git &> /dev/null; then
            git diff --no-index --color=always "$BACKUP_DIR/claude-desktop.json" "$DESKTOP_CONFIG" | tail -n +5 || true
        else
            diff -u "$BACKUP_DIR/claude-desktop.json" "$DESKTOP_CONFIG" || true
        fi
    fi
elif [ -f "$BACKUP_DIR/claude-desktop.json" ] && [ ! -f "$DESKTOP_CONFIG" ]; then
    warn "DELETED (exists in backup, not in current)"
    CHANGES_FOUND=true
elif [ ! -f "$BACKUP_DIR/claude-desktop.json" ] && [ -f "$DESKTOP_CONFIG" ]; then
    warn "ADDED (exists in current, not in backup)"
    CHANGES_FOUND=true
else
    info "Not found in either location"
fi
echo ""

if [ "$CHANGES_FOUND" = false ]; then
    success "No differences found - configs are identical"
else
    warn "Differences found (see above)"
fi

echo ""
