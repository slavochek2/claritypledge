#!/bin/bash
# MCP Configuration Backup Script
# Creates timestamped snapshots of all MCP config files
#
# Usage:
#   ./scripts/mcp-backup.sh                    # Full backup with auto-generated name
#   ./scripts/mcp-backup.sh "before-chrome"    # Backup with custom label
#
# Recovery:
#   ./scripts/mcp-restore.sh                   # Interactive selection
#   ./scripts/mcp-restore.sh backup-name       # Restore specific backup

set -euo pipefail

# Configuration
BACKUP_ROOT="$HOME/.claude/mcp-backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LABEL="${1:-}"

# Build backup name
if [ -n "$LABEL" ]; then
    BACKUP_NAME="${TIMESTAMP}-${LABEL}"
else
    BACKUP_NAME="${TIMESTAMP}"
fi

BACKUP_DIR="$BACKUP_ROOT/$BACKUP_NAME"

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
echo "  MCP Configuration Backup"
echo "=========================================="
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Track what we backed up
BACKED_UP_COUNT=0
MISSING_COUNT=0

log "Scanning for MCP configurations..."
echo ""

# Backup claude-cli config
if [ -f "$HOME/.claude.json" ]; then
    cp "$HOME/.claude.json" "$BACKUP_DIR/claude-cli.json"
    size=$(wc -c < "$HOME/.claude.json" | tr -d ' ')
    success "Backed up claude-cli ($size bytes)"
    ((BACKED_UP_COUNT++))
else
    warn "Not found: claude-cli"
    ((MISSING_COUNT++))
fi

# Backup claude settings
if [ -f "$HOME/.claude/settings.json" ]; then
    cp "$HOME/.claude/settings.json" "$BACKUP_DIR/claude-settings.json"
    size=$(wc -c < "$HOME/.claude/settings.json" | tr -d ' ')
    success "Backed up claude-settings ($size bytes)"
    ((BACKED_UP_COUNT++))
else
    warn "Not found: claude-settings"
    ((MISSING_COUNT++))
fi

# Backup claude desktop config
DESKTOP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
if [ -f "$DESKTOP_CONFIG" ]; then
    cp "$DESKTOP_CONFIG" "$BACKUP_DIR/claude-desktop.json"
    size=$(wc -c < "$DESKTOP_CONFIG" | tr -d ' ')
    success "Backed up claude-desktop ($size bytes)"
    ((BACKED_UP_COUNT++))
else
    warn "Not found: claude-desktop"
    ((MISSING_COUNT++))
fi

echo ""

# Create manifest with metadata
MANIFEST="$BACKUP_DIR/manifest.json"
cat > "$MANIFEST" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "label": "$LABEL",
  "hostname": "$(hostname)",
  "backed_up": $BACKED_UP_COUNT,
  "missing": $MISSING_COUNT,
  "configs": {
EOF

# Add configs to manifest
FIRST=true

if [ -f "$HOME/.claude.json" ]; then
    [ "$FIRST" = false ] && echo "," >> "$MANIFEST"
    FIRST=false
    hash=$(shasum -a 256 "$HOME/.claude.json" | cut -d' ' -f1)
    size=$(wc -c < "$HOME/.claude.json" | tr -d ' ')
    cat >> "$MANIFEST" << EOF
    "claude-cli": {
      "path": "$HOME/.claude.json",
      "size": $size,
      "sha256": "$hash"
    }
EOF
fi

if [ -f "$HOME/.claude/settings.json" ]; then
    [ "$FIRST" = false ] && echo "," >> "$MANIFEST"
    FIRST=false
    hash=$(shasum -a 256 "$HOME/.claude/settings.json" | cut -d' ' -f1)
    size=$(wc -c < "$HOME/.claude/settings.json" | tr -d ' ')
    cat >> "$MANIFEST" << EOF
    "claude-settings": {
      "path": "$HOME/.claude/settings.json",
      "size": $size,
      "sha256": "$hash"
    }
EOF
fi

if [ -f "$DESKTOP_CONFIG" ]; then
    [ "$FIRST" = false ] && echo "," >> "$MANIFEST"
    FIRST=false
    hash=$(shasum -a 256 "$DESKTOP_CONFIG" | cut -d' ' -f1)
    size=$(wc -c < "$DESKTOP_CONFIG" | tr -d ' ')
    cat >> "$MANIFEST" << EOF
    "claude-desktop": {
      "path": "$DESKTOP_CONFIG",
      "size": $size,
      "sha256": "$hash"
    }
EOF
fi

cat >> "$MANIFEST" << EOF

  }
}
EOF

success "Created manifest"

echo ""
echo "=========================================="
echo "  Backup Complete"
echo "=========================================="
echo "Location: $BACKUP_DIR"
echo "Files backed up: $BACKED_UP_COUNT"
if [ $MISSING_COUNT -gt 0 ]; then
    warn "Files missing: $MISSING_COUNT"
fi
echo ""
echo "To restore this backup:"
echo "  ./scripts/mcp-restore.sh $BACKUP_NAME"
echo ""
echo "To compare with current state:"
echo "  ./scripts/mcp-diff.sh $BACKUP_NAME"
echo ""

# List recent backups
if [ -d "$BACKUP_ROOT" ]; then
    info "Recent backups:"
    ls -1t "$BACKUP_ROOT" 2>/dev/null | head -5 | while read -r backup; do
        echo "  - $backup"
    done
    echo ""
fi
