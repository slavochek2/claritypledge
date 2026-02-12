#!/bin/bash
# MCP Configuration Restore Script
# Restores MCP configs from a timestamped backup
#
# Usage:
#   ./scripts/mcp-restore.sh                 # Interactive: list and select
#   ./scripts/mcp-restore.sh backup-name     # Restore specific backup
#   ./scripts/mcp-restore.sh --latest        # Restore most recent backup

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

echo "=========================================="
echo "  MCP Configuration Restore"
echo "=========================================="
echo ""

# If no backup specified, show interactive selection
if [ -z "$BACKUP_NAME" ]; then
    info "Available backups:"
    echo ""

    COUNT=0
    declare -a BACKUPS

    while IFS= read -r backup; do
        ((COUNT++))
        BACKUPS+=("$backup")

        MANIFEST="$BACKUP_ROOT/$backup/manifest.json"
        if [ -f "$MANIFEST" ] && command -v jq &> /dev/null; then
            timestamp=$(jq -r '.timestamp' "$MANIFEST" 2>/dev/null || echo "unknown")
            label=$(jq -r '.label' "$MANIFEST" 2>/dev/null || echo "")

            if [ -n "$label" ] && [ "$label" != "null" ]; then
                echo "$COUNT) $backup ($label)"
            else
                echo "$COUNT) $backup"
            fi
        else
            echo "$COUNT) $backup"
        fi
    done < <(ls -1t "$BACKUP_ROOT" 2>/dev/null)

    if [ $COUNT -eq 0 ]; then
        error "No backups found in $BACKUP_ROOT"
        exit 1
    fi

    echo ""
    read -p "Select backup to restore [1-$COUNT] or 'q' to quit: " selection

    if [ "$selection" = "q" ] || [ "$selection" = "Q" ]; then
        echo "Cancelled."
        exit 0
    fi

    if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt $COUNT ]; then
        error "Invalid selection"
        exit 1
    fi

    BACKUP_NAME="${BACKUPS[$((selection-1))]}"
fi

# Handle --latest flag
if [ "$BACKUP_NAME" = "--latest" ]; then
    BACKUP_NAME=$(ls -1t "$BACKUP_ROOT" 2>/dev/null | head -1)
    if [ -z "$BACKUP_NAME" ]; then
        error "No backups found"
        exit 1
    fi
    info "Selected latest backup: $BACKUP_NAME"
    echo ""
fi

BACKUP_DIR="$BACKUP_ROOT/$BACKUP_NAME"

# Verify backup exists
if [ ! -d "$BACKUP_DIR" ]; then
    error "Backup not found: $BACKUP_NAME"
    exit 1
fi

# Show backup info
info "Restore from: $BACKUP_NAME"
if [ -f "$BACKUP_DIR/manifest.json" ] && command -v jq &> /dev/null; then
    timestamp=$(jq -r '.timestamp' "$BACKUP_DIR/manifest.json" 2>/dev/null || echo "unknown")
    label=$(jq -r '.label' "$BACKUP_DIR/manifest.json" 2>/dev/null || echo "")

    echo "  Created: $timestamp"
    if [ -n "$label" ] && [ "$label" != "null" ]; then
        echo "  Label: $label"
    fi
fi
echo ""

# Create safety backup of current state FIRST
SAFETY_BACKUP="pre-restore-$(date +%Y%m%d-%H%M%S)"
warn "Creating safety backup of current state: $SAFETY_BACKUP"
if ! ./scripts/mcp-backup.sh "$SAFETY_BACKUP" > /dev/null 2>&1; then
    error "Failed to create safety backup"
    exit 1
fi
success "Safety backup created"
echo ""

# Confirm restoration
read -p "Restore this backup? This will overwrite current configs. [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Cancelled."
    exit 0
fi

echo ""
log "Restoring configurations..."

RESTORED_COUNT=0
FAILED_COUNT=0

# Restore claude-cli
if [ -f "$BACKUP_DIR/claude-cli.json" ]; then
    if cp "$BACKUP_DIR/claude-cli.json" "$HOME/.claude.json"; then
        success "Restored claude-cli"
        ((RESTORED_COUNT++))
    else
        error "Failed to restore claude-cli"
        ((FAILED_COUNT++))
    fi
fi

# Restore claude-settings
if [ -f "$BACKUP_DIR/claude-settings.json" ]; then
    mkdir -p "$HOME/.claude"
    if cp "$BACKUP_DIR/claude-settings.json" "$HOME/.claude/settings.json"; then
        success "Restored claude-settings"
        ((RESTORED_COUNT++))
    else
        error "Failed to restore claude-settings"
        ((FAILED_COUNT++))
    fi
fi

# Restore claude-desktop
if [ -f "$BACKUP_DIR/claude-desktop.json" ]; then
    mkdir -p "$HOME/Library/Application Support/Claude"
    if cp "$BACKUP_DIR/claude-desktop.json" "$HOME/Library/Application Support/Claude/claude_desktop_config.json"; then
        success "Restored claude-desktop"
        ((RESTORED_COUNT++))
    else
        error "Failed to restore claude-desktop"
        ((FAILED_COUNT++))
    fi
fi

echo ""
echo "=========================================="
echo "  Restore Complete"
echo "=========================================="
echo "Restored: $RESTORED_COUNT files"
if [ $FAILED_COUNT -gt 0 ]; then
    error "Failed: $FAILED_COUNT files"
fi
echo ""
info "Safety backup available at: $SAFETY_BACKUP"
echo ""
warn "Restart Claude CLI/Desktop for changes to take effect"
echo ""
