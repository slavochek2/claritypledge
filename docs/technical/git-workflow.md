# Git Workflow Guide

## Feature Branch vs Worktree — Decision Guide

> **Rule:** In-progress features stay off `main` until approved for production.

### Which to use?

| Situation | Use | Why |
|-----------|-----|-----|
| Single feature, focused session | **Feature branch** | Simple, no extra setup, merges cleanly |
| Two approaches to compare visually | **Worktree** | Parallel dev servers — see both at once |
| Agent parallelism (multiple features simultaneously) | **Worktree** | Each agent gets an isolated copy |
| Quick experiment that might be thrown away | **Worktree** | Reset without touching main branch |

### Feature branch workflow

```bash
# Start new feature
git checkout -b feature/p422-clarity-partner-agreement

# Work, commit, iterate...

# When approved for prod — merge to main and push
git checkout main
git merge feature/p422-clarity-partner-agreement --no-ff
git push origin main   # → Vercel auto-deploys

# Clean up
git branch -d feature/p422-clarity-partner-agreement
```

**Naming:** `feature/pN-short-description` (e.g., `feature/p427-story-edit-delete`)

### Worktree workflow (parallel / comparison)

See [worktree-setup.md](worktree-setup.md) for full setup.

```bash
# Each worktree = separate disk folder + port + branch
# claritypledge-1 on :5100, claritypledge-2 on :5200, etc.

# Assign a feature to a worktree
cd /Users/slavochek/Projects/public/claritypledge-1
git checkout -b feature/p422-clarity-partner-agreement

# Dev server at http://localhost:5100 — isolated, no conflict with main
```

**Key rule:** Never merge the worktree's port-config commit to main. Use `git rebase -i` to drop it, or cherry-pick only the feature commits.

### Pre-push safety net

A pre-push git hook (`.git/hooks/pre-push`) checks for `status: in-progress` feature specs before any push to `main`. If found, it warns you and requires explicit confirmation. This is the last line of defense — ideally you're already on a feature branch before it fires.

---

## Pre-Commit Hook Handling

> **Principle:** If unrelated in-progress work causes pre-commit hooks to fail, isolate it with a WIP commit — not a stash.

### The Problem

Pre-commit hooks run tests on the ENTIRE codebase, not just staged files. If you have unrelated in-progress work that breaks tests, your clean commit will fail.

### The Solution

```bash
# Commit unrelated work as WIP (visible, recoverable, won't be lost)
git add path/to/unrelated/file
git commit -m "wip: unrelated work in progress"

# Now commit your actual work
git add path/to/actual/changes
git commit -m "feat: your changes"

# Later: squash or amend the WIP commit before merging
```

**Why not stash?** Stashes are invisible pockets — easy to forget, permanently lost if pop fails. WIP commits appear in `git log`, survive any git operation, and can be recovered from `git reflog`.

**When to use:** Pre-commit hooks fail due to test failures in files you didn't touch.

---

## Commit Discipline — Checkpoint Prompts

> **Pattern to watch:** The founder tends to accumulate changes, then commit everything at once. This makes rollback hard and history unclear.

### Agent behavior:
- After completing a logical unit of work (feature, fix, refactor), prompt: "This is a good commit checkpoint. Want to commit now?"
- If 30+ minutes pass with uncommitted changes, remind: "You have uncommitted work. Commit before continuing?"
- Before starting something new (new feature, experiment, tool install), check for uncommitted changes first

### Signs to watch for:
- Multiple unrelated changes in `git status`
- Mix of "done" work and "in progress" work
- About to context-switch to something different

**Goal:** Small, atomic commits. Each commit = one logical change.

---

## Pre-Commit Checks

Before creating any commit, run:
```bash
./scripts/pre-commit-checks.sh
```

This catches issues before they reach the commit. Run it explicitly rather than relying on git hooks.

### What it checks:

| Check | Blocks commit? | Purpose |
|-------|---------------|---------|
| **Lint** | Yes | ESLint errors (includes accessibility via jsx-a11y) |
| **Build** | Yes | TypeScript errors, import issues |
| **Tests** | Yes | Regressions |
| **Secrets scan** | Yes | API keys, tokens, credentials (via gitleaks) |
| **Bundle size** | Warning | Alerts if dist/ exceeds 20MB |
| **console.log** | Warning | Debug logs left in code |
| **TODO/FIXME** | Warning | New tech debt being added |
| **@ts-ignore** | Warning | TypeScript escape hatches that bypass type safety |
| **debugger** | Yes | Leftover debug statements |
| **any types** | Warning | New `any` types in non-test code |

### After checks pass, also review:

1. **Logic bugs and edge cases** - Does the code handle errors?
2. **Security issues** - XSS, injection, auth bypass?
3. **Accessibility** - Linter catches basics, but verify keyboard navigation works
4. **CLAUDE.md patterns** - Does it follow project conventions?

**Pre-commit failures: fix inline, never ask.** Every check has a known fix:

| Failure | Fix |
|---------|-----|
| Duplicate P-number | Run `./scripts/next-p-number.sh` to get next available number, rename the conflicting file to use it |
| Frontmatter issues | Run `scripts/fix-frontmatter.py` — auto-fixes and re-stages |
| Lint / TypeScript errors | Fix the code; do not suppress with `@ts-ignore` or `as any` |
| Secrets detected | Remove the secret, rotate it externally, then re-commit |

---

## ESLint Accessibility Checks

The linter catches common accessibility issues via jsx-a11y:
- Missing alt text on images
- Empty anchor/button content
- Invalid ARIA roles
- Click handlers without keyboard support (warning)
