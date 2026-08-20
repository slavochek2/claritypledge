# Git Workflow Guide

## Feature Branch vs Worktree — Decision Guide

> **Rule:** In-progress features stay off `main` until approved for production.

### Which to use?

| Situation | Use | Why |
|-----------|-----|-----|
| Any P-number feature (`/dev`, `/fix`) | **Worktree** (default) | Parallel testing, session isolation, fixed ports |
| Risky change (10+ files, new framework, experimental) | **Worktree** | Easy rollback without touching main branch |
| Agent parallelism (index collision risk) | **Worktree** | Each agent gets an isolated staging area |
| Trivial fix (single file, typo, config tweak) | **Feature branch** | Worktree overhead not worth it |
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

# Clean up (see "Before Deleting Branches" below first)
git branch -d feature/p422-clarity-partner-agreement
```

**Naming:** `feature/pN-short-description` (e.g., `feature/p427-story-edit-delete`)

### Before Deleting Branches — Check for Unreleased Commits

Before deleting any branch (manually or during a cleanup sweep), run this check to find commits not on main:

```bash
# Check a single branch:
git log --oneline origin/main..<branch-name>

# Check ALL local branches at once (run before any bulk deletion):
for branch in $(git branch --list | tr -d ' *'); do
  count=$(git rev-list --count origin/main..$branch 2>/dev/null)
  if [ "$count" -gt "0" ]; then
    echo "UNMERGED: $branch — $count commit(s) not on main:"
    git log --oneline origin/main..$branch
  fi
done
```

**Why this matters:** UAT branches and feature branches may contain commits (docs, KDDs, architecture notes) written during testing that were never merged to main. A branch that looks "done" (feature code on main, spec closed) can silently contain unreleased content.

**Rule:** If a branch shows unmerged commits, inspect them before deleting. Cherry-pick anything worth keeping to main first.

**History:** `docs/ux-patterns.md` (266 lines of navigation architecture) was lost in 2026-03 because the branch containing it was deleted without this check. The lesson: KDDs and doc files written during UAT naturally land on the UAT branch and are the most likely stranded content.

### Worktree workflow (parallel / isolation)

See [worktree-setup.md](worktree-setup.md) for full setup.

```bash
# Create a worktree — always use slot name (w1, w2), not the feature name
# The branch carries the feature identity
git worktree add .claude/worktrees/w1 -b feature/p422-clarity-partner-agreement

# Required after creation — symlinks .env.local and node_modules
./scripts/setup-worktree.sh .claude/worktrees/w1

# Dev server — port is auto-detected from slot by vite.config.ts
cd .claude/worktrees/w1
npm run dev   # w1 = port 5100, w2 = 5200 (auto)
```

Port reference: w0 (main) = 5001, w1 = 5100, w2 = 5200. See [worktree-setup.md](worktree-setup.md) for full details.

### Pre-push safety net

A pre-push git hook (`.git/hooks/pre-push`) checks for `status: in-progress` feature specs before any push to `main`. If found, it shows the in-progress features as context, then requires TTY confirmation before allowing the push.

**Agent pushes are physically blocked** — agents have no TTY, so the confirmation prompt can never be satisfied. Agents must call `/ship` and wait for user approval; they cannot push to main unilaterally.

This is the last line of defense — ideally you're already on a feature branch before it fires.

### Deploying to production

Vercel auto-deploys on every push to `main` — there is no separate deploy environment to test in first, so a push to main IS deploying to prod. (Landing a push on `main` still goes through the mandatory staging-branch **hop** below — that's a CI gate, not a deploy environment.)

- **Feature branches:** use `/ship pN` — merges branch → main. What `/ship` does after that is owned by [ship.md](../../.claude/commands/slava/build/ship.md): it never pushes on its own — it prints "Ready to push" and stops for the user.
- **Small infra/doc work on main:** just say "push" — no `/ship` needed
- **Agent rule:** never push autonomously; always ask first, even if everything looks clean

> **⚠️ Vercel rollback ≠ git revert.** A Vercel rollback only changes the active deployment pointer — it is temporary. The next `git push` to `main` overrides it and the "rolled-back" code returns to prod. If you need to permanently remove code from prod, you MUST do a git revert or `/revert-feature pN`. Vercel rollback alone is not sufficient.

### Server-side push boundary (P919) — staging-branch hop

Two enforcement layers, by design:

- **Local hooks = accident-prevention.** `scripts/pre-push-checks.sh` + `scripts/audit-privacy.sh` run on your machine. An actor that controls the machine can bypass them (`--no-verify`, `core.hooksPath`, rewriting the script), so they catch *accidental* leaks — not a determined or prompt-injected agent.
- **Server (GitHub) = the boundary.** A `privacy-scan / audit-privacy` Actions check, marked **required** by a ruleset on `main` with an empty bypass list, re-scans pushed commits server-side. Un-checked or PII-bearing commits to `main` are rejected with `GH013` regardless of local hook state — and the agent's push credential cannot disable it (no Administration scope).

Because the required check only exists *after* CI runs on a branch, fresh commits cannot land directly on `main` — they transit a **staging branch** first. `git-ops.sh ship` and `commit-to-main` print this hop (they **never auto-push** — you run the commands):

```bash
git push origin main:refs/heads/staging/pN   # run CI on these commits
# wait for 'privacy-scan / audit-privacy' to pass on those SHAs (Actions tab / gh run watch)
git push origin main                          # promote — the green check on the same SHAs satisfies the rule
git push origin --delete staging/pN           # clean up the ephemeral staging branch
```

This works because GitHub binds a required check to the **commit SHA**, not the branch it ran on (proven in P919 Phase 0). The `main-privacy-gate` ruleset is **active** (P919 Phase 2 complete, 2026-06-16) — a direct `git push origin main` of unchecked commits returns GH013. The staging-hop is mandatory for all main pushes. Spec: `features/p919_*` (or `features/done/**/p919_*` once shipped).

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

### Hook passes manually but fails under `git commit`

**Symptom:** `bash .git/hooks/pre-commit` exits 0; `git commit` returns exit 1 with no clear error.

**Root cause:** Git invokes hooks as a non-interactive shell — no `.zshrc`, no `nvm`/`brew` shims. When `git commit` is run by Claude Code, a GUI app, or a script, the hook PATH may be narrower than your terminal session. A tool (`npx`, `gitleaks`, etc.) that's on your interactive PATH may be missing.

**Correct diagnostic — simulate git's environment:**
```bash
# Option A: simulate a non-interactive shell (how Claude Code / scripts invoke git)
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin bash ./scripts/pre-commit-checks.sh

# Option B: add `set -x` after the shebang line in scripts/pre-commit-checks.sh,
# then run `git commit` — trace output on stderr shows which command fails
# under git's invocation context. Remove set -x before the real commit.
```

**Fix:** For this project, add `export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"` near the top of `scripts/pre-commit-checks.sh` (after the shebang). The script calls `npx`, `npm`, and `gitleaks` without absolute paths — patching all call sites would be fragile.

**`--no-verify` is a workaround, not a fix.** Only use it after running the above diagnostic and confirming the hook is correct but the environment is the issue. Report it explicitly when used.

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
