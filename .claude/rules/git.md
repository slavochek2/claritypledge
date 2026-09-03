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
| `git add -u` / `git add -u <path>` | Stages every *modified* file under the path — including a co-tenant session's in-flight edits. Same failure mode as `-A`, but reads as narrower, which is exactly why it slips through. |
| `git reset HEAD` (no args) | Resets entire index; use `git reset HEAD -- file1 file2` |
| `git checkout HEAD -- <files>` / `git restore <files>` | Destroys working-tree edits **with no reflog recovery** — uncommitted content never entered the object database, so unlike a bad `git reset` there is nothing to recover. Wip-commit first, and derive the file list from `git diff --name-only` — never type it from memory. |
| `git push --force` to main/master | Destructive; always warn user |
| `git commit` from inside a subagent | Subagent staging state does not transfer to the main session's git index; commits issued from subagents will be empty or wrong |
| `git cherry-pick --abort` (mid-sequence) | Reverts ALL prior commits in the sequence, not just the conflicting one; use `--skip` to drop only the offending commit, or resolve and `--continue` |
| `git cherry-pick --quit` (mid-sequence) | Clears `.git/sequencer/` without reverting applied commits — if prior picks in the sequence already committed, a re-attempt re-applies them and silently duplicates changes. Inspect `.git/sequencer/todo` and `git log` first; only run with explicit user instruction. |
| `git commit --no-verify` | Bypasses `pre-commit-checks.sh` and `audit-privacy.sh` silently |
| `git push --no-verify` | Bypasses push hooks including the privacy gate silently |

**The table is four spellings of one mistake — the rule is the class, not the list.** Any staging form that expands to a set you did not type is banned: `.`, `-A`, `-u`, `:/`, a bare directory, a glob. If you cannot read the filenames in the command you are about to run, you do not know what you are committing. A new spelling not listed above is still banned; the list is examples, not an allowlist by omission.

Incident 2026-08-28: `git add -u tasks/ docs/decisions.md` swept another session's in-flight spec edit into a commit under the wrong message — **one hour after** the same thing was done to this session by a co-tenant, diagnosed, written up, and explicitly declined to be repeated. The table banned `.`, `-A` and `-f`; `-u` was absent and read as the safe narrow option. Recovery: reset to the parent SHA resolved absolutely (never `HEAD~1` — see below), unstage the bystander, recommit. See pp `docs/decisions.md` 2026-08-28.

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

## Any uncommitted file on the shared checkout is exposed — unstaging is not cleanup

`git reset HEAD -- <file>` is index-only. The file itself stays on the shared main checkout, uncommitted and unstaged, available for the next broad `git add` or commit that happens to touch that directory — regardless of who runs it or what they intended to commit. When work created on the main checkout moves into a worktree, delete the abandoned copy from the main checkout's working tree in the same step.

**This is not only about abandoned copies — it applies to the edit you are still working on.** A file you have written but not yet committed on the shared checkout is exposed for as long as it sits there, and "commit it sooner" is the wrong remedy (each raw commit on main is itself the hazard this file spends its length on). **Do the edit in a worktree.** 2026-09-03: a spec edit held ~40 min on main to be committed with its siblings was absorbed into a co-tenant's unrelated commit; content survived, attribution did not. The window is not the variable — a co-tenant `git add` can land seconds after you save.

A stray file left this way is not passively inert — a different session can find it, mistake it for live work, and actively build on it. P1147 (2026-08-23): a test file created on main before its worktree existed was unstaged when work moved to the worktree but never deleted; hours later a different concurrent session found the two-day-old orphan, fixed its assertions, and committed it — producing a real cherry-pick conflict when the original branch was later shipped. See [decisions.md](../../docs/decisions.md) 2026-08-23 [process].

## Always use explicit file names on `git add` — then commit with NO path arguments

**In a worktree this is enough** — each worktree has its own private index, unreachable
by any other session. **On the shared main checkout it is NOT enough on its own** — the
index and HEAD there are shared across every concurrent session, and the sequence below
still has a real gap between the bystander check and the commit. Use `git-ops.sh
commit-to-main` there instead (Merge Strategy Matrix, below) — it holds a lock across
the whole staging+commit sequence, which is what actually closes that gap.

```bash
# ✅ Correct — worktree
git diff --cached --name-only   # confirm the index holds only your files (see sections above)
git reset HEAD -- <bystander>   # unstage anything not yours, if any turned up
git add src/app/pages/MyPage.tsx src/components/Button.tsx
git commit -m "fix: preview persistence"

# ✅ Correct — shared main checkout
./scripts/git-ops.sh commit-to-main --message "fix: ..." --files src/app/pages/MyPage.tsx src/components/Button.tsx

# ❌ Never
git add .
git add -A
git commit -m "fix: ..."                                              # dirty index, no bystander check first
git commit -m "fix: ..." -- src/app/pages/MyPage.tsx src/components/Button.tsx   # see below — NOT safe
```

**`--files $VAR` does not work from the agent shell.** zsh does not word-split unquoted parameter
expansions, so a variable holding several paths arrives as ONE argument and `commit-to-main`
reports the whole list as a single not-found path. Write the paths literally, or use a real array.
And when a retry produces a **byte-identical** error, that is deterministic — not contention: break
and re-read it. A loop makes N attempts without N decisions, so the "reflect after 2 failures" rule
in CLAUDE.md cannot fire on its own (2026-09-03: 39 iterations against a quoting bug).

**Why NOT `git commit -- <files>` — corrected 2026-08-20, this rule previously recommended it.**
`git commit` given a pathspec does not commit the staged INDEX for those paths — per `git-commit(1)` (`-o`/`--only`, the default mode whenever any path is given), it re-reads them from the CURRENT WORKING TREE first. If a co-tenant session has unsaved edits sitting in the same file, they ride along into your commit under your message, and `git status` shows clean afterward — no signal anything went wrong. First found 2026-04-22 (P783, ship-phase temp-index finding — decisions.md) and hit again 2026-08-20, when it silently pulled another session's uncommitted `docs/decisions.md` WIP into a `/kdd` commit; recovered with `git hash-object` + `git update-index --cacheinfo` to stage the exact intended blob, then a plain commit.

The original concern — a plain `git commit` sweeping in files OTHER sessions staged elsewhere in the shared index — is still real, but the pathspec form is not the fix for it; it trades that risk for a worse one (silently wrong CONTENT for the very files you're committing, not just wrong file selection).

**The worktree/main-checkout distinction above is load-bearing, not decoration — a bystander-checked plain commit is still not safe on the shared checkout.** "Verify the index, then `git add`, then plain commit" still has a real gap: another session can stage or edit something between your check and your commit. This repo's own incident log records exactly that failure on the shared main checkout twice (2026-08-17 P1057, 2026-06-06) — a plain commit corrupted a co-tenant's work even though the verify-before-commit rule had been followed, because the verify→commit window was not atomic. A private worktree closes that gap by construction; the shared main checkout needs an actual lock, held for the whole sequence — that is what `commit-to-main` provides and a hand-run `git add` + `git commit` does not. **Never run a bare add-then-commit sequence directly on the shared main checkout, bystander-checked or not — always go through `git-ops.sh commit-to-main`.**

**`git mv` needs both paths confirmed staged, and the check must disable rename detection.** A rename stages as delete(old)+add(new); `git mv` does this atomically. `git status --short` and `git diff --cached --name-only` both COLLAPSE a staged rename into one line by default (rename detection) — use `git status --short --no-renames` (or add `--no-renames` to the diff form) to see both halves. This matters twice: confirming your own rename is fully staged, AND when unstaging a bystander's rename — `git reset HEAD -- <bystander>` on only the destination path leaves the source deletion staged and invisible to the same collapsed check. Reset BOTH paths of a rename, never just one.

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

## Volatile state decays — re-check before telling the user NOT to act

The rule above fires when a shared tool fails. This one fires when nothing fails: a branch,
worktree, or uncommitted-changes fact you verified earlier in the session and are now relaying as
current.

**The trigger is an advisory built on another session's work** — *"that's in flight in wN," "don't
touch it, let that session land first," "there's uncommitted work there."* Those sentences change
what the user does, and they rest on exactly the facts most likely to have moved since you learned
them: a co-tenant ships, the worktree is removed, the spec lands in `features/done/`. Re-run the
check before you say it — `git worktree list`, `git log --oneline -5`, `ls features/done/*/pNNNN*`.

**Distinct from [epistemic.md](epistemic.md) gate 9**, which binds you to verify a subagent's claim
before promoting it. That verification can pass and the fact still expire afterwards. Incident
2026-08-19: a correctly-verified *"P1083 is in flight in w3 with uncommitted changes"* was relayed
twice across ~10 turns — shaping a spec's framing and a "let that session land first"
recommendation — while P1083 had already shipped to main. Caught only when a link-existence check
failed at file-write time, after the founder had made design decisions on it.

## Worktree `scripts/` is a native checkout

`scripts/` and `supabase/migrations/` are hydrated as native git checkouts in every worktree (`3d7a010e`), not symlinks. `git status` is accurate there: a `D` entry for `scripts/` means the file is really missing, not an artifact — recover with `git checkout -- scripts` inside the worktree. Older advice to ignore those entries, or to filter them with `git diff --name-only HEAD`, is obsolete.

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
