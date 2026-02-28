# Git Workflow Guide

## Feature Branch vs Worktree — Decision Guide

> **Rule:** In-progress features stay off `main` until approved for production.

### Which to use?

| Situation | Use | Why |
|-----------|-----|-----|
| Single feature, focused session | **Feature branch** | Simple, no extra setup, merges cleanly |
| Risky change (10+ files, new framework, experimental) | **Worktree** | Easy rollback without touching main branch |
| Agent parallelism (index collision risk) | **Worktree** | Each agent gets an isolated staging area |
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

### Worktree workflow (parallel / isolation)

See [worktree-setup.md](worktree-setup.md) for full setup.

```bash
# Create a worktree under .claude/worktrees/ (via git or EnterWorktree tool)
git worktree add .claude/worktrees/feature-name -b feature/p422-clarity-partner-agreement

# Required after creation — symlinks .env.local and node_modules
./scripts/setup-worktree.sh .claude/worktrees/feature-name

# Dev server — pick any free port (no pre-configured ports)
cd .claude/worktrees/feature-name
npm run dev -- --port 5101
```

**Note:** Named worktrees (`claritypledge-1..5`) are legacy — they exist as sibling directories but are no longer the active pattern. Use `.claude/worktrees/` for all new worktrees.

### Pre-push safety net

A pre-push git hook (`.git/hooks/pre-push`) checks for `status: in-progress` feature specs before any push to `main`. If found, it shows the in-progress features as context, then requires TTY confirmation before allowing the push.

**Agent pushes are physically blocked** — agents have no TTY, so the confirmation prompt can never be satisfied. Agents must call `/ship` and wait for user approval; they cannot push to main unilaterally.

This is the last line of defense — ideally you're already on a feature branch before it fires.

### Deploying to production

Vercel auto-deploys on every push to `main`. There is no staging gate — pushing to main IS deploying to prod.

- **Feature branches:** use `/ship pN` — merges branch → main → pushes → Vercel deploys
- **Small infra/doc work on main:** just say "push" — no `/ship` needed
- **Agent rule:** never push autonomously; always ask first, even if everything looks clean

> **⚠️ Vercel rollback ≠ git revert.** A Vercel rollback only changes the active deployment pointer — it is temporary. The next `git push` to `main` overrides it and the "rolled-back" code returns to prod. If you need to permanently remove code from prod, you MUST do a git revert or `/revert-feature pN`. Vercel rollback alone is not sufficient.

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

### Moving files in git — always use `git mv`

When closing a feature (`git mv features/pN.md features/done/`), always use `git mv`, not `cp` + manual delete. A plain `cp` creates a new file and orphans the original — resulting in a commit with 0 deletions and a duplicate spec at both paths. `git mv` preserves history and stages the rename atomically.

---

## ESLint Accessibility Checks

The linter catches common accessibility issues via jsx-a11y:
- Missing alt text on images
- Empty anchor/button content
- Invalid ARIA roles
- Click handlers without keyboard support (warning)

---

## Git Safety Firewall

Hard rules — leaking secrets to git history is catastrophic and irreversible.

**Never use these commands:**
- `git add .` — can stage secrets and ignored files
- `git add -A` — same problem
- `git add -f <file>` — forces adding ignored files
- `git reset HEAD` (no args) — resets the **entire** index; always use `git reset HEAD -- file1 file2`
- `git stash` (agent-initiated) — agents must NOT stash unilaterally; prefer `git commit -m "wip: ..."` instead

**ALWAYS use explicit file names:**
```bash
git add src/app/pages/MyPage.tsx src/components/Button.tsx
```

**Files that MUST NEVER be committed:**
- `.mcp.json` — contains API tokens
- `.env.local` — contains secrets
- Any file with `token`, `secret`, `key`, `password` in content

**If you accidentally stage a secret:**
```bash
git reset HEAD <file>        # Unstage
git rm --cached <file>       # Untrack (if already tracked)
```
