---
paths:
  - "src/**"
  - "scripts/**"
  - "**/*.sh"
  - ".gitignore"
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

## Commits must come from the main session

Never issue `git commit` from inside a subagent. Subagents have an isolated staging area — their `git add` calls do not appear in the main session's index, and vice versa. Commit workflow: subagent stages → main session verifies with `git diff --cached --name-only` → main session commits.

## Verify file has changes before staging

Before `git add <file>`, run:
```bash
git diff HEAD -- <file>
```
Empty output = file matches HEAD = already committed. Do not stage.

This catches the case where a subagent or prior session already committed the file — staging it again produces an empty commit with a misleading message.

## Always use explicit file names

```bash
# ✅ Correct
git add src/app/pages/MyPage.tsx src/components/Button.tsx

# ❌ Never
git add .
git add -A
```

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

## Cleaning up tracked files + .gitignore changes

When removing tracked files AND adding them to `.gitignore` in the same operation:

1. `git rm -r --cached --ignore-unmatch <paths>` first — untracks without deleting from disk
2. Update `.gitignore`
3. `git add .gitignore`

Never reverse steps 1–2. `git add -A` silently skips paths that `.gitignore` now covers, even when those paths are tracked files being deleted from the index.
