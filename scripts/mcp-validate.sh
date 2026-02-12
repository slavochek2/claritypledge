#!/bin/bash
# MCP Configuration Validation Script
# Checks MCP configs for common issues
#
# Usage:
#   ./scripts/mcp-validate.sh              # Validate all configs

set -euo pipefail

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
echo "  MCP Configuration Validation"
echo "=========================================="
echo ""

ISSUES_FOUND=0
WARNINGS_FOUND=0

# Config file paths
CLAUDE_CLI="$HOME/.claude.json"
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
DESKTOP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

# Check 1: Find all config locations
log "Checking for MCP config files..."
echo ""

FOUND_COUNT=0
declare -a FOUND_CONFIGS

if [ -f "$CLAUDE_CLI" ]; then
    size=$(wc -c < "$CLAUDE_CLI" | tr -d ' ')
    success "Found: claude-cli ($size bytes)"
    FOUND_CONFIGS+=("claude-cli:$CLAUDE_CLI")
    ((FOUND_COUNT++))
else
    info "Not found: claude-cli"
fi

if [ -f "$CLAUDE_SETTINGS" ]; then
    size=$(wc -c < "$CLAUDE_SETTINGS" | tr -d ' ')
    success "Found: claude-settings ($size bytes)"
    FOUND_CONFIGS+=("claude-settings:$CLAUDE_SETTINGS")
    ((FOUND_COUNT++))
else
    info "Not found: claude-settings"
fi

if [ -f "$DESKTOP_CONFIG" ]; then
    size=$(wc -c < "$DESKTOP_CONFIG" | tr -d ' ')
    success "Found: claude-desktop ($size bytes)"
    FOUND_CONFIGS+=("claude-desktop:$DESKTOP_CONFIG")
    ((FOUND_COUNT++))
else
    info "Not found: claude-desktop"
fi

if [ $FOUND_COUNT -eq 0 ]; then
    warn "No MCP config files found"
    ((WARNINGS_FOUND++))
elif [ $FOUND_COUNT -gt 1 ]; then
    warn "Multiple MCP config locations found (may cause conflicts)"
    ((WARNINGS_FOUND++))
fi

echo ""

# Check 2: JSON validity
if command -v jq &> /dev/null; then
    log "Validating JSON syntax..."
    echo ""

    for entry in "${FOUND_CONFIGS[@]}"; do
        name="${entry%%:*}"
        path="${entry#*:}"

        if jq empty "$path" 2>/dev/null; then
            success "$name: Valid JSON"
        else
            error "$name: INVALID JSON"
            ((ISSUES_FOUND++))
            jq empty "$path" 2>&1 || true
        fi
    done
    echo ""
else
    warn "jq not installed - skipping JSON validation"
    echo "  Install with: brew install jq"
    echo ""
fi

# Check 3: Duplicate MCP servers across configs
log "Checking for duplicate MCP servers..."
echo ""

# Collect all servers
TEMP_FILE=$(mktemp)
DUPLICATES_FOUND=false

for entry in "${FOUND_CONFIGS[@]}"; do
    name="${entry%%:*}"
    path="${entry#*:}"

    if command -v jq &> /dev/null; then
        jq -r '.mcpServers // {} | keys[]' "$path" 2>/dev/null | while read -r server; do
            if [ -n "$server" ]; then
                echo "$server:$name" >> "$TEMP_FILE"
            fi
        done
    fi
done

# Find duplicates
if [ -f "$TEMP_FILE" ] && [ -s "$TEMP_FILE" ]; then
    # Extract just server names and find duplicates
    cut -d: -f1 "$TEMP_FILE" | sort | uniq -d > "${TEMP_FILE}.dups"

    if [ -s "${TEMP_FILE}.dups" ]; then
        error "Duplicate MCP servers found:"
        DUPLICATES_FOUND=true
        ((ISSUES_FOUND++))

        # Show where each duplicate appears
        while read -r dup_server; do
            echo ""
            echo "  Server: $dup_server"
            grep "^$dup_server:" "$TEMP_FILE" | while read -r line; do
                location="${line#*:}"
                echo "    - in $location"
            done
        done < "${TEMP_FILE}.dups"
    else
        success "No duplicate servers found"
    fi

    rm -f "${TEMP_FILE}.dups"
else
    success "No duplicate servers found"
fi

rm -f "$TEMP_FILE"

echo ""

# Check 4: List all configured servers
log "Configured MCP servers:"
echo ""

SERVER_COUNT=0
for entry in "${FOUND_CONFIGS[@]}"; do
    name="${entry%%:*}"
    path="${entry#*:}"

    if command -v jq &> /dev/null; then
        servers=$(jq -r '.mcpServers // {} | keys[]' "$path" 2>/dev/null)
        if [ -n "$servers" ]; then
            while read -r server; do
                if [ -n "$server" ]; then
                    echo "  - $server (in $name)"
                    ((SERVER_COUNT++))
                fi
            done <<< "$servers"
        fi
    fi
done

if [ $SERVER_COUNT -eq 0 ]; then
    warn "No MCP servers configured"
fi

echo ""

# Summary
echo "=========================================="
echo "  Validation Summary"
echo "=========================================="

if [ $ISSUES_FOUND -eq 0 ] && [ $WARNINGS_FOUND -eq 0 ]; then
    success "All checks passed - no issues found"
elif [ $ISSUES_FOUND -eq 0 ]; then
    warn "No critical issues, but $WARNINGS_FOUND warning(s) found"
else
    error "Found $ISSUES_FOUND critical issue(s) and $WARNINGS_FOUND warning(s)"
fi

echo ""

# Recommendations
if [ $FOUND_COUNT -gt 1 ]; then
    info "Recommendation: Consolidate to a single MCP config location"
    echo "  Suggested: ~/.claude.json (Claude CLI standard)"
    echo ""
fi

if [ $ISSUES_FOUND -gt 0 ]; then
    exit 1
fi

exit 0
