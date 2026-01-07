# Cloud Agent

Run AI coding tasks in the cloud. Works even when you close your laptop. Supports **parallel execution** via worktrees.

## Quick Reference

```bash
/c claude Add dark mode         # Auto-picks available worktree (0-3)
/c claude -w 2 Fix auth bug     # Explicitly use worktree 2
/c status                       # Check ALL running agents
/c --list                       # See worktree states
/c pull 0                       # Get work from worktree 0
/c reset all                    # Reset all idle worktrees to main
/c pause                        # Stop VM (saves money)
```

## Parallel Execution

The cloud agent supports running **up to 4 agents simultaneously** using git worktrees:

| Worktree | Directory | Dev Port | tmux Session |
|----------|-----------|----------|--------------|
| 0 (main) | `~/claritypledge` | 5001 | `agent-0` |
| 1 | `~/claritypledge-1` | 5100 | `agent-1` |
| 2 | `~/claritypledge-2` | 5200 | `agent-2` |
| 3 | `~/claritypledge-3` | 5300 | `agent-3` |

### Example Parallel Workflow

```bash
# Start two tasks in parallel
/c claude "Fix auth bug"              # Auto-picks worktree 0
/c claude "Add dark mode"             # Auto-picks worktree 1 (0 is busy)

# Check both
/c status
# Output:
# === Worktree 0 (RUNNING) ===
# Task: Fix auth bug
# ...
# === Worktree 1 (RUNNING) ===
# Task: Add dark mode
# ...

# Pull when done
/c pull 0    # Get auth fix
/c pull 1    # Get dark mode

# Clean up for next tasks
/c reset all
```

### Setting Up Worktrees (One-Time)

```bash
/c setup-worktrees
```

This creates worktrees 1-3 on the cloud VM with their own branches, symlinks `.env.local` from the main repo, and installs dependencies.

### Auto-Exposed Dev URLs

When a Claude agent starts, it automatically:
1. Starts dev server on worktree-specific port
2. Creates a cloudflared tunnel for external access
3. Sends the public URL to Telegram

You'll receive a message like:
```
🔗 WT1: https://abc-xyz.trycloudflare.com
```

Click to test the feature from your phone while the agent works!

## Claude vs Gemini

| Feature | Claude (`/c claude`) | Gemini (`/c`) |
|---------|---------------------|---------------|
| `/loop` workflow | Yes | No |
| BMAD agents | Yes | No |
| Visual checks (Playwright MCP) | Yes | No |
| Unit + E2E tests | Automated | Manual only |
| Best for | Complex features, UI work | Quick refactors, simple fixes |
| Cost | Higher (Claude API) | Lower (Gemini API) |

**Recommendation:** Use `claude` for anything involving UI or complex logic.

## Telegram Integration

Send commands to `@clarity_cloud_agent_bot`:

| Command | Action |
|---------|--------|
| `/status` or `s` | All agents status |
| `/s2` | Worktree 2 status only |
| `/logs` or `l` | Recent output (first running agent) |
| `/l1` | Worktree 1 logs |
| `/stop` | Stop first running agent |
| `/stop 2` | Stop worktree 2 |
| `/stop all` | Stop all agents |
| `/commit` | Manual checkpoint (all agents) |
| `/health` | VM health (RAM, CPU, per-agent memory) |
| `/help` | Show commands |
| `[any text]` | Send instruction to all running agents |

### Proactive Notifications

The handler automatically sends (with worktree context):
- **WT0 Started:** when agent begins
- **WT1 Checkpoint 3:** when agent commits with `checkpoint-N:` pattern
- **WT2 Complete!** when agent finishes cleanly
- **WT1 CRASHED!** when agent stops unexpectedly (includes RAM/CPU stats and last activity)
- **🔗 WT1:** tunnel URL when dev server is ready

## Commands Reference

### Task Commands

| Command | Description |
|---------|-------------|
| `/c [task]` | Run task with Gemini (auto-picks worktree) |
| `/c claude [task]` | Run task with Claude (auto-picks worktree) |
| `/c claude -w N [task]` | Run on specific worktree N (0-3) |
| `/c status` | Check ALL running agents |
| `/c status N` | Check worktree N only |
| `/c logs N` | See output for worktree N |
| `/c --list` | Show all worktree states |
| `/c pull N` | Get work from worktree N |
| `/c stop N` | Stop agent on worktree N |
| `/c stop all` | Stop all running agents |

### Worktree Management

| Command | Description |
|---------|-------------|
| `/c setup-worktrees` | Create worktrees 1-3 on cloud VM |
| `/c reset N` | Reset worktree N to main (no agent running) |
| `/c reset all` | Reset all idle worktrees to main |

### VM Commands

| Command | Description |
|---------|-------------|
| `/c setup` | One-time SSH login |
| `/c setup-mcp` | Install Playwright MCP for visual checks |
| `/c pause` | Stop VM (saves ~$3/day) |
| `/c resume` | Start VM |

## Architecture

```
┌─────────────────┐     ┌─────────────────────────────────────────┐
│   Your Laptop   │     │   Google Cloud VM (clarity-agent)       │
│                 │     │                                         │
│  ┌───────────┐  │     │  ┌────────────┐   ┌────────────┐        │
│  │  Cursor   │  │     │  │  agent-0   │   │  agent-1   │        │
│  │  + Claude │──┼─────┼──│  (tmux)    │   │  (tmux)    │        │
│  └───────────┘  │     │  └─────┬──────┘   └─────┬──────┘        │
│                 │     │        │                 │               │
└─────────────────┘     │        ▼                 ▼               │
        │               │  ~/claritypledge  ~/claritypledge-1     │
        │               │    (port 5001)      (port 5100)         │
        ▼               │                                         │
   ┌─────────┐          │  ┌──────────────────────────────────┐   │
   │ GitHub  │◄─────────┤  │       Telegram Handler v3        │   │
   └─────────┘          │  │    (multi-worktree support)      │   │
        │               │  └──────────────────────────────────┘   │
        ▼               └─────────────────────────────────────────┘
   ┌─────────┐                          │
   │   PR    │                          ▼
   └─────────┘                   ┌──────────────┐
                                 │   Telegram   │
                                 └──────────────┘
```

## How It Works

### Auto-Detect Worktree

When you run `/c claude "task"` without specifying a worktree:
1. Script checks which worktrees have running agents
2. Picks the **first available** (no tmux session)
3. If all busy, shows error with options

### Starting a Task

1. `/c claude [task]` finds available worktree
2. Pushes your local code to GitHub
3. VM pulls latest code to that worktree
4. Creates feature branch: `cloud-agent/task-name-xxxxx`
5. Runs Claude with full permissions
6. Sends Telegram "WTN Started" notification

### During Task

- Claude works **autonomously** (does NOT ask questions)
- Makes reasonable decisions based on the spec
- Periodic commits every 5 minutes
- Dev server runs on worktree-specific port
- Check progress: `/c status` or Telegram `/s`

### After Task

1. Final commit pushed to feature branch
2. Telegram "WTN Complete!" notification
3. Run `/c pull N` to get work locally
4. Review changes, then merge or create PR
5. Run `/c reset N` to prepare worktree for next task

## VM Configuration

### Details

| Property | Value |
|----------|-------|
| Name | `clarity-agent` |
| Zone | `us-central1-a` |
| Type | `e2-standard-4` (4 vCPU, 16GB RAM) |
| Cost | ~$0.13/hour (~$3/day running) |
| OS | Ubuntu 22.04 LTS |

### Files on VM

| File | Purpose |
|------|---------|
| `~/claritypledge/` | Main repo (worktree 0) |
| `~/claritypledge-1/` | Worktree 1 |
| `~/claritypledge-2/` | Worktree 2 |
| `~/claritypledge-3/` | Worktree 3 |
| `~/telegram-command-handler.py` | Command handler v3 |
| `/tmp/current-task-N.txt` | Task for worktree N |
| `/tmp/agent-output-N.log` | Output for worktree N |
| `/tmp/cloud-agent-multi-state.json` | Multi-worktree state |

### Credentials Stored

| Credential | Location | Purpose |
|------------|----------|---------|
| GitHub PAT | In git remote URL | Push to GitHub |
| Claude API | `~/.claude/` | Run Claude Code |
| `TELEGRAM_BOT_TOKEN` | Environment variable | Telegram bot API |
| `TELEGRAM_CHAT_ID` | Environment variable | Your Telegram chat ID |

## Troubleshooting

### Check worktree status

```bash
/c --list

# Or via SSH:
gcloud compute ssh clarity-agent --zone=us-central1-a --command="git worktree list"
```

### Agent stuck / no output

```bash
# Check specific worktree
gcloud compute ssh clarity-agent --zone=us-central1-a --command="tmux has-session -t agent-1 && echo running || echo stopped"

# Kill and restart
/c stop 1
/c claude -w 1 [task again]
```

### Reset a stuck worktree

```bash
/c reset 1   # Requires agent-1 to be stopped first
```

### All worktrees busy

```bash
/c --list        # See what's running
/c stop all      # Stop everything
/c reset all     # Reset to main
```

### Telegram not working

```bash
# Check handler is running
gcloud compute ssh clarity-agent --zone=us-central1-a --command="ps aux | grep telegram"

# Restart handler
gcloud compute ssh clarity-agent --zone=us-central1-a --command="pkill -f telegram-command-handler; nohup python3 ~/telegram-command-handler.py > /tmp/telegram-handler.log 2>&1 &"
```

## Cost Management

| State | Cost |
|-------|------|
| Running (4 agents) | ~$0.13/hour = $3.22/day |
| Stopped | ~$0.01/day (disk only) |

**Best practice:** Run `/c pause` when done for the day.

## /loop Workflow and BMAD

When using Claude (`/c claude`), the agent automatically uses the `/loop` workflow which includes:

1. **Task Analysis** - Determines task type, complexity, and required steps
2. **Implementation** - Reads existing code, follows patterns
3. **Unit Tests** - Runs `npm test`, fixes failures
4. **Visual Check** - Uses Playwright MCP to verify UI (dev server on worktree port)
5. **E2E Tests** - Runs `npx playwright test` (if applicable)
6. **UX Review** - Checks against design system (for significant UI features)

### Available BMAD Commands (Claude only)

```
/bmad:bmm:agents:dev            # Developer agent persona
/bmad:bmm:agents:architect      # Architect agent persona
/bmad:bmm:workflows:dev-story   # Execute a story file
/bmad:bmm:workflows:code-review # Code review workflow
```

### First-Time Setup

Before using visual checks, install Playwright MCP:

```bash
/c setup-mcp
```

This installs:
- Playwright + Chromium browser
- MCP server for Claude Code
- System dependencies for headless browser
