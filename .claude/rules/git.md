---
paths:
  - "src/**"
  - "scripts/**"
  - "**/*.sh"
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

## Cleaning up tracked files + .gitignore changes

When removing tracked files AND adding them to `.gitignore` in the same operation:

1. `git rm -r --cached --ignore-unmatch <paths>` first — untracks without deleting from disk
2. Update `.gitignore`
3. `git add .gitignore`

Never reverse steps 1–2. `git add -A` silently skips paths that `.gitignore` now covers, even when those paths are tracked files being deleted from the index.
