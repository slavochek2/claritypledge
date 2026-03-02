# Git Worktree Setup

## Overview

Worktrees provide isolated working directories on separate branches. The active pattern is **agent worktrees** — created on demand when needed for isolation. Named worktrees (`claritypledge-1..5`) are legacy and not maintained.

---

## When Worktrees Are Used

**1. Risky or experimental changes**

Major refactors (10+ files), new frameworks, or anything labeled experimental. Easy rollback if the experiment fails.

**2. Index collision — parallel feature work**

Two Claude sessions running simultaneously share the same git staging area. Uncommitted changes from one session can be swept into the other's commit. When `git status` shows uncommitted changes from a different feature, create a worktree for the new feature before starting.

---

## Creating a Worktree

```bash
# Create a worktree — always use slot name w1 or w2, not the feature name
# The branch carries the feature identity
git worktree add .claude/worktrees/w1 -b feature/pN-description

# Then run setup (symlinks .env.local and node_modules)
./scripts/setup-worktree.sh .claude/worktrees/w1
```

> **Note:** Always name the worktree by slot (w1, w2), not by feature (e.g., not p465). The branch name carries the feature. This keeps `start w1` and `kanban w1` working.

---

## Setup (Required After Creation)

Immediately after creating any worktree, run:

```bash
./scripts/setup-worktree.sh .claude/worktrees/w1
```

**What it does:** Symlinks `.env.local` and `node_modules` from the main repo into the worktree.

**Why it's required:** New worktrees don't include gitignored files or installed dependencies. Without `.env.local`, any script that reads credentials (migrations, edge function deploys, test setup) will silently fail. Without `node_modules`, nothing runs.

**Note:** The script has a hardcoded `MAIN_REPO` path (`/Users/slavochek/Projects/public/claritypledge`). If the repo is cloned elsewhere, update line 9 of `scripts/setup-worktree.sh` before running.

---

## Running a Dev Server in a Worktree

Ports are fixed by slot — no hunting required:

```bash
# Ports are fixed by slot — no hunting required
cd .claude/worktrees/w1
npm run dev -- --port 5100   # w1 is always 5100

cd .claude/worktrees/w2
npm run dev -- --port 5200   # w2 is always 5200
```

Or use: `start w1` from terminal (handles this automatically).

Port reference: w0 (main) = 5001, w1 = 5100, w2 = 5200.

---

## Listing and Removing Worktrees

```bash
# List all worktrees
git worktree list

# Remove a worktree (after work is merged or abandoned)
git worktree remove .claude/worktrees/w1
```
