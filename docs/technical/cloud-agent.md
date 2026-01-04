# Cloud Agent

Run AI coding tasks in the cloud. Works even when you close your laptop.

## Quick Reference

```bash
/c Add dark mode to settings    # Run task with Gemini 3 Pro (default)
/c claude Fix the bug           # Run with Claude Opus 4.5
/c status                       # Check progress
/c pull                         # Get work back
/c pause                        # Stop VM (saves money)
```

## Telegram Commands

Send these to `@clarity_cloud_agent_bot`:

| Command | Action |
|---------|--------|
| `/status` | Check if running |
| `/logs` | Get recent output |
| `/stop` | Stop task |
| `/commit` | Manual checkpoint |
| `/help` | Show commands |

You'll also get notifications when tasks start/complete.

## Architecture

```
┌─────────────────┐     ┌──────────────────────────────────┐
│   Your Laptop   │     │   Google Cloud VM                │
│                 │     │   (clarity-agent)                │
│  ┌───────────┐  │     │                                  │
│  │  Cursor   │  │     │  ┌────────────┐  ┌────────────┐  │
│  │  + Claude │──┼─────┼──│   Claude   │  │  Telegram  │  │
│  └───────────┘  │     │  │   Code     │  │  Handler   │  │
│                 │     │  └─────┬──────┘  └─────┬──────┘  │
│                 │     │        │               │         │
└─────────────────┘     │        ▼               ▼         │
        │               │  ┌──────────────────────────┐    │
        │               │  │     Your Codebase        │    │
        ▼               │  │     (git clone)          │    │
   ┌─────────┐          │  └──────────────────────────┘    │
   │ GitHub  │◄─────────┤                                  │
   └─────────┘          └──────────────────────────────────┘
        │                           │
        ▼                           ▼
   ┌─────────┐              ┌──────────────┐
   │   PR    │              │   Telegram   │
   └─────────┘              │   (notify)   │
                            └──────────────┘
```

## How It Works

### Starting a Task

1. `/c [task]` pushes your local code to GitHub
2. VM pulls latest code
3. Creates feature branch: `cloud-agent/task-name-xxxxx`
4. Runs Claude with full permissions
5. Sends Telegram "Task Started" notification

### During Task

- Claude works **autonomously** (does NOT ask questions)
- Makes reasonable decisions based on the spec
- Periodic commits every 5 minutes
- Check progress: `/c status` or Telegram `/status`

### After Task

1. Final commit pushed to feature branch
2. Telegram "Task Complete" notification
3. Run `/c pull` to checkout locally
4. Review changes, then merge or create PR

## Commands Reference

### Task Commands

| Command | Description |
|---------|-------------|
| `/c [task]` | Run task with Gemini 3 Pro (default) |
| `/c claude [task]` | Run task with Claude Opus 4.5 |
| `/c status` | Check if agent is running |
| `/c logs` | See recent output |
| `/c pull` | Get work back (checkout feature branch) |
| `/c stop` | Cancel current task |

### VM Commands

| Command | Description |
|---------|-------------|
| `/c setup` | One-time SSH login |
| `/c pause` | Stop VM (saves ~$3/day) |
| `/c resume` | Start VM |

## VM Configuration

### Details

| Property | Value |
|----------|-------|
| Name | `clarity-agent` |
| Zone | `us-central1-a` |
| Type | `e2-standard-4` (4 vCPU, 16GB RAM) |
| Cost | ~$0.13/hour (~$3/day running) |
| OS | Ubuntu 22.04 LTS |
| Project Dir | `~/claritypledge` |

### Files on VM

| File | Purpose |
|------|---------|
| `~/claritypledge/` | Git clone of repo |
| `~/telegram-bot.sh` | Notification script |
| `~/telegram-command-handler.py` | Command handler |
| `~/.claude/settings.json` | Claude permissions |
| `/tmp/agent-output.log` | Current task output |

### Credentials Stored

| Credential | Location | Purpose |
|------------|----------|---------|
| GitHub PAT | In git remote URL | Push to GitHub |
| Claude API | `~/.claude/` | Run Claude Code |
| Telegram Token | In scripts | Notifications |

## Troubleshooting

### Agent stuck / no output

```bash
# Check if Claude is running
gcloud compute ssh clarity-agent --zone=us-central1-a --command="ps aux | grep claude"

# Kill and restart
/c stop
/c [task again]
```

### GitHub push fails

```bash
# Check remote URL has token
gcloud compute ssh clarity-agent --zone=us-central1-a --command="cd ~/claritypledge && git remote -v"

# If token missing, re-add:
gcloud compute ssh clarity-agent --zone=us-central1-a --command="cd ~/claritypledge && git remote set-url origin https://TOKEN@github.com/USER/REPO.git"
```

### Telegram not working

```bash
# Check handler is running
gcloud compute ssh clarity-agent --zone=us-central1-a --command="ps aux | grep telegram"

# Restart handler
gcloud compute ssh clarity-agent --zone=us-central1-a --command="pkill -f telegram-command-handler; nohup python3 ~/telegram-command-handler.py > /tmp/telegram-handler.log 2>&1 &"
```

### VM not responding

```bash
# Check VM status
gcloud compute instances describe clarity-agent --zone=us-central1-a --format="value(status)"

# Start if stopped
/c resume
```

## Cost Management

| State | Cost |
|-------|------|
| Running | ~$0.13/hour = $3.22/day |
| Stopped | ~$0.01/day (disk only) |

**Best practice:** Run `/c pause` when done for the day.

## Security Notes

- VM has no public IP (SSH via gcloud only)
- GitHub token has `repo` scope only
- Telegram bot only responds to your chat ID
- Claude runs with full permissions (trusted environment)

## Future Improvements

- [ ] Real-time Q&A via Telegram (agent asks, you reply)
- [ ] Auto-pause VM after idle timeout
- [ ] PR auto-creation option
- [ ] Cost alerts via Telegram
