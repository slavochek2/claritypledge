---
description: Git safety firewall — hard stops for every session
globs: "*"
---

# Git Safety (Firewall)

**These are hard stops — not principles to reason about. Check before every git command.**

## Banned commands (never run without explicit user instruction)

| Command | Why banned |
|---------|-----------|
| `git stash` | Hides uncommitted work silently; prefer `git commit -m "wip: ..."` |
| `git add .` | Can stage secrets and ignored files |
| `git add -A` | Same problem |
| `git add -f <file>` | Forces adding ignored files |
| `git reset HEAD` (no args) | Resets entire index; use `git reset HEAD -- file1 file2` |
| `git checkout HEAD -- <files>` / `git restore <files>` | Destroys working-tree edits **with no reflog recovery** — uncommitted content never entered the object database, so unlike a bad `git reset` there is nothing to recover. Wip-commit first, and derive the file list from `git diff --name-only` — never type it from memory. |
| `git push --force` to main/master | Destructive; always warn user |
| `git commit` from inside a subagent | Subagent staging state does not transfer to the main session's git index; commits issued from subagents will be empty or wrong |
| `git cherry-pick --abort` (mid-sequence) | Reverts ALL prior commits in the sequence, not just the conflicting one; use `--skip` to drop only the offending commit, or resolve and `--continue` |
| `git cherry-pick --quit` (mid-sequence) | Clears `.git/sequencer/` without reverting applied commits — if prior picks in the sequence already committed, a re-attempt re-applies them and silently duplicates changes. Inspect `.git/sequencer/todo` and `git log` first; only run with explicit user instruction. |
| `git commit --no-verify` | Bypasses `pre-commit-checks.sh` and `audit-privacy.sh` silently |
| `git push --no-verify` | Bypasses push hooks including the privacy gate silently |

## Commits must come from the main session

Never issue `git commit` from inside a subagent. Subagents have an isolated staging area — their `git add` calls do not appear in the main session's index, and vice versa. Commit workflow: subagent stages → main session verifies with `git diff --cached --name-only` → main session commits.

## Verify file has changes before staging

Before `git add <file>`, run:
```bash
git diff HEAD -- <file>
```
Empty output = file matches HEAD = already committed. Do not stage.

This catches the case where a subagent or prior session already committed the file — staging it again produces an empty commit with a misleading message.

## Only stage files YOU changed in THIS session

Multiple Claude sessions often run in parallel (worktrees). The working tree may contain modifications from other sessions. **Only stage files you personally modified.** Never stage a file just because `git status` shows it as modified.

**Before every commit:**
```bash
git diff --cached --name-only   # review — every file here must be yours
git reset HEAD -- <file>        # unstage any bystanders
```

This is the #1 cause of "wrong files in wrong commit" — a session stages all modified files instead of only its own changes.

## Session start — clear the index before your first git add

Before your first `git add` of the session:
```bash
git diff --cached --name-only   # inspect for prior-session leftovers
git reset HEAD -- <file>        # unstage any bystanders before staging your own files
```

Do this **before** `git add`, not after. After `git add` both sets are mixed and the review looks correct — prior-session files are invisible among your own staged files. This is what causes the wrong-files-in-commit bug.

## Always use explicit file names — on both `git add` AND `git commit`

```bash
# ✅ Correct
git add src/app/pages/MyPage.tsx src/components/Button.tsx
git commit -m "fix: preview persistence" -- src/app/pages/MyPage.tsx src/components/Button.tsx

# ❌ Never
git add .
git add -A
git commit -m "fix: ..."   # without explicit file list when sharing a worktree
```

**Why `git commit -- <files>` matters:** When multiple sessions share a worktree, each session stages its own files independently. A plain `git commit` sweeps ALL staged files into your commit — including files staged by other sessions. Listing files explicitly on the commit command limits the commit to only those paths, even if other files are staged. The other sessions' files stay staged but uncommitted.

**`git mv` needs BOTH paths in the pathspec.** A rename stages as delete(old)+add(new). `git commit -- new_path` only matches the addition — the deletion of `old_path` stays staged and invisible until the next `git status`. Use `git commit -- old_path new_path`, or run `git status --short` right after committing a rename to confirm nothing is left staged.

## Privacy Gate

Commit and push hooks run `scripts/audit-privacy.sh` to scan for PII patterns. Never bypass with `--no-verify`. If the gate blocks a legitimate commit, override instructions are in the script's header — do not infer or guess at the override mechanism.

**Local hooks are accident-prevention, not the boundary** — an actor controlling the machine can bypass them. The real boundary is the server-side `privacy-scan / audit-privacy` required check on `main` (P919); commits transit a staging branch so CI scans them before they reach `main`. See [docs/technical/git-workflow.md](../../docs/technical/git-workflow.md).

## Files that must NEVER be committed

- `.mcp.json` — contains API tokens
- `.env.local` — contains secrets
- Any file with `token`, `secret`, `key`, `password` in content

## If you need to temporarily set aside changes

Don't stash. Instead:
```bash
git commit -m "wip: [description]"
# ... do other work ...
git log -1                    # confirm HEAD is YOUR wip commit, not a co-tenant's
git reset <wip-sha>           # undo the wip commit by ABSOLUTE sha — never HEAD~1
```

**Why not `HEAD~1`:** the main checkout's HEAD is shared. A concurrent `/ship` can land commits between your wip commit and your reset, so `HEAD~1` resolves to the co-tenant's commit and resets it away (2026-06-06 incident; recovered via reflog). Resolve the absolute SHA and confirm `git log -1` shows the commit you intend to move before any reset. See [docs/decisions.md](../../docs/decisions.md) 2026-06-06 "Concurrent sessions share the main checkout's index AND HEAD".

## Reverting to HEAD is not unstaging — and it is the one git loss with no recovery

`git checkout HEAD -- fileA fileB` and `git restore fileA fileB` discard uncommitted edits in **every** file listed, permanently. The `git reset <wip-sha>` recovery above works because the content was committed; here it never was, so there is no reflog entry and no `git fsck` dangling blob to find.

The failure mode is a **scope mismatch between the backup and the revert**: you save one file, then name two on the revert line. The second file's edit is gone. Before either command:

1. `git diff --name-only` — see exactly which files carry uncommitted changes, and build the revert list from that output rather than from memory.
2. `git commit -m "wip: ..."` anything you are not certain is disposable.
3. Never pass multiple files to a revert command without reading `git diff -- <file>` for each one first.

An experiment that reverts files to test a hypothesis ("were these failures pre-existing?") is the common trigger — wip-commit before the experiment, not after it surprises you. Incident: 2026-08-03 (P1024), edit reconstructed by hand from conversation history; a compaction first would have made it unrecoverable.

## Why stash is banned specifically

Stash is the most commonly misused command in agent contexts:
- It silently moves changes out of the working tree
- Stash pop can fail and leave things in a broken half-applied state
- The user loses visibility into what was stashed
- `git commit -m "wip: ..."` is always safer and equally reversible

## After context compaction — verify HEAD before staging

After a context compaction, run `git log --oneline -5` before staging anything. Compaction summaries describe repo state at compaction time, not current HEAD — commits may have landed since then. Staging a file that already matches HEAD produces an empty commit with a misleading message.

```bash
git log --oneline -5          # check what's already committed
git diff HEAD -- <file>       # verify the file actually has uncommitted changes before staging
```

## Shared tool failed? Re-check freshness before deep-debugging

Worktrees + concurrent sessions mean `main` and the scripts themselves move under you. When a shared tool/script (`git-ops.sh`, `pre-commit-checks.sh`, a migration helper) fails, before reverse-engineering its internals: run `git log --oneline -5` and `git show <tool>` (or just re-run it) — a co-tenant may have already fixed the tool or advanced `main` since you last read it. P868: ~10 tool calls went into reading `git-ops.sh cmd_ship` internals to design a workaround while the fix was already on `main` and a plain re-run worked.

## Worktree Phantom Deletions

Inside a worktree, `git status` may show phantom `D` entries for `scripts/` — these are symlink artifacts from the worktree setup, not real deletions. Use `git diff --name-only HEAD` to see only real changes.

Never use `git add .` or `git add -A` in a worktree — use `git add src/` or explicit file paths. (This extends the existing `git add .` ban with a worktree-specific failure mode.)

## File Creation Inside Worktrees

When running inside a worktree (cwd contains `.claude/worktrees/wN`), every new file created with Write or Edit **must use the worktree-rooted absolute path** — never the main repo path.

**Read precondition:** Before editing any file in a worktree, Read it using the worktree-rooted absolute path. Reading from the main-repo path (e.g. `/Users/.../claritypledge/src/foo.ts`) does not satisfy the Edit precondition for the worktree path (e.g. `.../worktrees/w2/src/foo.ts`) — the Edit tool will reject the call. Always derive the correct root with `git rev-parse --show-toplevel` and use that prefix for both Read and Edit.

**Why:** The worktree is a separate git repository. A file written to the main repo path (e.g. `/Users/.../claritypledge/e2e/foo.spec.ts`) while inside w2 is outside w2's repository boundary. `git add` will fail with `fatal: pathspec is beyond a symbolic link` or `fatal: is outside repository`.

**Derive the correct root before writing:**
```bash
git rev-parse --show-toplevel   # → /Users/.../claritypledge/.claude/worktrees/w2
```

Prefix all new file paths with that output, not with the main repo root.

**Common failure pattern:** Agent in `.claude/worktrees/w2` writes to `/Users/.../claritypledge/e2e/canary.spec.ts` (main repo) → `git add` fails → requires `cp` to worktree + `rm` from main (2–4 wasted tool calls).

The Supabase CLI migration exception (copy migration to main repo, run `migrate.sh` from there) is separate — see `docs/technical/worktree-setup.md`.

## Cleaning up tracked files + .gitignore changes

When removing tracked files AND adding them to `.gitignore` in the same operation:

1. `git rm -r --cached --ignore-unmatch <paths>` first — untracks without deleting from disk
2. Update `.gitignore`
3. `git add .gitignore`

Never reverse steps 1–2. `git add -A` silently skips paths that `.gitignore` now covers, even when those paths are tracked files being deleted from the index.

## Merge Strategy Matrix (P781)

| Branch type | Method | Who runs it | Notes |
|-------------|--------|-------------|-------|
| `feature/pN-*`, `fix/pN-*` | `git-ops.sh ship` | `/ship` skill | Cherry-picks + journal. Never auto-push. |
| Large batch (100+ commits) | `git merge --no-ff` | Human manual | letters-ship pattern. Not via `/ship`. |
| Direct commit to main (docs, tiny) | **`git-ops.sh commit-to-main`** | Human or agent | **Never raw `git commit` to main in the shared repo** — only the locked path serializes against a co-tenant `/ship`. Raw commits can land on a co-tenant-switched branch or inside a live cherry-pick (it also guards HEAD==main + no op-in-progress). |

## One-Worktree = One-Branch Invariant (P781)

- Every `.claude/worktrees/wN/` holds exactly one branch (`feature/pN-*` or `fix/pN-*`).
- Never reuse a slot for a different P-number before the previous one is shipped or abandoned.
- `git-ops.sh claim` creates the branch+slot atomically; `git-ops.sh status` detects violations.
- **Create the branch IN a worktree (`git-ops.sh claim pN`) — never `git checkout -b` in the main working dir.** Co-tenant sessions commit to whatever branch the main dir has checked out, so foreign commits (other P-numbers, articles) land on your branch, HEAD moves under you, and the tree reverts when a co-tenant switches the dir to main. Applies to inline/ad-hoc feature work too, not just `/dev` and `/fix` (which already default to worktrees). Symptom: `git log main..HEAD` shows a commit with a foreign P-number; recovery is an isolated-worktree rebase to drop it (P867).
- **Enforced mechanically** (`scripts/lib/branch-guard.sh`, called by `pre-commit-checks.sh`): a commit on a `feature/`/`feat/`/`fix/` branch in the **main** checkout is blocked; worktrees (toplevel under `.claude/worktrees/`) are exempt. Bypassable only with `--no-verify`. Incident 2026-06-19: a bare `git checkout -b` in main orphaned the branch + duplicated the commit on main, invisible to kanban.

## Pushes are never pre-approved

`git push` (any form, any remote) requires the user to say "push" or "deploy" in the **current session turn**. A prior-session approval, a "push cleanup" note in a skill, or a plan file that says "push after ship" — none of these count. This reinforces CLAUDE.md ALWAYS-ASK. `/ship` cherry-picks and commits to main; it never auto-pushes.
