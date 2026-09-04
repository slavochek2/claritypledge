# Git Worktree Setup

## Overview

Worktrees are the **default isolation mechanism** for all `/dev` and `/fix` work. Every P-number feature gets a worktree; branches are the mechanism inside worktrees, not a standalone workflow.

**Why worktrees over branches alone:** Worktrees provide parallel testing (fixed ports), visual tracking (`kanban w1`), and session isolation (separate directories). A branch-only experiment (P483–P488, March 2026) produced orphaned branches, cross-contaminated commits, and a "ship without testing" pattern within 10 days. See [decisions.md 2026-03-07](../decisions.md).

**Worktree independence:** Each worktree branches independently from `main` — no worktree inherits another's uncommitted changes. If two features need to share work, ship the first to main before branching the second.

**Trivial fixes (no worktree needed):** For a single-file typo, copy change, config tweak, **or a skill-file-only change** (`.claude/commands/slava/**/*.md` — these MUST land on `main`, see `.claude/rules/skills.md` Branch Guard, so never branch for them), use `git-ops.sh commit-to-main` — not a bare branch. The one-worktree = one-branch invariant means branches always live inside a worktree slot; `commit-to-main` is the correct path when a branch is overkill. See `./scripts/git-ops.sh --help` for the serialization protocol.

**Vite cache isolation:** All worktrees symlink `node_modules/` to main. `vite.config.ts` sets `cacheDir` per worktree slot (`node_modules/.vite-w1`, `.vite-w2`, etc.) so concurrent dev servers don't corrupt each other's pre-bundled dependencies. See [decisions.md 2026-03-13](../decisions.md).

**Slot exclusivity:** Each worktree slot (w1, w2, …) has one shared git index. Two concurrent agent sessions in the same slot contaminate each other's staged files — Session B's commit can pull in Session A's staged work as bystanders. Protocol: concurrent sessions must use different slot numbers. If you discover shared-slot contamination at commit time, run `git diff --cached --name-only`, reset non-owned files with `git reset HEAD -- <files>`, then re-stage and commit only the intended files.

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

### Subagent prompts need explicit worktree path

Code reviewers and other file-reading subagents default to the main repo root, not your feature-branch worktree. When spawning any file-reading subagent from inside a worktree, pass the full worktree path in the prompt:

```
Read files from `<cp-root>/.claude/worktrees/wN/`
```

Without this, the subagent reads from main and produces false positives about code that exists on the feature branch but not main. `settings.json` has no `defaultFilePath` key — explicit in-prompt path is the only mechanism.

### Check worktrees before loading EnterWorktree

`EnterWorktree` creates new worktrees; it cannot enter existing ones. Run `git worktree list` first. If the target slot (e.g., `w2`) already exists, skip the ToolSearch and work from that path directly. Only load `EnterWorktree` for brand-new slots.

### Known Limitations

- **Supabase CLI not linked in worktrees.** `supabase` CLI is linked to the main repo directory (via `supabase link`). Running `./scripts/migrate.sh` from a worktree fails with "Cannot find project ref." **Workaround:** Copy the migration file to the main repo and run `./scripts/migrate.sh` from there, or run `supabase link` in the worktree (creates a `.supabase` dir). **After `migrate.sh` succeeds, delete the copied file from main** — the branch commit carries the real one, and a leftover untracked copy blocks the `/ship` cherry-pick (`git-ops.sh ship` auto-removes it only when byte-identical to the branch version; a diverged copy hard-stops the ship). If `migrate.sh` is itself blocked (db-push history drift on the shared test DB, and/or a stale keychain PAT shadowing `.env.local` → 401), see `docs/decisions.md` 2026-06-02 [process] (keychain-first PAT shadow) and 2026-06-02 [technical] (direct Management-API `database/query` apply — note: applying DDL that way leaves `supabase_migrations.schema_migrations` un-stamped, so re-run `migrate.sh` once unblocked to record history). **Also copy `supabase/deploy-manifest.json` from main back into the worktree and commit it on the branch** — `migrate.sh` stamps only main's manifest, but pre-commit (P270 migration-applied gate) and `ship-gates.sh` read the *worktree's* manifest; without the sync, committing the migration on the branch is blocked with "migration not applied" even though it is (P940). **Then clean up main's own manifest edit — don't just unstage it.** `migrate.sh` leaves `supabase/deploy-manifest.json` modified (and typically staged) in the main repo's working tree; once you've copied its content into the worktree, that edit on main is done being useful. Commit it there via `git-ops.sh commit-to-main` (preferred — it's a real, correct stamp) — do NOT leave it sitting uncommitted-but-present on the shared main checkout, where it reads as a normal in-progress edit to any concurrent session's broad commit and gets silently swept in (`docs/decisions.md` 2026-08-23 "Uncommitted leftover files on the shared main checkout are not inert", recurred 2026-08-25 with this exact workaround). If you must discard it instead (e.g. it turns out wrong), that is a `git checkout --`/`git restore` operation — **ALWAYS-ASK**, per `.claude/rules/git.md`; confirm with the user first, same as any other discard of working-tree edits.

- **`scripts/` and `supabase/migrations/` are native checkouts, not symlinks.** Since `3d7a010e` (2026-04-22, see [decisions.md](../decisions.md) "Worktree session-mutable dirs must be native checkouts") they are hydrated per worktree by `setup-worktree.sh`'s `hydrate_native`. Before that commit they were symlinked to the main repo, which made `git status` report every file under them as a phantom `D` (deleted) entry; that no longer happens — `git status` and `git diff --name-only HEAD` behave normally in a worktree. **If you do see `D` entries for `scripts/` today, they are real** — the files are genuinely missing (an aborted hydrate, or a pre-`3d7a010e` worktree never re-provisioned). Recover with `git checkout -- scripts` from inside the worktree (prefix `rm -rf scripts` only if it is still a symlink). Re-running `setup-worktree.sh` is not a reliable repair: it skips any path that is already a real directory, so a partially-deleted `scripts/` stays broken. Independently of all this, never use `git add .` or `git add -A` in a worktree — always `git add src/` or explicit file paths.

---

## Lockfile Protocol (P781)

Every worktree slot has a lockfile at `<slot>/.lock` (one KEY=VALUE per line):

```
PID=69158
PID_START_TIME=Wed Apr 22 23:38:51 2026
NONCE=c8f87db3e5d73a29
SESSION_ID=Vyacheslavs-MacBook-Pro-69158-1776875932
SLOT=w1
BRANCH=feature/p790-p781-closure
P_NUMBER=p790
CLAIMED_AT=2026-04-22T16:38:52Z
HEARTBEAT=2026-04-22T16:38:52Z
```

**Four lock states** (see `./scripts/git-ops.sh --help` for source of truth):

| State | Meaning |
|-------|---------|
| `LIVE` | PID exists AND `ps -o lstart=` matches `PID_START_TIME` |
| `STALE` | PID exists but start time differs — PID was recycled by OS |
| `ORPHAN` | PID does not exist — session terminated without releasing lock |
| `NO_LOCK` | Slot directory has no `.lock` file |

STALE and ORPHAN locks can be abandoned without ownership (`git-ops.sh abandon <slot>` — session is dead, cleanup is safe). Releasing a LIVE lock requires `--nonce` match OR current PID match.

## Worktree Status Table

`./scripts/git-ops.sh status` prints a table of all active slots:

```
SLOT   BRANCH                                        PID      STATE
----   ------                                        ---      -----
w1     feature/p790-p781-closure                     69158    ORPHAN
w2     feature/p765-some-other-feature               84201    LIVE
```

`./scripts/git-ops.sh status w1` prints the full lockfile block for a single slot.

---

## Running a Dev Server in a Worktree

Ports are auto-detected from the worktree slot — just run `npm run dev`:

```bash
cd .claude/worktrees/w1
npm run dev   # auto-binds to 5100 (w1), reaps a zombie on that port first
```

Port reference: w0 (main) = 5001, w1 = 5100, w2 = 5200, named worktrees = 5800-5899 (hash-based).

**Kill-on-start — zombies only (P1234):** The `predev` hook (`check-worktree-env.sh`) reaps a *zombie* on the worktree's port before Vite starts — a process that holds the port but does not complete an HTTP response. This prevents zombie accumulation with no manual cleanup.

It will **not** kill a server that answers HTTP. It aborts instead, naming the port. Before P1234 the kill was unconditional, and on the shared main checkout (where every session maps to 5001) that removed the dev server a concurrent Playwright run was using — every remaining test in the victim run then failed at `page.goto` with `ERR_CONNECTION_REFUSED` and was triaged as an application defect. To restart your own healthy server deliberately: `FORCE_PORT_RECLAIM=1 npm run dev`.

**Concurrent E2E runs need separate worktrees.** `playwright.config.ts` sets `reuseExistingServer`, so a second run adopts the first run's server and loses it when that run tears down — the predev guard cannot see this and does not prevent it. One worktree per concurrent batch gives each its own port. When it does happen, the `infra-cascade` reporter labels the resulting failures `[infra]` so they are not counted as product bugs.

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
