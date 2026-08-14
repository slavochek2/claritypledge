---
status: backlog
type: task
rank: 33
workstream: foundation
tags: []
created_date: 2026-01-11
---
# P52: Cloud Agent & Telegram Bot Simplification

---

## Problem

The cloud agent and telegram bot have become unmanageably complex:

1. **Script argument parsing brittle**: `/c status` and `/c logs 1` were interpreted as new tasks instead of commands
2. **Wrong branch detection**: Agent started from `main` instead of specified `worktree-1`
3. **Build artifacts committed**: `.next/` folder not properly gitignored on cloud
4. **Multiple junk branches created**: `cloud-agent/logs-1-5004`, `cloud-agent/status-1-5024`
5. **Model confusion**: Sometimes used Gemini when Claude was requested
6. **Too many features**: Worktrees, parallel execution, multiple models, telegram integration - each adds complexity

---

## Learnings

| What Failed | Why | Fix |
|-------------|-----|-----|
| Branch targeting | Script creates new branch from main, ignores `-w` for base | Explicit `--base-branch` param |
| Command parsing | Positional args ambiguous | Subcommand pattern: `/c run`, `/c status`, `/c logs` |
| Build artifacts | Cloud `.gitignore` out of sync | Sync gitignore or add to script |
| Model selection | `claude` prefix not always honored | Explicit `--model` flag |
| Worktree complexity | 4 worktrees hard to track | Maybe just 1-2 max |

---

## Proposed Simplification

### Option A: KISS - Single Worktree
- Remove parallel worktree support
- One cloud agent, one branch at a time
- Simple: `/c run "task"`, `/c status`, `/c stop`, `/c pull`

### Option B: Explicit Everything
- Keep worktrees but require explicit flags
- `/c run --worktree=1 --base=worktree-1 --model=claude "task"`
- Verbose but unambiguous

### Option C: Deprecate Cloud Agent
- Use local Claude Code only
- Cloud for overnight batch jobs via simple cron
- Remove real-time cloud execution

---

## Decision

TBD. **Trying Clawdbot first** (Jan 2026).

If Clawdbot handles cloud dev tasks well → deprecate current `/c` system entirely.
If not → proceed with Option A (KISS single worktree).

### Clawdbot Experiment
- Install on existing `clarity-agent` VM (separate user for isolation)
- Use Gemini API with Google Cloud quotas (hard cap)
- Evaluate if it replaces need for custom cloud agent scripts

---

## Related

- Cloud agent docs: `docs/technical/cloud-agent.md`
- Telegram bot: `scripts/telegram-bot/`
- P49: Telegram bot KISS refactor (partial)
