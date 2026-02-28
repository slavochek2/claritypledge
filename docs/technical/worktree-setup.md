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
# Option A: manually with git
git worktree add .claude/worktrees/feature-name -b feature/pN-description

# Option B: via the EnterWorktree tool in Claude
# Use the EnterWorktree tool — it creates a worktree under .claude/worktrees/ automatically
```

---

## Setup (Required After Creation)

Immediately after creating any worktree, run:

```bash
./scripts/setup-worktree.sh .claude/worktrees/feature-name
```

**What it does:** Symlinks `.env.local` and `node_modules` from the main repo into the worktree.

**Why it's required:** New worktrees don't include gitignored files or installed dependencies. Without `.env.local`, any script that reads credentials (migrations, edge function deploys, test setup) will silently fail. Without `node_modules`, nothing runs.

---

## Running a Dev Server in a Worktree

No pre-configured ports. Pick any free port:

```bash
cd .claude/worktrees/feature-name
npm run dev -- --port 5101
```

---

## Listing and Removing Worktrees

```bash
# List all worktrees
git worktree list

# Remove a worktree (after work is merged or abandoned)
git worktree remove .claude/worktrees/feature-name
```

---

## Legacy: Named Worktrees

`claritypledge-1` through `claritypledge-5` exist at `../claritypledge-N` (sibling directories to the main repo). They were set up for parallel visual comparison — running multiple dev servers at fixed ports (5100–5500) to compare different implementations side by side. This workflow is no longer the active pattern. Don't create new named worktrees; don't rely on the existing ones having correct setup.
