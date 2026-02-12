#!/bin/bash
# Encrypted backup of entire system to Google Drive
# Run manually: ./scripts/backup-local.sh
# Or scheduled via LaunchAgent (daily at 9am)
#
# What gets backed up (encrypted):
# - ~/Projects/private/personal (full with git history)
# - ~/Projects/public/claritypledge (main worktree only)
# - ~/.zshrc, ~/.zprofile, ~/.gitconfig (shell/git configs)
# - ~/.claude/ (skills, settings, CLAUDE.md - excluding credentials/cache)
# - Brewfile snapshot (for package restoration)
#
# Recovery: gpg -d backup.tar.gz.gpg | tar -xzf - -C ~

set -euo pipefail  # Exit on error, undefined variables, pipe failures

DATE=$(date +%Y-%m-%d)
# Find Google Drive directory (works for any account)
GOOGLE_DRIVE_ROOT=$(find "$HOME/Library/CloudStorage" -maxdepth 1 -name "GoogleDrive-*" -type d 2>/dev/null | head -1)
BACKUP_DIR="${GOOGLE_DRIVE_ROOT}/My Drive/Backups"
BACKUP_FILE="$BACKUP_DIR/system-backup.tar.gz.gpg"
BACKUP_TEMP="$BACKUP_DIR/system-backup.tar.gz.gpg.tmp"
TEMP_DIR=$(mktemp -d)
KEYCHAIN_SERVICE="claritypledge-backup"
KEYCHAIN_ACCOUNT="backup"
REQUIRED_SPACE_MB=1500  # Minimum free space required

# Secure temp directory
chmod 700 "$TEMP_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Logging with dynamic timestamps
log() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
error() { echo -e "${RED}✗ $1${NC}"; }

# Cleanup handler - runs on exit, error, or interrupt
cleanup() {
    if [ -n "${TEMP_DIR:-}" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi
    if [ -f "${BACKUP_TEMP:-}" ]; then
        rm -f "$BACKUP_TEMP"
    fi
}
trap cleanup EXIT ERR INT TERM

echo "=========================================="
echo "  Encrypted System Backup - $DATE"
echo "=========================================="
echo ""

###########################################
# SECTION 1: Pre-flight Checks
###########################################
echo "=== Pre-flight Checks ==="

# Check if gpg is installed
if ! command -v gpg &> /dev/null; then
    error "GPG not installed. Install with: brew install gnupg"
    exit 1
fi
success "GPG installed"

# Get password from keychain
get_password() {
    security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w 2>/dev/null || {
        error "Password not found in keychain."
        echo ""
        echo "First-time setup required. Run:"
        echo "  security add-generic-password -a backup -s claritypledge-backup -w 'your-secure-password'"
        echo ""
        exit 1
    }
}

log "Checking keychain password..."
if get_password > /dev/null 2>&1; then
    success "Keychain password found"
else
    exit 1
fi

# Check required source paths exist
log "Validating source directories..."
REQUIRED_PATHS=(
    "$HOME/Projects/private/personal"
    "$HOME/Projects/public/claritypledge"
)

for path in "${REQUIRED_PATHS[@]}"; do
    if [ ! -e "$path" ]; then
        error "Required path missing: $path"
        exit 1
    fi
done
success "All source directories exist"

# Check disk space
log "Checking available disk space..."
AVAILABLE_SPACE=$(df -m "$BACKUP_DIR" | awk 'NR==2 {print $4}')

if [ "$AVAILABLE_SPACE" -lt "$REQUIRED_SPACE_MB" ]; then
    error "Insufficient disk space: ${AVAILABLE_SPACE}MB available, ${REQUIRED_SPACE_MB}MB required"
    exit 1
fi
success "Sufficient disk space: ${AVAILABLE_SPACE}MB available"

# Check if Google Drive is running
if ! pgrep -x "Google Drive" > /dev/null; then
    warn "Google Drive is not running. Backup will not sync to cloud."
else
    success "Google Drive is running"
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo ""

###########################################
# SECTION 2: Generate Brewfile
###########################################
echo "=== Brewfile Snapshot ==="

if command -v brew &> /dev/null; then
    log "Generating Brewfile..."
    BREWFILE="$TEMP_DIR/Brewfile"
    if brew bundle dump --force --file="$BREWFILE" 2>/dev/null; then
        success "Brewfile generated ($(wc -l < "$BREWFILE" | tr -d ' ') packages)"
    else
        warn "Brewfile generation failed"
    fi
else
    warn "Homebrew not installed"
fi

echo ""

###########################################
# SECTION 3: Prepare ~/.claude for backup
###########################################
echo "=== Preparing Claude config ==="

CLAUDE_TEMP="$TEMP_DIR/claude"
if [ -d "$HOME/.claude" ]; then
    log "Copying ~/.claude (excluding credentials/cache)..."

    if rsync -a \
        --exclude='.credentials.json' \
        --exclude='cache/' \
        --exclude='debug/' \
        --exclude='file-history/' \
        --exclude='session-env/' \
        --exclude='paste-cache/' \
        --exclude='history.jsonl' \
        "$HOME/.claude/" "$CLAUDE_TEMP/" 2>/dev/null; then
        success "Claude config prepared"
    else
        warn "Failed to copy Claude config"
    fi
else
    warn "~/.claude not found"
fi

echo ""

###########################################
# SECTION 4: Create encrypted archive
###########################################
echo "=== Creating Encrypted Archive ==="

log "Backing up:"
echo "  - ~/Projects/private/personal (full with git history)"
echo "  - ~/Projects/public/claritypledge (main worktree only)"
echo "  - ~/.zshrc, ~/.zprofile, ~/.gitconfig"
echo "  - ~/.claude/ (excluding credentials)"
echo "  - Brewfile"
echo ""
echo "Excluding:"
echo "  - claritypledge-1 through claritypledge-7 (worktrees)"
echo "  - polymet projects"
echo "  - node_modules, .next, cache"
echo ""

log "Creating encrypted archive (writing to temp file)..."

# Capture tar errors
TAR_LOG="$TEMP_DIR/tar.log"

# Create tarball with specific includes, pipe to GPG
if tar -czf - \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.cache' \
    --exclude='*.log' \
    --exclude='.DS_Store' \
    -C "$HOME/Projects/private" personal \
    -C "$HOME/Projects/public" claritypledge \
    -C "$HOME" .zshrc \
    -C "$HOME" .zprofile \
    -C "$HOME" .gitconfig \
    -C "$TEMP_DIR" claude \
    -C "$TEMP_DIR" Brewfile \
    2>"$TAR_LOG" | \
    gpg --symmetric --cipher-algo AES256 --batch --passphrase "$(get_password)" > "$BACKUP_TEMP"; then

    BACKUP_SIZE=$(du -h "$BACKUP_TEMP" | cut -f1)
    success "Encrypted archive created: $BACKUP_SIZE"
else
    error "Archive creation failed"
    cat "$TAR_LOG"
    exit 1
fi

# Check for tar warnings
if grep -i "error\|cannot\|permission denied" "$TAR_LOG" > /dev/null 2>&1; then
    warn "Archive completed with warnings:"
    cat "$TAR_LOG"
fi

echo ""

###########################################
# SECTION 5: Verify backup integrity
###########################################
echo "=== Verifying Backup ==="

log "Testing backup can be decrypted and extracted..."

if get_password | gpg --decrypt --batch --passphrase-fd 0 "$BACKUP_TEMP" 2>/dev/null | tar -tzf - > /dev/null 2>&1; then
    success "Backup verification passed - archive is valid"
else
    error "Backup verification FAILED - archive is corrupt or password incorrect"
    rm -f "$BACKUP_TEMP"
    exit 1
fi

echo ""

###########################################
# SECTION 6: Atomic rename (replace old backup)
###########################################
echo "=== Finalizing Backup ==="

log "Replacing old backup with new verified backup..."

if mv "$BACKUP_TEMP" "$BACKUP_FILE"; then
    success "Backup finalized successfully"
else
    error "Failed to move backup to final location"
    exit 1
fi

echo ""

###########################################
# SECTION 7: Cleanup happens automatically via trap
###########################################

###########################################
# Summary
###########################################
echo "=========================================="
echo "  Backup Complete!"
echo "=========================================="
echo "Encrypted backup: $BACKUP_FILE"
echo "Size: $BACKUP_SIZE"
echo "Strategy: Single file (overwrite daily)"
echo "Versioning: Google Drive keeps file versions"
echo ""
echo "Recovery commands:"
echo ""
echo "Full restore to home directory:"
echo "  security find-generic-password -a backup -s claritypledge-backup -w | \\"
echo "    gpg --decrypt --batch --passphrase-fd 0 --output /tmp/backup.tar.gz \"$BACKUP_FILE\" && \\"
echo "    tar -xzf /tmp/backup.tar.gz -C ~ && rm /tmp/backup.tar.gz"
echo ""
echo "List contents without extracting:"
echo "  security find-generic-password -a backup -s claritypledge-backup -w | \\"
echo "    gpg --decrypt --batch --passphrase-fd 0 \"$BACKUP_FILE\" | tar -tzf - | head -20"
echo ""

# Send notification (optional - only if script is run by LaunchAgent)
if [ "${TERM:-}" = "" ]; then
    osascript -e 'display notification "Backup completed successfully" with title "System Backup"' 2>/dev/null || true
fi
