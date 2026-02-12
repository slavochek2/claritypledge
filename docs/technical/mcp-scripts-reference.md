# MCP Scripts Reference

Quick reference for the MCP backup/recovery toolkit.

---

## Scripts

### mcp-backup.sh

**Purpose:** Create timestamped snapshot of all MCP configs

**Usage:**
```bash
./scripts/mcp-backup.sh                    # Auto-generated timestamp
./scripts/mcp-backup.sh "before-chrome"    # With descriptive label
```

**What it backs up:**
- `~/.claude.json` (Claude CLI config)
- `~/.claude/settings.json` (Claude CLI settings)
- `~/Library/Application Support/Claude/claude_desktop_config.json` (Claude Desktop config)

**Output location:** `~/.claude/mcp-backups/YYYYMMDD-HHMMSS-label/`

**Safe to run:** Yes, read-only operation

---

### mcp-restore.sh

**Purpose:** Restore MCP configs from a backup

**Usage:**
```bash
./scripts/mcp-restore.sh                 # Interactive selection
./scripts/mcp-restore.sh backup-name     # Restore specific backup
./scripts/mcp-restore.sh --latest        # Restore most recent
```

**Safety features:**
- Creates safety backup BEFORE restoring (named `pre-restore-TIMESTAMP`)
- Requires confirmation prompt
- Shows what will be restored

**Safe to run:** Yes (creates safety backup first)

**After running:** Restart Claude CLI/Desktop

---

### mcp-validate.sh

**Purpose:** Check MCP configs for issues

**Usage:**
```bash
./scripts/mcp-validate.sh
```

**Checks performed:**
1. Find all MCP config locations
2. Validate JSON syntax (requires `jq`)
3. Detect duplicate MCP servers across configs
4. List all configured servers
5. Warn about path issues (spaces, special chars)

**Exit codes:**
- `0` = No issues
- `1` = Critical issues found

**Safe to run:** Yes, read-only operation

---

### mcp-diff.sh

**Purpose:** Compare current configs with a backup

**Usage:**
```bash
./scripts/mcp-diff.sh                    # Compare with latest backup
./scripts/mcp-diff.sh backup-name        # Compare with specific backup
```

**Output:** Colored diff showing what changed

**Safe to run:** Yes, read-only operation

---

## Quick Commands

```bash
# Before making MCP changes
./scripts/mcp-validate.sh && ./scripts/mcp-backup.sh "before-X"

# After making changes
./scripts/mcp-validate.sh && ./scripts/mcp-backup.sh "working-X"

# Check what changed
./scripts/mcp-diff.sh

# Restore if broken
./scripts/mcp-restore.sh

# List backups
ls -1t ~/.claude/mcp-backups/

# Clean old backups (30+ days)
find ~/.claude/mcp-backups -type d -mtime +30 -exec rm -rf {} \;
```

---

## Workflow Integration

### Adding New MCP Server

```bash
# 1. Before
./scripts/mcp-backup.sh "before-adding-$(mcp-name)"

# 2. Install (follow MCP's docs)
npx @modelcontextprotocol/create-server <mcp-name>

# 3. Validate
./scripts/mcp-validate.sh

# 4. After (if successful)
./scripts/mcp-backup.sh "working-with-$(mcp-name)"
```

### Removing Duplicate MCPs

```bash
# 1. Find duplicates
./scripts/mcp-validate.sh
# Output shows which servers are duplicated

# 2. Backup before fixing
./scripts/mcp-backup.sh "before-dedup"

# 3. Edit configs to remove duplicates
code ~/.claude.json

# 4. Validate fix
./scripts/mcp-validate.sh

# 5. Backup clean state
./scripts/mcp-backup.sh "dedup-complete"
```

### Recovering from Broken State

```bash
# 1. Restore last working backup
./scripts/mcp-restore.sh

# 2. Select most recent "working-" backup

# 3. Restart Claude

# 4. Verify
./scripts/mcp-validate.sh
```

---

## Backup Naming Conventions

**Good:**
- `before-chrome-devtools`
- `working-playwright-chrome-notion`
- `before-removing-old-mcps`
- `pre-production-deploy`

**Bad:**
- `backup1`
- `test`
- `new`
- `tmp`

**Pattern:**
- `before-<change>` - Before making a change
- `working-<state>` - Known working configuration
- `<feature>-baseline` - Initial state for a feature

---

## Backup Storage

**Location:** `~/.claude/mcp-backups/`

**Structure:**
```
~/.claude/mcp-backups/
├── 20260212-143022-before-chrome/
│   ├── manifest.json
│   ├── claude-cli.json
│   ├── claude-settings.json
│   └── claude-desktop.json
├── 20260212-150133-working-state/
│   └── ...
└── pre-restore-20260212-151045/
    └── ...
```

**Manifest contains:**
- Timestamp
- Label
- Hostname
- File hashes (SHA256)
- File sizes

**Security:** Contains API keys and secrets - NOT synced to cloud, NOT in git

---

## Troubleshooting

### jq not installed

```bash
brew install jq
```

Scripts work without jq but validation is limited.

### Permission denied

Check write access:

```bash
ls -la ~/.claude/
ls -la ~/Library/Application\ Support/Claude/
```

### No backups found

Create initial backup:

```bash
./scripts/mcp-backup.sh "baseline-state"
```

### Validation shows duplicates but I can't find them

Use jq to inspect:

```bash
# List servers in each config
jq '.mcpServers | keys' ~/.claude.json
jq '.mcpServers | keys' ~/.claude/settings.json
```

### Restore didn't work

Check the safety backup:

```bash
# Find pre-restore backups
ls -1t ~/.claude/mcp-backups/ | grep pre-restore

# Restore it
./scripts/mcp-restore.sh pre-restore-TIMESTAMP
```

---

## See Also

- [MCP Backup & Recovery Guide](./mcp-backup-recovery.md) - Full documentation
- [MCP Pre-Change Checklist](./mcp-pre-change-checklist.md) - Step-by-step checklist
- [System Backup Script](../../scripts/backup-local.sh) - Includes MCP configs
- [CLAUDE.md](../../CLAUDE.md) - Agent instructions for MCP safety
