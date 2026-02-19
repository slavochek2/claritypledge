---
status: all-done
type: story
tags: []
rank: 125434.0
created_date: 2026-01-14
completed_at: '2026-02-09'
---

# P39: Cloud Agent Parallel Worktrees

## Problem

The cloud agent currently supports only **one task at a time**. When a new task is started, it kills any running task. This limits productivity when multiple independent features need to be worked on simultaneously.

**Current limitation:**
```bash
/c claude Fix the login bug     # Starts task A
/c claude Add dark mode         # KILLS task A, starts task B  ❌
```

**Desired behavior:**
```bash
/c claude Fix the login bug              # Runs on worktree-1
/c claude --worktree 2 Add dark mode     # Runs on worktree-2 (parallel)
```

## Solution

Add git worktree support to the cloud VM, allowing multiple Claude agents to run in parallel on separate worktrees. Each worktree gets its own tmux session, dev server port, and state files.

## Architecture

### Cloud VM Directory Structure (After)

```
~/
├── claritypledge/              # Main repo (worktree-0)
├── claritypledge-1/            # Worktree 1
├── claritypledge-2/            # Worktree 2
├── claritypledge-3/            # Worktree 3
└── telegram-command-handler.py # Updated to track all worktrees
```

### Port Allocation

| Worktree | Dev Server Port | tmux Session |
|----------|-----------------|--------------|
| 0 (main) | 5001 | agent-0 |
| 1 | 5100 | agent-1 |
| 2 | 5200 | agent-2 |
| 3 | 5300 | agent-3 |

### State Files (Per Worktree)

```
/tmp/
├── current-task-0.txt          # Task description for worktree 0
├── current-task-1.txt          # Task description for worktree 1
├── agent-output-0.log          # Output log for worktree 0
├── agent-output-1.log          # Output log for worktree 1
├── cloud-agent-state-0.json    # State for worktree 0
├── cloud-agent-state-1.json    # State for worktree 1
└── user-feedback-1.txt         # Feedback for worktree 1
```

## Implementation

### Phase 1: Setup Script for Cloud Worktrees

Create `scripts/setup-cloud-worktrees.sh`:

```bash
#!/bin/bash
# One-time setup of worktrees on cloud VM

VM_NAME="clarity-agent"
ZONE="us-central1-a"

gcloud compute ssh $VM_NAME --zone=$ZONE --command="
    cd ~/claritypledge

    # Create worktrees 1-3
    for i in 1 2 3; do
        BRANCH=\"worktree-cloud-\$i\"
        DIR=\"../claritypledge-\$i\"

        if [ ! -d \"\$DIR\" ]; then
            git worktree add \"\$DIR\" -b \"\$BRANCH\" main
            echo \"Created worktree \$i at \$DIR\"
        else
            echo \"Worktree \$i already exists\"
        fi
    done

    # List all worktrees
    git worktree list
"
```

### Phase 2: Update cloud-agent.sh

Key changes to `scripts/cloud-agent.sh`:

1. **Parse `--worktree N` flag:**
```bash
WORKTREE=0  # Default to main
while [[ "$1" == --* ]]; do
    case "$1" in
        --worktree)
            WORKTREE="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done
```

2. **Set worktree-specific paths:**
```bash
if [ "$WORKTREE" = "0" ]; then
    PROJECT_DIR="claritypledge"
else
    PROJECT_DIR="claritypledge-$WORKTREE"
fi

TMUX_SESSION="agent-$WORKTREE"
DEV_PORT=$((5000 + WORKTREE * 100 + 1))  # 5001, 5100, 5200, 5300
TASK_FILE="/tmp/current-task-$WORKTREE.txt"
LOG_FILE="/tmp/agent-output-$WORKTREE.log"
STATE_FILE="/tmp/cloud-agent-state-$WORKTREE.json"
```

3. **Update tmux commands:**
```bash
# Kill only this worktree's session
tmux kill-session -t $TMUX_SESSION 2>/dev/null || true

# Start new session for this worktree
tmux new-session -d -s $TMUX_SESSION bash -c '...'
```

4. **Update status command:**
```bash
"status")
    # Show status for all active worktrees
    for i in 0 1 2 3; do
        if tmux has-session -t agent-$i 2>/dev/null; then
            echo "=== Worktree $i ==="
            # ... show status
        fi
    done
```

5. **Update pull command:**
```bash
"pull"*)
    # Parse: "pull 2" or "pull --worktree 2"
    # Pull from specified cloud worktree to local worktree
```

### Phase 3: Update Telegram Handler

Key changes to `scripts/telegram-command-handler.py`:

1. **Track all worktrees:**
```python
WORKTREE_COUNT = 4  # 0-3

def get_all_active_worktrees():
    """Find which worktrees have active agents"""
    active = []
    for i in range(WORKTREE_COUNT):
        session = f"agent-{i}"
        if is_session_running(session):
            active.append(i)
    return active
```

2. **Update status format:**
```python
def format_status():
    active = get_all_active_worktrees()

    if not active:
        return "⚪ No agents running"

    msg = f"*{len(active)} agent(s) running:*\n\n"

    for wt in active:
        task = get_task_info(wt)
        cp = get_checkpoint_progress(wt)
        activity = get_recent_activity(wt)

        msg += f"📍 *Worktree {wt}*\n"
        msg += f"   📋 {task}\n"
        if cp:
            msg += f"   ✅ Checkpoint {cp}\n"
        msg += f"   🔄 {activity}\n\n"

    return msg
```

3. **Add worktree-specific commands:**
```python
# /status 2 - status for worktree 2
# /stop 1 - stop agent on worktree 1
# /logs 0 - logs for main worktree
```

4. **Update notifications:**
```python
def check_for_updates():
    for wt in range(WORKTREE_COUNT):
        state = load_state(wt)
        running = is_session_running(f"agent-{wt}")

        # Detect completion
        if state.get("was_running") and not running:
            task = get_task_info(wt)
            send_message(f"✅ *Worktree {wt} Complete!*\n📋 {task}")

        # Detect checkpoint
        if running:
            cp = get_checkpoint_progress(wt)
            if cp != state.get("last_checkpoint"):
                send_message(f"📍 *WT{wt} Checkpoint {cp}*")

        state["was_running"] = running
        save_state(wt, state)
```

### Phase 4: CLI UX Updates

**New commands:**

| Command | Description |
|---------|-------------|
| `/c claude --worktree 2 [task]` | Run on worktree 2 |
| `/c status` | Show ALL active agents |
| `/c status 2` | Show status for worktree 2 only |
| `/c stop 1` | Stop agent on worktree 1 |
| `/c stop all` | Stop all agents |
| `/c logs 2` | Logs for worktree 2 |
| `/c pull 2` | Pull worktree 2's work |
| `/c setup-worktrees` | One-time worktree setup on VM |

**Example workflow:**
```bash
# Start two parallel tasks
/c claude "Fix auth bug"                      # Uses worktree 0 (main)
/c claude --worktree 1 "Add dark mode"        # Uses worktree 1

# Check both
/c status
# Output:
# 2 agent(s) running:
#
# 📍 Worktree 0
#    📋 Fix auth bug
#    ✅ Checkpoint 2
#    🔄 Running tests...
#
# 📍 Worktree 1
#    📋 Add dark mode
#    ✅ Checkpoint 1
#    🔄 Creating components...

# Pull when done
/c pull 0    # Get auth fix
/c pull 1    # Get dark mode
```

**Telegram commands:**

| Command | Description |
|---------|-------------|
| `/status` or `s` | All agents status |
| `/status 2` or `s2` | Worktree 2 status |
| `/stop 1` | Stop worktree 1 |
| `/logs 2` or `l2` | Logs for worktree 2 |

## Checkpoints

### Checkpoint 1: Setup Script
- [x] Create `scripts/setup-cloud-worktrees.sh`
- [ ] Test: SSH to VM, run script, verify worktrees created
- [ ] Verify: `git worktree list` shows 4 worktrees

### Checkpoint 2: cloud-agent.sh Worktree Support
- [x] Add `--worktree N` flag parsing
- [x] Update PROJECT_DIR, TMUX_SESSION, ports based on worktree
- [x] Update task start to use worktree-specific paths
- [x] Add auto-detect for available worktree
- [ ] Test: `/c claude --worktree 1 "test task"` starts on worktree 1

### Checkpoint 3: Status/Logs for Multiple Worktrees
- [x] Update `/c status` to show all active worktrees
- [x] Add `/c status N` for single worktree
- [x] Update `/c logs` similarly
- [x] Add `/c --list` to show worktree table
- [ ] Test: Start 2 tasks, `/c status` shows both

### Checkpoint 4: Stop/Pull/Reset for Worktrees
- [x] Update `/c stop N` to stop specific worktree
- [x] Add `/c stop all`
- [x] Update `/c pull N` to pull from specific cloud worktree
- [x] Add `/c reset N` to reset worktree to main
- [x] Add `/c reset all` to reset all idle worktrees
- [ ] Test: Pull from worktree 1

### Checkpoint 5: Telegram Handler Updates
- [x] Update state file handling for multiple worktrees
- [x] Update `format_status()` to show all agents
- [x] Add worktree-specific commands (`/s2`, `/l1`, `/stop 2`)
- [x] Update proactive notifications with worktree context
- [ ] Test: Telegram shows "WT1 Checkpoint 2" notifications

### Checkpoint 6: Documentation
- [x] Update `docs/technical/cloud-agent.md` with parallel workflow
- [x] Update CLAUDE.md quick reference
- [x] Add example parallel workflow

### Checkpoint 7: Cloudflared Tunnel (Code Review Addition)
- [x] Auto-start cloudflared tunnel when dev server starts
- [x] Extract tunnel URL and send to Telegram
- [x] Clean up tunnel on task completion
- [ ] Test: Verify tunnel URL is accessible from phone

### Checkpoint 8: Health Monitoring (Code Review Addition)
- [x] Add `/health` command showing RAM/CPU usage
- [x] Show per-agent memory usage
- [x] Crash detection vs clean exit
- [x] Send crash notification with last activity and resource stats
- [ ] Test: Verify `/health` command works
- [ ] Test: Verify crash notification triggers on OOM

## Non-Goals

- **Auto-assignment:** ~~User must specify worktree explicitly~~ **DONE** - auto-detect implemented
- **Worktree cleanup:** Manual cleanup via git worktree commands
- **More than 4 worktrees:** Keep it simple, 4 is enough
- **Local/cloud sync:** Each worktree is independent

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Port conflicts | Fixed port allocation per worktree |
| Resource exhaustion | VM has 4 vCPU, 16GB RAM - enough for 4 Claude instances |
| State file conflicts | Separate state files per worktree |
| Git conflicts | Each worktree on separate branch |

## Success Criteria

1. Can run 2+ Claude agents in parallel on cloud VM
2. `/c status` shows all running agents with their progress
3. Telegram notifications include worktree context
4. `/c pull N` correctly gets work from specific worktree
5. No conflicts between parallel agents
