# MCP Pre-Change Checklist

**ALWAYS follow this checklist before touching MCP configs.**

Copy this into your terminal session before making changes:

```bash
# === MCP CHANGE CHECKLIST ===
# Change description: ________________________________

# 1. Validate current state
./scripts/mcp-validate.sh

# 2. Create labeled backup
./scripts/mcp-backup.sh "before-<change-description>"

# 3. Make your changes
# (edit configs, run installers, etc.)

# 4. Validate new state
./scripts/mcp-validate.sh

# 5a. If validation PASSED - backup working state
./scripts/mcp-backup.sh "working-state-after-<change>"

# 5b. If validation FAILED - restore previous backup
./scripts/mcp-restore.sh  # Select the "before-" backup
```

---

## Real Examples

### Example 1: Adding Chrome DevTools MCP

```bash
# 1. Validate current state
./scripts/mcp-validate.sh
# ✓ All checks passed

# 2. Backup
./scripts/mcp-backup.sh "before-chrome-devtools"
# ✓ Backup created: 20260212-143022-before-chrome-devtools

# 3. Make changes
npx @modelcontextprotocol/create-server chrome-devtools
# This modifies ~/.claude.json

# 4. Validate
./scripts/mcp-validate.sh
# ✓ All checks passed

# 5. Backup working state
./scripts/mcp-backup.sh "working-chrome-devtools"
# ✓ Backup created: 20260212-143145-working-chrome-devtools
```

### Example 2: Removing Duplicate MCP Servers

```bash
# 1. Validate (finds duplicates)
./scripts/mcp-validate.sh
# ✗ Duplicate server 'playwright' in:
#     - claude-cli
#     - claude-settings

# 2. Backup before fixing
./scripts/mcp-backup.sh "before-dedup"

# 3. Edit configs to remove duplicates
code ~/.claude.json
code ~/.claude/settings.json

# 4. Validate fix
./scripts/mcp-validate.sh
# ✓ No duplicate servers found

# 5. Backup clean state
./scripts/mcp-backup.sh "dedup-complete"
```

### Example 3: Validation Failed - Rollback

```bash
# 1. Validate
./scripts/mcp-validate.sh
# ✓ All checks passed

# 2. Backup
./scripts/mcp-backup.sh "before-experiment"

# 3. Make changes
code ~/.claude.json
# (accidentally introduce JSON syntax error)

# 4. Validate
./scripts/mcp-validate.sh
# ✗ claude-cli: INVALID JSON
#   parse error: Expected separator between values at line 45

# 5. ROLLBACK (don't try to fix manually)
./scripts/mcp-restore.sh before-experiment
# ✓ Restored: 3 files
# ✓ Safety backup created: pre-restore-20260212-143500
```

---

## Common Mistakes to Avoid

### ❌ DON'T: Skip the validation step

```bash
# BAD: Make changes without validating first
code ~/.claude.json  # Edit directly
# (Now you have no baseline to compare against)
```

### ✓ DO: Always validate before changing

```bash
# GOOD: Validate, backup, change
./scripts/mcp-validate.sh
./scripts/mcp-backup.sh "before-change"
code ~/.claude.json
./scripts/mcp-validate.sh
```

---

### ❌ DON'T: Use generic backup labels

```bash
# BAD: Unclear what changed
./scripts/mcp-backup.sh "backup1"
./scripts/mcp-backup.sh "test"
./scripts/mcp-backup.sh "new"
```

### ✓ DO: Use descriptive labels

```bash
# GOOD: Clear purpose
./scripts/mcp-backup.sh "before-chrome-devtools"
./scripts/mcp-backup.sh "working-playwright-chrome-notion"
./scripts/mcp-backup.sh "before-removing-old-mcps"
```

---

### ❌ DON'T: Edit configs in multiple locations at once

```bash
# BAD: Changes scattered across files
code ~/.claude.json &
code ~/.claude/settings.json &
code ~/Library/Application\ Support/Claude/claude_desktop_config.json &
# (Now you have state spread across 3 files, hard to reason about)
```

### ✓ DO: Consolidate to one location first

```bash
# GOOD: Single source of truth
./scripts/mcp-validate.sh  # Shows you have multiple configs
./scripts/mcp-backup.sh "before-consolidation"

# Move all MCP servers to ~/.claude.json
# Delete MCP configs from other files

./scripts/mcp-validate.sh  # Verify single config
./scripts/mcp-backup.sh "consolidated-to-claude-json"
```

---

### ❌ DON'T: Manually copy config files with cp

```bash
# BAD: Spaces in paths break this
cp ~/Library/Application Support/Claude/claude_desktop_config.json ~/backup.json
# Error: No such file or directory
```

### ✓ DO: Use the backup script (handles spaces correctly)

```bash
# GOOD: Script handles all edge cases
./scripts/mcp-backup.sh "manual-backup"
```

---

### ❌ DON'T: Commit MCP configs to git

```bash
# BAD: Contains API keys and secrets
git add ~/.claude.json
git commit -m "Add MCP config"
# (Just leaked your API keys to git history - CATASTROPHIC)
```

### ✓ DO: Use the MCP backup scripts (stored in ~/.claude/mcp-backups)

```bash
# GOOD: Backups stay local, not in git
./scripts/mcp-backup.sh "state-before-deploy"
# Stored in ~/.claude/mcp-backups/ (excluded from git)
```

---

## Quick Recovery Commands

### "I broke my MCP config"

```bash
./scripts/mcp-restore.sh  # Interactive selection
```

### "What changed since my last backup?"

```bash
./scripts/mcp-diff.sh
```

### "Are there any issues with my current config?"

```bash
./scripts/mcp-validate.sh
```

### "List all my backups"

```bash
ls -1t ~/.claude/mcp-backups/
```

### "Restore most recent backup"

```bash
./scripts/mcp-restore.sh --latest
```

---

## When to Use Each Script

| Situation | Command |
|-----------|---------|
| Before ANY config change | `./scripts/mcp-backup.sh "before-X"` |
| After successful change | `./scripts/mcp-backup.sh "working-state-X"` |
| Check for problems | `./scripts/mcp-validate.sh` |
| See what changed | `./scripts/mcp-diff.sh` |
| Restore from backup | `./scripts/mcp-restore.sh` |
| Find duplicates | `./scripts/mcp-validate.sh` |

---

## Integration with Other Workflows

### Before Installing New MCP Servers

```bash
# 1. Backup first
./scripts/mcp-backup.sh "before-installing-$(date +%Y%m%d)"

# 2. Install MCP (follows their docs)
npx @modelcontextprotocol/create-server <mcp-name>

# 3. Validate
./scripts/mcp-validate.sh

# 4. Test it works
# (Open Claude CLI, verify MCP loads)

# 5. Backup working state
./scripts/mcp-backup.sh "working-with-<mcp-name>"
```

### Before System Backup

```bash
# Ensure MCP configs are valid before backing up entire system
./scripts/mcp-validate.sh
# Only run system backup if this passes
./scripts/backup-local.sh
```

### Before Reinstalling Claude

```bash
# 1. Backup current MCP state
./scripts/mcp-backup.sh "before-claude-reinstall"

# 2. Reinstall Claude app

# 3. Restore MCP configs
./scripts/mcp-restore.sh before-claude-reinstall

# 4. Restart Claude
```

---

## Troubleshooting

### Validation fails with "jq not installed"

```bash
brew install jq
```

Scripts work without jq, but validation is better with it.

### Restore creates safety backup but fails to copy

Check permissions:

```bash
ls -la ~/.claude/
ls -la ~/Library/Application\ Support/Claude/
```

Ensure you have write access.

### "No backups found"

First time setup - create a baseline:

```bash
./scripts/mcp-backup.sh "baseline-state"
```

### Want to delete old backups

Keep only last 30 days:

```bash
find ~/.claude/mcp-backups -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null
```

---

## See Also

- [MCP Backup & Recovery Guide](./mcp-backup-recovery.md) - Full documentation
- [System Backup](../../scripts/backup-local.sh) - Includes MCP configs in encrypted backups
- Claude MCP Docs - https://modelcontextprotocol.io/
