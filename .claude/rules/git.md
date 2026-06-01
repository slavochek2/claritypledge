---
paths:
  - "src/**"
  - "scripts/**"
  - "**/*.sh"
  - ".gitignore"
  - "e2e/**"
  - "features/**"
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

## Privacy Gate

Commit and push hooks run `scripts/audit-privacy.sh` to scan for PII patterns. Never bypass with `--no-verify`. If the gate blocks a legitimate commit, override instructions are in the script's header — do not infer or guess at the override mechanism.

## Files that must NEVER be committed

- `.mcp.json` — contains API tokens
- `.env.local` — contains secrets
- Any file with `token`, `secret`, `key`, `password` in content

## If you need to temporarily set aside changes

Don't stash. Instead:
```bash
git commit -m "wip: [description]"
# ... do other work ...
git reset HEAD~1  # undo the wip commit when done
```

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

## Pushes are never pre-approved

`git push` (any form, any remote) requires the user to say "push" or "deploy" in the **current session turn**. A prior-session approval, a "push cleanup" note in a skill, or a plan file that says "push after ship" — none of these count. This reinforces CLAUDE.md ALWAYS-ASK. `/ship` cherry-picks and commits to main; it never auto-pushes.
