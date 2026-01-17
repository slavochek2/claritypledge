#!/bin/bash
# Backup .claude and .local folders to Dropbox
# Run manually: ./scripts/backup-local.sh
# Or schedule with cron: 0 20 * * * /path/to/backup-local.sh

BACKUP_DIR="$HOME/Dropbox/Backups/claritypledge"
SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATE=$(date +%Y-%m-%d)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== Backing up local folders ==="
echo "Source: $SOURCE_DIR"
echo "Destination: $BACKUP_DIR"
echo ""

# Create backup directory if needed
mkdir -p "$BACKUP_DIR"

# Backup .claude
if [ -d "$SOURCE_DIR/.claude" ]; then
    echo ">>> Backing up .claude..."
    rsync -av --delete "$SOURCE_DIR/.claude/" "$BACKUP_DIR/claude/"
    echo -e "${GREEN}✓ .claude backed up${NC}"
else
    echo -e "${YELLOW}⚠ .claude not found${NC}"
fi

# Backup .local
if [ -d "$SOURCE_DIR/.local" ]; then
    echo ">>> Backing up .local..."
    rsync -av --delete "$SOURCE_DIR/.local/" "$BACKUP_DIR/local/"
    echo -e "${GREEN}✓ .local backed up${NC}"
else
    echo -e "${YELLOW}⚠ .local not found${NC}"
fi

# Backup .bmad (workflow state)
if [ -d "$SOURCE_DIR/.bmad" ]; then
    echo ">>> Backing up .bmad..."
    rsync -av --delete "$SOURCE_DIR/.bmad/" "$BACKUP_DIR/bmad/"
    echo -e "${GREEN}✓ .bmad backed up${NC}"
fi

# Backup env files (sensitive - keep latest only)
echo ">>> Backing up env files..."
cp "$SOURCE_DIR/.env.local" "$BACKUP_DIR/env-local.txt" 2>/dev/null && echo -e "${GREEN}✓ .env.local backed up${NC}" || true
cp "$SOURCE_DIR/.env.test.local" "$BACKUP_DIR/env-test-local.txt" 2>/dev/null && echo -e "${GREEN}✓ .env.test.local backed up${NC}" || true

echo ""
echo "=== Backup complete ==="
echo "Location: $BACKUP_DIR"
ls -la "$BACKUP_DIR"
