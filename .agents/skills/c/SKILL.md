---
name: c
description: "Run a task in the cloud — works even when you close your laptop"
when_to_use: "When a task needs to run remotely or survive laptop close."
version: 1.0.0
---

# Cloud Agent

Run a task in the cloud. Works even when you close your laptop.

## Usage

```
/c claude Add feature X      # Claude + /loop + BMAD + visual checks (recommended)
/c Add feature X             # Gemini (simpler, no /loop or BMAD)
/c status                    # Check progress
/c pull                      # Get finished work back
```

## Claude vs Gemini

| Feature | Claude (`/c claude`) | Gemini (`/c`) |
|---------|---------------------|---------------|
| `/loop` workflow | ✅ | ❌ |
| BMAD agents | ✅ | ❌ |
| Playwright MCP | ✅ | ❌ |
| Chrome DevTools MCP | ✅ | ❌ |
| Best for | Complex features, UI | Quick fixes |

## Commands

| Command | What it does |
|---------|--------------|
| `/c [task]` | Run task with Gemini (default, no /loop) |
| `/c claude [task]` | Run with Claude + /loop + BMAD + visual checks |
| `/c status` | Check if running |
| `/c pull` | Get work back |
| `/c logs` | See full output |
| `/c stop` | Cancel task |
| `/c setup` | One-time login (run first!) |
| `/c setup-mcp` | Install Playwright + Chrome DevTools MCP |
| `/c pause` | Stop VM (save $) |
| `/c resume` | Start VM |

## How it works

1. Your code pushes to GitHub
2. Cloud pulls and runs AI agent
3. Cloud commits when done
4. You pull to get changes

## Arguments

$ARGUMENTS - Task description, or: claude [task], status, pull, stop, logs, setup, setup-mcp, pause, resume

## Implementation

```bash
./scripts/cloud-agent.sh $ARGUMENTS
```
