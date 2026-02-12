# MCP Backup & Recovery

Complete guide for safely managing MCP (Model Context Protocol) configurations.

## Quick Reference

```bash
# Before making ANY MCP changes
./scripts/mcp-backup.sh "before-adding-chrome"

# Validate current state
./scripts/mcp-validate.sh

# Compare with backup
./scripts/mcp-diff.sh backup-name

# Restore from backup (creates safety backup first)
./scripts/mcp-restore.sh
```

---

## The Problem This Solves

MCP configs are complex and fragile:
- **Multiple locations** - Can exist in 3+ different places
- **Contains secrets** - API keys, can't commit to git
- **Hard to debug** - JSON syntax errors break everything
- **Easy to lose state** - One bad edit = lost working config
- **Spaces in paths** - `~/Library/Application Support/Claude/` breaks naive scripts

**Real incident:** Lost 30 minutes debugging duplicate MCPs across 4 locations, no backups, unclear what changed.

---

## Backup Strategy

### When to Backup

**ALWAYS backup before:**
- Adding/removing MCP servers
- Updating MCP server configs
- Experimenting with new MCPs
- Following online tutorials that touch MCP configs
- Any `code ~/.claude.json` or similar edits

**Good practice:**
- Daily automatic backups (see automation section)
- Before and after successful MCP changes (capture working state)

### What Gets Backed Up

All MCP config locations:
- `~/.claude.json` - Claude CLI main config
- `~/.claude/settings.json` - Claude CLI settings
- `~/Library/Application Support/Claude/claude_desktop_config.json` - Claude Desktop config

**Note:** Backups are stored in `~/.claude/mcp-backups/` (NOT in git, contains secrets)

### Backup Naming

Format: `YYYYMMDD-HHMMSS-label`

Examples:
- `20260212-143022-before-chrome` - Before adding Chrome DevTools MCP
- `20260212-150133-working-state` - Known working configuration
- `20260212-143022` - Auto-generated (no label)

**Pro tip:** Use descriptive labels for important states:
```bash
./scripts/mcp-backup.sh "before-removing-old-mcps"
./scripts/mcp-backup.sh "working-playwright-chrome-notion"
```

---

## Scripts

### mcp-backup.sh

Creates timestamped snapshot of all MCP configs.

```bash
# Basic usage (auto-generated name)
./scripts/mcp-backup.sh

# With descriptive label (recommended)
./scripts/mcp-backup.sh "before-adding-chrome"
```

**Output:**
```
✓ Backed up claude-cli (61637 bytes)
✓ Backed up claude-settings (3419 bytes)
✓ Backed up claude-desktop (17 bytes)
✓ Created manifest

Location: ~/.claude/mcp-backups/20260212-143022-before-chrome
```

**What it does:**
1. Creates timestamped directory
2. Copies all MCP config files that exist
3. Generates manifest with metadata (timestamp, SHA256 hashes, file sizes)
4. Shows list of recent backups

**Edge cases handled:**
- Spaces in paths (uses proper quoting)
- Missing configs (warns but continues)
- Permission issues (fails with clear error)

---

### mcp-restore.sh

Restores MCP configs from a backup.

```bash
# Interactive selection (shows list)
./scripts/mcp-restore.sh

# Restore specific backup by name
./scripts/mcp-restore.sh 20260212-143022-before-chrome

# Restore latest backup
./scripts/mcp-restore.sh --latest
```

**Safety features:**
1. **Creates safety backup FIRST** - `pre-restore-TIMESTAMP` backup of current state
2. **Confirmation prompt** - Must type 'y' to proceed
3. **Shows backup metadata** - Timestamp, label, what will be restored

**Recovery workflow:**
```bash
$ ./scripts/mcp-restore.sh

Available backups:

1) 20260212-150133-working-state
2) 20260212-143022-before-chrome
3) 20260211-090000

Select backup to restore [1-3] or 'q' to quit: 1

Restore from: 20260212-150133-working-state
  Created: 2026-02-12T15:01:33-08:00
  Label: working-state

⚠ Creating safety backup of current state: pre-restore-20260212-151045
✓ Safety backup created

Restore this backup? This will overwrite current configs. [y/N] y

✓ Restored claude-cli
✓ Restored claude-settings
✓ Restored claude-desktop

Restored: 3 files
ℹ Safety backup available at: pre-restore-20260212-151045

⚠ Restart Claude CLI/Desktop for changes to take effect
```

---

### mcp-validate.sh

Checks MCP configs for common issues.

```bash
./scripts/mcp-validate.sh
```

**Checks performed:**

1. **Config file discovery** - Finds all MCP config locations
2. **JSON validity** - Validates syntax (requires `jq`)
3. **Duplicate servers** - Detects same MCP server in multiple configs
4. **Path issues** - Warns about unquoted paths with spaces
5. **Server inventory** - Lists all configured MCP servers

**Example output:**
```
✓ Found: claude-cli (61637 bytes)
✓ Found: claude-settings (3419 bytes)
⚠ Multiple MCP config locations found (may cause conflicts)

✓ claude-cli: Valid JSON
✓ claude-settings: Valid JSON

✗ Duplicate server 'playwright' in:
    - claude-cli
    - claude-settings

Configured MCP servers:
  - chrome-devtools (in claude-cli)
  - playwright (in claude-cli)
  - playwright (in claude-settings)  ← DUPLICATE

⚠ Recommendation: Consolidate to a single MCP config location
  Suggested: ~/.claude.json (Claude CLI standard)
```

**Exit codes:**
- `0` - All checks passed
- `1` - Critical issues found (duplicates, invalid JSON)

---

### mcp-diff.sh

Compare current configs with a backup.

```bash
# Compare with latest backup
./scripts/mcp-diff.sh

# Compare with specific backup
./scripts/mcp-diff.sh 20260212-143022-before-chrome
```

**Use cases:**
- "What changed since my last working state?"
- "Did that MCP install modify unexpected configs?"
- "Verify restore worked correctly"

**Example output:**
```
--- claude-cli ---
⚠ CHANGED

-  "chrome-devtools": {
-    "command": "npx",
-    "args": ["-y", "@cloudflare/mcp-server-chrome-devtools"]
-  },

--- claude-settings ---
✓ No changes

--- claude-desktop ---
✓ No changes
```

---

## Pre-Change Checklist

Before touching ANY MCP configuration:

```bash
# 1. Validate current state (should pass)
./scripts/mcp-validate.sh

# 2. Create labeled backup
./scripts/mcp-backup.sh "before-<change-description>"

# 3. Make your change (edit configs, run installers, etc.)
code ~/.claude.json

# 4. Validate new state (check for issues)
./scripts/mcp-validate.sh

# 5. If validation passes: backup working state
./scripts/mcp-backup.sh "working-state-after-<change>"

# 6. If validation fails: restore previous backup
./scripts/mcp-restore.sh  # select the "before-" backup
```

**Real example:**
```bash
# Adding Chrome DevTools MCP
./scripts/mcp-validate.sh                          # ✓ Current state valid
./scripts/mcp-backup.sh "before-chrome-devtools"   # ✓ Backup created
code ~/.claude.json                                # Make changes
./scripts/mcp-validate.sh                          # ✗ Duplicate found!
./scripts/mcp-restore.sh before-chrome-devtools    # ✓ Rolled back
```

---

## Recovery Procedures

### Scenario 1: "My MCP configs are broken"

```bash
# Step 1: Restore last known working backup
./scripts/mcp-restore.sh

# Step 2: Select most recent "working-state-" backup
# (Interactive prompt will show list)

# Step 3: Restart Claude CLI/Desktop
pkill -f "claude-desktop" || true  # If using Claude Desktop
# Then relaunch application

# Step 4: Test MCP servers work
# Open Claude CLI and verify MCP servers load
```

### Scenario 2: "I made changes and now Claude won't start"

```bash
# Likely JSON syntax error

# Step 1: Validate to see the error
./scripts/mcp-validate.sh
# Output will show which file has invalid JSON

# Step 2: Either fix manually or restore
./scripts/mcp-restore.sh --latest

# Step 3: Restart Claude
```

### Scenario 3: "I have duplicate MCP servers"

```bash
# Step 1: Find the duplicates
./scripts/mcp-validate.sh
# Output shows which servers are duplicated and where

# Step 2: Backup before fixing
./scripts/mcp-backup.sh "before-dedup"

# Step 3: Decide on canonical location
# Recommended: ~/.claude.json (Claude CLI standard)

# Step 4: Manually edit to remove duplicates
code ~/.claude.json
code ~/.claude/settings.json

# Step 5: Validate fix
./scripts/mcp-validate.sh  # Should pass now

# Step 6: Backup working state
./scripts/mcp-backup.sh "dedup-complete"
```

### Scenario 4: "I want to compare what changed"

```bash
# If you have a backup from before the change
./scripts/mcp-diff.sh backup-name

# If you just want to see what's in your current config
cat ~/.claude.json | jq '.mcpServers | keys'
```

---

## Testing Recovery Without Breaking Current Setup

**Safe testing workflow:**

```bash
# 1. Backup current working state
./scripts/mcp-backup.sh "working-before-test"

# 2. Restore an old backup (to test restore process)
./scripts/mcp-restore.sh some-old-backup
# (This creates a safety backup automatically)

# 3. Verify restore worked
./scripts/mcp-diff.sh some-old-backup  # Should show "No differences"

# 4. Restore back to working state
./scripts/mcp-restore.sh working-before-test

# 5. Verify we're back
./scripts/mcp-diff.sh working-before-test  # Should show "No differences"
```

**What you learn:**
- Restore process works correctly
- Safety backups are created
- Configs can be round-tripped without data loss

---

## Automation

### Daily Automatic Backups (Optional)

Add to crontab to create daily backups:

```bash
# Edit crontab
crontab -e

# Add this line (daily at 9am)
0 9 * * * cd ~/Projects/public/claritypledge && ./scripts/mcp-backup.sh "daily-auto" >> ~/.claude/mcp-backups/auto-backup.log 2>&1
```

**Cleanup old backups:**

```bash
# Keep only last 30 days of backups
find ~/.claude/mcp-backups -type d -mtime +30 -exec rm -rf {} \;

# Or add to weekly cron
0 9 * * 0 find ~/.claude/mcp-backups -type d -mtime +30 -exec rm -rf {} \;
```

---

## Backup Storage & Secrets

### Security

**Backups contain secrets:**
- API keys for MCP servers
- Access tokens
- Private configurations

**Storage location:**
- `~/.claude/mcp-backups/` - NOT in git
- NOT synced to cloud (unless you encrypt them)
- File permissions: 700 (owner only)

### Including in System Backups

If using the system-wide backup script (`./scripts/backup-local.sh`), it already backs up `~/.claude/` (excluding credentials cache).

**What's backed up:**
- Skills and commands
- Settings
- MCP configs (via `~/.claude/mcp-backups/`)

**What's NOT backed up:**
- Cached credentials
- Session state
- Temporary files

---

## Troubleshooting

### "jq not installed"

Validation and diff tools work better with `jq`:

```bash
brew install jq
```

Scripts still work without it, but with reduced functionality.

### "Permission denied"

Backup/restore scripts need read/write access to:
- `~/.claude/`
- `~/Library/Application Support/Claude/`

If using cloud sync (Dropbox/Google Drive), ensure Claude app isn't running during restore.

### "Backup not found"

List available backups:

```bash
ls -1t ~/.claude/mcp-backups/
```

Or use interactive restore:

```bash
./scripts/mcp-restore.sh  # No arguments = interactive
```

### "Restore didn't work"

Check the safety backup:

```bash
# Find the pre-restore backup
ls -1t ~/.claude/mcp-backups/ | grep pre-restore

# Restore it
./scripts/mcp-restore.sh pre-restore-TIMESTAMP
```

---

## Best Practices

1. **Label your backups** - `./scripts/mcp-backup.sh "descriptive-label"`
2. **Validate before committing changes** - Catch errors early
3. **Keep "working-state" bookmarks** - After successful changes, backup with "working-state-" prefix
4. **Use diff to understand changes** - Before restoring, see what you'll lose
5. **Don't delete backups manually** - Let automation clean up old ones
6. **Test recovery periodically** - Practice the restore process when not under pressure

---

## Reference: MCP Config Locations

| Location | Purpose | Used By |
|----------|---------|---------|
| `~/.claude.json` | Main MCP config | Claude CLI |
| `~/.claude/settings.json` | Additional settings | Claude CLI |
| `~/Library/Application Support/Claude/claude_desktop_config.json` | Desktop app config | Claude Desktop |
| `.mcp.json` (project-local) | Project-specific MCPs | Claude CLI (per-project) |

**Recommended:** Consolidate to `~/.claude.json` unless you need separation.

---

## Related

- System backup: `./scripts/backup-local.sh` (includes MCP configs)
- MCP server management: See Claude CLI docs
- Shell config backups: Included in `backup-local.sh` (`.zshrc`, `.zprofile`)
