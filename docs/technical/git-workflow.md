# Git Workflow Guide

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

If issues are found, ask the user how to proceed before committing.

---

## ESLint Accessibility Checks

The linter catches common accessibility issues via jsx-a11y:
- Missing alt text on images
- Empty anchor/button content
- Invalid ARIA roles
- Click handlers without keyboard support (warning)
