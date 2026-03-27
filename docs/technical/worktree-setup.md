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
# One command — creates worktree + symlinks .env.local, node_modules, .env.test.local
# Also checks for uncommitted src/ changes (worktrees only get committed code)
./scripts/create-worktree.sh w1 feature/pN-description
```

**Never use raw `git worktree add`** — it creates a broken worktree missing `.env.local` and `node_modules`. The wrapper script handles everything atomically.

> **Note:** Always name the worktree by slot (w1, w2), not by feature (e.g., not p465). The branch name carries the feature. This keeps `start w1` and `kanban w1` working.

---

## Setup (Handled Automatically)

`create-worktree.sh` calls `setup-worktree.sh` automatically. You should never need to run setup manually.

**What it does:** Symlinks `.env.local`, `.env.test.local`, and `node_modules` from the main repo into the worktree.

**Why it's required:** New worktrees don't include gitignored files or installed dependencies. Without `.env.local`, the Vite app crashes or shows broken UI (this cost an hour of debugging — see P589). Without `node_modules`, nothing runs. Without `.env.test.local`, integration tests fail.

**Manual fallback** (only if the wrapper wasn't used):
```bash
./scripts/setup-worktree.sh .claude/worktrees/w1
```

### Known Limitations

- **Supabase CLI not linked in worktrees.** `supabase` CLI is linked to the main repo directory (via `supabase link`). Running `./scripts/migrate.sh` from a worktree fails with "Cannot find project ref." **Workaround:** Copy the migration file to the main repo and run `./scripts/migrate.sh` from there, or run `supabase link` in the worktree (creates a `.supabase` dir).

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
