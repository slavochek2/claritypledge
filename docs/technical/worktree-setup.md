# Git Worktree Setup

## Overview

Worktrees are the **default isolation mechanism** for all `/dev` and `/fix` work. Every P-number feature gets a worktree; branches are the mechanism inside worktrees, not a standalone workflow.

**Why worktrees over branches alone:** Worktrees provide parallel testing (fixed ports), visual tracking (`kanban w1`), and session isolation (separate directories). A branch-only experiment (P483–P488, March 2026) produced orphaned branches, cross-contaminated commits, and a "ship without testing" pattern within 10 days. See [decisions.md 2026-03-07](../decisions.md).

**Exception — branch-only:** Single-file trivial fixes (typo, copy change, config tweak) where creating a worktree would be overhead. These can go directly on a feature branch or main.

**Vite cache isolation:** All worktrees symlink `node_modules/` to main. `vite.config.ts` sets `cacheDir` per worktree slot (`node_modules/.vite-w1`, `.vite-w2`, etc.) so concurrent dev servers don't corrupt each other's pre-bundled dependencies. See [decisions.md 2026-03-13](../decisions.md).

---

## When Worktrees Are Created

**1. Any `/dev` or `/fix` run on a P-number feature** — default behavior, not a special case.

**2. Risky or experimental changes** — major refactors (10+ files), new frameworks, anything labeled experimental.

**3. Index collision** — `git status` shows uncommitted changes from a different feature.

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

**Note:** The script auto-detects `MAIN_REPO` from its own location (no hardcoded paths).

---

## Running a Dev Server in a Worktree

Ports are auto-detected from the worktree slot — just run `npm run dev`:

```bash
cd .claude/worktrees/w1
npm run dev   # auto-binds to 5100 (w1), kills any zombie on that port first
```

Port reference: w0 (main) = 5001, w1 = 5100, w2 = 5200, named worktrees = 5800-5899 (hash-based).

**Kill-on-start:** The `predev` hook (`check-worktree-env.sh`) automatically kills any existing process on the worktree's port before Vite starts. This prevents zombie accumulation — no manual cleanup needed.

**Pre-commit zombie scan:** `pre-commit-checks.sh` section 19 detects Vite processes whose cwd points to a deleted worktree directory and warns with the PID to kill.

---

## Listing and Removing Worktrees

```bash
# Always list first — confirms the worktree is still registered
git worktree list

# Remove a registered worktree (run from MAIN REPO ROOT — never from inside the worktree)
git worktree remove .claude/worktrees/w1

# If the directory exists on disk but is NOT in `git worktree list` output,
# prune stale registry entries first, then remove the directory:
git worktree prune && rm -rf .claude/worktrees/w1
```

> **Common failure modes:**
> - `"not a working tree"` or `"No such worktree"` → registration is already pruned (directory exists, git doesn't know it). Use the `prune && rm -rf` path above.
> - `"not a git repository"` → you ran the command from inside the worktree directory. Re-run from the main repo root.
> - `"contains modified or untracked files"` → use `--force` flag, or commit/stash changes first.
