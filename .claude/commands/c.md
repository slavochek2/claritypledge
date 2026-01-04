# Cloud Agent

Run a task in the cloud. Works even when you close your laptop.

## Usage

```
/c Add dark mode to settings          # Uses Claude (default)
/c gemini Add dark mode to settings   # Uses Gemini 2.5 Pro
/c status                             # Check progress
/c pull                               # Get finished work back
```

## Commands

| Command | What it does |
|---------|--------------|
| `/c [task]` | Run task with Claude Opus 4.5 |
| `/c gemini [task]` | Run task with Gemini 2.0 Flash |
| `/c status` | Check if running |
| `/c pull` | Get work back |
| `/c logs` | See full output |
| `/c stop` | Cancel task |
| `/c setup` | One-time login (run first!) |
| `/c pause` | Stop VM (save $) |
| `/c resume` | Start VM |
| `/c overnight` | Run lint, tests, refactoring overnight |

## How it works

1. Your code pushes to GitHub
2. Cloud pulls and runs AI agent
3. Cloud commits when done
4. You pull to get changes

## Arguments

$ARGUMENTS - Task description, or: gemini [task], status, pull, stop, logs, setup, pause, resume

## Implementation

```bash
./scripts/cloud-agent.sh $ARGUMENTS
```
